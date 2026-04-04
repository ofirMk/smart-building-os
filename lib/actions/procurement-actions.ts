"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type ReceiveGoodsFromScannerLine = {
  poLineItemId: string
  quantityReceived: number
}

export type ReceiveGoodsFromScannerInput = {
  poId: string
  lines: ReceiveGoodsFromScannerLine[]
  receiptDate?: string
  deliveryNoteNumber?: string | null
  shortageNotes?: string | null
}

function toPositiveQty(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/**
 * Creates a `goods_receipts` row plus `goods_receipt_items` from scanner / mobile input.
 * Validates that each line belongs to the PO and does not exceed remaining open quantity.
 */
export async function receiveGoodsFromScanner(input: ReceiveGoodsFromScannerInput) {
  const poId = String(input.poId ?? "").trim()
  if (!poId) throw new Error("חסר מזהה הזמנת רכש")

  const lines = (input.lines ?? []).filter((l) => toPositiveQty(l.quantityReceived) > 0)
  if (lines.length === 0) {
    throw new Error("יש להזין לפחות שורה אחת עם כמות חיובית")
  }

  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const receivedByLabel =
    String(user?.user_metadata?.full_name ?? "").trim() ||
    String(user?.user_metadata?.name ?? "").trim() ||
    String(user?.email ?? "").trim() ||
    String(user?.id ?? "").trim() ||
    null

  const { data: poLines, error: poLinesErr } = await supabase
    .from("po_line_items")
    .select("id, quantity")
    .eq("po_id", poId)

  if (poLinesErr) throw new Error(poLinesErr.message ?? "טעינת שורות הזמנה נכשלה")
  const lineById = new Map((poLines ?? []).map((r) => [String(r.id), Number(r.quantity) || 0]))

  const { data: priorReceipts } = await supabase
    .from("goods_receipts")
    .select("id")
    .eq("po_id", poId)

  const receiptIds = (priorReceipts ?? []).map((r) => String(r.id))
  const receivedPrior = new Map<string, number>()
  if (receiptIds.length > 0) {
    const { data: priorItems } = await supabase
      .from("goods_receipt_items")
      .select("po_line_item_id, quantity_received")
      .in("goods_receipt_id", receiptIds)
    for (const row of priorItems ?? []) {
      const lid = String((row as { po_line_item_id: string }).po_line_item_id)
      const q = toPositiveQty((row as { quantity_received: number }).quantity_received)
      receivedPrior.set(lid, (receivedPrior.get(lid) ?? 0) + q)
    }
  }

  const linePayload: Array<{ po_line_item_id: string; quantity_received: number }> = []
  let needsShortageNotes = false

  for (const line of lines) {
    const poLineItemId = String(line.poLineItemId ?? "").trim()
    const qty = toPositiveQty(line.quantityReceived)
    if (!poLineItemId || qty <= 0) continue

    const ordered = lineById.get(poLineItemId)
    if (ordered == null) {
      throw new Error(`שורת הזמנה ${poLineItemId} אינה שייכת להזמנה זו`)
    }
    const prior = receivedPrior.get(poLineItemId) ?? 0
    const remaining = Math.max(0, ordered - prior)
    if (qty > remaining + 1e-9) {
      throw new Error(
        `כמות לשורה ${poLineItemId} חורגת מהיתרה (${remaining.toFixed(2)} נותר)`
      )
    }
    if (qty + 1e-9 < remaining) needsShortageNotes = true
    linePayload.push({
      po_line_item_id: poLineItemId,
      quantity_received: qty,
    })
  }

  if (linePayload.length === 0) {
    throw new Error("אין שורות תקפות לשמירה")
  }

  const shortageNotes = String(input.shortageNotes ?? "").trim()
  if (needsShortageNotes && !shortageNotes) {
    throw new Error("במשלוח חלקי יש למלא הערות לחוסר")
  }

  const receiptDate =
    String(input.receiptDate ?? "").trim() || new Date().toISOString().slice(0, 10)
  const deliveryNoteNumber = String(input.deliveryNoteNumber ?? "").trim() || null

  const { data: receipt, error: recErr } = await supabase
    .from("goods_receipts")
    .insert({
      po_id: poId,
      receipt_date: receiptDate,
      delivery_note_number: deliveryNoteNumber,
      received_by: receivedByLabel,
      shortage_notes: needsShortageNotes ? shortageNotes : null,
    })
    .select("id")
    .single()

  if (recErr) throw new Error(recErr.message ?? "שמירת קבלת סחורה נכשלה")
  if (!receipt?.id) throw new Error("לא נשמרה קבלת סחורה")

  const receiptId = String(receipt.id)
  const itemRows = linePayload.map((p) => ({
    goods_receipt_id: receiptId,
    po_line_item_id: p.po_line_item_id,
    quantity_received: p.quantity_received,
  }))

  const { error: itemsErr } = await supabase.from("goods_receipt_items").insert(itemRows)

  if (itemsErr) {
    await supabase.from("goods_receipts").delete().eq("id", receiptId)
    throw new Error(itemsErr.message ?? "שמירת שורות קבלה נכשלה")
  }

  revalidatePath("/marker-ofek/procurement")
  revalidatePath("/marker-ofek/procurement/orders")
  revalidatePath(`/marker-ofek/procurement/${poId}`)
  revalidatePath(`/marker-ofek/procurement/receipt/${poId}`)

  return { goodsReceiptId: receiptId }
}
