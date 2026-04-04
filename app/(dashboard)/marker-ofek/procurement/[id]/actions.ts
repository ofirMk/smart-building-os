"use server"

import { revalidatePath } from "next/cache"

import { canViewHoldingExecutive } from "@/lib/marker-ofek/partner-metrics/access"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

type SignatureActionResult = { ok: true } | { ok: false; error: string }

async function resolveUserAndRole() {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      supabase,
      user: null,
      role: null as string | null,
      email: null as string | null,
    }
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  const role = (profile as { role?: string } | null)?.role ?? null
  return {
    supabase,
    user,
    role,
    email: user.email ?? null,
  }
}

async function refreshPo(poId: string) {
  revalidatePath(`/marker-ofek/procurement/${poId}`)
  revalidatePath("/marker-ofek/procurement")
}

export async function signPurchaseOrderByUser(
  poId: string
): Promise<SignatureActionResult> {
  const trimmedPoId = poId.trim()
  if (!trimmedPoId) return { ok: false, error: "מזהה הזמנה חסר" }

  const { supabase, user } = await resolveUserAndRole()
  if (!user) return { ok: false, error: "נדרש להתחבר מחדש" }

  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id, ceo_approval_required, ceo_signed_at")
    .eq("id", trimmedPoId)
    .eq("is_deleted", false)
    .maybeSingle()
  if (poErr || !po?.id) {
    return { ok: false, error: poErr?.message ?? "ההזמנה לא נמצאה" }
  }

  const nowIso = new Date().toISOString()
  const updatePayload: Record<string, unknown> = {
    user_signed_by: user.id,
    user_signed_at: nowIso,
  }
  if (po.ceo_approval_required && po.ceo_signed_at) {
    updatePayload.status = "approved"
  }

  const { error: updErr } = await supabase
    .from("purchase_orders")
    .update(updatePayload)
    .eq("id", trimmedPoId)
  if (updErr) return { ok: false, error: updErr.message }

  await refreshPo(trimmedPoId)
  return { ok: true }
}

export async function signPurchaseOrderByCeo(
  poId: string
): Promise<SignatureActionResult> {
  const trimmedPoId = poId.trim()
  if (!trimmedPoId) return { ok: false, error: "מזהה הזמנה חסר" }

  const { supabase, user, role, email } = await resolveUserAndRole()
  if (!user) return { ok: false, error: "נדרש להתחבר מחדש" }
  if (!canViewHoldingExecutive(email, role)) {
    return { ok: false, error: "אין הרשאה לאישור מנכ״ל" }
  }

  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id, ceo_approval_required, user_signed_at")
    .eq("id", trimmedPoId)
    .eq("is_deleted", false)
    .maybeSingle()
  if (poErr || !po?.id) {
    return { ok: false, error: poErr?.message ?? "ההזמנה לא נמצאה" }
  }

  const nowIso = new Date().toISOString()
  const updatePayload: Record<string, unknown> = {
    ceo_signed_by: user.id,
    ceo_signed_at: nowIso,
  }
  if (po.ceo_approval_required && po.user_signed_at) {
    updatePayload.status = "approved"
  }

  const { error: updErr } = await supabase
    .from("purchase_orders")
    .update(updatePayload)
    .eq("id", trimmedPoId)
  if (updErr) return { ok: false, error: updErr.message }

  await refreshPo(trimmedPoId)
  return { ok: true }
}
