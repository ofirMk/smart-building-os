import { z } from "zod"

import { HR_AGENT_DATA_MARKER } from "@/lib/agents/hr/prompt"
import { extractModelJsonPayload } from "@/lib/ocr-invoice/parse-model-json"

/** שדה מספרי מהחוזה — value יכול להיות null אם לא נמצא במסמך */
export const citedNumberNullableSchema = z.object({
  value: z.number().nullable(),
  source: z.string(),
})

/** תאריך YYYY-MM-DD — value יכול להיות null אם לא נמצא */
export const citedIsoDateNullableSchema = z.object({
  value: z.string().nullable(),
  source: z.string(),
})

export type CitedNumberNullable = z.infer<typeof citedNumberNullableSchema>
export type CitedIsoDateNullable = z.infer<typeof citedIsoDateNullableSchema>

/**
 * אובייקט suggestions כפי שה-Contract Analyst מחזיר בסוף התשובה (לפי HR_AGENT_SYSTEM_PROMPT).
 */
export const hrAgentSuggestionsSchema = z.object({
  paymentTerms: citedNumberNullableSchema,
  retention: citedNumberNullableSchema,
  guarantee: citedNumberNullableSchema,
  endDate: citedIsoDateNullableSchema,
})

export type HrAgentSuggestions = z.infer<typeof hrAgentSuggestionsSchema>

/** בלוק JSON המלא עם מפתח suggestions */
export const hrAgentResponseBlockSchema = z.object({
  suggestions: hrAgentSuggestionsSchema,
})

export type HrAgentResponseBlock = z.infer<typeof hrAgentResponseBlockSchema>

/** חילוץ לפי הפרומפט עם מפתח extractedData (ללא endDate חובה) */
export const hrAgentExtractedDataSchema = z.object({
  paymentTerms: citedNumberNullableSchema.optional(),
  retention: citedNumberNullableSchema.optional(),
  guarantee: citedNumberNullableSchema.optional(),
  endDate: citedIsoDateNullableSchema.optional(),
})

export const hrAgentExtractedDataBlockSchema = z.object({
  extractedData: hrAgentExtractedDataSchema,
})

export type HrAgentExtractedDataBlock = z.infer<
  typeof hrAgentExtractedDataBlockSchema
>

const hrAgentRiskItemRawSchema = z.object({
  title: z.string(),
  level: z.string(),
  source: z.string(),
  recommendation: z.string(),
})

const hrAgentContractTypeMismatchSchema = z.object({
  message: z.string(),
})

const hrAgentBackToBackMismatchSchema = z.object({
  message: z.string(),
})

export type HrAgentRiskItem = {
  title: string
  level: "High" | "Medium" | "Low"
  source: string
  recommendation: string
}

