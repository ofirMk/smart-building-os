/**
 * Subcontractor Contracts importer (`erp_subcontractor_contracts`).
 *
 * Source: paper contracts at Lihtman (NOT in Priority — Step 12 of the
 * onboarding playbook). Operator transcribes contract metadata to CSV.
 *
 * Cross-entity dependencies:
 *   - `project_number → project_id` (via erp_proj_projects)
 *   - `subcontractor_number → subcontractor_id` (via erp_md_suppliers)
 *
 * BOQ lines are out of scope for the header importer — they will get their
 * own importer in Sprint 2 with a `contract_number` lookup column.
 */
import {
  makeMissingLookupError,
  resolveProjectIds,
  resolveSupplierIds,
} from "../lookups"
import type { ImporterSpec, RowError } from "../types"

const UPSERT_CHUNK = 100

export type SubcontractorContractImportPayload = {
  contract_number: string
  project_number: string
  subcontractor_number: string
  contract_type: string
  total_amount: number
  insurance_pct: number
  retention_pct: number
  payment_terms: string | null
  status: string
  signed_at: string | null
  notes: string | null
}

const VALID_TYPES = new Set(["PAUSHALI", "MEASURED", "TARGET", "COST_PLUS"])

function transformContractType(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/\s+/g, "_")
  if (!t) return "PAUSHALI"
  if (VALID_TYPES.has(t)) return t
  if (t.includes("פאושאל") || t === "FIXED") return "PAUSHALI"
  if (t.includes("מדיד") || t === "MEASURED") return "MEASURED"
  if (t.includes("יעד") || t === "TARGET") return "TARGET"
  throw new Error(`סוג חוזה לא חוקי: "${raw}". מותר: PAUSHALI/MEASURED/TARGET/COST_PLUS.`)
}

function transformStatus(raw: string): string {
  const t = raw.trim().toUpperCase()
  if (!t) return "DRAFT"
  if (["DRAFT", "ACTIVE", "CLOSED", "CANCELLED"].includes(t)) return t
  if (t.includes("פעיל")) return "ACTIVE"
  if (t.includes("טיוטה")) return "DRAFT"
  if (t.includes("סגור")) return "CLOSED"
  if (t.includes("בוטל")) return "CANCELLED"
  throw new Error(`סטטוס חוזה לא חוקי: "${raw}".`)
}

function transformAmount(raw: string): number {
  const cleaned = raw.replace(/[,₪\s]/g, "")
  const n = Number(cleaned)
  if (!Number.isFinite(n)) throw new Error(`סכום לא מספרי: "${raw}"`)
  if (n < 0) throw new Error(`סכום שלילי: "${raw}"`)
  return n
}

function transformPct(raw: string): number {
  const cleaned = raw.replace(/[%\s]/g, "")
  const n = Number(cleaned)
  if (!Number.isFinite(n)) throw new Error(`אחוז לא מספרי: "${raw}"`)
  if (n < 0 || n > 100) throw new Error(`אחוז מחוץ לטווח 0-100: "${raw}"`)
  return n
}

function transformDate(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(t)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  }
  throw new Error(`פורמט תאריך לא נתמך: "${raw}"`)
}

