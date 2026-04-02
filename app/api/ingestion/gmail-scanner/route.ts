import { GoogleGenerativeAI } from "@google/generative-ai"
import { NextResponse, type NextRequest } from "next/server"

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GEMINI_MODEL = "gemini-1.5-flash"
const START_DATE = "2025-01-01"

type ExtractedInvoice = {
  supplier_name: string
  invoice_date: string | null
  total_amount: number
  items: Array<{
    description: string
    quantity: number
    unit_price: number
    supplier_sku?: string | null
    unit?: string | null
  }>
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "idle_or_running",
    message: "סורק נתונים רטרואקטיביים בפעולה...",
    since: START_DATE,
  })
}

function safeSkuFromName(name: string): string {
  const ascii = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 14)
  return `MO-${ascii || "ITEM"}-${Date.now().toString().slice(-4)}`
}

function parseIsoDateOrNull(s: string | null | undefined): string | null {
  const x = String(s ?? "").trim()
  if (!x) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return x
  const d = new Date(x)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function decodeBase64Url(input: string): Buffer {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(b64, "base64")
}

async function getGoogleAccessToken(): Promise<string> {
  const direct = process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim()
  if (direct) return direct

  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim()
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      "Missing Google OAuth credentials (GOOGLE_OAUTH_ACCESS_TOKEN or refresh token set)"
    )
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })
  if (!res.ok) throw new Error(`Failed to refresh Google token (${res.status})`)
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error("Google refresh response missing access_token")
  return data.access_token
}

async function analyzeInvoiceWithGemini(
  apiKey: string,
  data: Buffer,
  mimeType: string
): Promise<ExtractedInvoice> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
  const prompt = `Extract invoice JSON only:
{
  "supplier_name": "string",
  "invoice_date": "YYYY-MM-DD|null",
  "total_amount": number,
  "items": [
    { "description": "string", "quantity": number, "unit_price": number, "supplier_sku": "string|null", "unit": "string|null" }
  ]
}
Rules: focus on supplier tax invoice (חשבונית מס), normalize numbers, items must be detailed lines.
All textual values should be in Hebrew when inferable from the source document.
Also ensure the response is strict JSON suitable for "טבלת התאמות וביקורת".`

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType,
        data: data.toString("base64"),
      },
    },
  ])
  const text = result.response.text()?.trim()
  if (!text) throw new Error("Gemini returned empty response")
  const match =
    text.match(/```json\s*([\s\S]*?)```/i)?.[1] ??
    text.match(/```([\s\S]*?)```/i)?.[1] ??
    text
  const parsed = JSON.parse(match) as Record<string, unknown>
  const itemsRaw = Array.isArray(parsed.items) ? parsed.items : []
  return {
    supplier_name: String(parsed.supplier_name ?? "").trim() || "Unknown Supplier",
    invoice_date: parseIsoDateOrNull(parsed.invoice_date as string | null),
    total_amount: Number(parsed.total_amount ?? 0) || 0,
    items: itemsRaw.map((x) => {
      const r = x as Record<string, unknown>
      const qty = Number(r.quantity ?? 0)
      const unitPrice = Number(r.unit_price ?? 0)
      return {
        description: String(r.description ?? "").trim(),
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        unit_price: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
        supplier_sku:
          r.supplier_sku == null ? null : String(r.supplier_sku).trim() || null,
        unit: r.unit == null ? null : String(r.unit).trim() || null,
      }
    }),
  }
}

type GmailAttachment = { id: string; filename: string; mimeType: string; messageId: string }

