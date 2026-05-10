/**
 * Contract BOQ lines importer (`erp_contract_boq_lines`).
 *
 * Idempotent re-import semantics:
 *   Conflict key `(company_id, contract_id, line_no)` → upsert replaces the
 *   row for a given (contract, line_no). Re-running the same file is safe.
 *
 * To replace the entire BOQ of a contract, use `line_no` 1..N in the file;
 * any existing rows with higher `line_no` are NOT deleted automatically.
 * (Explicit "replace all" behavior is out of scope here — users can empty
 * the BOQ by running a targeted DELETE or by re-exporting from Priority.)
 *
 * Cross-entity deps:
 *   - `contract_number → contract_id`
 */
import {
  makeMissingLookupError,
  resolveSubcontractorContractIds,
} from "../lookups"
import type { ImporterSpec, RowError } from "../types"

const UPSERT_CHUNK = 200

export type ContractBoqLineImportPayload = {
  contract_number: string
  line_no: number
  section_code: string
  description: string
  uom: string
  quantity: number
  unit_price: number
  discount_amount: number | null
  escalation_included: boolean | null
  notes: string | null
}

function transformInt(raw: string): number {
  const n = Number(raw.trim())
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`ערך חייב להיות מספר שלם חיובי: "${raw}"`)
  }
  return n
}

function transformNumber(raw: string): number {
  const cleaned = raw.replace(/[,₪\s]/g, "")
  const n = Number(cleaned)
  if (!Number.isFinite(n)) throw new Error(`ערך לא מספרי: "${raw}"`)
  if (n < 0) throw new Error(`ערך שלילי לא חוקי: "${raw}"`)
  return n
}

function transformOptionalNumber(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  return transformNumber(t)
}

function transformBoolean(raw: string): boolean | null {
  const t = raw.trim().toLowerCase()
  if (!t) return null
  if (["true", "1", "כן", "yes", "y", "v", "✓"].includes(t)) return true
  if (["false", "0", "לא", "no", "n"].includes(t)) return false
  throw new Error(`ערך בוליאני לא חוקי: "${raw}"`)
}

export const CONTRACT_BOQ_LINES_IMPORTER: ImporterSpec<ContractBoqLineImportPayload> =
  {
    kind: "contract_boq_lines",
    title: "שורות כתב כמויות (BOQ) לחוזים",
    description:
      "ייבוא שורות כתב כמויות לחוזי קבלן משנה. מפתח טבעי: מספר חוזה + מספר שורה. דורש שהחוזה ייובא קודם.",
    templateFileName: "contract-boq-lines-template.csv",
    columns: [
      {
        field: "contract_number",
        label: "מספר חוזה",
        aliases: ["מספר חוזה", "Contract Number", "contract_number"],
        required: true,
      },
      {
        field: "line_no",
        label: "מספר שורה",
        aliases: ["מספר שורה", "Line No", "line_no", "line"],
        required: true,
        transform: transformInt,
      },
      {
        field: "section_code",
        label: "סעיף",
        aliases: ["סעיף", "Section", "section_code"],
        required: true,
      },
      {
        field: "description",
        label: "תיאור",
        aliases: ["תיאור", "Description", "description"],
        required: true,
      },
      {
        field: "uom",
        label: "יחידת מידה",
        aliases: ["יחידת מידה", "יחידה", "UOM", "uom", "unit"],
        required: true,
      },
      {
        field: "quantity",
        label: "כמות",
        aliases: ["כמות", "Quantity", "quantity", "qty"],
        required: true,
        transform: transformNumber,
      },
      {
        field: "unit_price",
        label: "מחיר יחידה",
        aliases: ["מחיר יחידה", "Unit Price", "unit_price", "price"],
        required: true,
        transform: transformNumber,
      },
      {
        field: "discount_amount",
        label: "הנחה (סכום)",
        aliases: ["הנחה", "Discount", "discount_amount"],
        required: false,
        transform: transformOptionalNumber,
      },
      {
        field: "escalation_included",
        label: "כולל התייקרות",
        aliases: ["כולל התייקרות", "Escalation", "escalation_included"],
        required: false,
        transform: transformBoolean,
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

      const contractMap = await resolveSubcontractorContractIds(
        client,
        companyId,
        payloads.map((p) => p.contract_number),
      )

      type Resolved = {
        p: ContractBoqLineImportPayload
        contract_id: string
        rowIdx: number
      }
      const resolved: Resolved[] = []
      payloads.forEach((p, idx) => {
        const cid = contractMap.get(p.contract_number)
        if (!cid) {
          failed.push(
            makeMissingLookupError(
              idx + 2,
              "contract_number",
              p.contract_number,
              "חוזה קבלן משנה",
            ),
          )
          return
        }
        resolved.push({ p, contract_id: cid, rowIdx: idx })
      })

      if (resolved.length === 0) return { inserted, updated, failed }

      // Detect which (contract_id, line_no) pairs already exist to split
      // counts between inserted vs updated.
      const contractIds = [...new Set(resolved.map((r) => r.contract_id))]
      const { data: existing } = await client
        .from("erp_contract_boq_lines")
        .select("contract_id,line_no")
        .eq("company_id", companyId)
        .in("contract_id", contractIds)
      const existingSet = new Set(
        (existing ?? []).map(
          (r: { contract_id: string; line_no: number }) =>
            `${r.contract_id}:${r.line_no}`,
        ),
      )

      for (let i = 0; i < resolved.length; i += UPSERT_CHUNK) {
        const chunk = resolved.slice(i, i + UPSERT_CHUNK)
        const rows = chunk.map(({ p, contract_id }) => {
          const qty = p.quantity
          const unit = p.unit_price
          const discount = p.discount_amount ?? 0
          const total = Math.max(0, Math.round((qty * unit - discount) * 100) / 100)
          return {
            company_id: companyId,
            contract_id,
            line_no: p.line_no,
            section_code: p.section_code,
            description: p.description,
            uom: p.uom,
            quantity: qty,
            unit_price: unit,
            discount_amount: discount,
            total_line_price: total,
            escalation_included: p.escalation_included ?? false,
            notes: p.notes,
          }
        })
        const { error } = await client
          .from("erp_contract_boq_lines")
          .upsert(rows, { onConflict: "company_id,contract_id,line_no" })
        if (error) {
          failed.push({
            rowNumber: chunk[0].rowIdx + 2,
            field: null,
            message: `שגיאת DB ב-chunk שמתחיל בשורה ${chunk[0].rowIdx + 2}: ${error.message}`,
            rawValue: null,
          })
          continue
        }
        for (const { p, contract_id } of chunk) {
          if (existingSet.has(`${contract_id}:${p.line_no}`)) updated += 1
          else inserted += 1
        }
      }

      return { inserted, updated, failed }
    },
  }
