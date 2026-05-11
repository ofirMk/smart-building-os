/**
 * DMS — Linked entity owners resolver.
 *
 * Phase C.2 follow-up (commit aea77d05+): closes the
 * `resolveLinkedEntityRecipients` stub in `dms-notifications.ts`.
 *
 * Approach:
 *   1. The document's own `project_id` is always treated as a linked PROJECT
 *      (an upload to a project's DMS folder is implicitly "owned" by that
 *      project's team).
 *   2. Additionally, scan `dms_entity_links` for the document. Any row with
 *      entity_type='PROJECT' contributes its entity_id as another project.
 *   3. Union all collected project_ids and resolve owners via
 *      `project_assignments` (users assigned to those projects).
 *
 * Future expansion (when W2 land):
 *   - For entity_type='CONTRACT' (subcontractor or client), resolve via
 *     contract→project_id and union with the contract's own
 *     `created_by` / `account_manager_id` once those columns exist.
 *   - For entity_type='PURCHASE_ORDER', union PO `created_by` and
 *     `approver_user_id`.
 *   - Add a per-tenant cap to avoid pathological fan-outs.
 *
 * Spec reference:
 *   - docs/ingested-specs/medatech-contracts-module.md (chapter 3 ingest,
 *     "DMS Phase C.2 unlock — linked-entity owners resolver" section).
 *   - supabase/migrations/20260815120000_dms_phase_c1_foundations.sql
 *     §2.6 (dms_entity_links) + dms_entity_link_type enum.
 *
 * Failure mode: any DB error returns an empty set — never throws. Notifications
 * are fire-and-forget and must not block uploads/reverts.
 */

import "server-only"

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

/**
 * Resolve the set of user_ids that own ERP entities linked to the given
 * document. Includes the document's own project as an implicit link.
 *
 * @param documentId - Logical DMS document id.
 * @param documentProjectId - The doc's `project_id` (legacy `public.projects` FK).
 *                            Always included as an implicit PROJECT entity.
 * @returns Set of user_ids (auth.users.id), deduped. Empty on failure.
 */
export async function resolveLinkedEntityOwners(
  documentId: string,
  documentProjectId: string,
): Promise<Set<string>> {
  const admin = createSupabaseServiceRoleClient()

  /** Step 1+2: collect all project_ids related to this document. */
  const projectIds = new Set<string>()
  if (documentProjectId) projectIds.add(documentProjectId)

  /** Pull all non-orphaned entity links of type PROJECT. */
  try {
    const { data, error } = await admin
      .from("dms_entity_links")
      .select("entity_type, entity_id, is_orphan")
      .eq("document_id", documentId)
      .eq("is_orphan", false)
    if (!error && Array.isArray(data)) {
      type Row = { entity_type: string; entity_id: string; is_orphan: boolean }
      for (const row of data as Row[]) {
        if (row.entity_type === "PROJECT" && row.entity_id) {
          /** entity_id is text; PROJECT entity_ids are uuid strings of public.projects.id. */
          projectIds.add(row.entity_id)
        }
        /** Other entity_types intentionally skipped here — they will be
         *  resolved via per-type joins in a future revision (see file header). */
      }
    }
  } catch {
    /* swallow — keep the doc's own project as the minimum signal */
  }

  if (projectIds.size === 0) return new Set()

  /** Step 3: union project_assignments across all collected projects. */
  const owners = new Set<string>()
  try {
    const { data, error } = await admin
      .from("project_assignments")
      .select("user_id, project_id")
      .in("project_id", Array.from(projectIds))
    if (!error && Array.isArray(data)) {
      type Assignment = { user_id: string; project_id: string }
      for (const row of data as Assignment[]) {
        if (row.user_id) owners.add(row.user_id)
      }
    }
  } catch {
    /* swallow */
  }

  return owners
}