function extractAttachments(
  node: Record<string, unknown>,
  messageId: string,
  out: GmailAttachment[]
) {
  const parts = Array.isArray(node.parts) ? node.parts : []
  for (const p of parts as Record<string, unknown>[]) {
    const fileName = String(p.filename ?? "").trim()
    const mimeType = String(p.mimeType ?? "").trim().toLowerCase()
    const body = (p.body ?? {}) as Record<string, unknown>
    const attachmentId = String(body.attachmentId ?? "").trim()
    const allowed =
      mimeType === "application/pdf" ||
      mimeType === "image/png" ||
      mimeType === "image/jpeg" ||
      mimeType === "image/jpg" ||
      mimeType === "image/webp"
    if (attachmentId && fileName && allowed) {
      out.push({ id: attachmentId, filename: fileName, mimeType, messageId })
    }
    extractAttachments(p, messageId, out)
  }
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.INGESTION_SCANNER_SECRET?.trim()
    if (secret) {
      const header = req.headers.get("x-ingestion-secret")?.trim()
      if (!header || header !== secret) return jsonError("Unauthorized", 401)
    }

    const body = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean
      maxFiles?: number
    }
    const dryRun = Boolean(body.dryRun)
    const maxFiles = Math.max(1, Math.min(Number(body.maxFiles ?? 150), 1000))

    const googleToken = await getGoogleAccessToken()
    const geminiApiKey = process.env.GEMINI_API_KEY?.trim()
    if (!geminiApiKey) {
      return jsonError(
        "שגיאת אבטחה: המפתח הסודי אינו נגיש. אנא ודא שהגדרות השרת תקינות.",
        500
      )
    }

    const supabase = createSupabaseServiceRoleClient()
    const stats = {
      scannedFiles: 0,
      importedInvoices: 0,
      createdCatalogItems: 0,
      updatedSupplierPrices: 0,
      errors: [] as string[],
    }

    const gmailQuery =
      `from:dayan.ofir@gmail.com after:${START_DATE.replace(/-/g, "/")} ` +
      `(חשבונית OR "חשבונית מס" OR invoice) has:attachment`
    const gmailList = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(gmailQuery)}&maxResults=200`,
      { headers: { Authorization: `Bearer ${googleToken}` } }
    )
    if (!gmailList.ok) return jsonError(`Gmail list failed (${gmailList.status})`, 502)
    const gmailData = (await gmailList.json()) as {
      messages?: Array<{ id: string }>
    }

    const attachments: GmailAttachment[] = []
    for (const m of gmailData.messages ?? []) {
      if (attachments.length >= maxFiles) break
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
        { headers: { Authorization: `Bearer ${googleToken}` } }
      )
      if (!msgRes.ok) continue
      const msg = (await msgRes.json()) as { id: string; payload?: Record<string, unknown> }
      if (msg.payload) extractAttachments(msg.payload, msg.id, attachments)
    }

    const driveQuery =
      `createdTime >= '${START_DATE}T00:00:00Z' and ` +
      `(mimeType='application/pdf' or mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/webp')`
    const driveList = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(driveQuery)}&pageSize=100&fields=files(id,name,mimeType,createdTime)`,
      { headers: { Authorization: `Bearer ${googleToken}` } }
    )
    const driveFiles = driveList.ok
      ? (((await driveList.json()) as { files?: Array<{ id: string; name: string; mimeType: string }> }).files ?? [])
      : []

    const tasks: Array<{
      source: "gmail" | "drive"
      fileId: string
      messageId?: string
      name: string
      mimeType: string
    }> = [
      ...attachments.slice(0, maxFiles).map((a) => ({
        source: "gmail" as const,
        fileId: a.id,
        messageId: a.messageId,
        name: a.filename,
        mimeType: a.mimeType === "image/jpg" ? "image/jpeg" : a.mimeType,
      })),
      ...driveFiles.slice(0, Math.max(0, maxFiles - attachments.length)).map((f) => ({
        source: "drive" as const,
        fileId: f.id,
        name: f.name,
        mimeType: f.mimeType === "image/jpg" ? "image/jpeg" : f.mimeType,
      })),
    ]

    for (const task of tasks) {
      stats.scannedFiles += 1
      try {
        let fileBuffer: Buffer
        if (task.source === "gmail") {
          const attachRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${task.messageId}/attachments/${task.fileId}`,
            { headers: { Authorization: `Bearer ${googleToken}` } }
          )
          if (!attachRes.ok) throw new Error(`Gmail attachment fetch failed (${attachRes.status})`)
          const attach = (await attachRes.json()) as { data?: string }
          if (!attach.data) throw new Error("Gmail attachment missing data")
          fileBuffer = decodeBase64Url(attach.data)
        } else {
          const fileRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${task.fileId}?alt=media`,
            { headers: { Authorization: `Bearer ${googleToken}` } }
          )
          if (!fileRes.ok) throw new Error(`Drive file fetch failed (${fileRes.status})`)
          fileBuffer = Buffer.from(await fileRes.arrayBuffer())
        }

        const extracted = await analyzeInvoiceWithGemini(
          geminiApiKey,
          fileBuffer,
          task.mimeType
        )

        if (dryRun) continue

        const supplierName = extracted.supplier_name.trim() || "Unknown Supplier"
        const { data: supplierExisting } = await supabase
          .from("entities")
          .select("id, name")
          .eq("type", "supplier")
          .eq("is_deleted", false)
          .ilike("name", supplierName)
          .maybeSingle()
        let supplierId = (supplierExisting as { id?: string } | null)?.id ?? null
        if (!supplierId) {
          const { data: supplierInserted, error: supplierInsertErr } = await supabase
            .from("entities")
            .insert({
              name: supplierName,
              type: "supplier",
              contact_info: {},
              is_deleted: false,
            })
            .select("id")
            .single()
          if (supplierInsertErr || !supplierInserted?.id) {
            throw new Error(supplierInsertErr?.message ?? "Failed creating supplier")
          }
          supplierId = supplierInserted.id as string
        }

        for (const item of extracted.items) {
          const name = item.description.trim()
          if (!name) continue
          const lookup = await supabase
            .from("items_catalog")
            .select("id, sku, description")
            .ilike("description", name)
            .maybeSingle()
          let itemId = (lookup.data as { id?: string } | null)?.id ?? null
          if (!itemId) {
            const sku = safeSkuFromName(name)
            const insertItem = await supabase
              .from("items_catalog")
              .insert({
                sku,
                description: name,
                unit: item.unit ?? "יחידה",
                default_price: item.unit_price,
                is_inventory: true,
                additional_attributes: {
                  supplier_sku: item.supplier_sku ?? null,
                  source: "gmail_2025_scanner",
                },
              })
              .select("id")
              .single()
            if (insertItem.error || !insertItem.data?.id) {
              throw new Error(insertItem.error?.message ?? "Failed creating catalog item")
            }
            itemId = insertItem.data.id as string
            stats.createdCatalogItems += 1
          }

          const supplierItemExisting = await supabase
            .from("supplier_items")
            .select("id")
            .eq("master_item_id", itemId)
            .eq("supplier_id", supplierId)
            .maybeSingle()
          if (supplierItemExisting.data?.id) {
            await supabase
              .from("supplier_items")
              .update({
                supplier_sku: item.supplier_sku ?? null,
                unit_price: item.unit_price,
              })
              .eq("id", supplierItemExisting.data.id)
          } else {
            await supabase.from("supplier_items").insert({
              master_item_id: itemId,
              supplier_id: supplierId,
              supplier_sku: item.supplier_sku ?? null,
              unit_price: item.unit_price,
              is_preferred: false,
            })
          }

          const priceDate = extracted.invoice_date ?? new Date().toISOString().slice(0, 10)
          const priceInsert = await supabase.from("supplier_item_prices").insert({
            master_item_id: itemId,
            supplier_id: supplierId,
            supplier_sku: item.supplier_sku ?? null,
            last_price: item.unit_price,
            last_price_date: priceDate,
          })
          if (!priceInsert.error) {
            stats.updatedSupplierPrices += 1
          }
        }

        stats.importedInvoices += 1
      } catch (err) {
        stats.errors.push(`${task.source}:${task.name} -> ${String(err)}`)
      }
    }

    const emptyScanMessage =
      tasks.length === 0
        ? "סורק נתונים רטרואקטיביים בפעולה... טרם נמצאו מסמכים תואמים."
        : undefined

    return NextResponse.json({
      ok: true,
      scannedEmail: "dayan.ofir@gmail.com",
      dateRange: `${START_DATE}..today`,
      dryRun,
      message: emptyScanMessage,
      ...stats,
    })
  } catch (err) {
    return jsonError(String(err), 500)
  }
}
