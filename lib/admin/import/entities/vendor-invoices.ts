/**
 * Vendor Invoices importer (`erp_vendor_invoices`) — Sprint A.2.
 *
 * Source: SAP/Priority/Hashavshevet AP exports.
 * Conflict key: (company_id, invoice_number) — UPSERT, updating non-null fields.
 *
 * Status semantics: imports default to NEW (will pass through 3-Way Match
 * downstream); operator may override to APPROVED via the column. The Sprint
 * A.2 demo seeds use READY_FOR_PAYMENT directly via SQL.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { ImporterSpec, RowError } from "../types"

const UPSERT_CHUNK = 200

const ALLOWED_STATUSES = new Set([
  "DRAFT",
  "FINAL",
  "NEW",
  "APPROVED",
  "READY_FOR_PAYMENT",
  "MATCHED",
  "HAS_VARIANCES",
])

export type VendorInvoiceImportPayload = {
  invoice_number: string
  supplier_number: string
  invoice_date: string
  total_amount: number
  status: string
  notes: string | null
}

function transformDate(raw: string): string {
  const t = raw.trim()
  if (!t) throw new Error("חסר תאריך")
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(t)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  }
  throw new Error(`תאריך לא תקין: "${raw}"`)
}

function transformAmount(raw: string): number {
  const cleaned = raw.replace(/[,₪\s]/g, "")
  const n = Number(cleaned)
  if (!Number.isFinite(n)) throw new Error(`סכום לא מספרי: "${raw}"`)
  if (n < 0) throw new Error(`סכום שלילי לא נתמך: "${raw}"`)
  return n
}

function transformStatus(raw: string): string {
  const t = raw.trim().toUpperCase()
  if (!t) return "NEW"
  if (!ALLOWED_STATUSES.has(t)) {
    throw new Error(
      `סטטוס לא נתמך: "${raw}". ערכים מותרים: ${[...ALLOWED_STATUSES].join(", ")}.`,
    )
  }
  return t
}

export const VENDOR_INVOICES_IMPORTER: ImporterSpec<VendorInvoiceImportPayload> =
  {
    kind: "vendor_invoices",
    title: "חשבוניות ספק",
    description:
      "ייבוא חשבוניות ספק מ-Priority/SAP. Upsert על (company_id, invoice_number). הספק מזוהה לפי supplier_number.",
    templateFileName: "vendor-invoices-template.csv",
    columns: [
      {
        field: "invoice_number",
        label: "מספר חשבונית",
        aliases: ["מספר חשבונית", "Invoice Number", "invoice_number"],
        required: true,
      },
      {
        field: "supplier_number",
        label: "מספר ספק",
        aliases: ["מספר ספק", "Supplier Number", "supplier_number"],
        required: true,
      },
      {
        field: "invoice_date",
        label: "תאריך חשבונית",
        aliases: ["תאריך חשבונית", "תאריך", "Invoice Date", "invoice_date"],
        required: true,
        transform: transformDate,
      },
      {
        field: "total_amount",
        label: "סכום כולל",
        aliases: ["סכום כולל", "סכום", "Total", "Amount", "total_amount"],
        required: true,
        transform: transformAmount,
      },
      {
        field: "status",
        label: "סטטוס",
        aliases: ["סטטוס", "Status", "status"],
        required: false,
        transform: transformStatus,
      },
      {
        field: "notes",
        label: "הערות",
        aliases: ["הערות", "Notes", "notes"],
        required: false,
      },
    ],
    upsert: async (client: SupabaseClient, companyId, payloads) => {
      const failed: RowError[] = []
      if (payloads.length === 0) return { inserted: 0, updated: 0, failed }

      // Resolve supplier_number → supplier_id
      const supplierNumbers = [...new Set(payloads.map((p) => p.supplier_number))]
      const { data: suppliers, error: sErr } = await client
        .from("erp_md_suppliers")
        .select("id, supplier_number")
        .eq("company_id", companyId)
        .in("supplier_number", supplierNumbers)
      if (sErr) {
        failed.push({
          rowNumber: 1,
          field: null,
          message: `שגיאה בטעינת ספקים: ${sErr.message}`,
          rawValue: null,
        })
        return { inserted: 0, updated: 0, failed }
      }
      const supByNumber = new Map<string, string>()
      for (const s of (suppliers ?? []) as {
        id: string
        supplier_number: string
      }[]) {
        supByNumber.set(s.supplier_number, s.id)
      }

      // Pre-load existing invoices for insert/update accounting
      const invoiceNumbers = [...new Set(payloads.map((p) => p.invoice_number))]
      const { data: existing } = await client
        .from("erp_vendor_invoices")
        .select("invoice_number")
        .eq("company_id", companyId)
        .in("invoice_number", invoiceNumbers)
      const existingSet = new Set(
        (existing ?? []).map((r) => (r as { invoice_number: string }).invoice_number),
      )

      const rowsToUpsert: Record<string, unknown>[] = []
      for (let i = 0; i < payloads.length; i++) {
        const p = payloads[i]
        const supplierId = supByNumber.get(p.supplier_number)
        if (!supplierId) {
          failed.push({
            rowNumber: i + 2,
            field: "supplier_number",
            message: `ספק "${p.supplier_number}" לא קיים. הוסיפו אותו ב-Suppliers.`,
            rawValue: p.supplier_number,
          })
          continue
        }
        rowsToUpsert.push({
          company_id: companyId,
          supplier_id: supplierId,
          invoice_number: p.invoice_number,
          invoice_date: p.invoice_date,
          total_amount: p.total_amount,
          status: p.status,
          notes: p.notes,
        })
      }

      let inserted = 0
      let updated = 0
      for (let i = 0; i < rowsToUpsert.length; i += UPSERT_CHUNK) {
        const chunk = rowsToUpsert.slice(i, i + UPSERT_CHUNK)
        const { error: upErr } = await client
          .from("erp_vendor_invoices")
          .upsert(chunk, { onConflict: "company_id,invoice_number" })
        if (upErr) {
          failed.push({
            rowNumber: i + 2,
            field: null,
            message: `שגיאת UPSERT: ${upErr.message}`,
            rawValue: null,
          })
          continue
        }
        for (const row of chunk) {
          if (existingSet.has(String(row.invoice_number))) updated += 1
          else inserted += 1
        }
      }

      return { inserted, updated, failed }
    },
  }
