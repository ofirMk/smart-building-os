"use server"

import { revalidatePath } from "next/cache"

import { createServerSupabaseClient } from "@/lib/supabase/server"
import { formatError } from "@/lib/utils"
import type { FinancialClearanceRow } from "@/types/holden-finance"

const CLEARANCE = "/marker-ofek/finance/clearance"
const HEALTH = "/marker-ofek/system/health"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export async function fetchPendingFinancialClearanceAction(): Promise<
  | { ok: true, rows: FinancialClearanceRow[] }
  | { ok: false, error: string }
> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: recs, error: rErr } = await supabase
      .from("warehouse_receipts")
      .select(
        "id, po_id, receipt_date, warehouse_location, financial_approval_status, delivery_note_image_url, verification_notes"
      )
      .eq("financial_approval_status", "pending")
      .order("receipt_date", { ascending: false })
      .limit(200)
    if (rErr) throw rErr
    const ids = (recs ?? []).map((r) => String((r as { id: string }).id))
    if (ids.length === 0) return { ok: true, rows: [] }

    const poIds = [
      ...new Set(
        (recs ?? []).map((r) => String((r as { po_id: string }).po_id))
      ),
    ]
    const { data: pos, error: pErr } = await supabase
      .from("purchase_orders")
      .select("id, po_number, project_id, supplier_id")
      .in("id", poIds)
    if (pErr) throw pErr
    const poById = new Map(
      (pos ?? []).map((p) => [String((p as { id: string }).id), p])
    )

    const projIds = [
      ...new Set(
        (pos ?? [])
          .map((p) => (p as { project_id: string | null }).project_id)
          .filter(Boolean)
          .map(String)
      ),
    ]
    const entIds = [
      ...new Set(
        (pos ?? []).map((p) => String((p as { supplier_id: string }).supplier_id))
      ),
    ]

    const projName = new Map<string, string>()
    if (projIds.length > 0) {
      const { data: prs } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", projIds)
      for (const pr of prs ?? []) {
        projName.set(
          String((pr as { id: string }).id),
          String((pr as { name: string }).name ?? "")
        )
      }
    }
    const entName = new Map<string, string>()
    if (entIds.length > 0) {
      const { data: ens } = await supabase
        .from("entities")
        .select("id, name")
        .in("id", entIds)
      for (const e of ens ?? []) {
        entName.set(
          String((e as { id: string }).id),
          String((e as { name: string }).name ?? "")
        )
      }
    }

    const { data: wrl, error: wErr } = await supabase
      .from("warehouse_receipt_lines")
      .select("receipt_id, purchase_order_line_id, quantity_received")
      .in("receipt_id", ids)
    if (wErr) throw wErr

    const { data: allPols, error: polErr } = await supabase
      .from("purchase_order_lines")
      .select("id, order_id, part_id, quantity, unit_price, line_total")
      .in("order_id", poIds)
    if (polErr) throw polErr
    const polsByOrder = new Map<string, typeof allPols>()
    for (const p of allPols ?? []) {
      const oid = String((p as { order_id: string }).order_id)
      const arr = polsByOrder.get(oid) ?? []
      arr.push(p)
      polsByOrder.set(oid, arr)
    }

    const partIds = [
      ...new Set(
        (allPols ?? []).map((p) => String((p as { part_id: string }).part_id))
      ),
    ]
    const partLabel = new Map<string, string>()
    if (partIds.length > 0) {
      const { data: parts } = await supabase
        .from("supplier_parts")
        .select("id, part_number_supplier, description_32_chars")
        .in("id", partIds)
      for (const pt of parts ?? []) {
        const row = pt as {
          id: string
          part_number_supplier: string
          description_32_chars: string
        }
        const label = [row.part_number_supplier, row.description_32_chars]
          .filter(Boolean)
          .join(" · ")
        partLabel.set(String(row.id), label || "מקט״י")
      }
    }

    const linesByRec = new Map<
      string,
      Array<{ purchaseOrderLineId: string, quantityReceived: number }>
    >()
    for (const row of wrl ?? []) {
      const rid = String((row as { receipt_id: string }).receipt_id)
      const lid = String(
        (row as { purchase_order_line_id: string }).purchase_order_line_id
      )
      const q =
        Number((row as { quantity_received: number }).quantity_received) || 0
      const arr = linesByRec.get(rid) ?? []
      arr.push({ purchaseOrderLineId: lid, quantityReceived: q })
      linesByRec.set(rid, arr)
    }

    const rows: FinancialClearanceRow[] = []
    for (const rec of recs ?? []) {
      const r = rec as {
        id: string
        po_id: string
        receipt_date: string
        warehouse_location: string
        financial_approval_status: string
        delivery_note_image_url: string | null
        verification_notes: string | null
      }
      const po = poById.get(String(r.po_id)) as
        | {
            id: string
            po_number: string
            project_id: string | null
            supplier_id: string
          }
        | undefined
      if (!po) continue
      const rl = linesByRec.get(String(r.id)) ?? []
      const receiptQtyByPurchaseOrderLineId: Record<string, number> = {}
      for (const x of rl) {
        receiptQtyByPurchaseOrderLineId[x.purchaseOrderLineId] = x.quantityReceived
      }

      const polForPo = polsByOrder.get(String(po.id)) ?? []
      const orderedLines: FinancialClearanceRow["orderedLines"] = []
      let orderedValueFull = 0
      for (const pol of polForPo) {
        const p = pol as {
          id: string
          part_id: string
          quantity: number
          unit_price: number
          line_total: number
        }
        const oq = Number(p.quantity) || 0
        const up = Number(p.unit_price) || 0
        const lt = Number(p.line_total) || roundMoney(oq * up)
        orderedValueFull += lt
        orderedLines.push({
          lineId: String(p.id),
          partLabel: partLabel.get(String(p.part_id)) ?? "—",
          orderedQty: oq,
          unitPrice: up,
          lineTotal: lt,
        })
      }

      let receivedValueThisReceipt = 0
      let aligned = polForPo.length > 0
      for (const pol of polForPo) {
        const pid = String((pol as { id: string }).id)
        const p = pol as {
          id: string
          quantity: number
          unit_price: number
        }
        const oq = Number(p.quantity) || 0
        const up = Number(p.unit_price) || 0
        const got = receiptQtyByPurchaseOrderLineId[pid] ?? 0
        receivedValueThisReceipt += roundMoney(got * up)
        if (Math.abs(got - oq) > 1e-6) aligned = false
      }

      const ratio =
        orderedValueFull > 1e-9
          ? receivedValueThisReceipt / orderedValueFull
          : polForPo.length === 0
            ? 1
            : 0

      rows.push({
        receiptId: String(r.id),
        receiptDate: String(r.receipt_date ?? ""),
        warehouseLocation: String(r.warehouse_location ?? ""),
        poId: String(po.id),
        poNumber: String(po.po_number ?? ""),
        projectName: po.project_id
          ? projName.get(String(po.project_id)) ?? "—"
          : "—",
        supplierName: entName.get(String(po.supplier_id)) ?? "—",
        financialApprovalStatus: String(r.financial_approval_status ?? "pending"),
        deliveryNoteStoragePath: r.delivery_note_image_url,
        verificationNotes: r.verification_notes,
        orderedLines,
        receiptQtyByPurchaseOrderLineId,
        quantitiesFullyAligned: aligned && polForPo.length > 0,
        valueAlignmentRatio: ratio,
      })
    }

    return { ok: true, rows }
  } catch (e) {
    console.error("fetchPendingFinancialClearanceAction:", e)
    return { ok: false, error: formatError(e) || "טעינה נכשלה" }
  }
}

