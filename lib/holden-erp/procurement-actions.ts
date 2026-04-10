"use server"

import { createHash } from "node:crypto"

import { GoogleGenerativeAI } from "@google/generative-ai"
import { revalidatePath } from "next/cache"

import { extractModelJsonPayload } from "@/lib/ocr-invoice/parse-model-json"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import type {
  ReceiveGoodsInput,
  SaveDraftPurchaseOrderInput,
} from "@/types/holden-procurement"
import { formatError } from "@/lib/utils"

const HUB = "/marker-ofek/procurement"

const GEMINI_DELIVERY_NOTE_MODEL = "gemini-1.5-flash"
const MAX_DELIVERY_NOTE_IMAGE_BYTES = 15 * 1024 * 1024
const MATCH_THRESHOLD = 0.14

function mimeFromName(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith(".png")) return "image/png"
  if (n.endsWith(".webp")) return "image/webp"
  if (n.endsWith(".gif")) return "image/gif"
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg"
  return "image/jpeg"
}

function normText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function tokenizeForMatch(s: string): string[] {
  return normText(s)
    .split(/[\s,.|/\\\-–—_:;]+/)
    .filter((t) => t.length > 1)
}

function jaccardStrings(a: string, b: string): number {
  const ta = new Set(tokenizeForMatch(a))
  const tb = new Set(tokenizeForMatch(b))
  if (ta.size === 0 && tb.size === 0) return 1
  let inter = 0
  for (const x of ta) {
    if (tb.has(x)) inter += 1
  }
  const union = ta.size + tb.size - inter
  return union === 0 ? 0 : inter / union
}

function buildPartLabel(
  row: {
    description_32_chars: string | null
    description_48_chars: string | null
    manufacturer: string | null
    part_number_supplier: string | null
  }
): string {
  return [
    row.manufacturer?.trim(),
    row.part_number_supplier?.trim(),
    (row.description_48_chars || row.description_32_chars || "").trim(),
  ]
    .filter(Boolean)
    .join(" · ")
}

type PoLineForMatch = {
  id: string
  orderedQty: number
  label: string
  materialRisk: string
}

function matchAiItemsToPoLines(
  poLines: PoLineForMatch[],
  aiItems: Array<{ description: string, quantity: number }>
): {
  quantitiesByLineId: Record<string, number>
  mismatchScore: number
  overOrderedLineIds: string[]
  missingHighValuePartLabels: string[]
} {
  const quantitiesByLineId: Record<string, number> = {}
  const usedAi = new Set<number>()
  const scored: Array<{
    lineId: string
    aiIdx: number
    score: number
    qty: number
  }> = []
  for (const [aiIdx, ai] of aiItems.entries()) {
    const desc = String(ai.description ?? "").trim()
    const qty = roundMoney(toPositiveQty(ai.quantity))
    if (!desc || qty <= 0) continue
    for (const pl of poLines) {
      if (pl.orderedQty <= 0) continue
      const score = jaccardStrings(pl.label, desc)
      if (score >= MATCH_THRESHOLD) {
        scored.push({ lineId: pl.id, aiIdx, score, qty })
      }
    }
  }
  scored.sort((a, b) => b.score - a.score)
  const assignedLine = new Set<string>()
  for (const row of scored) {
    if (usedAi.has(row.aiIdx)) continue
    if (assignedLine.has(row.lineId)) continue
    usedAi.add(row.aiIdx)
    assignedLine.add(row.lineId)
    quantitiesByLineId[row.lineId] = row.qty
  }
  for (const pl of poLines) {
    if (quantitiesByLineId[pl.id] == null) quantitiesByLineId[pl.id] = 0
  }

  let errSum = 0
  let errCount = 0
  for (const pl of poLines) {
    if (pl.orderedQty <= 0) continue
    errCount += 1
    const aiQ = quantitiesByLineId[pl.id] ?? 0
    errSum +=
      Math.abs(aiQ - pl.orderedQty) / Math.max(pl.orderedQty, 1e-9)
  }
  const mismatchScore =
    errCount > 0 ? Math.min(1, errSum / errCount) : 0

  const overOrderedLineIds: string[] = []
  for (const pl of poLines) {
    if (pl.orderedQty <= 0) continue
    const aiQ = quantitiesByLineId[pl.id] ?? 0
    if (aiQ > pl.orderedQty + 1e-6) {
      overOrderedLineIds.push(pl.id)
    }
  }

  const missingHighValuePartLabels: string[] = []
  for (const pl of poLines) {
    if (pl.materialRisk !== "high_value") continue
    if (pl.orderedQty <= 0) continue
    const aiQ = quantitiesByLineId[pl.id] ?? 0
    const matched = assignedLine.has(pl.id)
    if (!matched || aiQ <= 1e-9) {
      missingHighValuePartLabels.push(pl.label || pl.id.slice(0, 8))
    }
  }

  return {
    quantitiesByLineId,
    mismatchScore,
    overOrderedLineIds,
    missingHighValuePartLabels,
  }
}

