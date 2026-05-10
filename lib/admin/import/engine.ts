/**
 * Engine: runs the validation/transform pipeline for any `ImporterSpec`.
 *
 * Stages:
 *   1. Header → field mapping  (alias-based, Hebrew + English friendly).
 *   2. Per-row validation       (required-field check, transform).
 *   3. Aggregation              (RowResult[] → EngineParseResult).
 *   4. Commit                   (delegated to spec.upsert via `runCommit`).
 *
 * The engine NEVER touches the DB during dry-run — it only validates and
 * builds typed payloads. Commit is a separate explicit call.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { ParsedFile } from "./parsers"
import { normalizeHeader } from "./parsers"
import type {
  ColumnSpec,
  EngineCommitResult,
  EngineParseResult,
  ImporterSpec,
  RowError,
  RowResult,
} from "./types"

const PREVIEW_ROW_CAP = 50

/**
 * Build a header → field map for a parsed file using a spec's column aliases.
 * Returns the map plus a list of unmapped headers (for UI diagnostic).
 */
function buildHeaderMap<TPayload>(
  spec: ImporterSpec<TPayload>,
  headers: readonly string[],
): {
  map: Map<string, ColumnSpec<TPayload>>
  unmappedHeaders: string[]
} {
  const map = new Map<string, ColumnSpec<TPayload>>()
  const unmappedHeaders: string[] = []
  for (const rawHeader of headers) {
    const norm = normalizeHeader(rawHeader)
    let matched: ColumnSpec<TPayload> | null = null
    for (const col of spec.columns) {
      if (
        col.aliases.some((alias) => normalizeHeader(alias) === norm) ||
        normalizeHeader(String(col.field)) === norm ||
        normalizeHeader(col.label) === norm
      ) {
        matched = col
        break
      }
    }
    if (matched) {
      if (!map.has(norm)) map.set(norm, matched)
    } else {
      unmappedHeaders.push(rawHeader)
    }
  }
  return { map, unmappedHeaders }
}

/** Look up a value for a target field across all matching headers in the row. */
function lookupCell<TPayload>(
  row: Record<string, string>,
  headers: readonly string[],
  fieldMap: Map<string, ColumnSpec<TPayload>>,
  field: keyof TPayload,
): string {
  for (const h of headers) {
    const norm = normalizeHeader(h)
    const col = fieldMap.get(norm)
    if (col?.field === field) {
      const raw = row[h]
      if (raw == null) continue
      const s = String(raw).trim()
      if (s !== "") return s
    }
  }
  return ""
}

/**
 * Run the parse/validate/transform pipeline against a parsed file.
 * Pure: no DB calls, no side effects.
 */
export function runDryRun<TPayload>(
  spec: ImporterSpec<TPayload>,
  parsed: ParsedFile,
): EngineParseResult<TPayload> & {
  unmappedHeaders: string[]
  missingRequiredFields: (keyof TPayload)[]
} {
  const { map: fieldMap, unmappedHeaders } = buildHeaderMap(spec, parsed.headerList)

  const presentFields = new Set([...fieldMap.values()].map((c) => c.field))
  const missingRequiredFields = spec.columns
    .filter((c) => c.required && !presentFields.has(c.field))
    .map((c) => c.field)

  const rowResults: RowResult<TPayload>[] = parsed.rows.map((row, i) => {
    const rowNumber = i + 2 // +1 for 0-index, +1 for header row
    const errors: RowError[] = []
    const payload: Partial<TPayload> = {}

    for (const col of spec.columns) {
      const raw = lookupCell(row, parsed.headerList, fieldMap, col.field)

      if (raw === "") {
        if (col.required) {
          errors.push({
            rowNumber,
            field: String(col.field),
            message: `חסר ערך חובה בעמודה "${col.label}"`,
            rawValue: null,
          })
        }
        ;(payload as Record<string, unknown>)[String(col.field)] = null
        continue
      }

      try {
        const transformed = col.transform ? col.transform(raw) : raw
        ;(payload as Record<string, unknown>)[String(col.field)] = transformed ?? null
      } catch (err) {
        errors.push({
          rowNumber,
          field: String(col.field),
          message: err instanceof Error ? err.message : String(err),
          rawValue: raw,
        })
      }
    }

    if (errors.length > 0) {
      return { ok: false, rowNumber, errors }
    }
    return { ok: true, rowNumber, payload: payload as TPayload }
  })

  const validPayloads: TPayload[] = []
  const errors: RowError[] = []
  let rowsSkipped = 0

  for (const r of rowResults) {
    if (r.ok === true) {
      validPayloads.push(r.payload)
    } else if (r.ok === false) {
      errors.push(...r.errors)
    } else {
      rowsSkipped += 1
    }
  }

  return {
    rowsTotal: rowResults.length,
    rowsValid: validPayloads.length,
    rowsError: rowResults.filter((r) => r.ok === false).length,
    rowsSkipped,
    previewPayloads: validPayloads.slice(0, PREVIEW_ROW_CAP),
    errors,
    validPayloads,
    unmappedHeaders,
    missingRequiredFields,
  }
}

/**
 * Commit a previously-validated batch. Delegates to spec.upsert.
 * The caller is responsible for ensuring the engine's dry-run already passed
 * (i.e. payloads match the spec's expectations).
 */
export async function runCommit<TPayload>(
  spec: ImporterSpec<TPayload>,
  client: SupabaseClient,
  companyId: string,
  payloads: readonly TPayload[],
): Promise<EngineCommitResult> {
  if (payloads.length === 0) {
    return { inserted: 0, updated: 0, failed: [] }
  }
  return spec.upsert(client, companyId, payloads)
}
