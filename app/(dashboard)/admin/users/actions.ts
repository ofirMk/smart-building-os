"use server"

/**
 * Admin provisioning server actions for `/admin/users`.
 *
 * Security model:
 *   - Every action calls `ensureAdminMembership(companyId)` first — rejects
 *     anyone who isn't an active `admin` for that company.
 *   - Writes go through the **service-role** client (RLS on
 *     `erp_user_company_memberships` restricts authenticated users to their
 *     OWN row only, so admin listing + cross-user writes need service-role).
 *
 * Pattern follows `lib/marker-ofek/user-ai-provision-actions.ts`
 * (`inviteUserByEmail` → upsert profile → upsert membership).
 */
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

import {
  listAdminAuditEntries,
  recordAdminAction,
  type AdminAuditEntry,
} from "@/lib/admin/audit-log"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

export type MembershipRole = "admin" | "member"

export type MemberRow = {
  userId: string
  email: string
  fullName: string | null
  role: MembershipRole
  isActive: boolean
  createdAt: string
  updatedAt: string
  lastSignInAt: string | null
}

/* -------------------------------------------------------------------------- */
/* Auth guard                                                                 */
/* -------------------------------------------------------------------------- */

async function ensureAdminMembership(): Promise<{
  userId: string
  userEmail: string | null
  companyId: string
}> {
  const store = await cookies()
  const companyId = resolveCompanyContext(store.get(COMPANY_COOKIE_KEY)?.value)
  if (!companyId) throw new Error("לא נבחרה חברה")

  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) throw new Error("נדרשת התחברות")

  const { data: mem, error } = await supabase
    .from("erp_user_company_memberships")
    .select("role,is_active")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) throw new Error(`שגיאה בבדיקת חברות: ${error.message}`)
  if (!mem || !mem.is_active) throw new Error("אין לך גישה פעילה לחברה זו")
  if (mem.role !== "admin") throw new Error("רק admin יכול לנהל משתמשים")

  return { userId: user.id, userEmail: user.email ?? null, companyId }
}

function normalizeRole(raw: string): MembershipRole {
  return raw === "admin" ? "admin" : "member"
}

/* -------------------------------------------------------------------------- */
/* List members                                                                */
/* -------------------------------------------------------------------------- */

