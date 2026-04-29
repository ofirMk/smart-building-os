import { GoogleGenerativeAI } from "@google/generative-ai"

import { extractModelJsonPayload } from "@/lib/ocr-invoice/parse-model-json"

export const AI_GEMINI_DEFAULT_MODEL = "gemini-1.5-flash"

/** מספר מילישניות לפני timeout בקריאת Gemini (60 שניות). */
const AI_CALL_TIMEOUT_MS = 60_000

/**
 * שגיאה מדויקת לכשלי AI — מאפשרת ל-Server Actions לזהות כשלי AI
 * בנפרד מכשלי לוגיקה עסקית.
 */
export class GeminiCallError extends Error {
  readonly isAiError = true as const
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = "GeminiCallError"
  }
}

/**
 * תוצאת AI בטוחה — אפשרות גיבוי (fallback) כשה-AI אינו זמין.
 * השתמש ב-`runAiSafe` כדי לעטוף כל קריאת AI.
 */
export type AiSafeResult<T> =
  | { ok: true; data: T }
  | { ok: false; aiError: string; fallback: true }

/**
 * עוטף כל קריאת AI אסינכרונית — כשל (timeout, quota, רשת) אינו
 * מקריס את ה-Server Action אלא מחזיר fallback מובנה.
 *
 * @example
 * const result = await runAiSafe(() => geminiGenerateJsonFromText({ prompt }))
 * if (!result.ok) return { ok: false, aiWarning: result.aiError, data: [] }
 */
export async function runAiSafe<T>(
  fn: () => Promise<T>
): Promise<AiSafeResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (err) {
    const aiError = err instanceof Error ? err.message : "שירות AI אינו זמין כרגע"
    console.warn("[AI] graceful degradation activated:", aiError)
    return { ok: false, aiError, fallback: true }
  }
}

function requireGeminiKey(): string {
  const k = process.env.GEMINI_API_KEY?.trim()
  if (!k) {
    throw new Error(
      "שגיאת אבטחה: GEMINI_API_KEY אינו מוגדר. הוסיפו מפתח בשרת."
    )
  }
  return k
}

/** תוכן PDF/תמונה → טקסט מודל → JSON מפורש. */
export async function geminiGenerateJsonFromInlineFile(input: {
  prompt: string
  mimeType: string
  base64Data: string
  model?: string
}): Promise<unknown> {
  const genAI = new GoogleGenerativeAI(requireGeminiKey())
  const model = genAI.getGenerativeModel({
    model: input.model ?? AI_GEMINI_DEFAULT_MODEL,
  })
  let result
  try {
    result = await model.generateContent(
      [
        { text: input.prompt },
        {
          inlineData: {
            mimeType: input.mimeType,
            data: input.base64Data,
          },
        },
      ],
      { timeout: AI_CALL_TIMEOUT_MS }
    )
  } catch (err) {
    throw new GeminiCallError(
      err instanceof Error ? err.message : "כשל תקשורת Gemini",
      err
    )
  }
  const text = result.response.text()?.trim() ?? ""
  if (!text) throw new GeminiCallError("תשובה ריקה מ-Gemini")
  return extractModelJsonPayload(text)
}

/** טקסט בלבד (תמלול, פרומפטים ארוכים). */
export async function geminiGenerateJsonFromText(input: {
  prompt: string
  model?: string
}): Promise<unknown> {
  const genAI = new GoogleGenerativeAI(requireGeminiKey())
  const model = genAI.getGenerativeModel({
    model: input.model ?? AI_GEMINI_DEFAULT_MODEL,
  })
  let result
  try {
    result = await model.generateContent(
      input.prompt,
      { timeout: AI_CALL_TIMEOUT_MS }
    )
  } catch (err) {
    throw new GeminiCallError(
      err instanceof Error ? err.message : "כשל תקשורת Gemini",
      err
    )
  }
  const text = result.response.text()?.trim() ?? ""
  if (!text) throw new GeminiCallError("תשובה ריקה מ-Gemini")
  return extractModelJsonPayload(text)
}

/**
 * אודיו/וידאו קצרים — כפוף למגבלות המודל (Flash).
 * mime לדוגמה: audio/mp3, audio/mpeg, audio/wav
 */
export async function geminiGenerateJsonFromAudio(input: {
  prompt: string
  mimeType: string
  base64Data: string
  model?: string
}): Promise<unknown> {
  return geminiGenerateJsonFromInlineFile(input)
}
