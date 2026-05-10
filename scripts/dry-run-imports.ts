/**
 * Dry-run all sample import CSVs through the engine.
 *
 * Usage:
 *   npx tsx scripts/dry-run-imports.ts
 *
 * What it does:
 *   - For every `.csv` in `docs/customer/sample-imports/`:
 *     - Looks up the matching importer in the registry by file basename.
 *     - Runs `parseCsv` + `runDryRun` (pure: no DB).
 *     - Prints rowsTotal/Valid/Error, unmappedHeaders, missingRequiredFields,
 *       and the first error message (if any).
 *   - Exits with non-zero status on ANY failure (CI-friendly).
 *
 * Goal: catch alias/transform regressions before the real Lihtman cutover.
 */
import fs from "node:fs"
import path from "node:path"

import { runDryRun } from "@/lib/admin/import/engine"
import { isParseError, parseCsv } from "@/lib/admin/import/parsers"
import { getImporterSpec } from "@/lib/admin/import/registry"
import type {
  ImporterEntityKind,
  ImporterSpec,
} from "@/lib/admin/import/types"

const SAMPLES_DIR = path.resolve("docs/customer/sample-imports")

/** Map sample CSV basename → importer kind. */
const FILE_TO_KIND: Record<string, ImporterEntityKind> = {
  "suppliers.csv": "suppliers",
  "product-families.csv": "product_families",
  "items.csv": "items",
  "projects.csv": "projects",
  "accounts.csv": "accounts",
  "subcontractor-contracts.csv": "subcontractor_contracts",
  "purchase-orders.csv": "purchase_orders",
  "opening-balances.csv": "opening_balances",
  "contract-boq-lines.csv": "contract_boq_lines",
  "purchase-order-lines.csv": "purchase_order_lines",
  "subcontractor-bills.csv": "subcontractor_bills",
  "bank-statements.csv": "bank_statements",
}

type Outcome = {
  file: string
  kind: ImporterEntityKind
  ok: boolean
  rowsTotal: number
  rowsValid: number
  rowsError: number
  unmappedHeaders: string[]
  missingRequiredFields: string[]
  firstErrorMessage: string | null
}

function runOne(file: string, kind: ImporterEntityKind): Outcome {
  const fullPath = path.join(SAMPLES_DIR, file)
  const content = fs.readFileSync(fullPath, "utf-8")
  const parsed = parseCsv(content)
  if (isParseError(parsed)) {
    return {
      file,
      kind,
      ok: false,
      rowsTotal: 0,
      rowsValid: 0,
      rowsError: 0,
      unmappedHeaders: [],
      missingRequiredFields: [],
      firstErrorMessage: `Parse error: ${parsed.message}`,
    }
  }

  const spec = getImporterSpec(kind) as ImporterSpec<unknown> | null
  if (!spec) {
    return {
      file,
      kind,
      ok: false,
      rowsTotal: parsed.rows.length,
      rowsValid: 0,
      rowsError: 0,
      unmappedHeaders: [],
      missingRequiredFields: [],
      firstErrorMessage: `No importer registered for kind "${kind}"`,
    }
  }

  const result = runDryRun(spec, parsed)
  const ok =
    result.rowsError === 0 &&
    result.missingRequiredFields.length === 0 &&
    result.rowsValid === result.rowsTotal
  return {
    file,
    kind,
    ok,
    rowsTotal: result.rowsTotal,
    rowsValid: result.rowsValid,
    rowsError: result.rowsError,
    unmappedHeaders: result.unmappedHeaders,
    missingRequiredFields: result.missingRequiredFields.map(String),
    firstErrorMessage: result.errors[0]
      ? `row ${result.errors[0].rowNumber} field=${result.errors[0].field} — ${result.errors[0].message}`
      : null,
  }
}

function statusBadge(o: Outcome): string {
  return o.ok ? "  PASS" : "  FAIL"
}

function main(): void {
  const files = fs
    .readdirSync(SAMPLES_DIR)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .sort()

  if (files.length === 0) {
    console.error(`No CSV files in ${SAMPLES_DIR}`)
    process.exit(2)
  }

  const outcomes: Outcome[] = []
  for (const file of files) {
    const kind = FILE_TO_KIND[file]
    if (!kind) {
      outcomes.push({
        file,
        kind: "suppliers",
        ok: false,
        rowsTotal: 0,
        rowsValid: 0,
        rowsError: 0,
        unmappedHeaders: [],
        missingRequiredFields: [],
        firstErrorMessage: `No mapping in FILE_TO_KIND for "${file}". Add it to the script.`,
      })
      continue
    }
    outcomes.push(runOne(file, kind))
  }

  // Pretty-print
  console.log("\nDRY-RUN REPORT — sample-imports/")
  console.log("=".repeat(80))
  for (const o of outcomes) {
    console.log(
      `${statusBadge(o)}  ${o.file.padEnd(34)}  kind=${o.kind.padEnd(26)}  ${o.rowsValid}/${o.rowsTotal} valid` +
        (o.rowsError > 0 ? `  (${o.rowsError} errors)` : ""),
    )
    if (o.unmappedHeaders.length > 0) {
      console.log(
        `         ⚠  unmappedHeaders: ${o.unmappedHeaders.join(", ")}`,
      )
    }
    if (o.missingRequiredFields.length > 0) {
      console.log(
        `         ⚠  missingRequiredFields: ${o.missingRequiredFields.join(", ")}`,
      )
    }
    if (o.firstErrorMessage) {
      console.log(`         ✗  ${o.firstErrorMessage}`)
    }
  }
  console.log("=".repeat(80))

  const failed = outcomes.filter((o) => !o.ok)
  if (failed.length > 0) {
    console.log(`\n${failed.length} file(s) failed dry-run.\n`)
    process.exit(1)
  }
  console.log(
    `\nAll ${outcomes.length} sample CSVs passed dry-run validation.\n`,
  )
}

main()
