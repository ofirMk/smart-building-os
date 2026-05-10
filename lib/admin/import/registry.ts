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
import { SUPPLIERS_IMPORTER } from "./entities/suppliers"
import type { ImporterEntityKind, ImporterSpec } from "./types"

const REGISTRY = new Map<ImporterEntityKind, ImporterSpec<unknown>>()

function register<TPayload>(spec: ImporterSpec<TPayload>): void {
  REGISTRY.set(spec.kind, spec as unknown as ImporterSpec<unknown>)
}

register(SUPPLIERS_IMPORTER)

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
