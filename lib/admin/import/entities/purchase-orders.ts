/**
 * Purchase Orders importer (`erp_purchase_orders`) — header only.
 *
 * Source: Priority's ORDERS form (open POs only). Conflict key:
 * `(company_id, po_number)`.
 *
 * Cross-entity dependencies:
 *   - `project_number → project_id`
 *   - `supplier_number → supplier_id`
 *
 * PO lines are deferred to a separate Sprint-2 importer because they require
 * `budget_sub_chapter` + `resource_id` resolution that depends on a separate
 * resource catalog import (also Sprint 2).
 */
import {
  makeMissingLookupError,
  resolveProjectIds,
  resolveSupplierIds,
} from "../lookups"
import type { ImporterSpec, RowError } from "../types"

const UPSERT_CHUNK = 100

export type PurchaseOrderImportPayload = {
  po_number: string
  project_number: string
  supplier_number: string
  title: string
  status: string
  total_amount: number
  issued_at: string | null
  notes: string | null
}

const VALID_STATUSES = new Set([
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "ORDERED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CLOSED",
  "CANCELLED",
])

function transformStatus(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/[\s-]+/g, "_")
  if (!t) return "DRAFT"
  if (VALID_STATUSES.has(t)) return t
  if (t.includes("טיוטה") || t === "OPEN") return "DRAFT"
  if (t.includes("אושר") || t === "APPROVED") return "APPROVED"
  if (t.includes("הוזמן")) return "ORDERED"
  if (t.includes("התקבל") && t.includes("חלקי")) return "PARTIALLY_RECEIVED"
  if (t.includes("התקבל")) return "RECEIVED"
  if (t.includes("סגור")) return "CLOSED"
  if (t.includes("בוטל")) return "CANCELLED"
  throw new Error(`סטטוס PO לא חוקי: "${raw}".`)
}

function transformAmount(raw: string): number {
  const cleaned = raw.replace(/[,₪\s]/g, "")
  const n = Number(cleaned)
  if (!Number.isFinite(n)) throw new Error(`סכום לא מספרי: "${raw}"`)
  if (n < 0) throw new Error(`סכום שלילי: "${raw}"`)
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

export const PURCHASE_ORDERS_IMPORTER: ImporterSpec<PurchaseOrderImportPayload> = {
  kind: "purchase_orders",
  title: "הזמנות רכש (header)",
  description:
    "ייבוא header של POs פתוחים. תלוי ב-projects + suppliers. שורות ייובאו בסבב נפרד (Sprint 2).",
  templateFileName: "purchase-orders-template.csv",
  columns: [
    {
      field: "po_number",
      label: "מספר הזמנה",
      aliases: ["מספר הזמנה", "PO Number", "po_number", "ORDNAME"],
      required: true,
    },
    {
      field: "project_number",
      label: "מספר פרויקט",
      aliases: ["מספר פרויקט", "Project Number", "project_number"],
      required: true,
    },
    {
      field: "supplier_number",
      label: "מספר ספק",
      aliases: ["מספר ספק", "Supplier Number", "supplier_number"],
      required: true,
    },
    {
      field: "title",
      label: "כותרת",
      aliases: ["כותרת", "Title", "title", "DETAILS"],
      required: true,
    },
    {
      field: "status",
      label: "סטטוס",
      aliases: ["סטטוס", "Status", "status"],
      required: false,
      transform: transformStatus,
    },
    {
      field: "total_amount",
      label: "סכום הזמנה",
      aliases: ["סכום הזמנה", "Total", "total_amount", "QPRICE"],
      required: false,
      transform: transformAmount,
    },
    {
      field: "issued_at",
      label: "תאריך הוצאה",
      aliases: ["תאריך הוצאה", "תאריך", "Issue Date", "issued_at", "CURDATE"],
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

    const [projectMap, supplierMap] = await Promise.all([
      resolveProjectIds(client, companyId, payloads.map((p) => p.project_number)),
      resolveSupplierIds(client, companyId, payloads.map((p) => p.supplier_number)),
    ])

    type Resolved = {
      p: PurchaseOrderImportPayload
      project_id: string
      supplier_id: string
      rowIdx: number
    }
    const resolved: Resolved[] = []
    payloads.forEach((p, idx) => {
      const pid = projectMap.get(p.project_number)
      const sid = supplierMap.get(p.supplier_number)
      if (!pid) {
        failed.push(makeMissingLookupError(idx + 2, "project_number", p.project_number, "פרויקט"))
        return
      }
      if (!sid) {
        failed.push(makeMissingLookupError(idx + 2, "supplier_number", p.supplier_number, "ספק"))
        return
      }
      resolved.push({ p, project_id: pid, supplier_id: sid, rowIdx: idx })
    })

    if (resolved.length === 0) return { inserted, updated, failed }

    const numbers = resolved.map((r) => r.p.po_number)
    const { data: existing } = await client
      .from("erp_purchase_orders")
      .select("po_number")
      .eq("company_id", companyId)
      .in("po_number", numbers)
    const existingSet = new Set(
      (existing ?? []).map((r: { po_number: string }) => r.po_number),
    )

    for (let i = 0; i < resolved.length; i += UPSERT_CHUNK) {
      const chunk = resolved.slice(i, i + UPSERT_CHUNK)
      const rows = chunk.map(({ p, project_id, supplier_id }) => ({
        company_id: companyId,
        po_number: p.po_number,
        project_id,
        supplier_id,
        title: p.title,
        status: p.status ?? "DRAFT",
        total_amount: p.total_amount ?? 0,
        issued_at: p.issued_at,
        notes: p.notes,
      }))
      const { error } = await client
        .from("erp_purchase_orders")
        .upsert(rows, { onConflict: "company_id,po_number" })
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
        if (existingSet.has(p.po_number)) updated += 1
        else inserted += 1
      }
    }
    return { inserted, updated, failed }
  },
}
