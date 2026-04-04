/**
 * PostgREST / Supabase schema hints for embeds and FKs.
 * Regenerate from CLI when available: `supabase gen types typescript`.
 *
 * **supplier_items → entities:** requires FK `supplier_items_supplier_id_entities_fkey`
 * (`supabase/migrations/20260418143000_supplier_items_supplier_fk_entities.sql`).
 * After migrate + `NOTIFY pgrst, 'reload schema'`, use:
 * `.from("supplier_items").select("*, entities(*)")`
 */

export type SupplierItemsEntitiesRelationship = {
  /** FK column */
  supplier_id: string
  /** PostgREST embed name after FK to public.entities(id) */
  entities?: import("@/types/marker-ofek").MarkerOfekEntityRow | null
}

/** Audit append-only table — populated by triggers + optional app wrapper */
export type MoAuditLogRow = {
  id: string
  user_id: string | null
  project_id: string | null
  action_type: "INSERT" | "UPDATE" | "DELETE"
  table_name: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}
