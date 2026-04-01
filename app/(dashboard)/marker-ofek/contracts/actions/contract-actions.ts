"use server"

import { revalidatePath } from "next/cache"

import { formatError } from "@/lib/format-error"
import {
  extractContractBoqAndBaselineFromPdfBuffer,
  MAX_BASELINE_PDF_BYTES as MAX_CONTRACT_BOQ_PDF_BYTES,
} from "@/lib/marker-ofek/contract-boq-baseline-gemini"
import {
  encodeBoqMilestoneStoredName,
  encodeMilestoneDisplayName,
} from "@/lib/marker-ofek/milestone-name-codec"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { PartialBillBaselineAIExtract } from "@/types/marker-ofek"

export type ScanContractBoqPdfResult =
  | { ok: true; data: PartialBillBaselineAIExtract }
  | { ok: false; error: string }

/**
 * סריקת PDF (כתב כמויות / חשבון חלקי) לשורות BoQ — לטופס יצירת חוזה בלבד.
 */
export async function scanContractBoqPdf(
  formData: FormData
): Promise<ScanContractBoqPdfResult> {
  try {
    const file = formData.get("contract_boq_pdf")
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "נא לבחור קובץ PDF" }
    }
    if (file.size > MAX_CONTRACT_BOQ_PDF_BYTES) {
      return {
        ok: false,
        error: `הקובץ גדול מדי (מקסימום ${Math.round(MAX_CONTRACT_BOQ_PDF_BYTES / (1024 * 1024))}MB)`,
      }
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const data = await extractContractBoqAndBaselineFromPdfBuffer(buffer)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/** שורות BoQ (כתב כמויות) */
export type UpdateContractBoqPayload = {
  sectionCode: string
  description: string
  unit: string
  quantity: string
  unitPrice: string
}

/** שורות פאושלי — משקל %; סכום נגזר מסכום החוזה הכולל */
export type UpdateContractPaushalRowPayload = {
  sectionCode: string
  description: string
  weightPct: string
}

export type UpdateContractStructurePayload =
  | { pricingModel: "boq"; boqRows: UpdateContractBoqPayload[] }
  | {
      pricingModel: "paushal"
      totalContractValue: string
      milestones: UpdateContractPaushalRowPayload[]
    }

/** @deprecated השתמשו ב-UpdateContractBoqPayload */
export type UpdateContractMilestonePayload = UpdateContractBoqPayload

function parseNum(s: string): number {
  const n = parseFloat(String(s).replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

function getValidBoqRows(rows: UpdateContractBoqPayload[]) {
  return rows.filter(
    (r) => r.sectionCode.trim().length > 0 && r.description.trim().length > 0
  )
}

function computeBoqTotal(rows: UpdateContractBoqPayload[]): number {
  return getValidBoqRows(rows).reduce(
    (sum, row) => sum + parseNum(row.quantity) * parseNum(row.unitPrice),
    0
  )
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function getValidPaushalRows(rows: UpdateContractPaushalRowPayload[]) {
  return rows.filter(
    (r) => r.sectionCode.trim().length > 0 && r.description.trim().length > 0
  )
}

export type UpdateContractResult = { ok: true } | { ok: false; error: string }

/**
 * עדכון חוזה לפי מודל תמחיר — כל סעיפי הכסף נשמרים כ-`contract_milestones` בלבד.
 */
export async function updateContract(
  contractId: string,
  formData: FormData,
  structure: UpdateContractStructurePayload
): Promise<UpdateContractResult> {
  const id = contractId?.trim()
  if (!id) {
    return { ok: false, error: "חסר מזהה חוזה" }
  }

  const projectName = (formData.get("projectName")?.toString() ?? "").trim()
  const entityName = (formData.get("entityName")?.toString() ?? "").trim()
  if (!projectName || !entityName) {
    return { ok: false, error: "יש למלא שם פרויקט ושם ישות" }
  }

  const entityLegalId = (formData.get("entityLegalId")?.toString() ?? "").trim()
  const entityAddress = (formData.get("entityAddress")?.toString() ?? "").trim()
  const entityDeductionsFile = (
    formData.get("entityDeductionsFile")?.toString() ?? ""
  ).trim()
  const contractTypeRaw = (
    formData.get("contractType")?.toString() ?? "main_contract"
  ).trim()
  const contractType =
    contractTypeRaw === "sub_contract" ? "sub_contract" : "main_contract"
  const retentionPct = parseNum(formData.get("retentionPct")?.toString() ?? "5")
  const insurancePct = parseNum(formData.get("insurancePct")?.toString() ?? "0.6")
  const testingPct = parseNum(formData.get("testingPct")?.toString() ?? "0")

  const agreementTypeLabel =
    structure.pricingModel === "paushal" ? "פאושלי" : "כתב כמויות"

  try {
    const supabase = await createSupabaseServerAuthClient()

    const { data: ctr, error: cErr } = await supabase
      .from("contracts")
      .select("id, project_id, entity_id")
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle()

    if (cErr || !ctr) {
      return { ok: false, error: cErr?.message ?? "החוזה לא נמצא" }
    }

    const projectId = ctr.project_id as string
    const entityId = ctr.entity_id as string

    const { error: pErr } = await supabase
      .from("projects")
      .update({ name: projectName })
      .eq("id", projectId)

    if (pErr) {
      return { ok: false, error: pErr.message }
    }

    const { error: eErr } = await supabase
      .from("entities")
      .update({
        name: entityName,
        legal_id: entityLegalId || null,
        address: entityAddress || null,
        deductions_file_number: entityDeductionsFile || null,
      })
      .eq("id", entityId)

    if (eErr) {
      return { ok: false, error: eErr.message }
    }

    const { error: msDelErr } = await supabase
      .from("contract_milestones")
      .delete()
      .eq("contract_id", id)

    if (msDelErr) {
      return { ok: false, error: msDelErr.message }
    }

    let totalAmount = 0

    if (structure.pricingModel === "boq") {
      const valid = getValidBoqRows(structure.boqRows)
      const boqTotal = roundMoney(computeBoqTotal(structure.boqRows))

      if (valid.length > 0) {
        const milestoneRows = valid.map((r, i) => {
          const amount = roundMoney(parseNum(r.quantity) * parseNum(r.unitPrice))
          const wp =
            boqTotal > 0 ? roundMoney((amount / boqTotal) * 100) : 0
          return {
            contract_id: id,
            name: encodeBoqMilestoneStoredName(
              r.sectionCode,
              r.description,
              r.quantity,
              r.unitPrice
            ),
            amount,
            sort_order: i,
            weight_percentage: wp,
          }
        })

        const { error: iErr } = await supabase
          .from("contract_milestones")
          .insert(milestoneRows)

        if (iErr) {
          return { ok: false, error: iErr.message }
        }
      }

      totalAmount = boqTotal
    } else {
      const totalVal = parseNum(structure.totalContractValue)
      if (!Number.isFinite(totalVal) || totalVal < 0) {
        return { ok: false, error: "סכום חוזה כולל (פאושלי) לא תקין" }
      }

      const validMs = getValidPaushalRows(structure.milestones)
      if (validMs.length === 0) {
        return {
          ok: false,
          error: "במצב פאושלי נדרשת לפחות שורת אבן דרך עם סעיף ותיאור",
        }
      }

      let sumW = 0
      for (const m of validMs) {
        sumW += parseNum(m.weightPct)
      }
      sumW = roundMoney(sumW)
      if (Math.abs(sumW - 100) > 0.05) {
        return {
          ok: false,
          error: `סכום משקלים חייב להיות 100% (כרגע ${sumW}%)`,
        }
      }

      const milestoneRows = validMs.map((m, i) => {
        const w = parseNum(m.weightPct)
        const amount = roundMoney((totalVal * w) / 100)
        return {
          contract_id: id,
          name: encodeMilestoneDisplayName(m.sectionCode, m.description),
          amount,
          sort_order: i,
          weight_percentage: roundMoney(w),
        }
      })

      const { error: msInsErr } = await supabase
        .from("contract_milestones")
        .insert(milestoneRows)

      if (msInsErr) {
        return { ok: false, error: msInsErr.message }
      }

      totalAmount = roundMoney(totalVal)
    }

    const { error: uErr } = await supabase
      .from("contracts")
      .update({
        contract_type: contractType,
        agreement_type: agreementTypeLabel,
        retention_pct: retentionPct,
        insurance_pct: insurancePct,
        testing_pct: testingPct,
        pricing_model: structure.pricingModel,
        total_amount: totalAmount,
      })
      .eq("id", id)

    if (uErr) {
      return { ok: false, error: uErr.message }
    }

    revalidatePath("/marker-ofek/contracts")
    revalidatePath(`/marker-ofek/contracts/${id}`)
    revalidatePath(`/marker-ofek/contracts/${id}/edit`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
