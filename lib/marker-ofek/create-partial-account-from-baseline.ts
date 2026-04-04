"use server"

import { revalidatePath } from "next/cache"

import { calculatePartialAccount } from "@/lib/marker-ofek/partial-account-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export type CreatePartialLineState = {
  contract_line_item_id: string | null
  contract_milestone_id: string | null
  quantity_previous: number
  quantity_current: number
}

/**
 * Creates the next partial account: inserts draft header + lines, then `calculatePartialAccount`.
 * `previous_cumulative_approved` is taken from the source partial’s `total_cumulative_amount` (server-trusted),
 * or 0 when `sourcePartialAccountId` is null (first account on the contract).
 */
export async function createPartialAccountFromBaseline(params: {
  contractId: string
  sourcePartialAccountId: string | null
  lineStates: CreatePartialLineState[]
}): Promise<
  { ok: true; partialAccountId: string; accountNumber: number } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const contractId = params.contractId.trim()
    const sourceIdRaw = params.sourcePartialAccountId?.trim() ?? ""
    const sourceId = sourceIdRaw || null
    if (!contractId) {
      return { ok: false, error: "חסר מזהה חוזה" }
    }
    if (!params.lineStates.length) {
      return { ok: false, error: "אין שורות לחשבון" }
    }

    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .select("id, project_id, is_deleted")
      .eq("id", contractId)
      .maybeSingle()

    if (cErr) throw cErr
    if (!contract || (contract as { is_deleted?: boolean }).is_deleted) {
      return { ok: false, error: "חוזה לא נמצא" }
    }

    const projectId = (contract as { project_id?: string | null }).project_id ?? null

    let previousCumulativeApproved = 0
    if (sourceId) {
      const { data: src, error: srcErr } = await supabase
        .from("partial_accounts")
        .select("id, total_cumulative_amount, contract_id")
        .eq("id", sourceId)
        .eq("is_deleted", false)
        .maybeSingle()

      if (srcErr) throw srcErr
      if (!src || (src as { contract_id: string }).contract_id !== contractId) {
        return { ok: false, error: "חשבון מקור לא נמצא" }
      }

      previousCumulativeApproved = roundMoney(
        Number((src as { total_cumulative_amount?: number }).total_cumulative_amount ?? 0)
      )
    }

    const { data: inserted, error: insErr } = await supabase
      .from("partial_accounts")
      .insert({
        contract_id: contractId,
        status: "draft",
        total_cumulative_amount: 0,
        retention_deduction: 0,
        insurance_deduction: 0,
        lab_fees_deduction: 0,
        period_work_indexed: 0,
        payment_due: 0,
        previous_cumulative_approved: previousCumulativeApproved,
        project_id: projectId,
      })
      .select("id, account_number")
      .single()

    if (insErr) throw insErr
    const newId = (inserted as { id: string }).id
    const accountNumber = Number((inserted as { account_number: number }).account_number)

    const lineInserts: Array<Record<string, unknown>> = []

    for (const row of params.lineStates) {
      const qPrev = Math.min(100, Math.max(0, Number(row.quantity_previous) || 0))
      const qCur = Math.min(100, Math.max(0, Number(row.quantity_current) || 0))

      let base = 0
      if (row.contract_milestone_id) {
        const { data: ms } = await supabase
          .from("contract_milestones")
          .select("amount")
          .eq("id", row.contract_milestone_id)
          .maybeSingle()
        base = Number((ms as { amount?: number } | null)?.amount ?? 0)
      } else if (row.contract_line_item_id) {
        const { data: li } = await supabase
          .from("contract_line_items")
          .select("quantity, unit_price")
          .eq("id", row.contract_line_item_id)
          .maybeSingle()
        const q = Number((li as { quantity?: number | null } | null)?.quantity ?? 0)
        const up = Number((li as { unit_price?: number | null } | null)?.unit_price ?? 0)
        base = roundMoney(q * up)
      }

      const cum = roundMoney((qCur / 100) * base)

      lineInserts.push({
        partial_account_id: newId,
        contract_line_item_id: row.contract_line_item_id,
        contract_milestone_id: row.contract_milestone_id,
        quantity_previous: qPrev,
        quantity_current: qCur,
        line_total_price: 0,
        execution_percentage: qCur,
        cumulative_amount: cum,
        submitted_percentage: qCur,
        submitted_amount: cum,
        approved_percentage: qCur,
        approved_amount: cum,
      })
    }

    const { error: liErr } = await supabase
      .from("partial_account_line_items")
      .insert(lineInserts as never)

    if (liErr) {
      await supabase.from("partial_accounts").delete().eq("id", newId)
      throw liErr
    }

    const calc = await calculatePartialAccount({ partialAccountId: newId })
    if (!calc.ok) {
      return { ok: false, error: calc.error }
    }

    revalidatePath(`/marker-ofek/finance/contracts/${contractId}`)
    revalidatePath(`/marker-ofek/finance/contracts/billing/${newId}`)
    revalidatePath("/marker-ofek/finance/billing")
    revalidatePath(`/marker-ofek/contracts/${contractId}`)
    revalidatePath("/marker-ofek/partner-finance")
    revalidatePath("/partner-finance")

    return { ok: true, partialAccountId: newId, accountNumber }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
