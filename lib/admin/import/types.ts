/**
 * Shared types for the generic CSV/XLSX importer engine.
 *
 * Architecture:
 *   - `ImporterSpec<TPayload>` — declarative description of one entity
 *     (suppliers, items, …). Defines columns, validation rules, and how to
 *     persist a parsed row to the DB.
 *   - `ImportEngine` consumes any `ImporterSpec` to provide dry-run + commit
 *     against a parsed file.
 *   - Per-entity files under `lib/admin/import/entities/` only need to export
 *     a single `ImporterSpec` — they don't touch parsing or DB plumbing.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export type ImporterEntityKind =
  | "suppliers"
  | "product_families"
  | "items"
  | "accounts"
  | "projects"
  | "purchase_orders"
  | "subcontractor_contracts"
  | "opening_balances"
  | "subcontractor_bills"
  | "contract_boq_lines"
  | "purchase_order_lines"

/** Single column in the source file. Matched against headers via aliases. */
export type ColumnSpec<TPayload> = {
  /** Field on the typed payload this column populates. */
  field: keyof TPayload
  /** Human label (Hebrew preferred — used in UI). */
  label: string
  /** Header aliases that map to this column. Case + whitespace tolerant. */
  aliases: readonly string[]
  /** When true, an empty value yields a row-level error. */
  required: boolean
  /**
   * Optional transformer: take the raw cell value, return the typed value
   * or `null`. Throw `Error("...")` to produce a row-level error.
   */
  transform?: (raw: string) => unknown
}

/** Result of validating + transforming a single source row. */
export type RowResult<TPayload> =
  | { ok: true; payload: TPayload; rowNumber: number }
  | { ok: false; rowNumber: number; errors: RowError[] }
  | { ok: "skipped"; rowNumber: number; reason: string }

export type RowError = {
  rowNumber: number
  field: string | null
  message: string
  rawValue: string | null
}

/** Declarative importer specification for one entity. */
export type ImporterSpec<TPayload> = {
  kind: ImporterEntityKind
  /** Human title shown in the UI (Hebrew). */
  title: string
  /** 1-2 line description (Hebrew). */
  description: string
  /** Column declarations (header → typed field). */
  columns: readonly ColumnSpec<TPayload>[]
  /** Suggested file template for "download example" link. */
  templateFileName: string
  /**
   * Persistence: takes the validated batch + the resolved Supabase client,
   * runs the upsert, and returns counts. Called only on commit (not dry-run).
   */
  upsert: (
    client: SupabaseClient,
    companyId: string,
    payloads: readonly TPayload[],
  ) => Promise<{ inserted: number; updated: number; failed: RowError[] }>
}

/** Top-level result returned by the engine to the UI. */
export type EngineParseResult<TPayload> = {
  rowsTotal: number
  rowsValid: number
  rowsError: number
  rowsSkipped: number
  /** First N successful payloads — for the preview table in the UI. */
  previewPayloads: TPayload[]
  /** All errors (no truncation — used to populate `error_report` JSON). */
  errors: RowError[]
  /** All valid payloads — kept by the action between dry-run and commit. */
  validPayloads: TPayload[]
}

export type EngineCommitResult = {
  inserted: number
  updated: number
  failed: RowError[]
}

/** DB row shape (mirror of `public.erp_import_jobs` columns). */
export type ImportJobRow = {
  id: string
  company_id: string
  entity_kind: string
  status: "uploaded" | "previewed" | "committed" | "failed" | "cancelled"
  file_name: string
  file_size_bytes: number
  file_checksum_sha256: string | null
  rows_total: number
  rows_success: number
  rows_error: number
  rows_skipped: number
  error_report: RowError[]
  summary_text: string | null
  created_by: string | null
  created_at: string
  previewed_at: string | null
  committed_at: string | null
  failed_at: string | null
}
