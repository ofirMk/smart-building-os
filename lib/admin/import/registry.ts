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
import { ACCOUNTS_IMPORTER } from "./entities/accounts"
import { ITEMS_IMPORTER } from "./entities/items"
import { OPENING_BALANCES_IMPORTER } from "./entities/opening-balances"
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
register(ACCOUNTS_IMPORTER) // GL chart of accounts (Sprint 1 / Step 4)

/* Layer 2 — references one Layer-1 entity: */
register(ITEMS_IMPORTER) // -> product_families

/* Layer 3 — references multiple Layer-1 entities: */
register(SUBCONTRACTOR_CONTRACTS_IMPORTER) // -> projects + suppliers
register(PURCHASE_ORDERS_IMPORTER) // -> projects + suppliers
register(OPENING_BALANCES_IMPORTER) // -> accounts (single journal entry per file)

/*
 * NOT YET REGISTERED (deferred to Sprint 2):
 *   - subcontractor_bills (cumulative math validation needs separate design)
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