export async function listMembers(): Promise<MemberRow[]> {
  const { companyId } = await ensureAdminMembership()
  const sr = createSupabaseServiceRoleClient()

  const { data: memberships, error } = await sr
    .from("erp_user_company_memberships")
    .select("user_id,role,is_active,created_at,updated_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })

  if (error) throw new Error(`שגיאה בטעינת חברי החברה: ${error.message}`)

  type MemRow = {
    user_id: string
    role: string
    is_active: boolean
    created_at: string
    updated_at: string
  }
  const rows = (memberships ?? []) as MemRow[]
  if (rows.length === 0) return []

  // Resolve auth user info (email, last_sign_in_at) via Admin API.
  const userIds = rows.map((r) => r.user_id)

  // Batch: auth admin has `getUserById` — one call per user. Parallelise.
  const authDetails = await Promise.all(
    userIds.map(async (uid) => {
      const { data } = await sr.auth.admin.getUserById(uid)
      return {
        id: uid,
        email: data.user?.email ?? "",
        lastSignInAt: data.user?.last_sign_in_at ?? null,
      }
    }),
  )
  const authMap = new Map(authDetails.map((a) => [a.id, a]))

  // Optional profile full_name lookup (profiles table is public).
  const { data: profiles } = await sr
    .from("profiles")
    .select("id,full_name")
    .in("id", userIds)
  const profileMap = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null }[]).map(
      (p) => [p.id, p.full_name],
    ),
  )

  return rows.map((r) => {
    const auth = authMap.get(r.user_id)
    return {
      userId: r.user_id,
      email: auth?.email ?? "(משתמש לא ידוע)",
      fullName: profileMap.get(r.user_id) ?? null,
      role: normalizeRole(r.role),
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastSignInAt: auth?.lastSignInAt ?? null,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Invite user                                                                */
/* -------------------------------------------------------------------------- */

async function findAuthUserIdByEmail(
  sr: ReturnType<typeof createSupabaseServiceRoleClient>,
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase()
  let page = 1
  const perPage = 200
  for (let guard = 0; guard < 50; guard += 1) {
    const { data, error } = await sr.auth.admin.listUsers({ page, perPage })
    if (error || !data?.users?.length) break
    const u = data.users.find((x) => x.email?.toLowerCase() === normalized)
    if (u?.id) return u.id
    if (data.users.length < perPage) break
    page += 1
  }
  return null
}

export async function inviteMember(input: {
  email: string
  fullName: string
  role: MembershipRole
}): Promise<
  | { ok: true; userId: string; invited: boolean }
  | { ok: false; error: string }
> {
  try {
    const {
      userId: actorId,
      userEmail: actorEmail,
      companyId,
    } = await ensureAdminMembership()
    const email = input.email.trim().toLowerCase()
    const fullName = input.fullName.trim()
    const role = normalizeRole(input.role)

    if (!email.includes("@")) return { ok: false, error: "אימייל לא תקין" }
    if (!fullName) return { ok: false, error: "נא למלא שם מלא" }

    const sr = createSupabaseServiceRoleClient()

    let userId = await findAuthUserIdByEmail(sr, email)
    let invited = false

    if (!userId) {
      const site =
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        process.env.VERCEL_URL?.trim()
      const origin = site?.startsWith("http")
        ? site
        : site
          ? `https://${site}`
          : ""
      const redirectTo = origin ? `${origin}/login` : undefined

      const { data: inv, error: invErr } = await sr.auth.admin.inviteUserByEmail(
        email,
        { data: { full_name: fullName }, redirectTo },
      )
      if (inv?.user?.id) {
        userId = inv.user.id
        invited = true
      } else if (invErr) {
        // Race: the user may have been created concurrently — try lookup.
        userId = await findAuthUserIdByEmail(sr, email)
        if (!userId) return { ok: false, error: invErr.message }
      }
    }

    if (!userId) return { ok: false, error: "לא נמצאה זהות משתמש" }

    // Upsert profile (best-effort — don't fail the invite if profiles table schema
    // evolves; the membership is the source of truth for company access).
    await sr
      .from("profiles")
      .upsert(
        {
          id: userId,
          full_name: fullName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )

    // Upsert membership.
    const { error: memErr } = await sr
      .from("erp_user_company_memberships")
      .upsert(
        {
          user_id: userId,
          company_id: companyId,
          role,
          is_active: true,
        },
        { onConflict: "user_id,company_id" },
      )
    if (memErr) {
      return { ok: false, error: `שגיאה ביצירת חברות: ${memErr.message}` }
    }

    await recordAdminAction({
      client: sr,
      companyId,
      actorUserId: actorId,
      actorEmail,
      action: "invite_member",
      targetUserId: userId,
      targetEmail: email,
      details: { invited, role, full_name: fullName },
    })

    revalidatePath("/admin/users")
    return { ok: true, userId, invited }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "כשל לא צפוי"
    return { ok: false, error: msg }
  }
}

/* -------------------------------------------------------------------------- */
/* Update membership                                                          */
/* -------------------------------------------------------------------------- */

export async function updateMemberRole(input: {
  userId: string
  role: MembershipRole
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const {
      companyId,
      userId: callerId,
      userEmail: actorEmail,
    } = await ensureAdminMembership()
    const role = normalizeRole(input.role)

    // Guard: admin can't demote themselves (prevents locking the tenant out).
    if (input.userId === callerId && role !== "admin") {
      return {
        ok: false,
        error: "אינך יכול להוריד את ההרשאות של עצמך. בקש מ-admin אחר.",
      }
    }

    const sr = createSupabaseServiceRoleClient()

    // Capture previous role for the audit entry.
    const { data: existingMem } = await sr
      .from("erp_user_company_memberships")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", input.userId)
      .maybeSingle()
    const previousRole = (existingMem as { role: string } | null)?.role ?? null

    const { error } = await sr
      .from("erp_user_company_memberships")
      .update({ role })
      .eq("company_id", companyId)
      .eq("user_id", input.userId)
    if (error) return { ok: false, error: error.message }

    const { data: tu } = await sr.auth.admin.getUserById(input.userId)
    await recordAdminAction({
      client: sr,
      companyId,
      actorUserId: callerId,
      actorEmail,
      action: "update_role",
      targetUserId: input.userId,
      targetEmail: tu.user?.email ?? null,
      details: { previous_role: previousRole, new_role: role },
    })

    revalidatePath("/admin/users")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "כשל" }
  }
}

export async function toggleMemberActive(input: {
  userId: string
  isActive: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const {
      companyId,
      userId: callerId,
      userEmail: actorEmail,
    } = await ensureAdminMembership()
    if (input.userId === callerId && !input.isActive) {
      return { ok: false, error: "אינך יכול להשבית את עצמך." }
    }

    const sr = createSupabaseServiceRoleClient()
    const { error } = await sr
      .from("erp_user_company_memberships")
      .update({ is_active: input.isActive })
      .eq("company_id", companyId)
      .eq("user_id", input.userId)
    if (error) return { ok: false, error: error.message }

    const { data: tu } = await sr.auth.admin.getUserById(input.userId)
    await recordAdminAction({
      client: sr,
      companyId,
      actorUserId: callerId,
      actorEmail,
      action: "toggle_active",
      targetUserId: input.userId,
      targetEmail: tu.user?.email ?? null,
      details: { is_active: input.isActive },
    })

    revalidatePath("/admin/users")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "כשל" }
  }
}

export async function removeMember(input: {
  userId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const {
      companyId,
      userId: callerId,
      userEmail: actorEmail,
    } = await ensureAdminMembership()
    if (input.userId === callerId) {
      return { ok: false, error: "אינך יכול להסיר את עצמך." }
    }

    const sr = createSupabaseServiceRoleClient()

    // Capture target email + previous role for audit BEFORE the delete.
    const [{ data: existingMem }, { data: tu }] = await Promise.all([
      sr
        .from("erp_user_company_memberships")
        .select("role,is_active")
        .eq("company_id", companyId)
        .eq("user_id", input.userId)
        .maybeSingle(),
      sr.auth.admin.getUserById(input.userId),
    ])
    const removedRole =
      (existingMem as { role: string; is_active: boolean } | null)?.role ?? null
    const targetEmail = tu.user?.email ?? null

    const { error } = await sr
      .from("erp_user_company_memberships")
      .delete()
      .eq("company_id", companyId)
      .eq("user_id", input.userId)
    if (error) return { ok: false, error: error.message }

    await recordAdminAction({
      client: sr,
      companyId,
      actorUserId: callerId,
      actorEmail,
      action: "remove_member",
      targetUserId: input.userId,
      targetEmail,
      details: { removed_role: removedRole },
    })

    revalidatePath("/admin/users")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "כשל" }
  }
}

/* -------------------------------------------------------------------------- */
/* Audit log reader                                                           */
/* -------------------------------------------------------------------------- */

export async function listAuditLog(
  limit: number = 20,
): Promise<AdminAuditEntry[]> {
  const { companyId } = await ensureAdminMembership()
  const sr = createSupabaseServiceRoleClient()
  return listAdminAuditEntries(sr, companyId, limit)
}
