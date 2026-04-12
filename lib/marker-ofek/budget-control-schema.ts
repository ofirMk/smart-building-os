import { z } from "zod"

/** קטגוריות תקציב סטנדרטיות — ERP */
export const BUDGET_CATEGORY_IDS = [
  "materials",
  "subcontractors",
  "labor",
  "misc",
] as const

export type BudgetCategoryId = (typeof BUDGET_CATEGORY_IDS)[number]

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategoryId, string> = {
  materials: "חומרים",
  subcontractors: "קבלני משנה",
  labor: "כוח אדם",
  misc: "שונות",
}

export const budgetCategoryRowSchema = z.object({
  categoryId: z.enum(BUDGET_CATEGORY_IDS),
  budgetedAmount: z.number().finite().nonnegative(),
  actualCost: z.number().finite().nonnegative(),
  billedRevenue: z.number().finite().nonnegative(),
})

export type BudgetCategoryRow = z.infer<typeof budgetCategoryRowSchema>

export type BudgetControlMockProject = {
  id: string
  label: string
}

/** פרויקטים לדמה — בחירת הקשר */
export const BUDGET_CONTROL_MOCK_PROJECTS: BudgetControlMockProject[] = [
  {
    id: "prj-gindi-towers-a",
    label: "גינדי TLV — מגדל A · חשמל ותאורה",
  },
  {
    id: "prj-gindi-logistics",
    label: "גינדי לוגיסטיקה פארק 7 — מתח ותשתיות",
  },
  {
    id: "prj-urban-mix-use",
    label: "מתחם מעורב מגורים-מסחר — שלב ביצוע 2",
  },
]

/**
 * שורות תקציב לפי פרויקט (דמה).
 * billedRevenue — הכנסות מחויבות ליזם בקטגוריה (לצורך תחזית רווח).
 */
const MOCK_BUDGET_BY_PROJECT: Record<string, BudgetCategoryRow[]> = {
  "prj-gindi-towers-a": [
    {
      categoryId: "materials",
      budgetedAmount: 2_400_000,
      actualCost: 2_180_000,
      billedRevenue: 2_350_000,
    },
    {
      categoryId: "subcontractors",
      budgetedAmount: 5_100_000,
      actualCost: 5_420_000,
      billedRevenue: 5_200_000,
    },
    {
      categoryId: "labor",
      budgetedAmount: 3_200_000,
      actualCost: 3_050_000,
      billedRevenue: 3_100_000,
    },
    {
      categoryId: "misc",
      budgetedAmount: 480_000,
      actualCost: 395_000,
      billedRevenue: 420_000,
    },
  ],
  "prj-gindi-logistics": [
    {
      categoryId: "materials",
      budgetedAmount: 1_100_000,
      actualCost: 980_000,
      billedRevenue: 1_050_000,
    },
    {
      categoryId: "subcontractors",
      budgetedAmount: 2_800_000,
      actualCost: 2_650_000,
      billedRevenue: 2_780_000,
    },
    {
      categoryId: "labor",
      budgetedAmount: 1_450_000,
      actualCost: 1_520_000,
      billedRevenue: 1_480_000,
    },
    {
      categoryId: "misc",
      budgetedAmount: 220_000,
      actualCost: 185_000,
      billedRevenue: 200_000,
    },
  ],
  "prj-urban-mix-use": [
    {
      categoryId: "materials",
      budgetedAmount: 3_600_000,
      actualCost: 3_720_000,
      billedRevenue: 3_550_000,
    },
    {
      categoryId: "subcontractors",
      budgetedAmount: 6_200_000,
      actualCost: 5_980_000,
      billedRevenue: 6_100_000,
    },
    {
      categoryId: "labor",
      budgetedAmount: 2_100_000,
      actualCost: 2_040_000,
      billedRevenue: 2_080_000,
    },
    {
      categoryId: "misc",
      budgetedAmount: 310_000,
      actualCost: 290_000,
      billedRevenue: 300_000,
    },
  ],
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function getBudgetRowsForProject(projectId: string): BudgetCategoryRow[] {
  const rows = MOCK_BUDGET_BY_PROJECT[projectId]
  if (!rows?.length) return []
  return rows.map((r) => ({ ...r }))
}

/** אחוז ניצול: Actual / Budget × 100 (אם אין תקציב — 0) */
export function utilizationPercent(
  actualCost: number,
  budgetedAmount: number
): number {
  if (budgetedAmount <= 0) return 0
  return roundMoney((actualCost / budgetedAmount) * 100)
}

/** חריגה מתקציב: עלות בפועל − תקציב מתוכנן */
export function budgetDeviation(
  actualCost: number,
  budgetedAmount: number
): number {
  return roundMoney(actualCost - budgetedAmount)
}

export function sumBudgeted(rows: BudgetCategoryRow[]): number {
  return roundMoney(rows.reduce((s, r) => s + r.budgetedAmount, 0))
}

export function sumActual(rows: BudgetCategoryRow[]): number {
  return roundMoney(rows.reduce((s, r) => s + r.actualCost, 0))
}

export function sumBilledRevenue(rows: BudgetCategoryRow[]): number {
  return roundMoney(rows.reduce((s, r) => s + r.billedRevenue, 0))
}

/** תחזית רווח/הפסד: הכנסות מחויבות − עלות בפועל (ברמת הפרויקט) */
export function forecastProfitLoss(rows: BudgetCategoryRow[]): number {
  return roundMoney(sumBilledRevenue(rows) - sumActual(rows))
}

export function categoryLabel(id: BudgetCategoryId): string {
  return BUDGET_CATEGORY_LABELS[id]
}