const DELIVERY_NOTE_OCR_PROMPT = `Identify the Supplier Name, Document Number, and Date. Extract a list of items with their quantities. Return JSON only.

The attached image is a delivery note (תעודת משלוח). Text may be Hebrew, English, or mixed.

Output must be a single JSON object with exactly these keys (no markdown, no prose):
{
  "supplier_name": "string",
  "delivery_note_number": "string",
  "delivery_date": "YYYY-MM-DD or empty string",
  "line_items": [ { "description": "string", "quantity": number } ]
}

Rules:
- Include every line item row that shows a quantity in the body of the note (skip blank headers and pure totals without line description).
- Quantities must be positive numbers. Normalize decimal commas if present.
- Prefer Hebrew in description fields when that is what appears on the document.`

export async function scanDeliveryNoteImageAction(input: {
  poId: string
  storagePath: string
  mimeType?: string
  fileName?: string
}): Promise<
  | {
      ok: true
      supplierName: string
      deliveryNoteNumber: string
      deliveryDate: string
      lineItems: Array<{ description: string, quantity: number }>
      quantitiesByLineId: Record<string, number>
      mismatchScore: number
      overOrderedLineIds: string[]
      missingHighValuePartLabels: string[]
    }
  | { ok: false, error: string }
> {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
      return {
        ok: false,
        error:
          "חסר GEMINI_API_KEY בשרת — לא ניתן לנתח תעודת משלוח",
      }
    }
    const poId = String(input.poId ?? "").trim()
    const storagePath = String(input.storagePath ?? "").trim()
    if (!poId || !storagePath) {
      return { ok: false, error: "חסר מזהה הזמנה או נתיב קובץ" }
    }

    const supabase = await createServerSupabaseClient()
    const { data: blob, error: dlErr } = await supabase.storage
      .from("delivery-notes")
      .download(storagePath)
    if (dlErr || !blob) {
      return {
        ok: false,
        error: dlErr?.message ?? "הורדת תמונה נכשלה",
      }
    }
    const buf = Buffer.from(await blob.arrayBuffer())
    if (buf.length > MAX_DELIVERY_NOTE_IMAGE_BYTES) {
      return { ok: false, error: "קובץ גדול מדי לניתוח (מקס׳ 15MB)" }
    }

    const { data: pol, error: polErr } = await supabase
      .from("purchase_order_lines")
      .select("id, part_id, quantity")
      .eq("order_id", poId)
    if (polErr) throw polErr
    const rows = pol ?? []
    const partIds = [
      ...new Set(
        rows.map((r) => String((r as { part_id: string }).part_id))
      ),
    ]
    const partMeta = new Map<
      string,
      {
        description_32_chars: string | null
        description_48_chars: string | null
        manufacturer: string | null
        part_number_supplier: string | null
        material_risk: string
      }
    >()
    if (partIds.length > 0) {
      const { data: sp, error: spErr } = await supabase
        .from("supplier_parts")
        .select(
          "id, description_32_chars, description_48_chars, manufacturer, part_number_supplier, material_risk"
        )
        .in("id", partIds)
      if (spErr) throw spErr
      for (const r of sp ?? []) {
        const id = String((r as { id: string }).id)
        partMeta.set(id, {
          description_32_chars: (r as { description_32_chars: string | null })
            .description_32_chars,
          description_48_chars: (r as { description_48_chars: string | null })
            .description_48_chars,
          manufacturer: (r as { manufacturer: string | null }).manufacturer,
          part_number_supplier: (r as { part_number_supplier: string | null })
            .part_number_supplier,
          material_risk: String(
            (r as { material_risk: string | null }).material_risk ??
              "standard"
          ),
        })
      }
    }

    const poLines: PoLineForMatch[] = rows.map((r) => {
      const pid = String((r as { part_id: string }).part_id)
      const pm = partMeta.get(pid)
      const label = pm ? buildPartLabel(pm) : pid
      return {
        id: String((r as { id: string }).id),
        orderedQty: Number((r as { quantity: number }).quantity) || 0,
        label,
        materialRisk: pm?.material_risk ?? "standard",
      }
    })

    const fn = String(input.fileName ?? "scan.jpg")
    const mime =
      (input.mimeType && input.mimeType.trim()) ||
      mimeFromName(fn)
    const mimeForPart = mime === "image/jpg" ? "image/jpeg" : mime

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: GEMINI_DELIVERY_NOTE_MODEL })
    const base64 = buf.toString("base64")
    const result = await model.generateContent([
      { text: DELIVERY_NOTE_OCR_PROMPT },
      {
        inlineData: {
          mimeType: mimeForPart,
          data: base64,
        },
      },
    ])
    const text = result.response.text()?.trim()
    if (!text) {
      return { ok: false, error: "Gemini החזירה תשובה ריקה" }
    }
    const parsed = extractModelJsonPayload(text) as Record<string, unknown>
    const supplierName = String(parsed.supplier_name ?? "").trim()
    const deliveryNoteNumber = String(
      parsed.delivery_note_number ?? parsed.deliveryNoteNumber ?? ""
    ).trim()
    const deliveryDate = String(parsed.delivery_date ?? "").trim()
    const rawItems = parsed.line_items ?? parsed.lineItems ?? parsed.items
    const lineItems: Array<{ description: string, quantity: number }> = []
    if (Array.isArray(rawItems)) {
      for (const it of rawItems) {
        const o = it as Record<string, unknown>
        const description = String(
          o.description ?? o.item_description ?? ""
        ).trim()
        const quantity = roundMoney(toPositiveQty(o.quantity))
        if (description && quantity > 0) {
          lineItems.push({ description, quantity })
        }
      }
    }

    const {
      quantitiesByLineId,
      mismatchScore,
      overOrderedLineIds,
      missingHighValuePartLabels,
    } = matchAiItemsToPoLines(poLines, lineItems)

    return {
      ok: true,
      supplierName,
      deliveryNoteNumber,
      deliveryDate,
      lineItems,
      quantitiesByLineId,
      mismatchScore,
      overOrderedLineIds,
      missingHighValuePartLabels,
    }
  } catch (e) {
    return { ok: false, error: formatError(e) || "סריקת תעודת משלוח נכשלה" }
  }
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function toPositiveQty(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n
}

