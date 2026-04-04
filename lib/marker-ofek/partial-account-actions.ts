"use server"

import { revalidatePath } from "next/cache"
import { format } from "date-fns"

import {
  DEFAULT_INDEX_SERIES_CODE,
  fetchIndexHistoryRowById,
  fetchIndexOnOrBefore,
} from "@/lib/marker-ofek/index-history-lookup"
import {
  computeDeductionAmounts,
  computeIndexedPeriodFromHistory,
  computeTotalCumulativeAmount,
  contractProgressPercent,
  roundMoney,
  resolveDeductionPercents,
} from "@/lib/marker-ofek/partial-account-calc"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { MoPartialAccountStatus } from "@/types/marker-ofek"
import { formatError } from "@/lib/utils"

type LinePatch = {
  id: string
  quantity_previous: number
  quantity_current: number
}

export type CalculatePartialAccountResult = {
  partialAccountId: string
  totalCumulativeAmount: number
  /** סה״כ ביצוע תקופתי (ברוטו, לפני מדד) */
  periodWorkGross: number
  periodWorkIndexed: number
  indexationAdjustmentAmount: number
  usedIndexHistoryRatio: boolean
  retentionDeduction: number
  insuranceDeduction: number
  labFeesDeduction: number
  retainageAmount: number
  paymentDue: number
  currentProgressPercent: number | null
}

/**
 * Cumulative billing math for a partial account.
 * Per line (milestone or BoQ): line_total_price = ((current − previous) / 100) × base line value,
 * where base is milestone.amount or contract line qty × unit_price.
 * Header: period_work = Σ line_total_price; total_cumulative = previous_cumulative_approved + period_work;
 * Indexed period work = period_gross × (מדד נוכחי / מדד בסיס) מ־`ref_index_history` כשקיים;
 * אחרת period_gross × contract.index_coefficient.
 * Retention, insurance, lab fees apply to indexed period; payment_due = indexed − sum(deductions).
 * Mission formula at header level: Total_Due ≈ (progress × contract value) − previous_payments,
 * realized here as incremental period due after prior cumulative.
 */
