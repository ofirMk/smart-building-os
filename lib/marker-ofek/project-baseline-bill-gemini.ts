/**
 * Gemini extraction for approved partial-bill PDFs (baseline for next bill).
 * Uses GEMINI_API_KEY.
 */
import { GoogleGenerativeAI } from "@google/generative-ai"

import {
  parsePartialBillBaselinePayload,
} from "@/lib/marker-ofek/baseline-bill-ai-schema"
import { extractModelJsonPayload } from "@/lib/ocr-invoice/parse-model-json"
import type { PartialBillBaselineAIExtract } from "@/types/marker-ofek"

const GEMINI_MODEL = "gemini-1.5-flash"

export const MAX_BASELINE_PDF_BYTES = 20 * 1024 * 1024

const BASELINE_SYSTEM_INSTRUCTION = `You are a strict Quantity Surveyor (כמת) parsing an Israeli construction partial payment certificate (חשבון חלקי).

You MUST extract BOTH the financial summary AND every single BoQ line item from ALL tables in the PDF — including pages 2–4 and beyond. Long BoQ tables must not be truncated: output one JSON object per row.

Typical columns: סעיף, תאור/תיאור, יחידה, כמות חוזה, מחיר יחידה, מחיר מחוזה, אחוז ביצוע.

YOU MUST populate the "items" array with every data row. Do not skip heavy tables. If only total line price and quantity appear, supply total_item_price and derive unit_price = total_item_price / contract_quantity when quantity > 0.

Use cumulative_execution_percent (0–100) for מצב ביצוע מחוזה when shown as percent; you may also send previous_cumulative_quantity when the PDF shows executed quantity.`

const BASELINE_PROMPT = `Return **ONLY** valid JSON (no markdown, no commentary).

Shape and key names:
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
      "section_number": "string",
      "description": "string",
      "unit": "string (optional)",
      "contract_quantity": number,
      "total_item_price": number,
      "unit_price": number,
      "cumulative_execution_percent": number,
      "previous_cumulative_quantity": number
    }
  ]
}

Rules:
- **items** must contain at least one row when the PDF includes BoQ tables, and must list **all** such rows (every page).
- **total_item_price**: מחיר מחוזה (ILS). **unit_price**: per-unit; compute from total ÷ quantity when needed.
- **cumulative_execution_percent**: אחוז ביצוע מחוזה מצטבר. **previous_cumulative_quantity**: executed quantity to date if printed (optional if percent is primary).
- bill_month: as printed (e.g. "01/2026"). Use 0 for unknown numeric fields only when absent.
- Keep all free-text output values in Hebrew when inferable from the document.

Parse Hebrew number formats (commas, ₪) into plain numbers. Omit only rows that are completely illegible — do not omit rows merely because the table continues on another page.`

export type BaselineScanContext = {
  projectName?: string | null
  currentAccountNumber?: number | null
  previousAccountNumber?: number | null
  previousItems?: unknown[]
}

function buildBaselinePrompt(context?: BaselineScanContext): string {
  const previousItems = Array.isArray(context?.previousItems)
    ? context!.previousItems!
    : []

  // Keep context bounded to avoid overloading model input.
  const compactItems = previousItems.slice(0, 250)
  const projectLabel = String(context?.projectName ?? "").trim() || "לא ידוע"
  const currentNumber = Number(context?.currentAccountNumber ?? 0)
  const prevNumber = Number(context?.previousAccountNumber ?? 0)
  const currentAccountLabel =
    Number.isFinite(currentNumber) && currentNumber > 0
      ? `#${currentNumber}`
      : "[מספר החשבון הנוכחי]"
  const previousAccountLabel =
    Number.isFinite(prevNumber) && prevNumber > 0
      ? `#${prevNumber}`
      : "[מספר חשבון קודם]"

  return `### תפקיד: מנהל חשבונות בכיר בפרויקט תשתיות (מרקר אופק)
אתה סורק כעת חשבון חלקי מספר ${currentAccountLabel} עבור פרויקט "${projectLabel}".

### מידע היסטורי (מבסיס הנתונים):
להלן הנתונים המאושרים מחשבון קודם ${previousAccountLabel}:
${JSON.stringify(compactItems)}

### המשימה שלך:
1. חלץ מהקובץ המצורף את "ביצוע נוכחי" (בכמות או באחוז) לכל סעיף.
2. השווה את הביצוע החדש מול "אחוז קודם" שסופק למעלה.
3. חשב את ה"מצטבר החדש": (אחוז קודם + ביצוע נוכחי).
4. אם ה"מצטבר החדש" עולה על 100%, סמן את השורה בסטטוס "OVER_BUDGET".

### פורמט פלט (JSON בלבד):
{
  "items": [
    {
      "item_id": "מספר סעיף",
      "description": "תיאור",
      "previous_percent": מספר,
      "current_performance": מספר,
      "total_accumulated": מספר,
      "alert": "OVER_BUDGET או null"
    }
  ]
}

IMPORTANT:
- After producing the logic fields above, also return the mandatory system schema exactly as defined below, because saving to DB depends on it.
- Return ONLY valid JSON (no markdown, no commentary).

${BASELINE_PROMPT}`
}

async function generateFromPdfBase64(
  apiKey: string,
  base64: string,
  context?: BaselineScanContext
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: BASELINE_SYSTEM_INSTRUCTION,
  })
  const result = await model.generateContent([
    buildBaselinePrompt(context),
    {
      inlineData: {
        mimeType: "application/pdf",
        data: base64,
      },
    },
  ])
  const text = result.response.text()?.trim()
  if (!text) throw new Error("תשובה ריקה מ-Gemini")
  return text
}

export async function extractPartialBillBaselineFromPdfBuffer(
  buffer: Buffer,
  context?: BaselineScanContext
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

  const base64String = buffer.toString("base64")
  let text: string
  try {
    text = await generateFromPdfBase64(apiKey, base64String, context)
  } catch (e) {
    console.error(
      "[extractPartialBillBaselineFromPdfBuffer] Gemini generate failed",
      e
    )
    throw e
  }

  let parsed: unknown
  try {
    parsed = extractModelJsonPayload(text)
  } catch (e) {
    console.error(
      "[extractPartialBillBaselineFromPdfBuffer] JSON extract failed",
      e
    )
    throw e
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error(
      "[extractPartialBillBaselineFromPdfBuffer] invalid root",
      parsed
    )
    throw new Error("מבנה JSON לא תקין מתשובת המודל")
  }

  try {
    return parsePartialBillBaselinePayload(
      parsed,
      "extractPartialBillBaselineFromPdfBuffer"
    ) as PartialBillBaselineAIExtract
  } catch (e) {
    console.error(
      "[extractPartialBillBaselineFromPdfBuffer] Zod validation failed",
      e
    )
    throw e
  }
}