function defaultReceiptIdempotencyKey(input: ReceiveGoodsInput): string {
  const lines = [...(input.lines ?? [])]
    .map((l) => ({
      purchaseOrderLineId: String(l.purchaseOrderLineId ?? "").trim(),
      quantityReceived: roundMoney(toPositiveQty(l.quantityReceived)),
    }))
    .filter((l) => l.purchaseOrderLineId && l.quantityReceived > 0)
    .sort((a, b) => a.purchaseOrderLineId.localeCompare(b.purchaseOrderLineId))
  const body = JSON.stringify({
    poId: String(input.poId ?? "").trim(),
    receiptDate: String(input.receiptDate ?? "").trim(),
    warehouseLocation: String(input.warehouseLocation ?? "").trim(),
    deliveryNoteImageUrl: String(input.deliveryNoteImageUrl ?? "").trim(),
    lines,
  })
  return createHash("sha256").update(body).digest("hex")
}

async function resolveSupplierEntityId(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  supplierId: string,
  taxId: string | null
): Promise<string | null> {
  const { data: row } = await supabase
    .from("suppliers")
    .select("entity_id, tax_id")
    .eq("id", supplierId)
    .maybeSingle()
  const ent = row as { entity_id: string | null, tax_id: string | null } | null
  if (ent?.entity_id) return ent.entity_id
  const tid = (taxId ?? ent?.tax_id ?? "").trim()
  if (!tid) return null
  const { data: match } = await supabase
    .from("entities")
    .select("id")
    .eq("type", "supplier")
    .eq("legal_id", tid)
    .eq("is_deleted", false)
    .maybeSingle()
  return match?.id ? String(match.id) : null
}