export const SUBCONTRACTOR_CONTRACTS_IMPORTER: ImporterSpec<SubcontractorContractImportPayload> = {
  kind: "subcontractor_contracts",
  title: "חוזי קבלן משנה (header)",
  description:
    "ייבוא header של חוזים. תלוי ב-projects + suppliers. שורות BOQ ייובאו בסבב נפרד.",
  templateFileName: "subcontractor-contracts-template.csv",
  columns: [
    {
      field: "contract_number",
      label: "מספר חוזה",
      aliases: ["מספר חוזה", "Contract Number", "contract_number"],
      required: true,
    },
    {
      field: "project_number",
      label: "מספר פרויקט",
      aliases: ["מספר פרויקט", "Project Number", "project_number"],
      required: true,
    },
    {
      field: "subcontractor_number",
      label: "מספר קבלן משנה",
      aliases: ["מספר קבלן משנה", "מספר ספק", "Subcontractor Number", "subcontractor_number"],
      required: true,
    },
    {
      field: "contract_type",
      label: "סוג חוזה",
      aliases: ["סוג חוזה", "Type", "contract_type"],
      required: false,
      transform: transformContractType,
    },
    {
      field: "total_amount",
      label: "סכום חוזה",
      aliases: ["סכום חוזה", "Total", "total_amount"],
      required: true,
      transform: transformAmount,
    },
    {
      field: "insurance_pct",
      label: "% ביטוח",
      aliases: ["% ביטוח", "Insurance %", "insurance_pct"],
      required: false,
      transform: transformPct,
    },
    {
      field: "retention_pct",
      label: "% עכבון",
      aliases: ["% עכבון", "Retention %", "retention_pct"],
      required: false,
      transform: transformPct,
    },
    {
      field: "payment_terms",
      label: "תנאי תשלום",
      aliases: ["תנאי תשלום", "Payment Terms", "payment_terms"],
      required: false,
    },
    {
      field: "status",
      label: "סטטוס",
      aliases: ["סטטוס", "Status", "status"],
      required: false,
      transform: transformStatus,
    },
    {
      field: "signed_at",
      label: "תאריך חתימה",
      aliases: ["תאריך חתימה", "Signed", "signed_at"],
      required: false,
      transform: transformDate,
    },
    {
      field: "notes",
      label: "הערות",
      aliases: ["הערות", "Notes", "notes"],
      required: false,
    },
  ],
  upsert: async (client, companyId, payloads) => {
    const failed: RowError[] = []
    let inserted = 0
    let updated = 0

    // Batch-resolve both relations.
    const [projectMap, supplierMap] = await Promise.all([
      resolveProjectIds(client, companyId, payloads.map((p) => p.project_number)),
      resolveSupplierIds(client, companyId, payloads.map((p) => p.subcontractor_number)),
    ])

    type Resolved = {
      p: SubcontractorContractImportPayload
      project_id: string
      subcontractor_id: string
      rowIdx: number
    }
    const resolved: Resolved[] = []
    payloads.forEach((p, idx) => {
      const pid = projectMap.get(p.project_number)
      const sid = supplierMap.get(p.subcontractor_number)
      if (!pid) {
        failed.push(makeMissingLookupError(idx + 2, "project_number", p.project_number, "פרויקט"))
        return
      }
      if (!sid) {
        failed.push(
          makeMissingLookupError(idx + 2, "subcontractor_number", p.subcontractor_number, "קבלן משנה"),
        )
        return
      }
      resolved.push({ p, project_id: pid, subcontractor_id: sid, rowIdx: idx })
    })

    if (resolved.length === 0) return { inserted, updated, failed }

    const numbers = resolved.map((r) => r.p.contract_number)
    const { data: existing } = await client
      .from("erp_subcontractor_contracts")
      .select("contract_number")
      .eq("company_id", companyId)
      .in("contract_number", numbers)
    const existingSet = new Set(
      (existing ?? []).map((r: { contract_number: string }) => r.contract_number),
    )

    for (let i = 0; i < resolved.length; i += UPSERT_CHUNK) {
      const chunk = resolved.slice(i, i + UPSERT_CHUNK)
      const rows = chunk.map(({ p, project_id, subcontractor_id }) => ({
        company_id: companyId,
        contract_number: p.contract_number,
        project_id,
        subcontractor_id,
        contract_type: p.contract_type ?? "PAUSHALI",
        total_amount: p.total_amount,
        insurance_pct: p.insurance_pct ?? 0,
        retention_pct: p.retention_pct ?? 0,
        payment_terms: p.payment_terms,
        status: p.status ?? "DRAFT",
        signed_at: p.signed_at,
        notes: p.notes,
      }))
      const { error } = await client
        .from("erp_subcontractor_contracts")
        .upsert(rows, { onConflict: "company_id,contract_number" })
      if (error) {
        failed.push({
          rowNumber: chunk[0].rowIdx + 2,
          field: null,
          message: `שגיאת DB ב-chunk שמתחיל בשורה ${chunk[0].rowIdx + 2}: ${error.message}`,
          rawValue: null,
        })
        continue
      }
      for (const { p } of chunk) {
        if (existingSet.has(p.contract_number)) updated += 1
        else inserted += 1
      }
    }
    return { inserted, updated, failed }
  },
}