export async function getDeliveryNoteSignedUrlAction(
  storagePath: string
): Promise<
  | { ok: true, url: string }
  | { ok: false, error: string }
> {
  try {
    const raw = String(storagePath ?? "").trim()
    if (!raw) {
      return { ok: false, error: "אין נתיב לתמונה" }
    }
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return { ok: true, url: raw }
    }
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.storage
      .from("delivery-notes")
      .createSignedUrl(raw, 3600)
    if (error) throw error
    const url = data?.signedUrl
    if (!url) throw new Error("לא נוצר קישור")
    return { ok: true, url }
  } catch (e) {
    return { ok: false, error: formatError(e) || "שגיאת אחסון" }
  }
}

export async function authorizeProcurementInvoiceAction(
  warehouseReceiptId: string
): Promise<
  | { ok: true, masavQueueId: string | null, pendingSync: boolean, message?: string }
  | { ok: false, error: string }
> {
  try {
    const id = String(warehouseReceiptId ?? "").trim()
    if (!id) {
      return { ok: false, error: "חסר מזהה קבלה" }
    }
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const { data: rec, error: recErr } = await supabase
      .from("warehouse_receipts")
      .select(
        "id, po_id, financial_approval_status, receipt_date, delivery_note_image_url"
      )
      .eq("id", id)
      .maybeSingle()
    if (recErr) throw recErr
    if (!rec) {
      return { ok: false, error: "קבלה לא נמצאה" }
    }
    const st = (rec as { financial_approval_status: string })
      .financial_approval_status
    if (st !== "pending") {
      return { ok: false, error: "קבלה זו כבר טופלה בבקרה" }
    }

    const poId = String((rec as { po_id: string }).po_id)
    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .select("id, po_number, supplier_id")
      .eq("id", poId)
      .maybeSingle()
    if (poErr) throw poErr
    if (!po) {
      return { ok: false, error: "הזמנה לא נמצאה" }
    }
    const supplierEntityId = String(
      (po as { supplier_id: string }).supplier_id
    )
    const { data: ent } = await supabase
      .from("entities")
      .select("name")
      .eq("id", supplierEntityId)
      .maybeSingle()
    const payeeLabel = String(
      (ent as { name: string } | null)?.name ?? "ספק"
    ).slice(0, 120)
    const poNum = String((po as { po_number: string }).po_number ?? "")
    const refLabel = `PO ${poNum} · קבלה ${id.slice(0, 8)}`

    const { data: wrl, error: wErr } = await supabase
      .from("warehouse_receipt_lines")
      .select("purchase_order_line_id, quantity_received")
      .eq("receipt_id", id)
    if (wErr) throw wErr
    const polIds = (wrl ?? []).map((w) =>
      String((w as { purchase_order_line_id: string }).purchase_order_line_id)
    )
    if (polIds.length === 0) {
      return { ok: false, error: "אין שורות בקבלה" }
    }
    const { data: polRows, error: polErr } = await supabase
      .from("purchase_order_lines")
      .select("id, unit_price")
      .in("id", polIds)
    if (polErr) throw polErr
    const priceByLine = new Map(
      (polRows ?? []).map((p) => [
        String((p as { id: string }).id),
        Number((p as { unit_price: number }).unit_price) || 0,
      ])
    )
    let amount = 0
    for (const row of wrl ?? []) {
      const lid = String(
        (row as { purchase_order_line_id: string }).purchase_order_line_id
      )
      const q =
        Number((row as { quantity_received: number }).quantity_received) || 0
      const up = priceByLine.get(lid) ?? 0
      amount += roundMoney(q * up)
    }

    const { error: upErr } = await supabase
      .from("warehouse_receipts")
      .update({
        financial_approval_status: "authorized",
        authorized_by: user.id,
        authorized_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("financial_approval_status", "pending")
    if (upErr) throw upErr

    const payloadJson = {
      warehouse_receipt_id: id,
      amount_ils: amount,
      payee_label: payeeLabel,
      reference_label: refLabel,
    }

    try {
      const { data: inserted, error: insErr } = await supabase
        .from("masav_queue_items")
        .insert({
          warehouse_receipt_id: id,
          amount_ils: amount,
          payee_label: payeeLabel,
          reference_label: refLabel,
          status: "draft",
        })
        .select("id")
        .single()

      if (insErr) {
        const msg = formatError(insErr) || ""
        if (msg.includes("duplicate") || msg.includes("unique")) {
          const { data: existing } = await supabase
            .from("masav_queue_items")
            .select("id")
            .eq("warehouse_receipt_id", id)
            .maybeSingle()
          const mqId = existing
            ? String((existing as { id: string }).id)
            : null
          revalidatePath(CLEARANCE)
          revalidatePath("/marker-ofek/finance/payments/masav")
          return {
            ok: true,
            masavQueueId: mqId,
            pendingSync: false,
          }
        }
        throw insErr
      }

      const mqId = inserted
        ? String((inserted as { id: string }).id)
        : null

      revalidatePath(CLEARANCE)
      revalidatePath("/marker-ofek/finance/payments/masav")
      return {
        ok: true,
        masavQueueId: mqId,
        pendingSync: false,
      }
    } catch (queueErr: unknown) {
      const errText = formatError(queueErr) || "שגיאת תור תשלומים"
      await supabase.from("system_sync_logs").insert({
        source_module: "procurement_clearance",
        target_module: "masav_queue",
        payload_json: payloadJson,
        status: "pending",
        error_message: errText,
        idempotency_key: null,
      })

      revalidatePath(CLEARANCE)
      revalidatePath(HEALTH)
      return {
        ok: true,
        masavQueueId: null,
        pendingSync: true,
        message:
          "הפעולה נרשמה מקומית, הסנכרון הפיננסי יושלם אוטומטית כשהחיבור יתייצב",
      }
    }
  } catch (e) {
    console.error("authorizeProcurementInvoiceAction:", e)
    return { ok: false, error: formatError(e) || "אישור נכשל" }
  }
}

export async function fetchSystemHealthAction(): Promise<
  | {
      ok: true
      pending: number
      failed: number
      synced: number
      recent: Array<{
        id: string
        status: string
        sourceModule: string
        targetModule: string
        retryCount: number
        updatedAt: string
        errorMessage: string | null
      }>
    }
  | { ok: false, error: string }
> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: logs, error } = await supabase
      .from("system_sync_logs")
      .select(
        "id, status, source_module, target_module, retry_count, updated_at, error_message"
      )
      .order("updated_at", { ascending: false })
      .limit(80)
    if (error) throw error

    let pending = 0
    let failed = 0
    let synced = 0
    for (const row of logs ?? []) {
      const st = String((row as { status: string }).status)
      if (st === "pending") pending += 1
      else if (st === "failed") failed += 1
      else if (st === "synced") synced += 1
    }

    const { count: pTotal } = await supabase
      .from("system_sync_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
    const { count: fTotal } = await supabase
      .from("system_sync_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
    const { count: sTotal } = await supabase
      .from("system_sync_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "synced")

    const recent = (logs ?? []).map((row) => {
      const r = row as {
        id: string
        status: string
        source_module: string
        target_module: string
        retry_count: number
        updated_at: string
        error_message: string | null
      }
      return {
        id: String(r.id),
        status: String(r.status),
        sourceModule: String(r.source_module),
        targetModule: String(r.target_module),
        retryCount: Number(r.retry_count) || 0,
        updatedAt: String(r.updated_at ?? ""),
        errorMessage: r.error_message,
      }
    })

    return {
      ok: true,
      pending: pTotal ?? pending,
      failed: fTotal ?? failed,
      synced: sTotal ?? synced,
      recent,
    }
  } catch (e) {
    return { ok: false, error: formatError(e) || "שגיאה" }
  }
}

export async function retrySystemSyncLogAction(
  logId: string
): Promise<{ ok: true } | { ok: false, error: string }> {
  try {
    const id = String(logId ?? "").trim()
    if (!id) {
      return { ok: false, error: "חסר מזהה" }
    }
    const supabase = await createServerSupabaseClient()
    const { data: log, error: lErr } = await supabase
      .from("system_sync_logs")
      .select("id, payload_json, status, target_module, retry_count")
      .eq("id", id)
      .maybeSingle()
    if (lErr) throw lErr
    if (!log) {
      return { ok: false, error: "רשומה לא נמצאה" }
    }
    const target = String((log as { target_module: string }).target_module)
    const payload = (log as { payload_json: Record<string, unknown> }).payload_json
    if (target !== "masav_queue") {
      return { ok: false, error: "סנכרון ידני לא נתמך ליעד זה" }
    }
    const wrId = String(payload?.warehouse_receipt_id ?? "")
    if (!wrId) {
      return { ok: false, error: "חסר מזהה קבלה ב־payload" }
    }
    const amount = Number(payload?.amount_ils) || 0
    const payee = String(payload?.payee_label ?? "")
    const ref = String(payload?.reference_label ?? "")

    const { error: insErr } = await supabase.from("masav_queue_items").insert({
      warehouse_receipt_id: wrId,
      amount_ils: amount,
      payee_label: payee,
      reference_label: ref,
      status: "draft",
    })
    if (insErr) {
      const msg = formatError(insErr) || ""
      if (msg.includes("duplicate") || msg.includes("unique")) {
        await supabase
          .from("system_sync_logs")
          .update({
            status: "synced",
            error_message: null,
            retry_count: Number((log as { retry_count: number }).retry_count) + 1,
          })
          .eq("id", id)
        revalidatePath(HEALTH)
        revalidatePath("/marker-ofek/finance/payments/masav")
        revalidatePath(CLEARANCE)
        return { ok: true }
      }
      const next = Number((log as { retry_count: number }).retry_count) + 1
      await supabase
        .from("system_sync_logs")
        .update({
          status: "failed",
          error_message: formatError(insErr) || "כשל חוזר",
          retry_count: next,
        })
        .eq("id", id)
      throw insErr
    }

    await supabase
      .from("system_sync_logs")
      .update({
        status: "synced",
        error_message: null,
        retry_count: Number((log as { retry_count: number }).retry_count) + 1,
      })
      .eq("id", id)

    revalidatePath(HEALTH)
    revalidatePath("/marker-ofek/finance/payments/masav")
    revalidatePath(CLEARANCE)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) || "ניסיון חוזר נכשל" }
  }
}
