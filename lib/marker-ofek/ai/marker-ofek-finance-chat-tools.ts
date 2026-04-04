import "server-only"

import { computeWithholdingOnPayment } from "@/lib/marker-ofek/israeli-tax-helpers"
import {
  getMoVatSummaryByProject,
  type VatProjectRow,
} from "@/lib/marker-ofek/finance-reporting-actions"
import { getHoldingExecutiveDashboard } from "@/lib/marker-ofek/partner-metrics-actions"
import { computeGanttLaborDaysByProjectId } from "@/lib/marker-ofek/partner-metrics/gantt-labor-cost"
import { roundMoney } from "@/lib/marker-ofek/partial-account-calc"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

function normalizeMoneyLine(n: number): string {
  return `${roundMoney(n).toLocaleString("he-IL")} ₪`
}

/**
 * פלט מובנה לעוזר AI — דשבורד הנהלה + דגלים פרואקטיביים.
 */
export async function financeExecutiveSnapshotForChat(): Promise<
  | {
      ok: true
      /** הודעות קצרות אם יש P&L שלילי או סיכונים */
      proactive_alerts: string[]
      portfolio: {
        recognized_revenue_nis: number
        total_direct_cost_nis: number
        field_profit_nis: number
        corporate_overhead_pool_nis: number
        net_loaded_profit_nis: number
        gross_profit_nis: number
        overhead_allocation_label: string
        active_project_count: number
      }
      /** עד 24 פרויקטים — שם, קוד, רווח שטח, עומס, רווח טעון */
      project_highlights: Array<{
        project_id: string
        name: string
        code: string
        field_profit_nis: number
        allocated_overhead_nis: number
        net_loaded_profit_nis: number
        recognized_billing_nis: number
      }>
      formatting_hint: string
    }
  | { ok: false; error: string }