/** בלוק ---DATA---: suggestions חלקי + מערך risks */
export const hrAgentDataPayloadSchema = z
  .object({
    suggestions: hrAgentExtractedDataSchema.optional(),
    risks: z.array(hrAgentRiskItemRawSchema).optional(),
    contractTypeMismatch: hrAgentContractTypeMismatchSchema.optional(),
    backToBackMismatch: hrAgentBackToBackMismatchSchema.optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.suggestions !== undefined ||
      d.risks !== undefined ||
      (d.contractTypeMismatch?.message?.trim().length ?? 0) > 0 ||
      (d.backToBackMismatch?.message?.trim().length ?? 0) > 0,
    {
      message:
        "חייב להופיע לפחות suggestions, risks, contractTypeMismatch או backToBackMismatch",
    }
  )

export type HrAgentDataPayload = z.infer<typeof hrAgentDataPayloadSchema>

/** @deprecated השתמשו ב-hrAgentSuggestionsSchema */
export const contractCitedExtractionsSchema = z.object({
  paymentTerms: citedNumberNullableSchema.optional(),
  retention: citedNumberNullableSchema.optional(),
  insuranceExpiry: citedIsoDateNullableSchema.optional(),
})

/** @deprecated השתמשו ב-HrAgentSuggestions */
export type ContractCitedExtractions = z.infer<
  typeof contractCitedExtractionsSchema
>

export const hrAgentResponseBlockExample: HrAgentResponseBlock = {
  suggestions: {
    paymentTerms: { value: 90, source: "עמוד 12, סעיף תשלומים" },
    retention: { value: 5, source: "נספח תנאים מיוחדים, סעיף 4" },
    guarantee: { value: 10, source: "ערבות מכרז סעיף 7.2" },
    endDate: { value: "2026-12-31", source: "מועד סיום עבודות — סעיף 3" },
  },
}

const missingNumberCited = (): z.infer<typeof citedNumberNullableSchema> => ({
  value: null,
  source: "לא חולץ בבלוק JSON",
})

const missingDateCited = (): z.infer<typeof citedIsoDateNullableSchema> => ({
  value: null,
  source: "לא חולץ בבלוק JSON",
})

function mergeExtractedDataToSuggestions(
  extracted: z.infer<typeof hrAgentExtractedDataSchema>
): HrAgentSuggestions {
  return {
    paymentTerms: extracted.paymentTerms ?? missingNumberCited(),
    retention: extracted.retention ?? missingNumberCited(),
    guarantee: extracted.guarantee ?? missingNumberCited(),
    endDate: extracted.endDate ?? missingDateCited(),
  }
}

function normalizeRiskLevel(raw: string): HrAgentRiskItem["level"] {
  const t = raw.trim()
  if (t === "High" || t === "Medium" || t === "Low") return t
  const lower = t.toLowerCase()
  if (lower.includes("high")) return "High"
  if (lower.includes("low")) return "Low"
  return "Medium"
}

function extractSegmentAfterDataMarker(text: string): string {
  const idx = text.indexOf(HR_AGENT_DATA_MARKER)
  if (idx === -1) return text
  return text.slice(idx + HR_AGENT_DATA_MARKER.length).trim()
}

/** מסתיר את בלוק הנתונים מהצגה (מסך הניתוח) */
export function stripHrAgentDataBlockFromDisplay(
  analysisText: string
): string {
  const t = analysisText.trim()
  const delimited = t.replace(/---DATA---[\s\S]*?---/, "").trim()
  if (delimited !== t) return delimited
  const i = t.indexOf(HR_AGENT_DATA_MARKER)
  if (i === -1) return t
  return t.slice(0, i).trimEnd()
}

function parseJsonFromAnalysis(analysisText: string): unknown {
  const t = analysisText.replace(/^\uFEFF/, "").trim()
  if (!t) throw new Error("empty")
  const segment = extractSegmentAfterDataMarker(t)
  try {
    return extractModelJsonPayload(segment)
  } catch {
    return extractModelJsonPayload(t)
  }
}

export type HrAgentParsedData = {
  suggestions: HrAgentSuggestions | null
  risks: HrAgentRiskItem[]
  contractTypeMismatchMessage: string | null
  backToBackMismatchMessage: string | null
}

/** ממפה אובייקט JSON שכבר פורסר (ללא טקסט סביב) ל־suggestions ו־risks */
export function parseHrAgentFromStructuredJsonValue(
  raw: unknown
): HrAgentParsedData {
  const wrapped = hrAgentResponseBlockSchema.safeParse(raw)
  if (wrapped.success) {
    return {
      suggestions: wrapped.data.suggestions,
      risks: [],
      contractTypeMismatchMessage: null,
      backToBackMismatchMessage: null,
    }
  }

  const extractedBlock = hrAgentExtractedDataBlockSchema.safeParse(raw)
  if (extractedBlock.success) {
    return {
      suggestions: mergeExtractedDataToSuggestions(
        extractedBlock.data.extractedData
      ),
      risks: [],
      contractTypeMismatchMessage: null,
      backToBackMismatchMessage: null,
    }
  }

  const dataPayload = hrAgentDataPayloadSchema.safeParse(raw)
  if (dataPayload.success) {
    const {
      suggestions: sug,
      risks,
      contractTypeMismatch,
      backToBackMismatch,
    } = dataPayload.data
    const suggestions = sug ? mergeExtractedDataToSuggestions(sug) : null
    const riskList: HrAgentRiskItem[] = (risks ?? []).map((r) => ({
      title: r.title,
      level: normalizeRiskLevel(r.level),
      source: r.source,
      recommendation: r.recommendation,
    }))
    const mm = contractTypeMismatch?.message?.trim()
    const b2b = backToBackMismatch?.message?.trim()
    return {
      suggestions,
      risks: riskList,
      contractTypeMismatchMessage: mm ? mm : null,
      backToBackMismatchMessage: b2b ? b2b : null,
    }
  }

  const direct = hrAgentSuggestionsSchema.safeParse(raw)
  if (direct.success) {
    return {
      suggestions: direct.data,
      risks: [],
      contractTypeMismatchMessage: null,
      backToBackMismatchMessage: null,
    }
  }

  return {
    suggestions: null,
    risks: [],
    contractTypeMismatchMessage: null,
    backToBackMismatchMessage: null,
  }
}

export function parseHrAgentDataFromAnalysis(
  analysisText: string
): HrAgentParsedData {
  const t = analysisText.replace(/^\uFEFF/, "").trim()
  if (!t) {
    return {
      suggestions: null,
      risks: [],
      contractTypeMismatchMessage: null,
      backToBackMismatchMessage: null,
    }
  }
  try {
    const raw = parseJsonFromAnalysis(t)
    return parseHrAgentFromStructuredJsonValue(raw)
  } catch {
    return {
      suggestions: null,
      risks: [],
      contractTypeMismatchMessage: null,
      backToBackMismatchMessage: null,
    }
  }
}

/**
 * מחלץ ומאמת את אובייקט suggestions מתוך טקסט הניתוח המלא מהמודל.
 * תומך ב־---DATA---, ב־{ "suggestions": { ... } }, ב־{ "extractedData": { ... } }, או ישירות באובייקט המלא.
 */
export function parseHrAgentSuggestionsFromAnalysis(
  analysisText: string
): HrAgentSuggestions | null {
  return parseHrAgentDataFromAnalysis(analysisText).suggestions
}
