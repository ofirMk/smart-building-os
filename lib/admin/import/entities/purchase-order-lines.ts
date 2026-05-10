/**
 * Purchase Order lines importer (`erp_purchase_order_lines`).
 *
 * The DB table has NO unique natural key on (po, line_no) — `line_no` isn't
 * even a column. We therefore use **delete-then-insert per PO** semantics:
 *
 *   For every PO referenced in the file:
 *     1. DELETE all existing lines of that PO.
 *     2. INSERT all lines from the file for that PO.
 *
 * Meaning: the uploaded file is the **authoritative set of lines** for each
 * PO it mentions. POs not mentioned in the file are untouched. To keep the
 * importer safe under concurrent writes, we do the delete+insert inside the
 * same server action (no DB transaction available via PostgREST, but the
 * window is short and this is admin-only).
 *
 * Cross-entity deps:
 *   - `po_number → { id, project_id }` (project_id comes from PO header to
 *      avoid requiring the project_number column on every PO line row).
 */
import { makeMissingLookupError, resolvePurchaseOrderIds } from "../lookups"
import type { ImporterSpec, RowError } from "../types"

const INSERT_CHUNK = 200

export type PurchaseOrderLineImportPayload = {
  po_number: string
  budget_sub_chapter: string
  resource_id: string
  description: string
  quantity: number
  unit_price: number
}

function transformNumber(raw: string): number {
  const cleaned = raw.replace(/[,₪\s]/g, "")
  const n = Number(cleaned)
  if (!Number.isFinite(n)) throw new Error(`ערך לא מספרי: "${raw}"`)
  if (n < 0) throw new Error(`ערך שלילי לא חוקי: "${raw}"`)
  return n
}

export const PURCHASE_ORDER_LINES_IMPORTER: ImporterSpec<PurchaseOrderLineImportPayload> =
  {
    kind: "purchase_order_lines",
    title: "שורות הזמנת רכש",
    description:
      "ייבוא שורות לפי מספר הזמנה. סמנטיקה: הקובץ הוא מקור האמת לכל הזמנה שמופיעה בו (שורות קיימות נמחקות ומוחלפות). דורש ייבוא של הזמנות קודם.",
    templateFileName: "purchase-order-lines-template.csv",
    columns: [
      {
        field: "po_number",
        label: "מספר הזמנה",
        aliases: ["מספר הזמנה", "PO Number", "po_number", "ORDNAME"],
        required: true,
      },
      {
        field: "budget_sub_chapter",
        label: "תת-פרק תקציב",
        aliases: [
          "תת-פרק תקציב",
          "תת פרק",
          "Budget Sub-chapter",
          "budget_sub_chapter",
          "sub_chapter",
        ],
        required: true,
      },
      {
        field: "resource_id",
        label: "קוד משאב",
        aliases: ["קוד משאב", "Resource", "resource_id", "PARTNAME"],
        required: true,
      },
      {
        field: "description",
        label: "תיאור",
        aliases: ["תיאור", "Description", "description", "PARTDES"],
        required: true,
      },
      {
        field: "quantity",
        label: "כמות",
        aliases: ["כמות", "Quantity", "quantity", "qty", "TQUANT"],
        required: true,
        transform: transformNumber,
      },
      {
        field: "unit_price",
        label: "מחיר יחידה",
        aliases: ["מחיר יחידה", "Unit Price", "unit_price", "price", "PRICE"],
        required: true,
        transform: transformNumber,
      },
    ],
    upsert: async (client, companyId, payloads) => {
      const failed: RowError[] = []
      let inserted = 0
      const updated = 0 // N/A: delete-then-insert — everything counted as "inserted"

      const poMap = await resolvePurchaseOrderIds(
        client,
        companyId,
        payloads.map((p) => p.po_number),
      )

      type Resolved = {
        p: PurchaseOrderLineImportPayload
        purchase_order_id: string
        project_id: string
        rowIdx: number
      }
      const resolved: Resolved[] = []
      payloads.forEach((p, idx) => {
        const po = poMap.get(p.po_number)
        if (!po) {
          failed.push(
            makeMissingLookupError(
              idx + 2,
              "po_number",
              p.po_number,
              "הזמנת רכש",
            ),
          )
          return
        }
        resolved.push({
          p,
          purchase_order_id: po.id,
          project_id: po.project_id,
          rowIdx: idx,
        })
      })

      if (resolved.length === 0) return { inserted, updated, failed }

      // Group resolved rows by PO for the delete+insert cycle.
      const byPo = new Map<string, Resolved[]>()
      for (const r of resolved) {
        const arr = byPo.get(r.purchase_order_id)
        if (arr) arr.push(r)
        else byPo.set(r.purchase_order_id, [r])
      }

      // Step 1: delete all existing lines for these POs in a single round-trip.
      const poIds = [...byPo.keys()]
      const { error: delError } = await client
        .from("erp_purchase_order_lines")
        .delete()
        .eq("company_id", companyId)
        .in("purchase_order_id", poIds)

      if (delError) {
        // Report once; abort insertion to avoid duplicates.
        failed.push({
          rowNumber: resolved[0].rowIdx + 2,
          field: null,
          message: `שגיאה במחיקת שורות קיימות: ${delError.message}`,
          rawValue: null,
        })
        return { inserted, updated, failed }
      }

      // Step 2: insert all lines in chunks.
      for (let i = 0; i < resolved.length; i += INSERT_CHUNK) {
        const chunk = resolved.slice(i, i + INSERT_CHUNK)
        const rows = chunk.map(({ p, purchase_order_id, project_id }) => ({
          company_id: companyId,
          purchase_order_id,
          project_id,
          budget_sub_chapter: p.budget_sub_chapter,
          resource_id: p.resource_id,
          description: p.description,
          quantity: p.quantity,
          unit_price: p.unit_price,
        }))
        const { error } = await client
          .from("erp_purchase_order_lines")
          .insert(rows)
        if (error) {
          failed.push({
            rowNumber: chunk[0].rowIdx + 2,
            field: null,
            message: `שגיאת DB ב-chunk שמתחיל בשורה ${chunk[0].rowIdx + 2}: ${error.message}`,
            rawValue: null,
          })
          continue
        }
        inserted += chunk.length
      }

      return { inserted, updated, failed }
    },
  }
