/**
 * Fiscal Period Enforcement — Phase 6.4
 *
 * Provides two pre-submission checks:
 *
 *   1. `checkFiscalPeriodOpen` — verifies that the PO submission date falls
 *      within an OPEN GL period (`erp_gl_periods`). Blocks if LOCKED; blocks
 *      if CLOSED; warns (non-blocking) if no period is configured.
 *
 *   2. `checkBudgetChapterThreshold` — checks whether approving this PO would
 *      push the open commitments for any of its budget chapters above the
 *      warning threshold (`BUDGET_OVERSPEND_WARN_PCT` system parameter,
 *      default 80%). When `BUDGET_STRICT_ENFORCEMENT = true`, a 100%+ overrun
 *      blocks the transition; otherwise it only adds a warning.
 *
 * Both functions use the service-role client to read GL periods and commitment
 * data without RLS interference.
 *
 * ## Failure semantics
 *   - `ok: false` → the caller must return HTTP 422 (Unprocessable Entity) or
 *     409 and include the `message` in the error response.
 *   - `ok: true, warnings: string[]` → transition proceeds; warnings are
 *     included in the 200 response body for the UI to surface.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

// ─────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────

export type FiscalCheckResult =
  | { ok: true; warnings: string[] }
  | { ok: false; code: string; message: string }

// ─────────────────────────────────────────────
// 6.4 — checkFiscalPeriodOpen
// ─────────────────────────────────────────────

/**
 * Checks whether a given date falls within an OPEN fiscal GL period.
 *
 * Behaviour:
 *   - OPEN period found → ok=true, no warnings.
 *   - No period configured for this date → ok=true with an advisory warning
 *     (companies that have not yet set up GL periods are not blocked).
 *   - CLOSED period → ok=false (blocks submission; reversible by re-opening).
 *   - LOCKED period → ok=false (blocks submission; requires admin override).
 */
export async function checkFiscalPeriodOpen(params: {
  companyId: string
  /** Defaults to today (UTC). */
  checkDate?: Date
}): Promise<FiscalCheckResult> {
  const { companyId, checkDate = new Date() } = params
  const svc = createSupabaseServiceRoleClient()

  // Format as YYYY-MM-DD for PostgREST date comparisons.
  const dateStr = checkDate.toISOString().split("T")[0]

  // Find the GL period whose start_date ≤ checkDate ≤ end_date.
  const { data: periods, error } = await svc
    .from("erp_gl_periods")
    .select("period_yyyymm, status, start_date, end_date")
    .eq("company_id", companyId)
    .lte("start_date", dateStr)
    .gte("end_date", dateStr)
    .order("start_date", { ascending: false })
    .limit(1)

  if (error) {
    // Non-fatal DB error — warn but don't block to avoid operational disruption.
    console.error("[fiscal-period] GL periods query failed:", error.message)
    return {
      ok: true,
      warnings: [
        "לא ניתן לאמת תקופת GL (שגיאת DB). ההגשה ממשיכה — אנא בדוק הגדרות תקופות.",
      ],
    }
  }

  if (!periods || periods.length === 0) {
    // No period configured → non-blocking advisory.
    return {
      ok: true,
      warnings: [
        `לא הוגדרה תקופת GL לתאריך ${dateStr}. ההזמנה תוגש, אך ייתכן שנדרשת הגדרת תקופה חשבונאית.`,
      ],
    }
  }

  const period = periods[0]

  if (period.status === "LOCKED") {
    return {
      ok: false,
      code: "FISCAL_PERIOD_LOCKED",
      message: `תקופת GL ${period.period_yyyymm} נעולה (LOCKED). לא ניתן להגיש הזמנות לתאריך ${dateStr}. פנה למנהל המערכת.`,
    }
  }

  if (period.status === "CLOSED") {
    return {
      ok: false,
      code: "FISCAL_PERIOD_CLOSED",
      message: `תקופת GL ${period.period_yyyymm} סגורה (CLOSED). יש לפתוח את התקופה לפני הגשת הזמנות חדשות.`,
    }
  }

  // status === 'OPEN' — all good.
  return { ok: true, warnings: [] }
}

// ─────────────────────────────────────────────
// 6.4 — checkBudgetChapterThreshold
// ─────────────────────────────────────────────

