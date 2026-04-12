import { NextResponse } from "next/server"

export const runtime = "nodejs"

type OcrExtractedLine = {
  sku: string
  itemName: string
  poNumber: string
  quantity: number
}

type OcrMockResponse = {
  supplierName: string
  documentNumber: string
  documentDate: string
  lines: OcrExtractedLine[]
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * POST /api/ocr
 * Phase 11 mock AI OCR endpoint for Delivery Notes.
 * Simulates 2s model latency and returns structured extraction payload.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "יש לצרף קובץ בשדה file (PDF או תמונה)." },
        { status: 400 }
      )
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "הקובץ ריק." }, { status: 400 })
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))

    const payload: OcrMockResponse = {
      supplierName: "חשמל ישיר",
      documentNumber: "DN-2026-0411",
      documentDate: todayIsoDate(),
      lines: [
        {
          sku: "MO-CAB-NYY-3x2.5",
          itemName: "כבל NYY 3×2.5 מ״מ — סליל 100 מ׳",
          poNumber: "PO-10042",
          quantity: 80,
        },
        {
          sku: "MO-CAB-NYY-5x4",
          itemName: "כבל NYY 5×4 מ״מ — סליל 100 מ׳",
          poNumber: "PO-10042",
          quantity: 40,
        },
        {
          sku: "MO-MCB-C16-1P",
          itemName: "מפסק אוטומטי חד-פאזי 16A — יח׳",
          poNumber: "PO-10042",
          quantity: 5,
        },
      ],
    }

    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
