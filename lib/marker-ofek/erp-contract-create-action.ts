"use server"

import { revalidatePath } from "next/cache"

import {
  encodeBoqMilestoneStoredName,
  encodeMilestoneDisplayName,
} from "@/lib/marker-ofek/milestone-name-codec"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import {
  erpContractCreateSchema,
  type ErpContractCreateInput,
} from "@/lib/marker-ofek/erp-validation-schemas"
import { formatError } from "@/lib/utils"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function paushalLineAmount(totalVal: number, weightPct: number): number {
  return roundMoney((totalVal * weightPct) / 100)
}

export type ErpContractCreateResult =
  | { ok: true; contractId: string }
  | { ok: false; error: string }

export async function createErpContract(
  raw: unknown
): Promise<ErpContractCreateResult> {
  let data: ErpContractCreateInput
  try {
    const parsed = erpContractCreateSchema.safeParse(raw)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(" · ")
      return { ok: false, error: msg || "נתוני חוזה לא תקינים" }
    }
    data = parsed.data
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: ent, error: entErr } = await supabase
      .from("entities")
      .select("id, type, is_deleted")
      .eq("id", data.clientEntityId)
      .maybeSingle()

    if (entErr) return { ok: false, error: entErr.message }
    if (!ent || ent.is_deleted || ent.type !== "client") {
      return { ok: false, error: "מזמין (לקוח) חייב להיבחר מרשימת ישויות מסוג client" }
    }

    const { data: proj, error: projErr } = await supabase
      .from("projects")
      .select("id, is_deleted")
      .eq("id", data.projectId)
      .maybeSingle()

    if (projErr) return { ok: false, error: projErr.message }
    if (!proj || proj.is_deleted) {
      return { ok: false, error: "פרויקט לא נמצא או מסומן כמחוק" }
    }

    const agreementLabel = data.pricingModel === "paushal" ? "פאושלי" : "כתב כמויות"
    const totalForContract =
      data.pricingModel === "boq"
        ? roundMoney(
            (data.boqRows ?? []).reduce(
              (s, r) => s + r.quantity * r.unitPrice,
              0
            )
          )
        : roundMoney(data.paushalTotalValue ?? 0)

    const { data: newContract, error: contractInsertError } = await supabase
      .from("contracts")
      .insert({
        project_id: data.projectId,
        entity_id: data.clientEntityId,
        contract_type: data.contractType,
        agreement_type: agreementLabel,
        retention_pct: data.retentionPct,
        insurance_pct: data.insurancePct,
        testing_pct: data.testingPct,
        pricing_model: data.pricingModel,
        total_amount: totalForContract,
        status: "draft",
        contract_number: data.contractNumber?.trim() || null,
        name: data.contractDisplayName?.trim() || null,
        start_date: data.startDate,
      })
      .select("id")
      .single()

    if (contractInsertError || !newContract?.id) {
      return {
        ok: false,
        error: contractInsertError?.message ?? "שמירת חוזה נכשלה",
      }
    }
    const contractId = newContract.id as string

    if (data.pricingModel === "boq") {
      const boqForDb = (data.boqRows ?? []).filter(
        (r) => r.sectionCode.trim() && r.description.trim()
      )
      const boqTotal = roundMoney(
        boqForDb.reduce((s, r) => s + r.quantity * r.unitPrice, 0)
      )
      if (boqForDb.length > 0) {
        const milestonePayload = boqForDb.map((r, i) => {
          const amount = roundMoney(r.quantity * r.unitPrice)
          const wp = boqTotal > 0 ? roundMoney((amount / boqTotal) * 100) : 0
          return {
            contract_id: contractId,
            name: encodeBoqMilestoneStoredName(
              r.sectionCode,
              r.description,
              String(r.quantity),
              String(r.unitPrice)
            ),
            amount,
            sort_order: i,
            weight_percentage: wp,
          }
        })

        const { error: linesError } = await supabase
          .from("contract_milestones")
          .insert(milestonePayload)

        if (linesError) {
          await supabase.from("contracts").delete().eq("id", contractId)
          return { ok: false, error: linesError.message }
        }
      }
    } else {
      const totalVal = roundMoney(data.paushalTotalValue ?? 0)
      const validMs = (data.paushalRows ?? []).filter(
        (r) => r.sectionCode.trim() && r.description.trim()
      )
      const milestonePayload = validMs.map((m, i) => {
        const w = roundMoney(m.weightPct)
        return {
          contract_id: contractId,
          name: encodeMilestoneDisplayName(m.sectionCode, m.description),
          amount: paushalLineAmount(totalVal, w),
          sort_order: i,
          weight_percentage: w,
        }
      })

      const { error: msError } = await supabase
        .from("contract_milestones")
        .insert(milestonePayload)

      if (msError) {
        await supabase.from("contracts").delete().eq("id", contractId)
        return { ok: false, error: msError.message }
      }
    }

    revalidatePath("/marker-ofek/contracts")
    return { ok: true, contractId }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
