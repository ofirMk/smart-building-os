"use server"

import { revalidatePath } from "next/cache"

import { geminiGenerateJsonFromInlineFile } from "@/lib/marker-ofek/ai/shared/gemini-json"
import { createErpContract } from "@/lib/marker-ofek/erp-contract-create-action"
import {
  erpContractCreateSchema,
  type ErpContractCreateInput,
} from "@/lib/marker-ofek/erp-validation-schemas"

export type GenerateContractDraftFromPdfResult =
  | { success: true; data: ErpContractCreateInput }
  | { success: false; error: string }

export type CreateContractFromDraftResult =
  | { success: true; contractId: string }
  | { success: false; error: string }

/**
 * שמירת טיוטת חוזה מאומתת (`ErpContractCreateInput`) ל־`contracts` ושורות כסף ב־`contract_milestones`
 * (BoQ ופאושלי — תואם ל־`createErpContract`).
 */
export async function createContractFromDraft(
  payload: ErpContractCreateInput
): Promise<CreateContractFromDraftResult> {
  const parsed = erpContractCreateSchema.safeParse(payload)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(" · ")
    return { success: false, error: msg || "נתוני חוזה לא תקינים" }
  }

  const result = await createErpContract(parsed.data)
  if (!result.ok) {
    return { success: false, error: result.error }
  }

  revalidatePath("/marker-ofek/entities")
  revalidatePath(`/marker-ofek/entities/${parsed.data.clientEntityId}`)
  return { success: true, contractId: result.contractId }
}

export async function generateContractDraftFromPdf(
  base64Data: string,
  mimeType: string,
  projectId: string,
  clientEntityId: string
): Promise<GenerateContractDraftFromPdfResult> {
  try {
    const prompt = `
      You are an expert construction project manager and contract analyst in Israel.
      Extract the contract details from the provided document into a strict JSON format.
      
      CRITICAL RULES:
      1. Return ONLY valid JSON. No markdown tags, no explanations.
      2. If a value is not found, use null or 0 according to the schema.
      3. Dates must be YYYY-MM-DD.
      4. Understand if this is a BOQ (כתב כמויות) or Paushal (פאושלי) contract based on the text.
      
      Output Structure:
      {
        "startDate": "YYYY-MM-DD",
        "contractType": "main_contract" or "sub_contract",
        "pricingModel": "boq" or "paushal",
        "contractNumber": "string or null",
        "contractDisplayName": "string or null",
        "retentionPct": number (0-100, e.g., 5 for 5%),
        "insurancePct": number (0-100),
        "testingPct": number (0-100),
        "paushalTotalValue": number or null,
        "boqRows": [ { "sectionCode": "string", "description": "string", "unit": "string", "quantity": number, "unitPrice": number } ],
        "paushalRows": [ { "sectionCode": "string", "description": "string", "weightPct": number } ]
      }
    `

    const rawJson = await geminiGenerateJsonFromInlineFile({
      prompt,
      mimeType,
      base64Data,
    })

    const draftPayload = {
      ...(rawJson as Record<string, unknown>),
      projectId,
      clientEntityId,
    }

    const validatedContract = erpContractCreateSchema.parse(draftPayload)

    return { success: true, data: validatedContract }
  } catch (error) {
    console.error("AI Contract Extraction Failed:", error)
    return {
      success: false,
      error:
        "הבינה המלאכותית לא הצליחה לחלץ חוזה תקין מהמסמך. ייתכן וחסרים נתוני חובה.",
    }
  }
}
