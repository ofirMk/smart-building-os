"use server"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

export type SalesOrderLineInput = {
  itemCatalogId: string
  sku: string | null
  description: string
  quantity: number
  unitPrice: number
}

export async function createSalesOrderAction(input: {
  clientEntityId: string
  projectId: string | null
  orderDate: string
  internalNotes?: string | null
  lines: SalesOrderLineInput[]
}): Promise<{ ok: true; salesOrderId: string } | { ok: false; error: string }> {
  try {
    const clientEntityId = input.clientEntityId?.trim()
    if (!clientEntityId) {
      return { ok: false, error: "נא לבחור לקוח" }
    }
    const lines = (input.lines ?? []).filter(
      (l) => l.itemCatalogId?.trim() && l.quantity > 0 && l.unitPrice >= 0
    )
    if (lines.length === 0) {
      return { ok: false, error: "נא להוסיף לפחות שורת פריט אחת" }
    }

    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    let total = 0
    const lineRows: Array<{
      item_catalog_id: string
      sku: string | null
      description: string
      quantity: number
      unit_price: number
      line_total: number
      sort_order: number
    }> = []
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i]!
      const qty = ln.quantity
      const up = Math.round(ln.unitPrice * 10000) / 10000
      const lt = Math.round(qty * up * 100) / 100
      total += lt
      lineRows.push({
        item_catalog_id: ln.itemCatalogId.trim(),
        sku: ln.sku?.trim() || null,
        description: ln.description.trim() || "—",
        quantity: qty,
        unit_price: up,
        line_total: lt,
        sort_order: i,
      })
    }
    total = Math.round(total * 100) / 100

    const { data: ent, error: entErr } = await supabase
      .from("entities")
      .select("id, type, is_deleted")
      .eq("id", clientEntityId)
      .maybeSingle()
    if (entErr) return { ok: false, error: entErr.message }
    const er = ent as { type?: string; is_deleted?: boolean } | null
    if (!er || er.is_deleted || er.type !== "client") {
      return { ok: false, error: "יש לבחור לקוח תקין (ישות מסוג client)" }
    }

    let projectId: string | null = input.projectId?.trim() || null
    if (projectId) {
      const { data: pr, error: pErr } = await supabase
        .from("projects")
        .select("id, is_deleted")
        .eq("id", projectId)
        .maybeSingle()
      if (pErr) return { ok: false, error: pErr.message }
      if (!pr || (pr as { is_deleted?: boolean }).is_deleted) {
        return { ok: false, error: "פרויקט לא נמצא" }
      }
    } else {
      projectId = null
    }

    const orderDate =
      String(input.orderDate ?? "").trim() ||
      new Date().toISOString().slice(0, 10)

    const itemIds = [...new Set(lineRows.map((r) => r.item_catalog_id))]
    const { data: catRows, error: catErr } = await supabase
      .from("items_catalog")
      .select("id")
      .in("id", itemIds)
    if (catErr) return { ok: false, error: catErr.message }
    if ((catRows ?? []).length !== itemIds.length) {
      return { ok: false, error: "אחד או יותר מזהי הפריטים אינם קיימים בקטלוג" }
    }

    const { data: header, error: hErr } = await supabase
      .from("sales_orders")
      .insert({
        client_entity_id: clientEntityId,
        project_id: projectId,
        order_date: orderDate,
        status: "draft",
        total_amount: total,
        internal_notes: input.internalNotes?.trim() || null,
        created_by: user?.id ?? null,
        is_deleted: false,
      })
      .select("id")
      .single()

    if (hErr || !header) {
      return { ok: false, error: hErr?.message ?? "שמירת הזמנה נכשלה" }
    }

    const salesOrderId = String((header as { id: string }).id)

    const payload = lineRows.map((r) => ({
      sales_order_id: salesOrderId,
      item_catalog_id: r.item_catalog_id,
      sku: r.sku,
      description: r.description,
      quantity: r.quantity,
      unit_price: r.unit_price,
      line_total: r.line_total,
      sort_order: r.sort_order,
    }))

    const { error: lErr } = await supabase.from("sales_order_lines").insert(payload)
    if (lErr) {
      await supabase.from("sales_orders").delete().eq("id", salesOrderId)
      return { ok: false, error: lErr.message }
    }

    return { ok: true, salesOrderId }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
