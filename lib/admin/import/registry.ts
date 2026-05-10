/**
 * Central registry of all entity importers.
 *
 * To add a new entity:
 *   1. Author `lib/admin/import/entities/<entity>.ts` exporting an
 *      `ImporterSpec<TPayload>`.
 *   2. Register it here.
 *   3. The UI auto-discovers it via `getRegisteredEntities()`.
 *
 * Sprint 1 Step 1 ships only `suppliers`. Steps 2-7 add the remaining 7
 * importers (items, accounts, projects, POs, contracts, opening balances,
 * bills) — each is a single new file + 1-line registration here.
 */
import { ITEMS_IMPORTER } from "./entities/items"
import { PRODUCT_FAMILIES_IMPORTER } from "./entities/product-families"
import { PROJECTS_IMPORTER } from "./entities/projects"
import { PURCHASE_ORDERS_IMPORTER } from "./entities/purchase-orders"
import { SUBCONTRACTOR_CONTRACTS_IMPORTER } from "./entities/subcontractor-contracts"
import { SUPPLIERS_IMPORTER } from "./entities/suppliers"
import type { ImporterEntityKind, ImporterSpec } from "./types"

const REGISTRY = new Map<ImporterEntityKind, ImporterSpec<unknown>>()

function register<TPayload>(spec: ImporterSpec<TPayload>): void {
  REGISTRY.set(spec.kind, spec as unknown as ImporterSpec<unknown>)
}

/*
 * Registration order = recommended ingestion order for Lihtman onboarding.
 * (Each entity may reference earlier ones via foreign keys.)
 *
 * Layer 1 — pure master data (no FKs):
 */
register(SUPPLIERS_IMPORTER)
register(PRODUCT_FAMILIES_IMPORTER)
register(PROJECTS_IMPORTER)

/* Layer 2 — references one Layer-1 entity: */
register(ITEMS_IMPORTER) // -> product_families

/* Layer 3 — references multiple Layer-1 entities: */
register(SUBCONTRACTOR_CONTRACTS_IMPORTER) // -> projects + suppliers
register(PURCHASE_ORDERS_IMPORTER) // -> projects + suppliers

/*
 * NOT YET REGISTERED (deferred to Sprint 2):
 *   - accounts            (no erp_gl_accounts table — DB schema missing)
 *   - opening_balances    (no erp_gl_journal_entries table — DB schema missing)
 *   - subcontractor_bills (header schema is complex; cumulative math validation)
 *   - po_lines / contract_boq_lines  (need resource catalog import first)
 */

export function getRegisteredEntities(): {
  kind: ImporterEntityKind
  title: string
  description: string
}[] {
  return [...REGISTRY.values()].map((s) => ({
    kind: s.kind,
    title: s.title,
    description: s.description,
  }))
}

export function getImporterSpec(
  kind: ImporterEntityKind,
): ImporterSpec<unknown> | null {
  return REGISTRY.get(kind) ?? null
}
