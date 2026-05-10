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
import { BANK_STATEMENTS_IMPORTER } from "./entities/bank-statements"
import { CONTRACT_BOQ_LINES_IMPORTER } from "./entities/contract-boq-lines"
import { ITEMS_IMPORTER } from "./entities/items"
import { OPENING_BALANCES_IMPORTER } from "./entities/opening-balances"
import { PRODUCT_FAMILIES_IMPORTER } from "./entities/product-families"
import { PROJECTS_IMPORTER } from "./entities/projects"
import { PURCHASE_ORDER_LINES_IMPORTER } from "./entities/purchase-order-lines"
import { PURCHASE_ORDERS_IMPORTER } from "./entities/purchase-orders"
import { SUBCONTRACTOR_BILLS_IMPORTER } from "./entities/subcontractor-bills"
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

/* Layer 4 — line-level data referencing Layer-3 headers: */
register(CONTRACT_BOQ_LINES_IMPORTER) // -> subcontractor_contracts (upsert on line_no)
register(PURCHASE_ORDER_LINES_IMPORTER) // -> purchase_orders (delete-then-insert per PO)

/* Layer 5 — references Layer-4 (BOQ lines): */
register(SUBCONTRACTOR_BILLS_IMPORTER) // -> contracts + boq_lines (waterfall validation)

/* Layer 6 — bank reconciliation (independent surface, references erp_bank_accounts): */
register(BANK_STATEMENTS_IMPORTER) // -> bank_accounts (statement = bank_account × period)

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
