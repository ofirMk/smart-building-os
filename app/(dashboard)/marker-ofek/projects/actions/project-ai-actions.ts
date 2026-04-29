"use server"

import { revalidatePath } from "next/cache"

import { formatError } from "@/lib/format-error"
import { fetchAllGlAccounts } from "@/lib/holden-erp/gl-accounts-data"
import {
  extractContractBoqAndBaselineFromPdfBuffer,
  MAX_BASELINE_PDF_BYTES as MAX_BOQ_PDF_BYTES,
} from "@/lib/marker-ofek/contract-boq-baseline-gemini"
import { encodeBoqMilestoneStoredName } from "@/lib/marker-ofek/milestone-name-codec"
import {
  type BaselineScanContext,
  extractPartialBillBaselineFromPdfBuffer,
  MAX_BASELINE_PDF_BYTES,
} from "@/lib/marker-ofek/project-baseline-bill-gemini"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type {
  BaselineBillLineItemAI,
  PartialBillBaselineAIExtract,
} from "@/types/marker-ofek"

export type ImportBaselineBillAIResult =
  | { ok: true; data: PartialBillBaselineAIExtract }
  | { ok: false; error: string }

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function normalizeGlAccountCodeForDb(
  value: string | null | undefined
): string | null {
  const t = String(value ?? "").trim()
  return t.length > 0 ? t : null
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

function logSupabaseError(ctx: string, err: { message?: string; code?: string } | null | undefined) {
  console.error(`[project-ai-actions] ${ctx}`, err?.message, err?.code)
}

async function getPreviousAccountData(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  projectId: string,
  currentAccountNum: number
): Promise<
  | "אין נתונים קודמים מאושרים."
  | Array<{ id: string; desc: string; prevTotalPercent: number }>
> {
  const previousAccountNum = Math.max(0, currentAccountNum - 1)
  if (previousAccountNum <= 0) return "אין נתונים קודמים מאושרים."

  const previousAccountRes = await supabase
    .from("partial_accounts")
    .select("snapshot_payload")
    .eq("project_id", projectId)
    .eq("account_number", previousAccountNum)
    .eq("status", "approved")
    .limit(1)
    .maybeSingle()

  if (previousAccountRes.error || !previousAccountRes.data) {
    return "אין נתונים קודמים מאושרים."
  }

  const snapshot = (
    previousAccountRes.data as { snapshot_payload?: Record<string, unknown> | null }
  ).snapshot_payload
  const rows = Array.isArray(snapshot?.items) ? snapshot.items : []
  if (!rows.length) return "אין נתונים קודמים מאושרים."

  return rows.map((item, idx) => {
    const row =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {}
    return {
      id: String(
        row.section_number ??
          row.item_id ??
          row.manualId ??
          row.id ??
          `line-${idx + 1}`
      ).trim(),
      desc: String(row.description ?? row.desc ?? "").trim(),
      prevTotalPercent: Number(
        row.cumulative_execution_percent ??
          row.totalAccumulatedPercent ??
          row.prevTotalPercent ??
          0
      ),
    }
  })
}

type MilestoneBuildResult = {
  rows: Array<{
    contract_id: string
    name: string
    amount: number
    sort_order: number
    weight_percentage: number | null
  }>
  lineAmounts: number[]
  validItems: BaselineBillLineItemAI[]
  sumAmounts: number
}

function milestonePayloadFromItems(
  contractId: string,
  items: BaselineBillLineItemAI[]
): MilestoneBuildResult {
  const valid = items.filter(
    (i) =>
      (String(i.section_number ?? "").trim() ||
        String(i.description ?? "").trim()) &&
      Number.isFinite(i.contract_quantity) &&
      Number.isFinite(i.unit_price)
  )
  const lineAmounts = valid.map((i) =>
    roundMoney(Math.max(0, i.contract_quantity * i.unit_price))
  )
  const sumAmounts = roundMoney(lineAmounts.reduce((a, x) => a + x, 0))
  const rows = valid.map((item, i) => {
    const amount = lineAmounts[i]!
    const wp =
      sumAmounts > 0 ? roundMoney((amount / sumAmounts) * 100) : null
    let name = encodeBoqMilestoneStoredName(
      String(item.section_number ?? ""),
      String(item.description ?? ""),
      String(item.contract_quantity),
      String(item.unit_price)
    ).slice(0, 2000)
    if (!name.trim()) {
      name =
        [item.section_number, item.description]
          .filter(Boolean)
          .join(" ")
          .trim()
          .slice(0, 500) || `סעיף ${i + 1}`
    }
    return {
      contract_id: contractId,
      name,
      amount,
      sort_order: i,
      weight_percentage: wp,
    }
  })
  return { rows, lineAmounts, validItems: valid, sumAmounts }
}

function progressRowsFromMilestonesAndItems(
  milestoneIds: string[],
  validItems: BaselineBillLineItemAI[],
  lineAmounts: number[],
  unifiedPctFallback: number,
  useUnifiedFallback: boolean
): Array<{
  contract_milestone_id: string
  quantity_contract: number | null
  quantity_previous_cumulative: number
  quantity_current_cumulative: number
  quantity_executed_month: number
  quantity_executed: number
  unit_price: number
  line_total: number
  line_cumulative_value: number
}> {
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

  for (let i = 0; i < milestoneIds.length; i++) {
    const id = milestoneIds[i]!
    const milestoneAmount = lineAmounts[i] ?? 0
    const item = validItems[i]
    let currPct = 0
    if (item && !useUnifiedFallback) {
      const qty = item.contract_quantity
      const prevQty = Math.max(0, item.previous_cumulative_quantity)
      currPct =
        qty > 0 ? clampPct((Math.min(prevQty, qty) / qty) * 100) : 0
    } else {
      currPct = unifiedPctFallback
    }
    const prevPct = 0
    const deltaPct = roundMoney(currPct - prevPct)
    const approvedThisBill = roundMoney((deltaPct / 100) * milestoneAmount)
    const cumulativeValue = roundMoney((currPct / 100) * milestoneAmount)
    const qtyContract = item?.contract_quantity
    itemRows.push({
      contract_milestone_id: id,
      quantity_contract:
        item && Number.isFinite(qtyContract) ? qtyContract : null,
      quantity_previous_cumulative: prevPct,
      quantity_current_cumulative: currPct,
      quantity_executed_month: deltaPct,
      quantity_executed: deltaPct,
      unit_price: milestoneAmount,
      line_total: approvedThisBill,
      line_cumulative_value: cumulativeValue,
    })
  }
  return itemRows
}

/** MM/YYYY או YYYY-MM → YYYY-MM לדוח */
function parseBillMonthToReportMonth(label: string): string {
  const t = label.trim()
  const slash = /^(\d{1,2})\/(\d{4})$/.exec(t)
  if (slash) {
    const mo = slash[1].padStart(2, "0")
    const yr = slash[2]
    const mNum = parseInt(mo, 10)
    if (mNum >= 1 && mNum <= 12) return `${yr}-${mo}`
  }
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(t)) return t
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/**
 * קורא PDF של חשבון חלקי מאושר ומחלץ שדות בסיס כספיים (Gemini 2.5 Flash).
 */
export async function importBaselineBillAI(
  formData: FormData
): Promise<ImportBaselineBillAIResult> {
  try {
    const projectId = formData.get("project_id")?.toString().trim() ?? ""
    const file = formData.get("baseline_pdf")

    if (!projectId) {
      return { ok: false, error: "חסר מזהה פרויקט" }
    }
    if (!(file instanceof File) || file.size === 0) {
      return {
        ok: false,
        error: "נא לבחור קובץ PDF של חשבון מאושר",
      }
    }
    if (file.size > MAX_BASELINE_PDF_BYTES) {
      return {
        ok: false,
        error: `הקובץ גדול מדי (מקסימום ${Math.round(MAX_BASELINE_PDF_BYTES / (1024 * 1024))}MB)`,
      }
    }

    const mime = (file.type || "").toLowerCase()
    const lowerName = file.name.toLowerCase()
    if (mime !== "application/pdf" && !lowerName.endsWith(".pdf")) {
      return { ok: false, error: "יש להעלות קובץ PDF בלבד" }
    }

    const supabase = await createSupabaseServerAuthClient()

    const previousContext: BaselineScanContext = {}

    const { data: projectRow } = await supabase
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .maybeSingle()
    previousContext.projectName = String(
      (projectRow as { name?: string } | null)?.name ?? ""
    ).trim()

    const currentAccountNumRaw =
      formData.get("current_account_number")?.toString().trim() ??
      formData.get("account_number")?.toString().trim() ??
      ""
    const parsedCurrentAccountNum = Number(currentAccountNumRaw)
    previousContext.currentAccountNumber =
      Number.isFinite(parsedCurrentAccountNum) && parsedCurrentAccountNum > 0
        ? parsedCurrentAccountNum
        : 1

    const previousItemsOrMessage = await getPreviousAccountData(
      supabase,
      projectId,
      previousContext.currentAccountNumber
    )
    if (Array.isArray(previousItemsOrMessage)) {
      previousContext.previousItems = previousItemsOrMessage
      previousContext.previousAccountNumber =
        previousContext.currentAccountNumber - 1
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const data = await extractPartialBillBaselineFromPdfBuffer(
      buf,
      previousContext
    )
    return { ok: true, data }
  } catch (e) {
    console.error("[importBaselineBillAI]", e)
    return { ok: false, error: formatError(e) }
  }
}

export type SaveBaselineReportResult =
  | { ok: true; reportId: string }
  | { ok: false; error: string }

function coerceNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  const s = String(v ?? "")
    .replace(/,/g, "")
    .replace(/₪/g, "")
    .trim()
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/**
 * נרמול שורות BoQ ללא Zod — מתאים payload גולמי מה-UI / AI.
 */
function normalizeBaselineItemsLoose(raw: unknown): BaselineBillLineItemAI[] {
  if (!Array.isArray(raw)) return []
  const out: BaselineBillLineItemAI[] = []
  for (const row of raw) {
    const o =
      row && typeof row === "object" && !Array.isArray(row)
        ? (row as Record<string, unknown>)
        : {}
    const qty = coerceNum(o.contract_quantity)
    let unitP = coerceNum(o.unit_price)
    let totalItem = coerceNum(o.total_item_price)
    if (qty > 0 && totalItem > 0 && (unitP === 0 || !Number.isFinite(unitP))) {
      unitP = roundMoney(totalItem / qty)
    }
    if (qty > 0 && unitP > 0 && totalItem === 0) {
      totalItem = roundMoney(unitP * qty)
    }
    if (!Number.isFinite(unitP)) unitP = 0
    if (!Number.isFinite(totalItem)) totalItem = 0
    let prevQty = coerceNum(o.previous_cumulative_quantity)
    const cumPct = coerceNum(o.cumulative_execution_percent)
    if (qty > 0 && cumPct > 0 && prevQty === 0) {
      prevQty = roundMoney(Math.max(0, Math.min(qty, (cumPct / 100) * qty)))
    }
    let cumPctOut = cumPct
    if (qty > 0 && prevQty > 0 && cumPctOut === 0) {
      cumPctOut = roundMoney(
        Math.min(100, Math.max(0, (prevQty / qty) * 100))
      )
    }
    const unitStr =
      o.unit === undefined || o.unit === null ? "" : String(o.unit).trim()
    const cumPctFinal = Math.min(100, Math.max(0, cumPctOut))
    const item_id =
      o.item_id === undefined || o.item_id === null
        ? null
        : String(o.item_id).trim() || null
    const previousPercent = Number.isFinite(o.previous_percent as number)
      ? Number(o.previous_percent)
      : Number.isFinite(cumPctFinal)
        ? cumPctFinal
        : 0
    const currentPerformance = Number.isFinite(o.current_performance as number)
      ? Number(o.current_performance)
      : 0
    const totalAccumulated = Number.isFinite(o.total_accumulated as number)
      ? Number(o.total_accumulated)
      : roundMoney(previousPercent + currentPerformance)
    const normalizedAlert =
      String(o.alert ?? "").trim().toUpperCase() === "OVER_BUDGET" ||
      totalAccumulated > 100
        ? "OVER_BUDGET"
        : null
    out.push({
      item_id,
      section_number: String(o.section_number ?? "").trim(),
      description: String(o.description ?? "").trim(),
      unit: unitStr,
      contract_quantity: qty,
      total_item_price: totalItem,
      unit_price: unitP,
      previous_cumulative_quantity: prevQty,
      cumulative_execution_percent: cumPctFinal,
      previous_percent: previousPercent,
      current_performance: currentPerformance,
      total_accumulated: totalAccumulated,
      alert: normalizedAlert,
    })
  }
  return out
}

function coerceBaselineFinancialSummary(
  s: Record<string, unknown>
): Omit<PartialBillBaselineAIExtract, "items"> {
  return {
    bill_number: coerceNum(s.bill_number),
    bill_month: String(s.bill_month ?? "").trim(),
    base_index: coerceNum(s.base_index),
    current_index: coerceNum(s.current_index),
    cumulative_work_value: coerceNum(s.cumulative_work_value),
    indexation_amount: coerceNum(s.indexation_amount),
    retention_percent: coerceNum(s.retention_percent),
    retention_amount: coerceNum(s.retention_amount),
    insurance_amount: coerceNum(s.insurance_amount),
    testing_amount: coerceNum(s.testing_amount),
    subcontractor_deductions: coerceNum(s.subcontractor_deductions),
    total_approved: coerceNum(s.total_approved),
    glAccountCode: String(s.glAccountCode ?? "").trim(),
  }
}

export type SaveAiBaselineInput = {
  projectId: string
  contractId: string
  /** שורות גולמיות מה-AI — ינורמלו בשרת */
  items: unknown[]
  /** כותרת כספית בלי items */
  summary: Record<string, unknown>
}

/**
 * שמירת Baseline מ-payload גולמי (ללא Zod בצד לקוח).
 * מנרמל items ו-summary בשרת ואז מפעיל את אותה לוגיקה כמו saveBaselineReport.
 */
export async function saveAiBaseline(
  input: SaveAiBaselineInput
): Promise<SaveBaselineReportResult> {
  const projectId = input.projectId?.trim()
  const contractId = input.contractId?.trim()
  if (!projectId || !contractId) {
    return { ok: false, error: "חסר מזהה פרויקט או חוזה" }
  }
  const items = normalizeBaselineItemsLoose(input.items)
  const summary = coerceBaselineFinancialSummary(
    input.summary && typeof input.summary === "object" && !Array.isArray(input.summary)
      ? (input.summary as Record<string, unknown>)
      : {}
  )
  const baseline: PartialBillBaselineAIExtract = { ...summary, items }
  return saveBaselineReport({ projectId, contractId, baseline })
}

/**
 * שומר את תוצאות ה-AI כדוח התקדמות מאושר (Baseline): כותרת כספית + שורות לפי אבני דרך.
 * נדרשות לפחות שורת `items` אחת מהסריקה.
 * חסימה: אם לחוזה כבר קיימים דוחות `approved` / `submitted` ב־`project_progress_reports` — אין דריסה.
 */
export async function saveBaselineReport(input: {
  projectId: string
  contractId: string
  baseline: PartialBillBaselineAIExtract
}): Promise<SaveBaselineReportResult> {
  const projectId = input.projectId?.trim()
  const contractId = input.contractId?.trim()
  const b = input.baseline

  if (!projectId || !contractId) {
    return { ok: false, error: "חסר מזהה פרויקט או חוזה" }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()

    const { data: ctr, error: cErr } = await supabase
      .from("contracts")
      .select("id, project_id")
      .eq("id", contractId)
      .eq("is_deleted", false)
      .maybeSingle()

    if (cErr) {
      logSupabaseError("saveBaselineReport load contract", cErr)
      return { ok: false, error: cErr.message }
    }
    if (!ctr) {
      return { ok: false, error: "החוזה לא נמצא" }
    }
    if ((ctr as { project_id: string }).project_id !== projectId) {
      return { ok: false, error: "החוזה אינו משויך לפרויקט זה" }
    }

    const { count: priorBillingCount, error: priorRepErr } = await supabase
      .from("project_progress_reports")
      .select("id", { count: "exact", head: true })
      .eq("contract_id", contractId)
      .in("status", ["approved", "submitted"])

    if (priorRepErr) {
      logSupabaseError(
        "saveBaselineReport count prior project_progress_reports",
        priorRepErr
      )
      return { ok: false, error: priorRepErr.message }
    }
    if ((priorBillingCount ?? 0) > 0) {
      return {
        ok: false,
        error:
          "לחוזה זה כבר קיימים חשבונות פעילים. לא ניתן לדרוס היסטוריה פיננסית באמצעות סריקת Baseline.",
      }
    }

    const extractedItems = b.items ?? []
    if (extractedItems.length < 1) {
      return {
        ok: false,
        error:
          "חובה לפחות שורת כתב כמויות אחת מהסריקה — לא ניתן לשמור בסיס ללא items",
      }
    }

    let itemRows: Array<{
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

    const { rows, lineAmounts, validItems, sumAmounts } =
      milestonePayloadFromItems(contractId, extractedItems)
    if (rows.length === 0) {
      return {
        ok: false,
        error: "לא נמצאו שורות תקפות ב-items — בדקו את סריקת ה-PDF",
      }
    }

    const { error: delErr } = await supabase
      .from("contract_milestones")
      .delete()
      .eq("contract_id", contractId)
    if (delErr) {
      logSupabaseError("saveBaselineReport delete milestones", delErr)
      return { ok: false, error: delErr.message }
    }

    const { data: insertedMs, error: insErr } = await supabase
      .from("contract_milestones")
      .insert(rows)
      .select("id, sort_order")

    if (insErr || !insertedMs?.length) {
      logSupabaseError("saveBaselineReport insert milestones", insErr)
      return {
        ok: false,
        error: insErr?.message ?? "שמירת אבני דרך נכשלה",
      }
    }

    const milestoneIdsOrdered = [...insertedMs]
      .sort(
        (a, b) =>
          Number((a as { sort_order: number }).sort_order) -
          Number((b as { sort_order: number }).sort_order)
      )
      .map((r) => (r as { id: string }).id)

    const glAccountCodeForDb = normalizeGlAccountCodeForDb(b.glAccountCode)

    const { error: ctrUpdErr } = await supabase
      .from("contracts")
      .update({
        total_amount: sumAmounts,
        gl_account_code: glAccountCodeForDb,
      })
      .eq("id", contractId)
    if (ctrUpdErr) {
      logSupabaseError("saveBaselineReport update contract total", ctrUpdErr)
      return { ok: false, error: ctrUpdErr.message }
    }

    itemRows = progressRowsFromMilestonesAndItems(
      milestoneIdsOrdered,
      validItems,
      lineAmounts,
      0,
      false
    )

    const cumulativeWork = roundMoney(Number(b.cumulative_work_value) || 0)
    const insuranceAmount = roundMoney(Number(b.insurance_amount) || 0)
    const testingAmount = roundMoney(Number(b.testing_amount) || 0)
    const subcontractor = roundMoney(Number(b.subcontractor_deductions) || 0)
    const deductionsTotal = roundMoney(insuranceAmount + testingAmount + subcontractor)

    const indexationAmount = roundMoney(Number(b.indexation_amount) || 0)
    const retentionPercent = clampPct(Number(b.retention_percent) || 0)
    let retentionAmount = roundMoney(Number(b.retention_amount) || 0)
    const totalPayable = roundMoney(Number(b.total_approved) || 0)
    const previousBilled = 0

    const sumApprovedThisBill = roundMoney(
      itemRows.reduce((s, row) => s + row.line_total, 0)
    )

    const baseForRetention = roundMoney(sumApprovedThisBill + indexationAmount)
    if (retentionAmount <= 0 && retentionPercent > 0) {
      retentionAmount = roundMoney((baseForRetention * retentionPercent) / 100)
    }

    const reportMonth = parseBillMonthToReportMonth(b.bill_month ?? "")

    const billNo = Number(b.bill_number)
    const billNumberInsert = Number.isFinite(billNo) ? Math.round(billNo) : null

    const { data: reportRow, error: repErr } = await supabase
      .from("project_progress_reports")
      .insert({
        contract_id: contractId,
        report_month: reportMonth,
        status: "approved",
        bill_number: billNumberInsert,
        bill_month_label: b.bill_month?.trim() || null,
        base_index: Number.isFinite(Number(b.base_index))
          ? Number(b.base_index)
          : null,
        current_index: Number.isFinite(Number(b.current_index))
          ? Number(b.current_index)
          : null,
        indexation_amount: indexationAmount,
        retention_percent: retentionPercent,
        retention_amount: retentionAmount,
        insurance_amount: insuranceAmount,
        testing_amount: testingAmount,
        deductions_amount: deductionsTotal,
        previous_billed_amount: previousBilled,
        cumulative_works_total: cumulativeWork,
        total_payable: totalPayable,
        gl_account_code: glAccountCodeForDb,
      })
      .select("id")
      .single()

    if (repErr || !reportRow?.id) {
      logSupabaseError("saveBaselineReport insert project_progress_reports", repErr)
      const msg = repErr?.message ?? "שמירת בסיס נכשלה"
      if (
        repErr?.code === "23505" ||
        msg.toLowerCase().includes("duplicate") ||
        msg.includes("unique")
      ) {
        return {
          ok: false,
          error: "כבר קיים דיווח לחודש זה עבור החוזה — מחקו או שנהו חודש",
        }
      }
      return { ok: false, error: msg }
    }

    const reportId = reportRow.id as string

    const insertPayload = itemRows.map((row) => ({
      progress_report_id: reportId,
      contract_milestone_id: row.contract_milestone_id,
      quantity_contract: row.quantity_contract,
      quantity_previous_cumulative: row.quantity_previous_cumulative,
      quantity_current_cumulative: row.quantity_current_cumulative,
      quantity_executed_month: row.quantity_executed_month,
      quantity_executed: row.quantity_executed,
      unit_price: row.unit_price,
      line_total: row.line_total,
      line_cumulative_value: row.line_cumulative_value,
    }))

    const { error: itemsErr } = await supabase
      .from("project_progress_items")
      .insert(insertPayload)

    if (itemsErr) {
      logSupabaseError("saveBaselineReport insert project_progress_items", itemsErr)
      await supabase.from("project_progress_reports").delete().eq("id", reportId)
      return { ok: false, error: itemsErr.message }
    }

    revalidatePath("/marker-ofek/projects")
    revalidatePath(`/marker-ofek/projects/${projectId}`)
    revalidatePath("/marker-ofek/execution/progress-reports/new")

    return { ok: true, reportId }
  } catch (e) {
    console.error("[saveBaselineReport] unhandled", e)
    return { ok: false, error: formatError(e) }
  }
}

export type BuildContractAndBaselineAIResult =
  | {
      ok: true
      reportId: string
      milestonesCreated: number
      glAccountCode: string
    }
  | { ok: false; error: string }

/**
 * סריקת PDF: בניית אבני דרך (BoQ) + דוח מאושר ראשון עם % מצטבר לפי שורה.
 * רק כשאין עדיין אבני דרך לחוזה.
 */
export async function buildContractAndBaselineAI(
  formData: FormData
): Promise<BuildContractAndBaselineAIResult> {
  const contractId = formData.get("contract_id")?.toString().trim() ?? ""
  const file = formData.get("build_pdf")

  if (!contractId) {
    return { ok: false, error: "חסר מזהה חוזה" }
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "נא לבחור קובץ PDF" }
  }
  if (file.size > MAX_BOQ_PDF_BYTES) {
    return {
      ok: false,
      error: `הקובץ גדול מדי (מקסימום ${Math.round(MAX_BOQ_PDF_BYTES / (1024 * 1024))}MB)`,
    }
  }

  const mime = (file.type || "").toLowerCase()
  const lowerName = file.name.toLowerCase()
  if (mime !== "application/pdf" && !lowerName.endsWith(".pdf")) {
    return { ok: false, error: "יש להעלות קובץ PDF בלבד" }
  }

  let milestoneIds: string[] = []

  try {
    const supabase = await createSupabaseServerAuthClient()

    const { data: ctr, error: cErr } = await supabase
      .from("contracts")
      .select("id, project_id")
      .eq("id", contractId)
      .eq("is_deleted", false)
      .maybeSingle()

    if (cErr) {
      logSupabaseError("buildContractAndBaselineAI load contract", cErr)
      return { ok: false, error: cErr.message }
    }
    if (!ctr) {
      return { ok: false, error: "החוזה לא נמצא" }
    }

    const projectId = (ctr as { project_id: string }).project_id

    const { count, error: cntErr } = await supabase
      .from("contract_milestones")
      .select("id", { count: "exact", head: true })
      .eq("contract_id", contractId)

    if (cntErr) {
      logSupabaseError("buildContractAndBaselineAI count milestones", cntErr)
      return { ok: false, error: cntErr.message }
    }
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error:
          "לחוזה כבר קיימות אבני דרך — הסריקה זמינה רק כשאין סעיפי חוזה",
      }
    }

    const buf = Buffer.from(await file.arrayBuffer())

    const { data: glRowsRaw, success: glOk } = await fetchAllGlAccounts()
    const glRows = glOk && Array.isArray(glRowsRaw) ? glRowsRaw : []
    const expenseLike = glRows.filter((a) => {
      const g = (a.trial_balance_group ?? "").toString()
      return g.includes("עלות") || g.includes("הוצאות")
    })
    const glSource = expenseLike.length > 0 ? expenseLike : glRows
    const glAccounts = glSource.map((a) => ({
      code: a.account_code,
      name: a.account_name_he,
    }))

    let extracted: PartialBillBaselineAIExtract
    try {
      extracted = await extractContractBoqAndBaselineFromPdfBuffer(buf, glAccounts)
    } catch (e) {
      console.error("[buildContractAndBaselineAI] PDF extract failed", e)
      return { ok: false, error: formatError(e) }
    }

    const b = extracted
    const glAccountCodeForDb = normalizeGlAccountCodeForDb(b.glAccountCode)
    const rawItems = b.items ?? []
    if (rawItems.length === 0) {
      return {
        ok: false,
        error:
          "לא זוהה מערך items בקובץ — ה-PDF חייב לכלול טבלת סעיפים (BoQ) וסריקה מחדש",
      }
    }

    const { rows: milestoneRows, lineAmounts, validItems, sumAmounts } =
      milestonePayloadFromItems(contractId, rawItems)
    if (milestoneRows.length === 0 || sumAmounts <= 0) {
      return {
        ok: false,
        error:
          "סכום החוזה המחושב מאפס — בדקו כמויות ומחירים בטבלאות ה-PDF",
      }
    }

    const { data: insertedMs, error: insErr } = await supabase
      .from("contract_milestones")
      .insert(milestoneRows)
      .select("id, sort_order")

    if (insErr || !insertedMs?.length) {
      logSupabaseError("buildContractAndBaselineAI insert milestones", insErr)
      return {
        ok: false,
        error: insErr?.message ?? "שמירת אבני דרך נכשלה",
      }
    }

    const milestonesOrdered = [...insertedMs].sort(
      (a, b) =>
        Number((a as { sort_order: number }).sort_order) -
        Number((b as { sort_order: number }).sort_order)
    )
    milestoneIds = milestonesOrdered.map((r) => (r as { id: string }).id)

    let itemRows = progressRowsFromMilestonesAndItems(
      milestoneIds,
      validItems,
      lineAmounts,
      0,
      false
    )

    const cumulativeWork = roundMoney(Number(b.cumulative_work_value) || 0)
    const allLinePctZero = itemRows.every(
      (r) => (r.quantity_current_cumulative ?? 0) <= 0
    )
    if (allLinePctZero && cumulativeWork > 0 && sumAmounts > 0) {
      const u = clampPct((cumulativeWork / sumAmounts) * 100)
      itemRows = progressRowsFromMilestonesAndItems(
        milestoneIds,
        [],
        lineAmounts,
        u,
        true
      )
    }

    const insuranceAmount = roundMoney(Number(b.insurance_amount) || 0)
    const testingAmount = roundMoney(Number(b.testing_amount) || 0)
    const subcontractor = roundMoney(Number(b.subcontractor_deductions) || 0)
    const deductionsTotal = roundMoney(insuranceAmount + testingAmount + subcontractor)

    const indexationAmount = roundMoney(Number(b.indexation_amount) || 0)
    const retentionPercent = clampPct(Number(b.retention_percent) || 0)
    let retentionAmount = roundMoney(Number(b.retention_amount) || 0)
    const totalPayable = roundMoney(Number(b.total_approved) || 0)
    const previousBilled = 0

    const sumApprovedThisBill = roundMoney(
      itemRows.reduce((s, row) => s + row.line_total, 0)
    )

    const baseForRetention = roundMoney(sumApprovedThisBill + indexationAmount)
    if (retentionAmount <= 0 && retentionPercent > 0) {
      retentionAmount = roundMoney((baseForRetention * retentionPercent) / 100)
    }

    const reportMonth = parseBillMonthToReportMonth(b.bill_month ?? "")

    const billNo = Number(b.bill_number)
    const billNumberInsert = Number.isFinite(billNo) ? Math.round(billNo) : null

    const { data: reportRow, error: repErr } = await supabase
      .from("project_progress_reports")
      .insert({
        contract_id: contractId,
        report_month: reportMonth,
        status: "approved",
        bill_number: billNumberInsert,
        bill_month_label: b.bill_month?.trim() || null,
        base_index: Number.isFinite(Number(b.base_index))
          ? Number(b.base_index)
          : null,
        current_index: Number.isFinite(Number(b.current_index))
          ? Number(b.current_index)
          : null,
        indexation_amount: indexationAmount,
        retention_percent: retentionPercent,
        retention_amount: retentionAmount,
        insurance_amount: insuranceAmount,
        testing_amount: testingAmount,
        deductions_amount: deductionsTotal,
        previous_billed_amount: previousBilled,
        cumulative_works_total: cumulativeWork,
        total_payable: totalPayable,
        gl_account_code: glAccountCodeForDb,
      })
      .select("id")
      .single()

    if (repErr || !reportRow?.id) {
      logSupabaseError(
        "buildContractAndBaselineAI insert project_progress_reports",
        repErr
      )
      await supabase.from("contract_milestones").delete().in("id", milestoneIds)
      const msg = repErr?.message ?? "שמירת דוח בסיס נכשלה"
      if (
        repErr?.code === "23505" ||
        msg.toLowerCase().includes("duplicate") ||
        msg.includes("unique")
      ) {
        return {
          ok: false,
          error: "כבר קיים דיווח לחודש זה עבור החוזה — שנהו חודש בחשבון או מחקו דוח",
        }
      }
      return { ok: false, error: msg }
    }

    const reportId = reportRow.id as string

    const insertPayload = itemRows.map((row) => ({
      progress_report_id: reportId,
      contract_milestone_id: row.contract_milestone_id,
      quantity_contract: row.quantity_contract,
      quantity_previous_cumulative: row.quantity_previous_cumulative,
      quantity_current_cumulative: row.quantity_current_cumulative,
      quantity_executed_month: row.quantity_executed_month,
      quantity_executed: row.quantity_executed,
      unit_price: row.unit_price,
      line_total: row.line_total,
      line_cumulative_value: row.line_cumulative_value,
    }))

    const { error: itemsErr } = await supabase
      .from("project_progress_items")
      .insert(insertPayload)

    if (itemsErr) {
      logSupabaseError(
        "buildContractAndBaselineAI insert project_progress_items",
        itemsErr
      )
      await supabase.from("project_progress_reports").delete().eq("id", reportId)
      await supabase.from("contract_milestones").delete().in("id", milestoneIds)
      return { ok: false, error: itemsErr.message }
    }

    await supabase
      .from("contracts")
      .update({
        total_amount: sumAmounts,
        gl_account_code: glAccountCodeForDb,
      })
      .eq("id", contractId)

    revalidatePath("/marker-ofek/projects")
    revalidatePath(`/marker-ofek/projects/${projectId}`)
    revalidatePath("/marker-ofek/execution/progress-reports/new")

    const glAccountCode = glAccountCodeForDb ?? ""

    return {
      ok: true,
      reportId,
      milestonesCreated: milestoneIds.length,
      glAccountCode,
    }
  } catch (e) {
    console.error("[buildContractAndBaselineAI] unhandled", e)
    if (milestoneIds.length > 0) {
      try {
        const supabase = await createSupabaseServerAuthClient()
        await supabase.from("contract_milestones").delete().in("id", milestoneIds)
      } catch (cleanupErr) {
        console.error(
          "[buildContractAndBaselineAI] milestone cleanup failed",
          cleanupErr
        )
      }
    }
    return { ok: false, error: formatError(e) }
  }
}
