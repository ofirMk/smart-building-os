/**
 * Subcontractor partial bills importer (`erp_subcontractor_bills` + `_lines`).
 *
 * The most complex of all importers: each bill is **cumulative** with a
 * waterfall (חוזה → קיזוז עכבון → קיזוז ביטוח → קיזוז מצטבר קודם → +מע"מ).
 *
 * Input shape (one CSV row per BOQ line in a bill):
 *   - Per-bill columns repeat on every line of the same bill:
 *       contract_number, bill_number, execution_month, bill_date,
 *       previous_billed_amount, vat_pct, status, header_notes
 *   - Per-line columns vary:
 *       boq_line_no, cumulative_qty, cumulative_pct, cumulative_amount,
 *       line_notes
 *
 * Pipeline:
 *   1. Group rows by (contract_number, bill_number).
 *   2. Validate header consistency within each group.
 *   3. Resolve contract → { id, project_id, retention_pct, insurance_pct }.
 *   4. Resolve boq_line by (contract_id, line_no) and validate
 *      `cumulative_amount ≈ pct × boq.total_line_price` (±₪1).
 *   5. Compute waterfall per bill from line sums + contract terms:
 *        cumulative_executed = SUM(line.cumulative_amount)
 *        retention            = round(retention_pct/100 * executed, 2)
 *        insurance            = round(insurance_pct/100  * executed, 2)
 *        net                  = executed − retention − insurance
 *        amount_to_pay        = net − previous_billed     (must be ≥ 0)
 *        vat_amount           = round(vat_pct/100 * amount_to_pay, 2)
 *        grand_total          = amount_to_pay + vat_amount
 *   6. Upsert header (idempotent on company_id+contract_id+bill_number).
 *   7. Replace lines (delete then insert — same pattern as PO lines).
 *
 * Error semantics: if ANY bill in the file fails validation, only that bill
 * is rejected; other bills in the same file proceed independently.
 */
import {
  makeMissingLookupError,
  resolveContractsWithTerms,
} from "../lookups"
import type { ImporterSpec, RowError } from "../types"

const TOLERANCE_NIS = 1.0 // ±1₪ rounding tolerance for line consistency check
const VAT_DEFAULT = 17.0

export type SubcontractorBillImportPayload = {
  contract_number: string
  bill_number: number
  execution_month: string
  bill_date: string
  previous_billed_amount: number | null
  vat_pct: number | null
  status: string | null
  header_notes: string | null
  boq_line_no: number
  cumulative_qty: number
  cumulative_pct: number
  cumulative_amount: number
  line_notes: string | null
}

const VALID_STATUSES = new Set(["DRAFT", "SUBMITTED", "APPROVED", "PAID", "REJECTED"])

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
  return n
}

function transformNonNegative(raw: string): number {
  const n = transformNumber(raw)
  if (n < 0) throw new Error(`ערך שלילי לא חוקי: "${raw}"`)
  return n
}

function transformOptionalNumber(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  return transformNumber(t)
}

function transformPct(raw: string): number {
  const n = transformNonNegative(raw)
  if (n > 100) throw new Error(`אחוז חורג מ-100: "${raw}"`)
  return n
}

function transformDate(raw: string): string {
  const t = raw.trim()
  if (!t) throw new Error("תאריך חסר")
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(t)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  }
  throw new Error(`פורמט תאריך לא נתמך: "${raw}"`)
}