async function resolveMasterSupplierFromEntity(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  entityId: string
): Promise<string | null> {
  const { data: byLink } = await supabase
    .from("suppliers")
    .select("id")
    .eq("entity_id", entityId)
    .maybeSingle()
  if (byLink?.id) return String(byLink.id)
  const { data: ent } = await supabase
    .from("entities")
    .select("legal_id")
    .eq("id", entityId)
    .maybeSingle()
  const lid = (ent as { legal_id: string | null } | null)?.legal_id?.trim()
  if (!lid) return null
  const { data: byTax } = await supabase
    .from("suppliers")
    .select("id")
    .eq("tax_id", lid)
    .maybeSingle()
  return byTax?.id ? String(byTax.id) : null
}

function revHub() {
  revalidatePath(HUB)
  revalidatePath("/marker-ofek/procurement/new")
  revalidatePath("/marker-ofek/procurement/receive")
}

export async function saveDraftPurchaseOrderAction(
  input: SaveDraftPurchaseOrderInput
): Promise<
  | { ok: true, id: string, poNumber: string }
  | { ok: false, error: string }
> {
  try {
    const projectId = input.projectId?.trim()
    const masterSupplierId = input.masterSupplierId?.trim()
    const linesIn = input.lines ?? []
    if (!projectId) {
      return { ok: false, error: "נא לבחור פרויקט" }
    }
    if (!masterSupplierId) {
      return { ok: false, error: "נא לבחור ספק" }
    }

    const supabase = await createServerSupabaseClient()

    const { data: proj, error: pErr } = await supabase
      .from("projects")
      .select("id, is_deleted")
      .eq("id", projectId)
      .maybeSingle()
    if (pErr) throw pErr
    if (!proj || proj.is_deleted) {
      return { ok: false, error: "פרויקט לא נמצא או מסומן כמחוק" }
    }

    const { data: supRow } = await supabase
      .from("suppliers")
      .select("tax_id")
      .eq("id", masterSupplierId)
      .maybeSingle()
    const taxId = (supRow as { tax_id: string | null } | null)?.tax_id ?? null

    const supplierEntityId = await resolveSupplierEntityId(
      supabase,
      masterSupplierId,
      taxId
    )
    if (!supplierEntityId) {
      return {
        ok: false,
        error:
          "לא נמצאה ישות ארגונית לספק — קשרו entity במאסטר או התאימו ח.פ. לישות",
      }
    }

    const orderDate =
      String(input.orderDate ?? "").trim() ||
      new Date().toISOString().slice(0, 10)

    let totalAmount = 0
    const lineRows: Array<{
      part_id: string
      quantity: number
      unit_price: number
      uom_id: string
      line_total: number
    }> = []

    if (linesIn.length > 0) {
      const partIds = [...new Set(linesIn.map((l) => l.partId.trim()).filter(Boolean))]
      const { data: parts, error: partsErr } = await supabase
        .from("supplier_parts")
        .select("id, supplier_id")
        .in("id", partIds)
      if (partsErr) throw partsErr
      const partById = new Map(
        (parts ?? []).map((p) => [
          String((p as { id: string }).id),
          p as { supplier_id: string },
        ])
      )
      for (const pid of partIds) {
        if (!partById.has(pid)) {
          return { ok: false, error: `מקט״י ${pid} לא נמצא במאסטר` }
        }
      }
      const supplierIds = [...new Set(partIds.map((id) => partById.get(id)!.supplier_id))]
      if (supplierIds.length !== 1 || supplierIds[0] !== masterSupplierId) {
        return {
          ok: false,
          error: "כל השורות חייבות להיות ממקט״י של הספק הנבחר",
        }
      }

      for (const ln of linesIn) {
        const partId = ln.partId.trim()
        const uomId = ln.uomId.trim()
        const qty = toPositiveQty(ln.quantity)
        const unitPrice = roundMoney(Number(ln.unitPrice) || 0)
        if (!partId || !uomId || qty <= 0) {
          return { ok: false, error: "שורה לא תקינה" }
        }
        const lt = roundMoney(qty * unitPrice)
        totalAmount += lt
        lineRows.push({
          part_id: partId,
          quantity: qty,
          unit_price: unitPrice,
          uom_id: uomId,
          line_total: lt,
        })
      }
      totalAmount = roundMoney(totalAmount)
    }

    const poIdIn = input.poId?.trim() || null

    if (poIdIn) {
      const { data: existing, error: exErr } = await supabase
        .from("purchase_orders")
        .select("id, status")
        .eq("id", poIdIn)
        .maybeSingle()
      if (exErr) throw exErr
      const st = (existing as { status: string } | null)?.status
      if (!existing) {
        return { ok: false, error: "הזמנה לא נמצאה" }
      }
      if (st !== "draft") {
        return { ok: false, error: "ניתן לערוך רק טיוטה" }
      }

      const { error: delErr } = await supabase
        .from("purchase_order_lines")
        .delete()
        .eq("order_id", poIdIn)
      if (delErr) throw delErr

      const { error: upErr } = await supabase
        .from("purchase_orders")
        .update({
          project_id: projectId,
          supplier_id: supplierEntityId,
          order_date: orderDate,
          total_amount: totalAmount,
        })
        .eq("id", poIdIn)
      if (upErr) throw upErr

      if (lineRows.length > 0) {
        const payload = lineRows.map((r) => ({
          order_id: poIdIn,
          part_id: r.part_id,
          quantity: r.quantity,
          unit_price: r.unit_price,
          uom_id: r.uom_id,
          line_total: r.line_total,
        }))
        const { error: lineErr } = await supabase
          .from("purchase_order_lines")
          .insert(payload)
        if (lineErr) throw lineErr
      }

      const { data: row } = await supabase
        .from("purchase_orders")
        .select("po_number")
        .eq("id", poIdIn)
        .single()
      revHub()
      return {
        ok: true,
        id: poIdIn,
        poNumber: String((row as { po_number: string }).po_number ?? ""),
      }
    }

    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .insert({
        project_id: projectId,
        supplier_id: supplierEntityId,
        po_number: null,
        order_date: orderDate,
        total_amount: totalAmount,
        status: "draft",
        wh_status: null,
      })
      .select("id, po_number")
      .single()

    if (poErr) throw poErr
    const newId = String((po as { id: string }).id)
    const poNumber = String((po as { po_number: string }).po_number ?? "")

    if (lineRows.length > 0) {
      const payload = lineRows.map((r) => ({
        order_id: newId,
        part_id: r.part_id,
        quantity: r.quantity,
        unit_price: r.unit_price,
        uom_id: r.uom_id,
        line_total: r.line_total,
      }))
      const { error: lineErr } = await supabase
        .from("purchase_order_lines")
        .insert(payload)
      if (lineErr) {
        await supabase.from("purchase_orders").delete().eq("id", newId)
        throw lineErr
      }
    }

    revHub()
    return { ok: true, id: newId, poNumber }
  } catch (e) {
    return { ok: false, error: formatError(e) || "שמירת טיוטה נכשלה" }
  }
}

