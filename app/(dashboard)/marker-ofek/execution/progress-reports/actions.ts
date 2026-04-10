"use server"

import { revalidatePath } from "next/cache"

import { formatError } from "@/lib/format-error"
import { createJournalEntryAction } from "@/lib/holden-erp/journal-actions"
import {
  calcCurrentAmountProgressLine,
  clampPct,
  roundMoney,
} from "@/lib/marker-ofek/progress-report-line-calc"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

import type {
  ProgressReportLineInput,
  ProgressReportSaveStatus,
  SaveProgressReportResult,
} from "./types"

const PAGE_PATH = "/marker-ofek/execution/progress-reports/new"

/** תאריך היום בישראל (YYYY-MM-DD) */
function reportDateIsrael(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === "year")?.value
  const m = parts.find((p) => p.type === "month")?.value
  const d = parts.find((p) => p.type === "day")?.value
  if (y && m && d) return `${y}-${m}-${d}`
  return new Date().toISOString().slice(0, 10)
}

export async function saveProgressReport(input: {
  contractId: string
  reportMonth: string
  reportStatus: ProgressReportSaveStatus
  indexationAmount: number
  retentionPercent: number
  deductionsAmount: number
  previousBilledAmount: number
  lines: ProgressReportLineInput[]
}): Promise<SaveProgressReportResult> {
  const contractId = input.contractId?.trim()
  if (!contractId) {
    return { ok: false, error: "נא לבחור חוזה" }
  }

  const reportMonth = input.reportMonth?.trim()
  if (!reportMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(reportMonth)) {
    return { ok: false, error: "חודש דיווח לא תקין (YYYY-MM)" }
  }

  const indexationAmount = Number(input.indexationAmount)
  const retentionPercent = Number(input.retentionPercent)
  const deductionsAmount = Number(input.deductionsAmount)
  const previousBilledAmount = Number(input.previousBilledAmount)

  if (!Number.isFinite(indexationAmount) || indexationAmount < 0) {
    return { ok: false, error: "סכום מדד לא תקין" }
  }
  if (!Number.isFinite(retentionPercent) || retentionPercent < 0 || retentionPercent > 100) {
    return { ok: false, error: "אחוז עכבון לא תקין (0–100)" }
  }
  if (!Number.isFinite(deductionsAmount) || deductionsAmount < 0) {
    return { ok: false, error: "סכום קיזוזים לא תקין" }
  }
  if (!Number.isFinite(previousBilledAmount) || previousBilledAmount < 0) {
    return { ok: false, error: "סכום חויב קודם לא תקין" }
  }

  const reportStatus = input.reportStatus
  if (
    reportStatus !== "draft" &&
    reportStatus !== "submitted" &&
    reportStatus !== "approved"
  ) {
    return { ok: false, error: "סטטוס דוח לא תקין" }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()

    const { data: contractRow, error: ctrErr } = await supabase
      .from("contracts")
      .select("id, gl_account_code, contract_number, name, entity_id")
      .eq("id", contractId)
      .eq("is_deleted", false)
      .maybeSingle()

    if (ctrErr) {
      return { ok: false, error: ctrErr.message }
    }
    if (!contractRow) {
      return { ok: false, error: "החוזה לא נמצא" }
    }

    const ctr = contractRow as {
      gl_account_code: string | null
      contract_number: string | null
      name: string | null
      entity_id: string
    }

    let contractorName = "—"
    const { data: entRow } = await supabase
      .from("entities")
      .select("name")
      .eq("id", ctr.entity_id)
      .maybeSingle()
    const entName = (entRow as { name?: string | null } | null)?.name
    if (entName && String(entName).trim() !== "") {
      contractorName = String(entName).trim()
    }

    const { data: msRows, error: msErr } = await supabase
      .from("contract_milestones")
      .select("id, amount")
      .eq("contract_id", contractId)
      .order("sort_order", { ascending: true })

    if (msErr) {
      return { ok: false, error: msErr.message }
    }

    const amountById = new Map<string, number>()
    for (const r of msRows ?? []) {
      const row = r as { id: string; amount: number | string | null }
      const a = Number(row.amount)
      amountById.set(row.id, Number.isFinite(a) && a >= 0 ? a : 0)
    }

    /** סכום אושר בחשבון זה (שורות) — בסיס למדד/עכבון */
    let sumApprovedThisBill = 0

    const itemRows: Array<{
      contract_milestone_id: string
      quantity_contract: number | null
      quantity_previous_cumulative: number
      quantity_current_cumulative: number
      quantity_executed_month: number
      quantity_executed: number
      unit_price: number
      line_total: number
      line_cumulative_value: number
    }> = []

    for (const line of input.lines) {
      const id = line.contractMilestoneId?.trim()
      if (!id) continue

      const milestoneAmount = amountById.get(id)
      if (milestoneAmount === undefined) {
        return {
          ok: false,
          error: "אבן דרך לא שייכת לחוזה שנבחר",
        }
      }

      const prevPct = clampPct(Number(line.pctPreviousCumulative))
      const currPct = clampPct(Number(line.pctCurrentCumulative))

      const calc = calcCurrentAmountProgressLine(milestoneAmount, currPct, prevPct)
      const deltaPct = calc.deltaPct
      const approvedThisBill = calc.currentAmount
      const cumulativeValue = calc.cumulativeValue

      sumApprovedThisBill += approvedThisBill

      const include =
        currPct > 0 ||
        prevPct > 0 ||
        Math.abs(deltaPct) > 1e-9

      if (!include) continue

      itemRows.push({
        contract_milestone_id: id,
        quantity_contract: null,
        quantity_previous_cumulative: prevPct,
        quantity_current_cumulative: currPct,
        quantity_executed_month: deltaPct,
        quantity_executed: deltaPct,
        unit_price: milestoneAmount,
        line_total: approvedThisBill,
        line_cumulative_value: cumulativeValue,
      })
    }

    if (itemRows.length === 0) {
      return {
        ok: false,
        error: "נא למלא אחוזי ביצוע או סכומים לפחות באבן דרך אחת",
      }
    }

    sumApprovedThisBill = roundMoney(sumApprovedThisBill)

    const glFromContract =
      ctr.gl_account_code != null && String(ctr.gl_account_code).trim() !== ""
        ? String(ctr.gl_account_code).trim()
        : null

    if (reportStatus === "approved") {
      if (!glFromContract) {
        return {
          ok: false,
          error:
            "לא ניתן לאשר דוח ללא קוד חשבון GL בחוזה — יש להגדיר קוד חשבון (מחילוץ AI בחוזה) לפני אישור ויצירת פקודת יומן",
        }
      }
      if (sumApprovedThisBill <= 0) {
        return {
          ok: false,
          error:
            "לא ניתן לאשר דוח כשהסכום המאושר בחשבון חלקי אינו חיובי — נדרש סכום לפקודת יומן",
        }
      }
    }

    const baseForRetention = roundMoney(sumApprovedThisBill + indexationAmount)
    const retentionAmount = roundMoney(
      (baseForRetention * retentionPercent) / 100
    )
    const totalPayable = roundMoney(
      baseForRetention - retentionAmount - deductionsAmount - previousBilledAmount
    )

    const { data: reportRow, error: repErr } = await supabase
      .from("project_progress_reports")
      .insert({
        contract_id: contractId,
        report_month: reportMonth,
        status: reportStatus,
        report_date: reportDateIsrael(),
        indexation_amount: roundMoney(indexationAmount),
        retention_percent: retentionPercent,
        retention_amount: retentionAmount,
        deductions_amount: roundMoney(deductionsAmount),
        previous_billed_amount: roundMoney(previousBilledAmount),
        cumulative_works_total: sumApprovedThisBill,
        total_payable: totalPayable,
        insurance_amount: 0,
        testing_amount: 0,
        gl_account_code: glFromContract,
      })
      .select("id")
      .single()

    if (repErr || !reportRow?.id) {
      const msg = repErr?.message ?? "שמירת דוח נכשלה"
      if (
        repErr?.code === "23505" ||
        msg.toLowerCase().includes("duplicate") ||
        msg.includes("unique")
      ) {
        return {
          ok: false,
          error: "כבר קיים דיווח לחודש זה עבור החוזה",
        }
      }
      return { ok: false, error: msg }
    }

    const reportId = reportRow.id as string

    const insertPayload = itemRows.map((r) => ({
      progress_report_id: reportId,
      contract_milestone_id: r.contract_milestone_id,
      quantity_contract: r.quantity_contract,
      quantity_previous_cumulative: r.quantity_previous_cumulative,
      quantity_current_cumulative: r.quantity_current_cumulative,
      quantity_executed_month: r.quantity_executed_month,
      quantity_executed: r.quantity_executed,
      unit_price: r.unit_price,
      line_total: r.line_total,
      line_cumulative_value: r.line_cumulative_value,
    }))

    const { error: itemsErr } = await supabase
      .from("project_progress_items")
      .insert(insertPayload)

    if (itemsErr) {
      await supabase.from("project_progress_reports").delete().eq("id", reportId)
      return { ok: false, error: itemsErr.message }
    }

    if (reportStatus === "approved") {
      const { data: reportSnap, error: snapErr } = await supabase
        .from("project_progress_reports")
        .select("gl_account_code, cumulative_works_total")
        .eq("id", reportId)
        .single()

      if (snapErr || !reportSnap) {
        await supabase.from("project_progress_reports").delete().eq("id", reportId)
        return {
          ok: false,
          error: snapErr?.message ?? "טעינת דוח מאושר נכשלה",
        }
      }

      const report = reportSnap as {
        gl_account_code: string | null
        cumulative_works_total: number | string | null
      }
      const approvedAmount = roundMoney(
        Number(report.cumulative_works_total ?? 0)
      )
      const glCode =
        report.gl_account_code != null &&
        String(report.gl_account_code).trim() !== ""
          ? String(report.gl_account_code).trim()
          : null

      if (!glCode) {
        await supabase.from("project_progress_reports").delete().eq("id", reportId)
        return {
          ok: false,
          error:
            "חסר קוד חשבון GL בדוח — לא ניתן ליצור פקודת יומן (נדרש gl_account_code)",
        }
      }
      if (approvedAmount <= 0) {
        await supabase.from("project_progress_reports").delete().eq("id", reportId)
        return {
          ok: false,
          error:
            "סכום מאושר בדוח (cumulative_works_total) אינו חיובי — לא ניתן ליצור פקודת יומן",
        }
      }

      const jeRes = await createJournalEntryAction({
        status: "draft",
        entryDate: new Date().toISOString().split("T")[0],
        description: "אישור חשבון חלקי אוטומטי - " + contractorName,
        lines: [
          {
            accountId: glCode,
            debit: approvedAmount,
            credit: 0,
            reference1: reportMonth,
            reference2: reportId,
            details: "חובה — חשבון חלקי מאושר (דוח)",
          },
          {
            accountId: "300",
            debit: 0,
            credit: approvedAmount,
            reference1: reportMonth,
            reference2: reportId,
            details: "זכות — קבלני משנה (חשבון 300)",
          },
        ],
      })

      if (!jeRes.success) {
        await supabase.from("project_progress_reports").delete().eq("id", reportId)
        return {
          ok: false,
          error: "יצירת פקודת יומן טיוטה נכשלה — " + jeRes.error,
        }
      }
    }

    revalidatePath(PAGE_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
