/**
 * Admin audit log writer.
 *
 * Insert-only API for the /admin/users mutating server actions. Uses the
 * service-role client (the table's RLS denies all non-service_role traffic).
 *
 * Failures here are intentionally **non-throwing**: we never want to fail
 * the user-facing action just because audit logging hit an error. Instead we
 * surface a server log so it can be investigated later.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export type AdminAuditAction =
  | "invite_member"
  | "update_role"
  | "toggle_active"
  | "remove_member"

export type AdminAuditEntry = {
  id: string
  company_id: string
  actor_user_id: string | null
  actor_email: string | null
  action: AdminAuditAction
  target_user_id: string | null
  target_email: string | null
  details: Record<string, unknown>
  created_at: string
}

export async function recordAdminAction(input: {
  client: SupabaseClient
  companyId: string
  actorUserId: string | null
  actorEmail: string | null
  action: AdminAuditAction
  targetUserId: string | null
  targetEmail: string | null
  details?: Record<string, unknown>
}): Promise<void> {
  try {
    const { error } = await input.client
      .from("erp_admin_audit_log")
      .insert({
        company_id: input.companyId,
        actor_user_id: input.actorUserId,
        actor_email: input.actorEmail,
        action: input.action,
        target_user_id: input.targetUserId,
        target_email: input.targetEmail,
        details: input.details ?? {},
      })
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[admin-audit-log] insert failed:", error.message, {
        companyId: input.companyId,
        action: input.action,
      })
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[admin-audit-log] threw:", e)
  }
}

/**
 * Read most-recent audit entries for a company. Caller must already have
 * verified admin membership — this helper does NOT re-check.
 */
export async function listAdminAuditEntries(
  client: SupabaseClient,
  companyId: string,
  limit: number = 20,
): Promise<AdminAuditEntry[]> {
  const { data, error } = await client
    .from("erp_admin_audit_log")
    .select(
      "id,company_id,actor_user_id,actor_email,action,target_user_id,target_email,details,created_at",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[admin-audit-log] list failed:", error.message)
    return []
  }
  return (data ?? []) as AdminAuditEntry[]
}