/**
 * Warns (or blocks, if BUDGET_STRICT_ENFORCEMENT=true) when approving this PO
 * would push the open commitment for any of its budget chapters above the
 * configured threshold.
 *
 * Algorithm:
 *   For each distinct budget_sub_chapter in the PO lines:
 *     1. Sum planned_amount from erp_project_budget_lines for that chapter.
 *     2. Sum net_amount from OPEN erp_po_commitments for that chapter
 *        (excluding the current PO's own commitment to avoid double-counting).
 *     3. Add the current PO's line total for this chapter.
 *     4. If projected utilisation ≥ 100% and strict mode → block.
 *        If projected utilisation ≥ warn threshold → warn.
 *
 * Returns ok=true with an empty warnings array if there is no budget data for
 * the chapter (i.e., budget control is not configured for that chapter).
 */
export async function checkBudgetChapterThreshold(params: {
  companyId: string
  poId: string
}): Promise<FiscalCheckResult> {
  const { companyId, poId } = params
  const svc = createSupabaseServiceRoleClient()

  // ── 1. Fetch PO line totals by budget chapter ────────────────────────────
  const { data: lines, error: linesErr } = await svc
    .from("erp_purchase_order_lines")
    .select("budget_sub_chapter, total_price")
    .eq("purchase_order_id", poId)
    .eq("company_id", companyId)

  if (linesErr || !lines?.length) {
    return { ok: true, warnings: [] }
  }

  // Aggregate total PO exposure per chapter.
  const chapterTotals = new Map<string, number>()
  for (const line of lines) {
    const chapter = line.budget_sub_chapter as string | null
    if (!chapter) continue
    chapterTotals.set(
      chapter,
      (chapterTotals.get(chapter) ?? 0) + Number(line.total_price ?? 0),
    )
  }

  if (chapterTotals.size === 0) {
    return { ok: true, warnings: [] }
  }

  // ── 2. Fetch system parameters (warn threshold + strict mode) ────────────
  const { data: paramRows } = await svc
    .from("erp_system_parameters")
    .select("param_key, param_value")
    .eq("company_id", companyId)
    .in("param_key", ["BUDGET_OVERSPEND_WARN_PCT", "BUDGET_STRICT_ENFORCEMENT"])

  // Safely build a lookup map (avoids two separate queries).
  const paramMap: Record<string, string> = {}
  for (const p of (paramRows ?? []) as Array<{ param_key: string; param_value: string | null }>) {
    if (p.param_value !== null) paramMap[p.param_key] = p.param_value
  }

  const warnPct = paramMap["BUDGET_OVERSPEND_WARN_PCT"]
    ? Number(paramMap["BUDGET_OVERSPEND_WARN_PCT"])
    : 80
  const strictMode = paramMap["BUDGET_STRICT_ENFORCEMENT"] === "true"

  // ── 3. Evaluate each chapter ─────────────────────────────────────────────
  const warnings: string[] = []

  for (const [chapter, poChapterAmount] of chapterTotals) {
    // Total planned budget for this chapter across all projects in the company.
    const { data: budgetLines } = await svc
      .from("erp_project_budget_lines")
      .select("planned_amount")
      .eq("company_id", companyId)
      .eq("budget_sub_chapter", chapter)

    if (!budgetLines?.length) continue

    const totalBudget = budgetLines.reduce(
      (s, b) => s + Number((b as { planned_amount: number | null }).planned_amount ?? 0),
      0,
    )
    if (totalBudget <= 0) continue

    // Existing open commitments for this chapter (exclude the current PO to
    // avoid double-counting if this function is called before the commitment
    // is written — e.g., on SUBMIT pre-check).
    const { data: existingCommitments } = await svc
      .from("erp_po_commitments")
      .select("net_amount")
      .eq("company_id", companyId)
      .eq("budget_chapter", chapter)
      .eq("status", "OPEN")
      .neq("po_id", poId)

    const existingCommitted = (
      existingCommitments ?? []
    ).reduce(
      (s, c) => s + Number((c as { net_amount: number | null }).net_amount ?? 0),
      0,
    )

    const projectedCommitted = existingCommitted + poChapterAmount
    const utilizationPct = (projectedCommitted / totalBudget) * 100
    const utilizationStr = `${utilizationPct.toFixed(1)}%`
    const amtFmt = (n: number) =>
      n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 })

    if (utilizationPct >= 100) {
      const msg =
        `סעיף תקציבי "${chapter}": ניצול צפוי ${utilizationStr} ` +
        `(${amtFmt(projectedCommitted)} / ${amtFmt(totalBudget)}) — חריגה מהתקציב!`
      if (strictMode) {
        return { ok: false, code: "BUDGET_OVERSPEND", message: msg }
      }
      warnings.push(msg)
    } else if (utilizationPct >= warnPct) {
      warnings.push(
        `סעיף תקציבי "${chapter}": ניצול צפוי ${utilizationStr} — ` +
          `מתקרב למגבלה (סף אזהרה: ${warnPct}%).`,
      )
    }
  }

  return { ok: true, warnings }
}