function transformStatus(raw: string): string | null {
  const t = raw.trim().toUpperCase()
  if (!t) return null
  if (VALID_STATUSES.has(t)) return t
  if (t.includes("טיוטה") || t.includes("טיוטא")) return "DRAFT"
  if (t.includes("הוגש")) return "SUBMITTED"
  if (t.includes("אושר")) return "APPROVED"
  if (t.includes("שולם")) return "PAID"
  if (t.includes("נדחה")) return "REJECTED"
  throw new Error(`סטטוס לא חוקי: "${raw}"`)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export const SUBCONTRACTOR_BILLS_IMPORTER: ImporterSpec<SubcontractorBillImportPayload> =
  {
    kind: "subcontractor_bills",
    title: "חשבונות חלקיים — קבלן משנה",
    description:
      "ייבוא חשבונות חלקיים עם וולידציה של מפל מים פיננסי (עכבון/ביטוח/מצטבר/מע\"מ). שורה לכל BOQ line של חשבון. דורש שהחוזה ושורות ה-BOQ ייובאו תחילה.",
    templateFileName: "subcontractor-bills-template.csv",
    columns: [
      {
        field: "contract_number",
        label: "מספר חוזה",
        aliases: ["מספר חוזה", "Contract Number", "contract_number"],
        required: true,
      },
      {
        field: "bill_number",
        label: "מספר חשבון",
        aliases: ["מספר חשבון", "Bill Number", "bill_number"],
        required: true,
        transform: transformInt,
      },
      {
        field: "execution_month",
        label: "חודש ביצוע",
        aliases: ["חודש ביצוע", "Execution Month", "execution_month", "month"],
        required: true,
      },
      {
        field: "bill_date",
        label: "תאריך החשבון",
        aliases: ["תאריך החשבון", "תאריך חשבון", "Bill Date", "bill_date"],
        required: true,
        transform: transformDate,
      },
      {
        field: "previous_billed_amount",
        label: "מצטבר בחשבון קודם",
        aliases: [
          "מצטבר בחשבון קודם",
          "מצטבר קודם",
          "Previous Billed",
          "previous_billed_amount",
        ],
        required: false,
        transform: transformOptionalNumber,
      },
      {
        field: "vat_pct",
        label: "% מע\"מ",
        aliases: ["% מע\"מ", "אחוז מעמ", "VAT %", "vat_pct"],
        required: false,
        transform: (raw) => {
          const t = raw.trim()
          if (!t) return null
          return transformPct(t)
        },
      },
      {
        field: "status",
        label: "סטטוס",
        aliases: ["סטטוס", "Status", "status"],
        required: false,
        transform: transformStatus,
      },
      {
        field: "header_notes",
        label: "הערות לחשבון",
        aliases: ["הערות לחשבון", "Bill Notes", "header_notes"],
        required: false,
      },
      {
        field: "boq_line_no",
        label: "מספר שורת BOQ",
        aliases: ["מספר שורה", "BOQ Line", "boq_line_no", "line_no"],
        required: true,
        transform: transformInt,
      },
      {
        field: "cumulative_qty",
        label: "כמות מצטברת",
        aliases: ["כמות מצטברת", "Cumulative Qty", "cumulative_qty"],
        required: true,
        transform: transformNonNegative,
      },
      {
        field: "cumulative_pct",
        label: "% ביצוע מצטבר",
        aliases: ["% ביצוע מצטבר", "% ביצוע", "Cumulative %", "cumulative_pct"],
        required: true,
        transform: transformPct,
      },
      {
        field: "cumulative_amount",
        label: "סכום מצטבר",
        aliases: [
          "סכום מצטבר",
          "Cumulative Amount",
          "cumulative_amount",
          "Amount",
        ],
        required: true,
        transform: transformNonNegative,
      },
      {
        field: "line_notes",
        label: "הערות שורה",
        aliases: ["הערות שורה", "Line Notes", "line_notes"],
        required: false,
      },
    ],
    upsert: async (client, companyId, payloads) => {
      const failed: RowError[] = []
      let inserted = 0
      let updated = 0

      if (payloads.length === 0) return { inserted, updated, failed }

      // ----------------------------------------------------------------------
      // 1. Group payloads by (contract_number, bill_number).
      // ----------------------------------------------------------------------
      type Group = {
        contract_number: string
        bill_number: number
        rows: { p: SubcontractorBillImportPayload; rowIdx: number }[]
        firstRowIdx: number
      }
      const groups = new Map<string, Group>()
      payloads.forEach((p, idx) => {
        const key = `${p.contract_number}::${p.bill_number}`
        const g = groups.get(key)
        if (g) g.rows.push({ p, rowIdx: idx })
        else
          groups.set(key, {
            contract_number: p.contract_number,
            bill_number: p.bill_number,
            rows: [{ p, rowIdx: idx }],
            firstRowIdx: idx,
          })
      })

      // ----------------------------------------------------------------------
      // 2. Resolve contracts (with terms) once for all groups.
      // ----------------------------------------------------------------------
      const contractNumbers = [...groups.values()].map((g) => g.contract_number)
      const contractMap = await resolveContractsWithTerms(
        client,
        companyId,
        contractNumbers,
      )

      // ----------------------------------------------------------------------
      // 3. Process each bill independently — failures are scoped per-bill.
      // ----------------------------------------------------------------------
      for (const g of groups.values()) {
        const rowNumOf = (rowIdx: number) => rowIdx + 2
        const fail = (rowIdx: number, field: string | null, message: string) => {
          failed.push({ rowNumber: rowNumOf(rowIdx), field, message, rawValue: null })
        }

        const contract = contractMap.get(g.contract_number)
        if (!contract) {
          failed.push(
            makeMissingLookupError(
              rowNumOf(g.firstRowIdx),
              "contract_number",
              g.contract_number,
              "חוזה קבלן משנה",
            ),
          )
          continue
        }

        // Header consistency: execution_month, bill_date, previous_billed,
        // vat_pct, status, header_notes must match across all rows of a bill.
        const head = g.rows[0].p
        const headerFields: { field: keyof SubcontractorBillImportPayload; label: string }[] = [
          { field: "execution_month", label: "חודש ביצוע" },
          { field: "bill_date", label: "תאריך החשבון" },
          { field: "previous_billed_amount", label: "מצטבר בחשבון קודם" },
          { field: "vat_pct", label: 'אחוז מע"מ' },
        ]
        let headerInvalid = false
        for (const { field, label } of headerFields) {
          const seen = new Set(g.rows.map((r) => String(r.p[field] ?? "")))
          if (seen.size > 1) {
            fail(
              g.firstRowIdx,
              String(field),
              `שדה "${label}" לא עקבי בין שורות חשבון #${g.bill_number}: ${[...seen].join(" | ")}`,
            )
            headerInvalid = true
          }
        }
        if (headerInvalid) continue

        // Resolve boq_line ids for this contract.
        const lineNos = g.rows.map((r) => r.p.boq_line_no)
        const { data: boqRows, error: boqErr } = await client
          .from("erp_contract_boq_lines")
          .select("id,line_no,total_line_price,quantity")
          .eq("company_id", companyId)
          .eq("contract_id", contract.id)
          .in("line_no", lineNos)
        if (boqErr) {
          fail(g.firstRowIdx, null, `שגיאה בטעינת BOQ: ${boqErr.message}`)
          continue
        }
        type BoqRow = {
          id: string
          line_no: number
          total_line_price: number
          quantity: number
        }
        const boqMap = new Map<number, BoqRow>(
          ((boqRows ?? []) as BoqRow[]).map((r) => [r.line_no, r]),
        )

        // Per-line validation: each cumulative_amount must be within ±₪1 of
        // (cumulative_pct/100 × boq.total_line_price).
        let perLineInvalid = false
        for (const r of g.rows) {
          const boq = boqMap.get(r.p.boq_line_no)
          if (!boq) {
            fail(
              r.rowIdx,
              "boq_line_no",
              `שורת BOQ #${r.p.boq_line_no} לא נמצאה בחוזה ${g.contract_number}.`,
            )
            perLineInvalid = true
            continue
          }
          const expected = round2((r.p.cumulative_pct / 100) * Number(boq.total_line_price))
          const diff = Math.abs(r.p.cumulative_amount - expected)
          if (diff > TOLERANCE_NIS) {
            fail(
              r.rowIdx,
              "cumulative_amount",
              `אי-עקביות שורה ${r.p.boq_line_no}: ${r.p.cumulative_pct}% × ₪${Number(boq.total_line_price).toLocaleString("he-IL")} = ₪${expected.toLocaleString("he-IL")}, אבל הוגש ₪${r.p.cumulative_amount.toLocaleString("he-IL")} (פער ₪${diff.toFixed(2)}).`,
            )
            perLineInvalid = true
          }
        }
        if (perLineInvalid) continue

        // ---- Waterfall computation -----------------------------------------
        const cumulativeExecuted = round2(
          g.rows.reduce((s, r) => s + r.p.cumulative_amount, 0),
        )
        const retention = round2((Number(contract.retention_pct) / 100) * cumulativeExecuted)
        const insurance = round2((Number(contract.insurance_pct) / 100) * cumulativeExecuted)
        const net = round2(cumulativeExecuted - retention - insurance)
        const previousBilled = head.previous_billed_amount ?? 0
        const amountToPay = round2(net - previousBilled)
        if (amountToPay < 0) {
          fail(
            g.firstRowIdx,
            "previous_billed_amount",
            `סכום לתשלום שלילי: מצטבר נטו ₪${net.toLocaleString("he-IL")} פחות מצטבר קודם ₪${previousBilled.toLocaleString("he-IL")} = ₪${amountToPay.toLocaleString("he-IL")}. ייתכן שמצטבר קודם שגוי או שמדובר בזיכוי שדורש טיפול ידני.`,
          )
          continue
        }
        const vatPct = head.vat_pct ?? VAT_DEFAULT
        const vatAmount = round2((vatPct / 100) * amountToPay)
        const grandTotal = round2(amountToPay + vatAmount)

        // ---- Upsert header --------------------------------------------------
        const status = head.status ?? "DRAFT"

        // Detect existing for inserted/updated split.
        const { data: existingBill } = await client
          .from("erp_subcontractor_bills")
          .select("id")
          .eq("company_id", companyId)
          .eq("contract_id", contract.id)
          .eq("bill_number", g.bill_number)
          .maybeSingle()
        const wasExisting = !!existingBill

        const { data: upsertedHeader, error: hdrErr } = await client
          .from("erp_subcontractor_bills")
          .upsert(
            {
              company_id: companyId,
              project_id: contract.project_id,
              contract_id: contract.id,
              bill_number: g.bill_number,
              execution_month: head.execution_month,
              bill_date: head.bill_date,
              cumulative_executed_amount: cumulativeExecuted,
              retention_deduction_amount: retention,
              insurance_deduction_amount: insurance,
              previous_billed_amount: previousBilled,
              amount_to_pay: amountToPay,
              vat_pct: vatPct,
              vat_amount: vatAmount,
              grand_total_amount: grandTotal,
              status,
              notes: head.header_notes,
            },
            { onConflict: "company_id,contract_id,bill_number" },
          )
          .select("id")
          .maybeSingle()
        if (hdrErr || !upsertedHeader) {
          fail(
            g.firstRowIdx,
            null,
            `שגיאת DB ב-header של חשבון #${g.bill_number}: ${hdrErr?.message ?? "no row returned"}`,
          )
          continue
        }
        const billId = (upsertedHeader as { id: string }).id

        // ---- Replace lines --------------------------------------------------
        const { error: delErr } = await client
          .from("erp_subcontractor_bill_lines")
          .delete()
          .eq("company_id", companyId)
          .eq("bill_id", billId)
        if (delErr) {
          fail(
            g.firstRowIdx,
            null,
            `שגיאה במחיקת שורות קיימות: ${delErr.message}`,
          )
          continue
        }

        const lineRows = g.rows.map((r) => {
          const boq = boqMap.get(r.p.boq_line_no)!
          return {
            company_id: companyId,
            bill_id: billId,
            boq_line_id: boq.id,
            cumulative_qty: r.p.cumulative_qty,
            cumulative_pct: r.p.cumulative_pct,
            cumulative_amount: r.p.cumulative_amount,
            notes: r.p.line_notes,
          }
        })
        const { error: insErr } = await client
          .from("erp_subcontractor_bill_lines")
          .insert(lineRows)
        if (insErr) {
          fail(
            g.firstRowIdx,
            null,
            `שגיאה בהכנסת שורות חשבון: ${insErr.message}`,
          )
          continue
        }

        if (wasExisting) updated += 1
        else inserted += 1
      }

      return { inserted, updated, failed }
    },
  }