export async function issuePurchaseOrderAction(
  poId: string
): Promise<{ ok: true } | { ok: false, error: string }> {
  try {
    const id = String(poId ?? "").trim()
    if (!id) {
      return { ok: false, error: "חסר מזהה הזמנה" }
    }
    const supabase = await createServerSupabaseClient()
    const { data: row, error: qErr } = await supabase
      .from("purchase_orders")
      .select("id, status")
      .eq("id", id)
      .maybeSingle()
    if (qErr) throw qErr
    if (!row) {
      return { ok: false, error: "הזמנה לא נמצאה" }
    }
    const st = (row as { status: string }).status
    if (st === "sent" || st === "partial_receipt" || st === "closed") {
      return { ok: true }
    }
    if (st !== "draft") {
      return { ok: false, error: "רק טיוטה ניתנת להנפקה" }
    }
    const { count, error: cErr } = await supabase
      .from("purchase_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("order_id", id)
    if (cErr) throw cErr
    if (!count || count < 1) {
      return { ok: false, error: "יש להוסיף לפחות שורת מקט״י לפני הנפקה" }
    }

    const { error: uErr } = await supabase
      .from("purchase_orders")
      .update({
        status: "sent",
        wh_status: "open",
      })
      .eq("id", id)
    if (uErr) throw uErr
    revHub()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) || "הנפקה נכשלה" }
  }
}

