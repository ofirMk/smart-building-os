/**
 * Phase 9.1–9.3 — דמה לאנליטיקה הנהלתית (מסך מנכ"ל): פרויקטים, תזרים תלת־חודשי, פירוח עלויות.
 *
 * @database-layer — אינדקסים מוצעים ל־ORM (Prisma/Drizzle) ודפוסי שאילתה: ראו `DATA_LAYER_INDEXING.md`.
 */

export type ExecutiveCostCategoryKey =
  | "materials"
  | "subcontractors"
  | "labor"

/** פירוח `costsToDate` לפי קטגוריה — סכום `actualCost` חייב להתאים ל־`costsToDate` */
export type ExecutiveProjectCostCategory = {
  key: ExecutiveCostCategoryKey
  labelHe: string
  /** יעד תקציבי לקטגוריה בפרויקט (בסיס להשוואה / חריגה) */
  budgetAllocated: number
  actualCost: number
}

export type ExecutiveProjectSnapshot = {
  id: string
  name: string
  /** תקציב בסיס לפרויקט (להשוואה מול עלות מצטברת + פירוח קטגוריות) */
  baselineBudget: number
  totalExpectedRevenue: number
  billedToDate: number
  costsToDate: number
  openQA_Critical: number
  /** פירוח עלויות מצטברות — לשורות Drill-Down */
  costBreakdown: ExecutiveProjectCostCategory[]
}

export type ExecutiveCompanyKpis = {
  totalRevenueBilled: number
  totalCosts: number
  expectedCashflowNextMonth: number
  totalCriticalQaOpen: number
}

export type ExecutiveCeoAlertSeverity = "critical" | "high" | "medium"

export type ExecutiveCeoAlert = {
  id: string
  title: string
  detail: string
  severity: ExecutiveCeoAlertSeverity
  /** סוג דמה לסינון/אייקון */
  kind: "subcontractor_overdue" | "schedule" | "cash" | "qa" | "compliance"
}

/** תחזית תזרים — 3 חודשים קדימה (דמה) */
export type ExecutiveCashFlowForecastMonth = {
  monthKey: string
  labelHe: string
  /** צפי הכנסות (הכנסות) */
  expectedIn: number
  /** צפי הוצאות (הוצאות) */
  expectedOut: number
}

/** מאי–יולי 2026 — עקבי עם תאריך מערכת (אפריל 2026) */
export const EXECUTIVE_MOCK_CASH_FLOW_FORECAST_3M: ExecutiveCashFlowForecastMonth[] =
  [
    {
      monthKey: "2026-05",
      labelHe: "מאי 2026",
      expectedIn: 9_400_000,
      expectedOut: 7_850_000,
    },
    {
      monthKey: "2026-06",
      labelHe: "יוני 2026",
      expectedIn: 11_200_000,
      expectedOut: 9_100_000,
    },
    {
      monthKey: "2026-07",
      labelHe: "יולי 2026",
      expectedIn: 8_750_000,
      expectedOut: 8_020_000,
    },
  ]

/** שלושה פרויקטים פעילים — דמה; `costBreakdown` מסכם ל־`costsToDate` */
export const EXECUTIVE_MOCK_PROJECTS: ExecutiveProjectSnapshot[] = [
  {
    id: "pr-gindi",
    name: "גינדי TLV",
    baselineBudget: 26_100_000,
    totalExpectedRevenue: 48_500_000,
    billedToDate: 31_200_000,
    costsToDate: 26_850_000,
    openQA_Critical: 2,
    costBreakdown: [
      {
        key: "materials",
        labelHe: "חומרים",
        budgetAllocated: 9_000_000,
        actualCost: 9_500_000,
      },
      {
        key: "subcontractors",
        labelHe: "קבלני משנה",
        budgetAllocated: 13_500_000,
        actualCost: 14_200_000,
      },
      {
        key: "labor",
        labelHe: "כוח אדם",
        budgetAllocated: 3_600_000,
        actualCost: 3_150_000,
      },
    ],
  },
  {
    id: "pr-wine",
    name: "עיר היין",
    baselineBudget: 12_500_000,
    totalExpectedRevenue: 22_750_000,
    billedToDate: 14_100_000,
    costsToDate: 12_400_000,
    openQA_Critical: 1,
    costBreakdown: [
      {
        key: "materials",
        labelHe: "חומרים",
        budgetAllocated: 5_000_000,
        actualCost: 4_800_000,
      },
      {
        key: "subcontractors",
        labelHe: "קבלני משנה",
        budgetAllocated: 5_400_000,
        actualCost: 5_600_000,
      },
      {
        key: "labor",
        labelHe: "כוח אדם",
        budgetAllocated: 2_100_000,
        actualCost: 2_000_000,
      },
    ],
  },
  {
    id: "pr-shuster",
    name: "שוסטר",
    baselineBudget: 8_800_000,
    totalExpectedRevenue: 18_900_000,
    billedToDate: 9_650_000,
    costsToDate: 8_920_000,
    openQA_Critical: 0,
    costBreakdown: [
      {
        key: "materials",
        labelHe: "חומרים",
        budgetAllocated: 3_100_000,
        actualCost: 3_200_000,
      },
      {
        key: "subcontractors",
        labelHe: "קבלני משנה",
        budgetAllocated: 4_000_000,
        actualCost: 4_100_000,
      },
      {
        key: "labor",
        labelHe: "כוח אדם",
        budgetAllocated: 1_700_000,
        actualCost: 1_620_000,
      },
    ],
  },
]

