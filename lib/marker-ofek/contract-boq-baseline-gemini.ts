/**
 * Gemini: מסמך PDF (חשבון חלקי / כתב כמויות) → שורות BoQ + בסיס כספי.
 * Uses GEMINI_API_KEY
 */
import { GoogleGenerativeAI } from "@google/generative-ai"

import { parsePartialBillBaselinePayload } from "@/lib/marker-ofek/baseline-bill-ai-schema"
import { MAX_BASELINE_PDF_BYTES } from "@/lib/marker-ofek/project-baseline-bill-gemini"
import { extractModelJsonPayload } from "@/lib/ocr-invoice/parse-model-json"
import type { PartialBillBaselineAIExtract } from "@/types/marker-ofek"

export { MAX_BASELINE_PDF_BYTES }

const GEMINI_MODEL = "gemini-1.5-flash"

const BOQ_SYSTEM_INSTRUCTION = `You are a strict Quantity Surveyor (כמת) parsing an Israeli construction bill (חשבון חלקי / כתב כמויות).

You MUST extract BOTH:
1) The financial summary (header totals), AND
2) Every single line item from ALL BoQ tables anywhere in the PDF — including continuation pages (often pages 2–4+), not only page 1.

BoQ tables typically include columns such as: "סעיף" (item number), "תאור" / "תיאור" (description), "יחידה" (unit), "כמות חוזה" (contract quantity), "מחיר יחידה" or "מחיר מחוזה" / total line price.

YOU MUST extract ALL data rows from these tables into the "items" array. Do not skip rows because the table is long, spans pages, or uses small font. Do not summarize or sample the table — output one JSON object per visible bill line.

If a column shows only total line price (מחיר מחוזה) and quantity, compute unit_price = total_item_price / contract_quantity when quantity > 0.

If execution is shown as a percentage (אחוז ביצוע מצטבר), put it in cumulative_execution_percent (0–100) and still output contract_quantity and pricing fields.

Never return an empty "items" array when the PDF contains BoQ tables.`

const COMBINED_PROMPT = `Return **ONLY** valid JSON (no markdown, no commentary).

Shape (exact keys):

{
  "bill_number": number,
  "bill_month": string,
  "base_index": number,
  "current_index": number,
  "cumulative_work_value": number,
  "indexation_amount": number,
  "retention_percent": number,
  "retention_amount": number,
  "insurance_amount": number,
  "testing_amount": number,
  "subcontractor_deductions": number,
  "total_approved": number,
  "items": [
    {
      "section_number": "string — e.g. 08.01.001 or 01.08.01.0010",
      "description": "string — Hebrew description, e.g. הארקת יסודות",
      "unit": "string — optional, e.g. יח', מ\"א, קומ",
      "contract_quantity": number,
      "total_item_price": number,
      "unit_price": number,
      "cumulative_execution_percent": number
    }
  ]
}

Per line rules:
- **items** MUST list every BoQ row from the document (all pages). Minimum one object if any table exists.
- **total_item_price**: מחיר מחוזה / סכום שורה מהחוזה (ILS) as printed; use 0 only if truly missing.
- **unit_price**: מחיר ליחידה; if only total and quantity exist, set unit_price = total_item_price / contract_quantity (when quantity > 0).
- **cumulative_execution_percent**: אחוז ביצוע מחוזה מצטבר עד חשבון זה (0–100). If the PDF gives cumulative quantity instead, derive percent = (executed_qty / contract_quantity) * 100.
- Legacy compatibility: you may also include **previous_cumulative_quantity** (quantity executed); if percent is given, prefer filling cumulative_execution_percent.
- Keep all free-text output values in Hebrew when inferable from the document.

Financial summary fields: use document numbers; cumulative_work_value = cumulative work before indexation where applicable; total_approved = net payable on this bill.

Use 0 for unknown numeric scalars only when the column is absent; use best guess for bill_month (e.g. "01/2026") if a period is visible.`

export async function extractContractBoqAndBaselineFromPdfBuffer(
  buffer: Buffer
): Promise<PartialBillBaselineAIExtract> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      "שגיאת אבטחה: המפתח הסודי אינו נגיש. אנא ודא שהגדרות השרת תקינות."
    )
  }
  if (buffer.length === 0) throw new Error("קובץ ריק")
  if (buffer.length > MAX_BASELINE_PDF_BYTES) {
    throw new Error(
      `קובץ גדול מדי (מקסימום ${Math.round(MAX_BASELINE_PDF_BYTES / (1024 * 1024))}MB)`
    )
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: BOQ_SYSTEM_INSTRUCTION,
  })
  let text: string
  try {
    const result = await model.generateContent([
      COMBINED_PROMPT,
      {
        inlineData: {
          mimeType: "application/pdf",
          data: buffer.toString("base64"),
        },
      },
    ])
    text = result.response.text()?.trim() ?? ""
  } catch (e) {
    console.error(
      "[extractContractBoqAndBaselineFromPdfBuffer] Gemini failed",
      e
    )
    throw e
  }
  if (!text) throw new Error("תשובה ריקה מ-Gemini")

  let parsed: unknown
  try {
    parsed = extractModelJsonPayload(text)
  } catch (e) {
    console.error(
      "[extractContractBoqAndBaselineFromPdfBuffer] JSON parse failed",
      e
    )
    throw e
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error(
      "[extractContractBoqAndBaselineFromPdfBuffer] invalid root",
      parsed
    )
    throw new Error("מבנה JSON לא תקין מתשובת המודל")
  }

  try {
    return parsePartialBillBaselinePayload(
      parsed,
      "extractContractBoqAndBaselineFromPdfBuffer"
    ) as PartialBillBaselineAIExtract
  } catch (e) {
    console.error(
      "[extractContractBoqAndBaselineFromPdfBuffer] Zod validation failed",
      e
    )
    throw e
  }
}