export async function receiveGoodsAction(
  input: ReceiveGoodsInput
): Promise<
  | { ok: true, receiptId: string, duplicate?: boolean }
  | { ok: false, error: string }
> {
  try {
    const poId = String(input.poId ?? "").trim()
    if (!poId) {
      return { ok: false, error: "חסר מזהה הזמנה" }
    }
    const receiptDate =
      String(input.receiptDate ?? "").trim() ||
      new Date().toISOString().slice(0, 10)
    const warehouseLocation = String(input.warehouseLocation ?? "").trim()
    if (!warehouseLocation) {
      return { ok: false, error: "נא לציין מיקום מחסן" }
    }

    const lines = (input.lines ?? []).filter(
      (l) => toPositiveQty(l.quantityReceived) > 0
    )
    if (lines.length === 0) {
      return { ok: false, error: "נא להזין כמות חיובית בלפחות שורה אחת" }
    }

    const idempotencyKey =
      String(input.idempotencyKey ?? "").trim() || defaultReceiptIdempotencyKey(input)

    const supabase = await createServerSupabaseClient()

    const { data: dupRec } = await supabase
      .from("warehouse_receipts")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()
    if (dupRec?.id) {
      return {
        ok: true,
        receiptId: String((dupRec as { id: string }).id),
        duplicate: true,
      }
    }

    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .select("id, wh_status")
      .eq("id", poId)
      .maybeSingle()
    if (poErr) throw poErr
    if (!po) {
      return { ok: false, error: "הזמנה לא נמצאה" }
    }
    const wh = (po as { wh_status: string | null }).wh_status
    if (wh === "closed") {
      return { ok: false, error: "ההזמנה סגורה לקבלות" }
    }

    const { data: polRows, error: polErr } = await supabase
      .from("purchase_order_lines")
      .select("id, quantity, part_id")
      .eq("order_id", poId)
    if (polErr) throw polErr
    const ordered = new Map(
      (polRows ?? []).map((r) => [
        String((r as { id: string }).id),
        Number((r as { quantity: number }).quantity) || 0,
      ])
    )
    const partByPol = new Map(
      (polRows ?? []).map((r) => [
        String((r as { id: string }).id),
        String((r as { part_id: string }).part_id),
      ])
    )
    if (ordered.size === 0) {
      return { ok: false, error: "אין שורות מאסטר להזמנה זו" }
    }

    const partIds = [
      ...new Set(
        (polRows ?? []).map((r) => String((r as { part_id: string }).part_id))
      ),
    ]
    const riskByPart = new Map<string, string>()
    if (partIds.length > 0) {
      const { data: partsMeta } = await supabase
        .from("supplier_parts")
        .select("id, material_risk")
        .in("id", partIds)
      for (const pm of partsMeta ?? []) {
        riskByPart.set(
          String((pm as { id: string }).id),
          String((pm as { material_risk: string }).material_risk ?? "standard")
        )
      }
    }

    const { data: priorReceipts } = await supabase
      .from("warehouse_receipts")
      .select("id")
      .eq("po_id", poId)
    const receiptIds = (priorReceipts ?? []).map((r) => String((r as { id: string }).id))
    const receivedPrior = new Map<string, number>()
    if (receiptIds.length > 0) {
      const { data: pri } = await supabase
        .from("warehouse_receipt_lines")
        .select("purchase_order_line_id, quantity_received, receipt_id")
        .in("receipt_id", receiptIds)
      for (const row of pri ?? []) {
        const lid = String(
          (row as { purchase_order_line_id: string }).purchase_order_line_id
        )
        const q = toPositiveQty((row as { quantity_received: number }).quantity_received)
        receivedPrior.set(lid, (receivedPrior.get(lid) ?? 0) + q)
      }
    }

    const itemRows: Array<{
      receipt_id: string
      purchase_order_line_id: string
      quantity_received: number
    }> = []

    const deliveryNoteImageUrl = String(input.deliveryNoteImageUrl ?? "").trim()
    const noteParts: string[] = []
    if (String(input.verificationNotes ?? "").trim()) {
      noteParts.push(String(input.verificationNotes).trim())
    }

    for (const ln of lines) {
      const lid = String(ln.purchaseOrderLineId ?? "").trim()
      const qty = toPositiveQty(ln.quantityReceived)
      if (!lid || qty <= 0) continue
      const ord = ordered.get(lid)
      if (ord == null) {
        return { ok: false, error: `שורה ${lid} אינה שייכת להזמנה` }
      }
      const pid = partByPol.get(lid)
      const risk = pid ? riskByPart.get(pid) ?? "standard" : "standard"
      if (risk === "high_value" && !deliveryNoteImageUrl) {
        return {
          ok: false,
          error: "חומר ערך גבוה (ברזל/בטון וכו׳) — נדרש צילום תעודת משלוח",
        }
      }
      const prior = receivedPrior.get(lid) ?? 0
      const remaining = Math.max(0, ord - prior)
      if (qty > remaining + 1e-9) {
        return {
          ok: false,
          error: `כמות חורגת מהיתרה לשורה (${remaining.toFixed(2)} נותר)`,
        }
      }
      if (qty + 1e-9 < ord) {
        noteParts.push(`משלוח חסר בשורה: ${lid.slice(0, 8)} (${qty}/${ord})`)
      }
      receivedPrior.set(lid, prior + qty)
      itemRows.push({
        receipt_id: "",
        purchase_order_line_id: lid,
        quantity_received: qty,
      })
    }

    if (itemRows.length === 0) {
      return { ok: false, error: "אין שורות תקפות לשמירה" }
    }

    const verificationNotesMerged =
      noteParts.length > 0 ? noteParts.join(" | ") : null

    const { data: rec, error: recErr } = await supabase
      .from("warehouse_receipts")
      .insert({
        po_id: poId,
        receipt_date: receiptDate,
        warehouse_location: warehouseLocation,
        delivery_note_image_url: deliveryNoteImageUrl || null,
        verification_notes: verificationNotesMerged,
        idempotency_key: idempotencyKey,
        financial_approval_status: "pending",
      })
      .select("id")
      .single()
    if (recErr) {
      const msg = formatError(recErr) || ""
      if (msg.includes("duplicate") || msg.includes("unique")) {
        const { data: again } = await supabase
          .from("warehouse_receipts")
          .select("id")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle()
        if (again?.id) {
          return {
            ok: true,
            receiptId: String((again as { id: string }).id),
            duplicate: true,
          }
        }
      }
      throw recErr
    }
    const receiptId = String((rec as { id: string }).id)

    const withReceipt = itemRows.map((r) => ({
      receipt_id: receiptId,
      purchase_order_line_id: r.purchase_order_line_id,
      quantity_received: r.quantity_received,
    }))

    const { error: insErr } = await supabase
      .from("warehouse_receipt_lines")
      .insert(withReceipt)

    if (insErr) {
      await supabase.from("warehouse_receipts").delete().eq("id", receiptId)
      throw insErr
    }

    const { data: allReceipts } = await supabase
      .from("warehouse_receipts")
      .select("id")
      .eq("po_id", poId)
    const allIds = (allReceipts ?? []).map((r) => String((r as { id: string }).id))
    const totals = new Map<string, number>()
    if (allIds.length > 0) {
      const { data: allLines } = await supabase
        .from("warehouse_receipt_lines")
        .select("purchase_order_line_id, quantity_received")
        .in("receipt_id", allIds)
      for (const row of allLines ?? []) {
        const lid = String(
          (row as { purchase_order_line_id: string }).purchase_order_line_id
        )
        const q = toPositiveQty((row as { quantity_received: number }).quantity_received)
        totals.set(lid, (totals.get(lid) ?? 0) + q)
      }
    }

    let allComplete = true
    for (const [lid, ordQty] of ordered) {
      const got = totals.get(lid) ?? 0
      if (got + 1e-9 < ordQty) {
        allComplete = false
        break
      }
    }

    const nextWh: "partially_received" | "closed" = allComplete
      ? "closed"
      : "partially_received"
    const nextMo = allComplete ? "closed" : "partial_receipt"

    const { error: upErr } = await supabase
      .from("purchase_orders")
      .update({
        wh_status: nextWh,
        status: nextMo,
      })
      .eq("id", poId)
    if (upErr) throw upErr

    revHub()
    revalidatePath(`/marker-ofek/procurement/${poId}`)
    return { ok: true, receiptId }
  } catch (e) {
    return { ok: false, error: formatError(e) || "קבלת סחורה נכשלה" }
  }
}