> {
  try {
    const res = await getHoldingExecutiveDashboard()
    if (!res.ok) {
      return { ok: false, error: res.error }
    }
    const d = res.data
    const proactive_alerts: string[] = []

    if (d.portfolioNetLoadedProfitNis < 0) {
      proactive_alerts.push(
        `שים לב: רווח נטו טעון קונסולידציה שלילי (${normalizeMoneyLine(d.portfolioNetLoadedProfitNis)}) — מומלץ לבדוק עקיפות והעמסה מול הכנסות.`
      )
    }
    if (d.netProfitNis < 0 && d.portfolioNetLoadedProfitNis >= 0) {
      proactive_alerts.push(
        `רווח שטח (לפני עומס הנהלה) שלילי (${normalizeMoneyLine(d.netProfitNis)}) בעוד שהנטו הטעון אינו שלילי — בדקו התאמה בין חלוקת עומס לבין מספר הפרויקטים.`
      )
    }

    for (const r of d.rows) {
      if (r.netLoadedProfitNis < 0) {
        proactive_alerts.push(
          `פרויקט «${r.name}»: רווח טעון שלילי (${normalizeMoneyLine(r.netLoadedProfitNis)}).`
        )
      }
    }

    const project_highlights = d.rows.slice(0, 24).map((r) => ({
      project_id: r.projectId,
      name: r.name,
      code: r.code,
      field_profit_nis: r.netProfitNis,
      allocated_overhead_nis: r.allocatedCorporateOverheadNis,
      net_loaded_profit_nis: r.netLoadedProfitNis,
      recognized_billing_nis: r.recognizedBillingNis,
    }))

    return {
      ok: true,
      proactive_alerts,
      portfolio: {
        recognized_revenue_nis: d.recognizedRevenueNis,
        total_direct_cost_nis: d.totalDirectCostNis,
        field_profit_nis: d.netProfitNis,
        corporate_overhead_pool_nis: d.totalMonthlyCorporateOverheadNis,
        net_loaded_profit_nis: d.portfolioNetLoadedProfitNis,
        gross_profit_nis: d.portfolioGrossProfitNis,
        overhead_allocation_label: d.overheadAllocationLabel,
        active_project_count: d.activeProjectCount,
      },
      project_highlights,
      formatting_hint:
        "הצג סכומי ₪ בשורות נפרדות; השתמש בפורמט עברי עם פסיקי אלפים (למשל 1,234,567 ₪). טון נקי ומקצועי (Pharmacy clean).",
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

function filterVatRowsByName(
  rows: VatProjectRow[],
  query: string
): VatProjectRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter(
    (r) =>
      r.projectName.toLowerCase().includes(q) ||
      r.projectCode.toLowerCase().includes(q)
  )
}

export async function financeVatSummaryForChat(input: {
  /** חלק משם פרויקט (עברית/אנגלית) או קוד פנימי; ריק = כל הפרויקטים */
  project_name_query?: string
}): Promise<
  | {
      ok: true
      totals: {
        output_subtotal_nis: number
        output_vat_nis: number
        output_grand_nis: number
      }
      matching_projects: VatProjectRow[]
      input_vat_note: string
      formatting_hint: string
    }
  | { ok: false; error: string }
> {
  const res = await getMoVatSummaryByProject()
  if (!res.ok) {
    return { ok: false, error: res.error }
  }
  const q = String(input.project_name_query ?? "").trim()
  const matching = q
    ? filterVatRowsByName(res.data.byProject, q)
    : res.data.byProject

  if (q && matching.length === 0) {
    return {
      ok: true,
      totals: {
        output_subtotal_nis: 0,
        output_vat_nis: 0,
        output_grand_nis: 0,
      },
      matching_projects: [],
      input_vat_note: res.data.inputVatNote,
      formatting_hint:
        `לא נמצאו חשבוניות מאושרות/שולם לפרויקט התואם ל־"${q}". רשימת פרויקטים עם מע״מ פלט: ` +
        res.data.byProject.map((p) => p.projectName).join(", "),
    }
  }

  let sub = 0
  let vat = 0
  let grand = 0
  for (const r of matching) {
    sub += r.outputSubtotalNis
    vat += r.outputVatNis
    grand += r.outputGrandNis
  }

  return {
    ok: true,
    totals: {
      output_subtotal_nis: roundMoney(sub),
      output_vat_nis: roundMoney(vat),
      output_grand_nis: roundMoney(grand),
    },
    matching_projects: matching,
    input_vat_note: res.data.inputVatNote,
    formatting_hint:
      "מע״מ פלט מבוסס mo_invoices (מאושר/שולם). לשאלות 'חשיפת מע״מ' הצג בסיס, מע״מ וסה״כ לפרויקט.",
  }
}

export async function financeProjectOverheadInsightForChat(input: {
  project_name_query: string
}): Promise<
  | {
      ok: true
      narrative_hints: string[]
      project: {
        id: string
        name: string
        code: string
        recognized_billing_nis: number
        total_direct_cost_nis: number
        gross_profit_nis: number
        field_profit_nis: number
        allocated_corporate_overhead_nis: number
        net_loaded_profit_nis: number
        net_loaded_margin_percent: number | null
        gantt_labor_days_weight: number
      }
      allocation_context: {
        global_overhead_pool_nis: number
        company_overhead_allocation_label: string
        /** מדיניות בטבלת project_overhead_allocation אם קיימת */
        project_policy: {
          method: string | null
          fixed_rate_percent: number | null
        }
      }
      formatting_hint: string
    }
  | { ok: false; error: string }
> {
  const q = String(input.project_name_query ?? "").trim()
  if (!q) {
    return { ok: false, error: "חסר שם פרויקט לחיפוש" }
  }

  const exec = await getHoldingExecutiveDashboard()
  if (!exec.ok) {
    return { ok: false, error: exec.error }
  }

  const ql = q.toLowerCase()
  const matches = exec.data.rows.filter(
    (r) =>
      r.name.toLowerCase().includes(ql) ||
      r.code.toLowerCase().includes(ql)
  )

  if (matches.length === 0) {
    return {
      ok: false,
      error: `לא נמצא פרויקט בהיקף הדשבורד התואם ל־"${q}".`,
    }
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: `נמצאו ${matches.length} פרויקטים — ציינו שם מדויק יותר: ${matches.map((m) => m.name).join(", ")}`,
    }
  }

  const row = matches[0]!
  const supabase = await createSupabaseServerAuthClient()
  const laborMap = await computeGanttLaborDaysByProjectId(supabase, [
    row.projectId,
  ])
  const laborDays = laborMap.get(row.projectId) ?? 0

  let method: string | null = null
  let fixedPct: number | null = null
  const { data: pol } = await supabase
    .from("project_overhead_allocation")
    .select("method, fixed_rate_percent")
    .eq("project_id", row.projectId)
    .maybeSingle()

  if (pol) {
    method = String((pol as { method?: string }).method ?? "")
    fixedPct = Number((pol as { fixed_rate_percent?: number }).fixed_rate_percent ?? 0)
  }

  const narrative_hints: string[] = []
  if (
    row.netProfitNis > 0 &&
    row.allocatedCorporateOverheadNis > row.netProfitNis * 0.25
  ) {
    narrative_hints.push(
      "עומס הנהלה מוקצה מהווה חלק משמעותי מרווח השטח — בדקו מדיניות fixed_rate או חלוקה יחסית להכנסות מול פרויקטים אחרים."
    )
  }
  if (method === "labor_based" && laborDays === 0) {
    narrative_hints.push(
      "הפרויקט מוגדר labor_based אך משקל ימי גאנט הוא 0 — החלוקה עלולה להסתמך על משקל מינימלי; שקלו לעבור ל-revenue_based או לעדכן משימות גאנט."
    )
  }
  if (method === "fixed_rate" && (fixedPct ?? 0) > 0) {
    narrative_hints.push(
      `מדיניות fixed_rate של ${fixedPct}% מסך עומס החודש — הסבר אפשרי לעומס גבוה יחסית אם סך העומס החברתי גדול.`
    )
  }
  if (row.netLoadedProfitNis < 0) {
    narrative_hints.push(
      "רווח טעון שלילי — שילוב של עלויות ישירות ועומס הנהלה מכסים את ההכנסות המוכרות."
    )
  }

  return {
    ok: true,
    narrative_hints,
    project: {
      id: row.projectId,
      name: row.name,
      code: row.code,
      recognized_billing_nis: row.recognizedBillingNis,
      total_direct_cost_nis: row.totalCostNis,
      gross_profit_nis: row.grossProfitNis,
      field_profit_nis: row.netProfitNis,
      allocated_corporate_overhead_nis: row.allocatedCorporateOverheadNis,
      net_loaded_profit_nis: row.netLoadedProfitNis,
      net_loaded_margin_percent: row.netLoadedMarginPercent,
      gantt_labor_days_weight: laborDays,
    },
    allocation_context: {
      global_overhead_pool_nis: exec.data.totalMonthlyCorporateOverheadNis,
      company_overhead_allocation_label: exec.data.overheadAllocationLabel,
      project_policy: {
        method,
        fixed_rate_percent: fixedPct,
      },
    },
    formatting_hint:
      "הסבר את הקשר בין רווח שטח, עומס מוקצה, ורווח טעון; הזכר את משקל ימי הגאנט אם method הוא labor_based.",
  }
}

export async function supplierPaymentWithholdingEstimateForChat(input: {
  supplier_name_query: string
  payment_amount_before_withholding_nis: number
}): Promise<
  | {
      ok: true
      entity: { id: string; name: string }
      /** אחוז יעיל לניכוי */
      effective_withholding_rate_percent: number
      withholding_nis: number
      net_paid_nis: number
      sources: {
        from_supplier_finance_profile: boolean
        from_entity_default_column: boolean
      }
      formatting_hint: string
    }
  | { ok: false; error: string }
> {
  const q = String(input.supplier_name_query ?? "").trim()
  const amount = Math.max(0, Number(input.payment_amount_before_withholding_nis) || 0)
  if (!q) {
    return { ok: false, error: "חסר שם ספק" }
  }
  if (amount <= 0) {
    return { ok: false, error: "חסר סכום תשלום חיובי (לפני ניכוי)" }
  }

  const supabase = await createSupabaseServerAuthClient()
  const { data: ents, error } = await supabase
    .from("entities")
    .select("id, name, default_withholding_tax_percent, type")
    .eq("is_deleted", false)
    .ilike("name", `%${q}%`)
    .limit(6)

  if (error) {
    return { ok: false, error: error.message }
  }

  const list = (ents ?? []) as Array<{
    id: string
    name: string
    default_withholding_tax_percent?: number
    type?: string
  }>

  const suppliers = list.filter((e) => String(e.type ?? "").toLowerCase() === "supplier")
  const candidates = suppliers.length > 0 ? suppliers : list

  if (candidates.length === 0) {
    return { ok: false, error: `לא נמצאה ישות התואמת ל־"${q}"` }
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      error: `נמצאו מספר ישויות — ציינו שם מדויק יותר: ${candidates.map((e) => e.name).join(", ")}`,
    }
  }

  const ent = candidates[0]!
  const entityDefault = Math.max(
    0,
    Number(ent.default_withholding_tax_percent ?? 0) || 0
  )

  const { data: prof } = await supabase
    .from("supplier_finance_profile")
    .select("withholding_rate_percent")
    .eq("entity_id", ent.id)
    .maybeSingle()

  const profileRate = prof
    ? Math.max(0, Number((prof as { withholding_rate_percent?: number }).withholding_rate_percent ?? 0) || 0)
    : 0

  const effective =
    profileRate > 0 ? profileRate : entityDefault

  const { withholdingNis, netPaidNis } = computeWithholdingOnPayment(
    amount,
    effective
  )

  return {
    ok: true,
    entity: { id: ent.id, name: ent.name },
    effective_withholding_rate_percent: effective,
    withholding_nis: withholdingNis,
    net_paid_nis: netPaidNis,
    sources: {
      from_supplier_finance_profile: profileRate > 0,
      from_entity_default_column: profileRate <= 0 && entityDefault > 0,
    },
    formatting_hint:
      "הבהר למשתמש: הניכוי הוא הערכה לפי אחוז בפרופיל הספק או בעמודת ברירת המחדל בישות; לא מחליף ייעוץ מס.",
  }
}
