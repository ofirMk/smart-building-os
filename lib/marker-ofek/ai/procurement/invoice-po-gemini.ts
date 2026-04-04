import { geminiGenerateJsonFromInlineFile } from "@/lib/marker-ofek/ai/shared/gemini-json"

export type ExtractedInvoiceLine = {
  line_no: number
  description: string
  quantity: number | null
  unit: string | null
  unit_price: number | null
  line_total: number | null
  sku: string | null
}

export type ExtractedInvoiceHeader = {
  supplier_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  currency: string | null
  total_amount: number | null
}

export type ExtractedSupplierInvoice = {
  header: ExtractedInvoiceHeader
  lines: ExtractedInvoiceLine[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v)
}

export function normalizeExtractedInvoice(raw: unknown): ExtractedSupplierInvoice {
  if (!isRecord(raw)) throw new Error("פלט המודל אינו אובייקט")

  const headerRaw = isRecord(raw.header) ? raw.header : raw
  const header: ExtractedInvoiceHeader = {
    supplier_name:
      headerRaw.supplier_name != null ? String(headerRaw.supplier_name) : null,
    invoice_number:
      headerRaw.invoice_number != null
        ? String(headerRaw.invoice_number)
        : null,
    invoice_date:
      headerRaw.invoice_date != null ? String(headerRaw.invoice_date) : null,
    currency: headerRaw.currency != null ? String(headerRaw.currency) : "ILS",
    total_amount:
      headerRaw.total_amount != null && headerRaw.total_amount !== ""
        ? Number(headerRaw.total_amount)
        : null,
  }

  const linesRaw = Array.isArray(raw.lines) ? raw.lines : []
  const lines: ExtractedInvoiceLine[] = linesRaw.map((row, idx) => {
    if (!isRecord(row)) {
      return {
        line_no: idx + 1,
        description: "",
        quantity: null,
        unit: null,
        unit_price: null,
        line_total: null,
        sku: null,
      }
    }
    return {
      line_no: Number(row.line_no) || idx + 1,
      description: String(row.description ?? "").trim(),
      quantity:
        row.quantity != null && row.quantity !== ""
          ? Number(row.quantity)
          : null,
      unit: row.unit != null ? String(row.unit) : null,
      unit_price:
        row.unit_price != null && row.unit_price !== ""
          ? Number(row.unit_price)
          : null,
      line_total:
        row.line_total != null && row.line_total !== ""
          ? Number(row.line_total)
          : null,
      sku: row.sku != null ? String(row.sku).trim() || null : null,
    }
  })

  return { header, lines: lines.filter((l) => l.description.length > 0) }
}

export async function extractSupplierInvoiceFromDocument(input: {
  base64: string
  mimeType: string
}): Promise<ExtractedSupplierInvoice> {
  const prompt = `You extract structured data from a supplier invoice (Hebrew/English). Return STRICT JSON only:
{
  "header": {
    "supplier_name": string|null,
    "invoice_number": string|null,
    "invoice_date": string|null (ISO yyyy-mm-dd if possible),
    "currency": string|null,
    "total_amount": number|null
  },
  "lines": [
    {
      "line_no": number,
      "description": string,
      "quantity": number|null,
      "unit": string|null,
      "unit_price": number|null,
      "line_total": number|null,
      "sku": string|null
    }
  ]
}
Use null when unknown. Numbers must be numeric, not strings.`

  const raw = await geminiGenerateJsonFromInlineFile({
    prompt,
    mimeType: input.mimeType,
    base64Data: input.base64,
  })
  return normalizeExtractedInvoice(raw)
}