export async function fetchProjectPoCommitmentAction(input: {
  projectId: string
  excludePoId?: string | null
}): Promise<
  | { ok: true, committedIls: number }
  | { ok: false, error: string }
> {
  try {
    const projectId = input.projectId?.trim()
    if (!projectId) {
      return { ok: false, error: "חסר פרויקט" }
    }
    const supabase = await createServerSupabaseClient()
    const ex = input.excludePoId?.trim()
    let query = supabase
      .from("purchase_orders")
      .select("id, total_amount")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
    if (ex) {
      query = query.neq("id", ex)
    }
    const { data, error } = await query
    if (error) throw error
    let sum = 0
    for (const r of data ?? []) {
      sum += Number((r as { total_amount: number }).total_amount) || 0
    }
    return { ok: true, committedIls: roundMoney(sum) }
  } catch (e) {
    return { ok: false, error: formatError(e) || "שגיאה" }
  }
}

export async function fetchPurchaseOrderForHubAction(poId: string): Promise<
  | {
      ok: true
      po: {
        id: string
        po_number: string
        project_id: string | null
        order_date: string
        status: string
        wh_status: string | null
        total_amount: number
        supplier_id: string
      }
      masterSupplierId: string | null
      lines: Array<{
        id: string
        part_id: string
        quantity: number
        unit_price: number
        uom_id: string
        line_total: number
        material_risk: string
      }>
    }
  | { ok: false, error: string }