export async function calculatePartialAccount(params: {
  partialAccountId: string
  linePatches?: LinePatch[] | null
  nextStatus?: MoPartialAccountStatus | null
}): Promise<
  { ok: true; data: CalculatePartialAccountResult } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const pid = params.partialAccountId.trim()
    if (!pid) {
      return { ok: false, error: "חסר מזהה חשבון חלקי" }
    }

    if (params.linePatches?.length) {
      for (const p of params.linePatches) {
        const { error: patchErr } = await supabase
          .from("partial_account_line_items")
          .update({
            quantity_previous: p.quantity_previous,
            quantity_current: p.quantity_current,
          })
          .eq("id", p.id)
          .eq("partial_account_id", pid)
        if (patchErr) throw patchErr
      }
    }

    const { data: pa, error: paErr } = await supabase
      .from("partial_accounts")
      .select(
        "id, contract_id, status, previous_cumulative_approved, project_id, is_deleted"
      )
      .eq("id", pid)
      .maybeSingle()

    if (paErr) throw paErr
    if (!pa || (pa as { is_deleted?: boolean }).is_deleted) {
      return { ok: false, error: "חשבון חלקי לא נמצא" }
    }

    const contractId = (pa as { contract_id: string }).contract_id
    const previousCumulative = roundMoney(
      Number((pa as { previous_cumulative_approved?: number | null }).previous_cumulative_approved ?? 0)
    )

    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .select(
        "id, total_amount, retention_pct, insurance_pct, lab_fees_pct, retainage_percentage, index_coefficient, index_linkage_base_date, base_index_history_id, project_id, is_deleted"
      )
      .eq("id", contractId)
      .maybeSingle()

    if (cErr) throw cErr
    if (!contract || (contract as { is_deleted?: boolean }).is_deleted) {
      return { ok: false, error: "חוזה לא נמצא" }
    }

    const contractTotal = Number((contract as { total_amount?: number | null }).total_amount ?? 0)
    const retentionPctLegacy = Number((contract as { retention_pct?: number }).retention_pct ?? 0)
    const retainagePctCol = (contract as { retainage_percentage?: number | null })
      .retainage_percentage
    const retainagePct =
      retainagePctCol != null && Number.isFinite(Number(retainagePctCol))
        ? Number(retainagePctCol)
        : retentionPctLegacy
    const insurancePct = Number((contract as { insurance_pct?: number }).insurance_pct ?? 0)
    const labFeesPct = Number((contract as { lab_fees_pct?: number }).lab_fees_pct ?? 0)
    const indexCoefficient = Number((contract as { index_coefficient?: number }).index_coefficient ?? 1)
    const contractProjectId = (contract as { project_id?: string | null }).project_id ?? null
    const baseIndexFk = (contract as { base_index_history_id?: string | null })
      .base_index_history_id
    const linkageBaseDate = (contract as { index_linkage_base_date?: string | null })
      .index_linkage_base_date

    const asOfIso = format(new Date(), "yyyy-MM-dd")

    let baseIndexRow = await fetchIndexHistoryRowById(supabase, baseIndexFk)
    if (!baseIndexRow && linkageBaseDate) {
      const d = String(linkageBaseDate).slice(0, 10)
      baseIndexRow = await fetchIndexOnOrBefore(
        supabase,
        DEFAULT_INDEX_SERIES_CODE,
        d
      )
    }

    const currentIndexRow = await fetchIndexOnOrBefore(
      supabase,
      DEFAULT_INDEX_SERIES_CODE,
      asOfIso
    )

    const { data: ruleRows } = await supabase
      .from("contract_deduction_rules")
      .select("deduction_kind, percent")
      .eq("contract_id", contractId)

    const deductionPercents = resolveDeductionPercents({
      retentionPct: retainagePct,
      insurancePct,
      labFeesPct,
      rules: ruleRows ?? [],
    })

    const { data: lines, error: liErr } = await supabase
      .from("partial_account_line_items")
      .select(
        "id, contract_line_item_id, contract_milestone_id, quantity_previous, quantity_current"
      )
      .eq("partial_account_id", pid)

    if (liErr) throw liErr
    const lineRows = lines ?? []

    let periodWork = 0

    for (const row of lineRows) {
      const r = row as {
        id: string
        contract_line_item_id: string | null
        contract_milestone_id: string | null
        quantity_previous: number | null
        quantity_current: number | null
      }

      let base = 0
      if (r.contract_milestone_id) {
        const { data: ms } = await supabase
          .from("contract_milestones")
          .select("amount")
          .eq("id", r.contract_milestone_id)
          .maybeSingle()
        base = Number((ms as { amount?: number } | null)?.amount ?? 0)
      } else if (r.contract_line_item_id) {
        const { data: li } = await supabase
          .from("contract_line_items")
          .select("quantity, unit_price")
          .eq("id", r.contract_line_item_id)
          .maybeSingle()
        const q = Number((li as { quantity?: number | null } | null)?.quantity ?? 0)
        const up = Number((li as { unit_price?: number | null } | null)?.unit_price ?? 0)
        base = roundMoney(q * up)
      }

      const qPrev = Math.min(100, Math.max(0, Number(r.quantity_previous ?? 0)))
      const qCur = Math.min(100, Math.max(0, Number(r.quantity_current ?? 0)))
      const deltaPct = Math.max(0, qCur - qPrev)
      const lineTotal = roundMoney((deltaPct / 100) * base)
      periodWork += lineTotal

      const { error: upErr } = await supabase
        .from("partial_account_line_items")
        .update({
          line_total_price: lineTotal,
          approved_percentage: qCur,
          approved_amount: roundMoney((qCur / 100) * base),
          execution_percentage: qCur,
          cumulative_amount: roundMoney((qCur / 100) * base),
        })
        .eq("id", r.id)

      if (upErr) throw upErr
    }

    periodWork = roundMoney(periodWork)
    const totalCumulativeAmount = computeTotalCumulativeAmount(previousCumulative, periodWork)

    const idx = computeIndexedPeriodFromHistory({
      periodGross: periodWork,
      baseIndexValue: baseIndexRow?.index_value ?? null,
      currentIndexValue: currentIndexRow?.index_value ?? null,
      indexCoefficientFallback: indexCoefficient,
    })
    const periodWorkIndexed = idx.periodIndexed
    const indexationAdjustmentAmount = idx.indexationAdjustment
    const baseIndexIdForRow = idx.usedIndexRatio ? baseIndexRow?.id ?? null : null
    const appliedIndexIdForRow = idx.usedIndexRatio ? currentIndexRow?.id ?? null : null

    const d = computeDeductionAmounts(periodWorkIndexed, deductionPercents)
    const retentionDeduction = d.retention
    const insuranceDeduction = d.insurance
    const labFeesDeduction = d.labFees
    const paymentDue = d.paymentDue
    const retainageAmount = retentionDeduction

    const currentProgressPercent = contractProgressPercent(totalCumulativeAmount, contractTotal)

    const nextStatus = params.nextStatus ?? (pa as { status: MoPartialAccountStatus }).status

    const { error: upPaErr } = await supabase
      .from("partial_accounts")
      .update({
        total_cumulative_amount: totalCumulativeAmount,
        period_work_gross: periodWork,
        period_work_indexed: periodWorkIndexed,
        indexation_adjustment_amount: indexationAdjustmentAmount,
        retainage_amount: retainageAmount,
        base_index_history_id: baseIndexIdForRow,
        applied_index_history_id: appliedIndexIdForRow,
        retention_deduction: retentionDeduction,
        insurance_deduction: insuranceDeduction,
        lab_fees_deduction: labFeesDeduction,
        payment_due: paymentDue,
        current_progress_percent: currentProgressPercent,
        status: nextStatus,
        project_id: (pa as { project_id?: string | null }).project_id ?? contractProjectId,
      })
      .eq("id", pid)

    if (upPaErr) throw upPaErr

    revalidatePath("/marker-ofek/partner-finance")
    revalidatePath("/partner-finance")
    revalidatePath("/marker-ofek/finance/billing")
    revalidatePath(`/marker-ofek/finance/contracts/${contractId}`)
    revalidatePath(`/marker-ofek/finance/contracts/billing/${pid}`)
    revalidatePath(`/marker-ofek/contracts/${contractId}`)

    return {
      ok: true,
      data: {
        partialAccountId: pid,
        totalCumulativeAmount,
        periodWorkGross: periodWork,
        periodWorkIndexed,
        indexationAdjustmentAmount,
        usedIndexHistoryRatio: idx.usedIndexRatio,
        retentionDeduction,
        insuranceDeduction,
        labFeesDeduction,
        retainageAmount,
        paymentDue,
        currentProgressPercent,
      },
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/**
 * מנוע כספי אחיד: בסיס ביצוע → הצמדה → ניכויי עכבון/ביטוח/אגרות → נטו לתשלום.
 * שקול ל־`calculatePartialAccount` (אותו חישוב).
 */
export async function calculateFinancials(accountId: string): Promise<
  | { ok: true; data: CalculatePartialAccountResult }
  | { ok: false; error: string }
> {
  return calculatePartialAccount({ partialAccountId: accountId })
}