export const EXECUTIVE_MOCK_EXPECTED_CASHFLOW_NEXT_MONTH = 6_280_000

/** Top 5 התראות מנכ"ל — דמה */
export const EXECUTIVE_MOCK_CEO_ALERTS: ExecutiveCeoAlert[] = [
  {
    id: "a1",
    title: "קבלן משנה — איחור תשלום 47 יום",
    detail: "אלקטרה בנייה · גינדי TLV · חשבון מס׳ 2026-0142",
    severity: "critical",
    kind: "subcontractor_overdue",
  },
  {
    id: "a2",
    title: "עיכוב קריטי בלו״ז — אגף B",
    detail: "עיר היין · אספקת לוחות ראשיים · סטייה +18 יום",
    severity: "critical",
    kind: "schedule",
  },
  {
    id: "a3",
    title: "תזרים צפוי: פער מול התחייבויות ספקים",
    detail: "חודש קדימה: יתרה צפויה נמוכה ב־₪1.1M לעומת התחייבויות פתוחות",
    severity: "high",
    kind: "cash",
  },
  {
    id: "a4",
    title: "ליקוי QA עוצר עבודה — ממתין לתיקון שטח",
    detail: "גינדי TLV · ארון ראשי קומה 9 · נפתח לפני 6 ימים",
    severity: "high",
    kind: "qa",
  },
  {
    id: "a5",
    title: "תוקף אישור ניכוי מס — קבלן משנה",
    detail: "שוסטר · «י.ש. מתקנים» · פג תוקף בעוד 12 יום",
    severity: "medium",
    kind: "compliance",
  },
]

/**
 * סיכום חברתי על פני כל הפרויקטים בפלט — **O(P)** זמן, **O(1)** זיכרון נוסף (מעבר יחיד).
 */
export function computeExecutiveCompanyKpis(
  projects: ExecutiveProjectSnapshot[],
  expectedCashflowNextMonth: number
): ExecutiveCompanyKpis {
  let totalRevenueBilled = 0
  let totalCosts = 0
  let totalCriticalQaOpen = 0
  for (const p of projects) {
    totalRevenueBilled += p.billedToDate
    totalCosts += p.costsToDate
    totalCriticalQaOpen += p.openQA_Critical
  }
  return {
    totalRevenueBilled,
    totalCosts,
    expectedCashflowNextMonth,
    totalCriticalQaOpen,
  }
}

/** מרווח גולמי על בסיס חיוב מצטבר: (חויב − עלות) / חויב */
export function grossMarginPercentOnBilled(
  billedToDate: number,
  costsToDate: number
): number | null {
  if (billedToDate <= 0) return null
  return ((billedToDate - costsToDate) / billedToDate) * 100
}

/** אחוז ניצול תקציב בקטגוריה — לעומת יעד הקצאה */
export function categoryBudgetUtilizationPercent(
  actualCost: number,
  budgetAllocated: number
): number | null {
  if (budgetAllocated <= 0) return null
  return (actualCost / budgetAllocated) * 100
}
