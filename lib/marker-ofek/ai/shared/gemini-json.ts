import { GoogleGenerativeAI } from "@google/generative-ai"

import { extractModelJsonPayload } from "@/lib/ocr-invoice/parse-model-json"

export const AI_GEMINI_DEFAULT_MODEL = "gemini-1.5-flash"

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
  const result = await model.generateContent([
    { text: input.prompt },
    {
      inlineData: {
        mimeType: input.mimeType,
        data: input.base64Data,
      },
    },
  ])
  const text = result.response.text()?.trim() ?? ""
  if (!text) throw new Error("תשובה ריקה מ-Gemini")
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
  const result = await model.generateContent(input.prompt)
  const text = result.response.text()?.trim() ?? ""
  if (!text) throw new Error("תשובה ריקה מ-Gemini")
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
