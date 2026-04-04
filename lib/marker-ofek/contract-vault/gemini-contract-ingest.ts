import { GoogleGenerativeAI } from "@google/generative-ai"

import { AI_GEMINI_DEFAULT_MODEL } from "@/lib/marker-ofek/ai/shared/gemini-json"

const EMBED_MODEL = "text-embedding-004"

function requireGeminiKey(): string {
  const k = process.env.GEMINI_API_KEY?.trim()
  if (!k) throw new Error("GEMINI_API_KEY חסר בשרת")
  return k
}

/** חילוץ טקסט גלמי מחוזה / נספח (PDF או תמונה). */
export async function extractContractPlainText(input: {
  mimeType: string
  base64: string
}): Promise<string> {
  const genAI = new GoogleGenerativeAI(requireGeminiKey())
  const model = genAI.getGenerativeModel({ model: AI_GEMINI_DEFAULT_MODEL })
  const prompt = `Extract all readable text from this contract or legal construction document. 
Output plain UTF-8 text only, preserve Hebrew and numbers. 
No JSON, no markdown fences. If a page has no text, skip it.`

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: input.mimeType,
        data: input.base64,
      },
    },
  ])
  return (result.response.text() ?? "").trim()
}

export async function embedTextForContractVault(text: string): Promise<number[]> {
  const genAI = new GoogleGenerativeAI(requireGeminiKey())
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL })
  const chunk = text.replace(/\s+/g, " ").trim().slice(0, 8_000)
  if (!chunk) return []
  const res = await model.embedContent(chunk)
  const values = res.embedding?.values
  if (!values?.length) return []
  return Array.from(values)
}

export function vectorToPgString(values: number[]): string {
  return `[${values.join(",")}]`
}
