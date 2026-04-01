"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

const ALLOWED_PO_STATUS = new Set([
  "approved",
  "sent",
  "partial_receipt",
])

function roundQty(n: number): number {
  return Math.round(n * 10000) / 10000
}

export type SaveDeliveryNoteLine = {
  poLineItemId: string
  quantityReceived: number
}

export type SaveDeliveryNoteResult =
  | { ok: true }
  | { ok: false; error: string }

export async function saveDeliveryNote(input: {
  poId: string
  deliveryNoteNumber: string
  receiptDate: string
  receivedBy: string
  shortageNotes: string
  lines: SaveDeliveryNoteLine[]
}): Promise<SaveDeliveryNoteResult> {
  const poId = input.poId?.trim()
  if (!poId) {
    return { ok: false, error: "נא לבחור הזמנת רכש" }
  }

  const supabase = await createSupabaseServerAuthClient()

  const { data: poRow, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id, status, is_deleted")
    .eq("id", poId)
    .eq("is_deleted", false)
    .maybeSingle()

  if (poErr) {
    return { ok: false, error: poErr.message }
  }
  if (!poRow) {
    return { ok: false, error: "הזמנת הרכש לא נמצאה" }
  }
  const status = poRow.status as string
  if (!ALLOWED_PO_STATUS.has(status)) {
    return {
      ok: false,
      error: "לא ניתן לקלוט סחורה להזמנה בסטטוס זה (טיוטה או סגורה).",
    }
  }

  const { data: lineRows, error: linesErr } = await supabase
    .from("po_line_items")
    .select("id, quantity, created_at")
    .eq("po_id", poId)
    .order("created_at", { ascending: true })

  if (linesErr) {
    return { ok: false, error: linesErr.message }
  }
  const lines = (lineRows ?? []) as Array<{
    id: string
    quantity: number
    created_at: string
  }>
  if (lines.length === 0) {
    return { ok: false, error: "אין שורות בהזמנה" }
  }

  const orderedById = new Map<string, number>()
  for (const li of lines) {
    orderedById.set(li.id, Number(li.quantity) || 0)
  }

  const { data: receipts, error: grErr } = await supabase
    .from("goods_receipts")
    .select("id")
    .eq("po_id", poId)

  if (grErr) {
    return { ok: false, error: grErr.message }
  }

  const receiptIds = (receipts ?? []).map((r) => r.id as string)
  const priorByLine = new Map<string, number>()
  for (const li of lines) {
    priorByLine.set(li.id, 0)
  }

  if (receiptIds.length > 0) {
    const { data: grItems, error: griErr } = await supabase
      .from("goods_receipt_items")
      .select("po_line_item_id, quantity_received")
      .in("goods_receipt_id", receiptIds)

    if (griErr) {
      return { ok: false, error: griErr.message }
    }
    for (const row of grItems ?? []) {
      const lid = (row as { po_line_item_id: string }).po_line_item_id
      const q =
        Number((row as { quantity_received: number }).quantity_received) || 0
      priorByLine.set(lid, (priorByLine.get(lid) ?? 0) + q)
    }
  }

  const byId = new Map(
    input.lines.map((l) => [l.poLineItemId, l.quantityReceived])
  )

  type RowCheck = {
    po_line_item_id: string
    qty: number
    remaining: number
  }
  const checks: RowCheck[] = []
  for (const li of lines) {
    const ordered = orderedById.get(li.id) ?? 0
    const prior = priorByLine.get(li.id) ?? 0
    const remaining = Math.max(0, roundQty(ordered - prior))
    const entered = roundQty(byId.get(li.id) ?? 0)
    checks.push({
      po_line_item_id: li.id,
      qty: entered,
      remaining,
    })
  }

  if (!checks.some((r) => r.qty > 0)) {
    return {
      ok: false,
      error: "יש להזין כמות שהתקבלה גדולה מ-0 בלפחות שורה אחת",
    }
  }

  for (const r of checks) {
    if (r.qty < 0) {
      return { ok: false, error: "כמות לא יכולה להיות שלילית" }
    }
    if (r.qty > r.remaining + 1e-9) {
      return {
        ok: false,
        error:
          "כמות שהתקבלה חורגת מהיתרה לשורה (מול הזמנה וקבלות קודמות).",
      }
    }
  }

  const needsShortageNotes = checks.some(
    (r) => r.qty > 0 && r.qty + 1e-9 < r.remaining
  )
  const notes = input.shortageNotes?.trim() ?? ""
  if (needsShortageNotes && !notes) {
    return {
      ok: false,
      error:
        "במשלוח חלקי יש למלא הערות חוסר (כאשר כמות נמוכה מהיתרה לשורה).",
    }
  }

  const { data: receipt, error: recErr } = await supabase
    .from("goods_receipts")
    .insert({
      po_id: poId,
      receipt_date:
        input.receiptDate?.trim() ||
        new Date().toISOString().slice(0, 10),
      delivery_note_number: input.deliveryNoteNumber?.trim() || null,
      received_by: input.receivedBy?.trim() || null,
      shortage_notes: needsShortageNotes ? notes : null,
    })
    .select("id")
    .single()

  if (recErr || !receipt?.id) {
    return {
      ok: false,
      error: recErr?.message ?? "שמירת תעודת משלוח נכשלה",
    }
  }

  const rid = receipt.id as string
  const finalPayload = checks
    .filter((r) => r.qty > 0)
    .map((r) => ({
      goods_receipt_id: rid,
      po_line_item_id: r.po_line_item_id,
      quantity_received: r.qty,
    }))

  const { error: itemsErr } = await supabase
    .from("goods_receipt_items")
    .insert(finalPayload)

  if (itemsErr) {
    await supabase.from("goods_receipts").delete().eq("id", rid)
    return { ok: false, error: itemsErr.message }
  }

  const { data: allReceipts } = await supabase
    .from("goods_receipts")
    .select("id")
    .eq("po_id", poId)

  const allIds = (allReceipts ?? []).map((x) => x.id as string)
  const { data: allItems } = await supabase
    .from("goods_receipt_items")
    .select("po_line_item_id, quantity_received")
    .in("goods_receipt_id", allIds)

  const cumulative = new Map<string, number>()
  for (const li of lines) {
    cumulative.set(li.id, 0)
  }
  for (const row of allItems ?? []) {
    const lid = (row as { po_line_item_id: string }).po_line_item_id
    const q =
      Number((row as { quantity_received: number }).quantity_received) || 0
    cumulative.set(lid, (cumulative.get(lid) ?? 0) + q)
  }

  let allComplete = true
  for (const li of lines) {
    const ordered = orderedById.get(li.id) ?? 0
    const got = cumulative.get(li.id) ?? 0
    if (got + 1e-6 < ordered) {
      allComplete = false
      break
    }
  }

  const nextStatus = allComplete ? "closed" : "partial_receipt"
  const { error: updErr } = await supabase
    .from("purchase_orders")
    .update({ status: nextStatus })
    .eq("id", poId)
    .eq("is_deleted", false)

  if (updErr) {
    console.error("[delivery-note] עדכון סטטוס PO נכשל", updErr)
  }

  revalidatePath("/marker-ofek/procurement")
  revalidatePath(`/marker-ofek/procurement/${poId}`)

  return { ok: true }
}