> {
  try {
    const id = String(poId ?? "").trim()
    if (!id) {
      return { ok: false, error: "חסר מזהה" }
    }
    const supabase = await createServerSupabaseClient()
    const { data: po, error: pErr } = await supabase
      .from("purchase_orders")
      .select(
        "id, po_number, project_id, order_date, status, wh_status, total_amount, supplier_id"
      )
      .eq("id", id)
      .maybeSingle()
    if (pErr) throw pErr
    if (!po) {
      return { ok: false, error: "לא נמצא" }
    }
    const supplierEntityId = String((po as { supplier_id: string }).supplier_id)
    const masterSupplierId = await resolveMasterSupplierFromEntity(
      supabase,
      supplierEntityId
    )

    const { data: pol, error: lErr } = await supabase
      .from("purchase_order_lines")
      .select("id, part_id, quantity, unit_price, uom_id, line_total")
      .eq("order_id", id)
    if (lErr) throw lErr

    const partIds = [
      ...new Set(
        (pol ?? []).map((r) => String((r as { part_id: string }).part_id))
      ),
    ]
    const riskByPart = new Map<string, string>()
    if (partIds.length > 0) {
      const { data: meta } = await supabase
        .from("supplier_parts")
        .select("id, material_risk")
        .in("id", partIds)
      for (const m of meta ?? []) {
        riskByPart.set(
          String((m as { id: string }).id),
          String((m as { material_risk: string }).material_risk ?? "standard")
        )
      }
    }

    const lines = (pol ?? []).map((r) => ({
      id: String((r as { id: string }).id),
      part_id: String((r as { part_id: string }).part_id),
      quantity: Number((r as { quantity: number }).quantity) || 0,
      unit_price: Number((r as { unit_price: number }).unit_price) || 0,
      uom_id: String((r as { uom_id: string }).uom_id),
      line_total: Number((r as { line_total: number }).line_total) || 0,
      material_risk: riskByPart.get(String((r as { part_id: string }).part_id)) ?? "standard",
    }))

    return {
      ok: true,
      po: {
        id: String((po as { id: string }).id),
        po_number: String((po as { po_number: string }).po_number ?? ""),
        project_id: (po as { project_id: string | null }).project_id,
        order_date: String((po as { order_date: string }).order_date ?? ""),
        status: String((po as { status: string }).status ?? ""),
        wh_status: (po as { wh_status: string | null }).wh_status,
        total_amount: Number((po as { total_amount: number }).total_amount) || 0,
        supplier_id: supplierEntityId,
      },
      masterSupplierId,
      lines,
    }
  } catch (e) {
    return { ok: false, error: formatError(e) || "טעינה נכשלה" }
  }
}
