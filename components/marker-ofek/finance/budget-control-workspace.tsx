"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { FileSpreadsheet, PieChart } from "lucide-react"
import { toast } from "sonner"

import {
  DenseDetailPanel,
  DenseMasterDetailTemplate,
} from "@/components/layout/DenseMasterDetailTemplate"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BUDGET_CATEGORY_IDS,
  BUDGET_CONTROL_MOCK_PROJECTS,
  budgetDeviation,
  categoryLabel,
  forecastProfitLoss,
  getBudgetRowsForProject,
  sumActual,
  sumBudgeted,
  utilizationPercent,
  type BudgetCategoryId,
  type BudgetCategoryRow,
} from "@/lib/marker-ofek/budget-control-schema"
import { MD_QUERY } from "@/lib/marker-ofek/master-detail-nav"
import { cn } from "@/lib/utils"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const pct = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function RowOverBudget(row: BudgetCategoryRow): boolean {
  return row.actualCost > row.budgetedAmount
}

export function BudgetControlWorkspace() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const defaultProjectId = BUDGET_CONTROL_MOCK_PROJECTS[0]?.id ?? ""
  const projectFromUrl = searchParams.get(MD_QUERY.entity)?.trim()
  const categoryFromUrl = searchParams.get(MD_QUERY.category)?.trim()

  const [projectId, setProjectId] = React.useState(() =>
    projectFromUrl &&
      BUDGET_CONTROL_MOCK_PROJECTS.some((p) => p.id === projectFromUrl)
      ? projectFromUrl
      : defaultProjectId
  )

  const [focusedCategory, setFocusedCategory] =
    React.useState<BudgetCategoryId | null>(() =>
      categoryFromUrl &&
      BUDGET_CATEGORY_IDS.includes(categoryFromUrl as BudgetCategoryId)
        ? (categoryFromUrl as BudgetCategoryId)
        : null
    )

  React.useEffect(() => {
    const p = searchParams.get(MD_QUERY.entity)?.trim()
    if (p && BUDGET_CONTROL_MOCK_PROJECTS.some((x) => x.id === p)) {
      setProjectId(p)
    }
    const c = searchParams.get(MD_QUERY.category)?.trim()
    if (c && BUDGET_CATEGORY_IDS.includes(c as BudgetCategoryId)) {
      setFocusedCategory(c as BudgetCategoryId)
    }
  }, [searchParams])

  function pushBudgetUrl(nextProject: string, nextCategory: BudgetCategoryId | null) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(MD_QUERY.entity, nextProject)
    if (nextCategory) params.set(MD_QUERY.category, nextCategory)
    else params.delete(MD_QUERY.category)
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }

  const rows = React.useMemo(
    () => getBudgetRowsForProject(projectId),
    [projectId]
  )

  const totalBudget = React.useMemo(() => sumBudgeted(rows), [rows])
  const totalActual = React.useMemo(() => sumActual(rows), [rows])
  const forecast = React.useMemo(() => forecastProfitLoss(rows), [rows])

  function exportExcel() {
    toast.success("ייצוא לאקסל — דמה (Phase 6.1)")
  }

  return (
    <DenseMasterDetailTemplate
      dir="rtl"
      className="min-h-0 flex-1 bg-card text-foreground [color-scheme:light]"
      eyebrow="Marker Ofek · כספים"
      title="בקרת תקציב ורווחיות"
      description="תקציב מול עלות בפועל מול הכנסות (דמה). לחיצה על שורת קטגוריה מעמיקה את המיקוד ומעדכנת את כתובת הדף (?e=פרויקט&c=קטגוריה)."
      leading={<PieChart className="size-5 text-slate-700" aria-hidden />}
      backLink={{
        href: "/marker-ofek/finance",
        label: "חזרה לכספים וחשבונות",
      }}
      headerActions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-slate-200 bg-card text-xs text-slate-800 shadow-sm hover:bg-background"
          onClick={exportExcel}
        >
          <FileSpreadsheet className="size-3.5 shrink-0" aria-hidden />
          יצא דו״ח לאקסל
        </Button>
      }
      master={
        <div className="flex flex-col gap-3">
          <section
            className="rounded-lg border border-slate-200 bg-background/80 p-3 shadow-sm"
            aria-label="הקשר פרויקט"
          >
            <div className="grid gap-2 sm:max-w-md">
              <Label htmlFor="budget-project" className="text-xs font-semibold text-slate-600">
                פרויקט
              </Label>
              <Select
                value={projectId}
                onValueChange={(v) => {
                  if (!v) return
                  setProjectId(v)
                  pushBudgetUrl(v, focusedCategory)
                }}
              >
                <SelectTrigger
                  id="budget-project"
                  className="h-9 border-slate-200 bg-card text-sm text-foreground shadow-sm"
                >
                  <SelectValue placeholder="בחרו פרויקט…" />
                </SelectTrigger>
                <SelectContent>
                  {BUDGET_CONTROL_MOCK_PROJECTS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <KpiTile
              label='סה״כ תקציב'
              value={ils.format(totalBudget)}
              valueClassName="text-foreground"
            />
            <KpiTile
              label='סה״כ עלות בפועל'
              value={ils.format(totalActual)}
              valueClassName="text-foreground"
            />
            <KpiTile
              label="תחזית רווח / הפסד"
              value={ils.format(forecast)}
              valueClassName={
                forecast >= 0
                  ? "font-semibold text-emerald-700"
                  : "font-semibold text-red-600"
              }
              sub={
                forecast >= 0
                  ? "הכנסות מחויבות − עלות בפועל"
                  : "גירעון צפוי לפי נתוני דמה"
              }
            />
          </div>
        </div>
      }
      detail={
        <DenseDetailPanel className="min-h-0 flex-1 overflow-hidden border-slate-200 bg-card p-0 shadow-sm">
          <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200 bg-card shadow-sm">
            <div className="border-b border-slate-200 px-3 py-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                פירוט לפי קטגוריה
              </h2>
            </div>
            <div className="overflow-x-auto">
              <Table dir="rtl" className="text-xs">
                <TableHeader>
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="h-9 w-[22%] min-w-[7rem] text-right font-semibold text-slate-700">
                      קטגוריה
                    </TableHead>
                    <TableHead className="h-9 text-right font-semibold text-slate-700">
                      תקציב מתוכנן
                    </TableHead>
                    <TableHead className="h-9 text-right font-semibold text-slate-700">
                      עלות בפועל
                    </TableHead>
                    <TableHead className="h-9 text-right font-semibold text-slate-700">
                      אחוז ניצול
                    </TableHead>
                    <TableHead className="h-9 text-right font-semibold text-slate-700">
                      חריגה
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const cat = row.categoryId as BudgetCategoryId
                    const util = utilizationPercent(
                      row.actualCost,
                      row.budgetedAmount
                    )
                    const dev = budgetDeviation(row.actualCost, row.budgetedAmount)
                    const over = RowOverBudget(row)
                    return (
                      <TableRow
                        key={row.categoryId}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "cursor-pointer border-slate-100 transition-colors hover:bg-background/80",
                          focusedCategory === cat &&
                            "bg-emerald-50/90 ring-2 ring-inset ring-emerald-500/50"
                        )}
                        onClick={() => {
                          setFocusedCategory(cat)
                          pushBudgetUrl(projectId, cat)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setFocusedCategory(cat)
                            pushBudgetUrl(projectId, cat)
                          }
                        }}
                      >
                        <TableCell className="py-1.5 font-medium text-foreground">
                          {categoryLabel(cat)}
                        </TableCell>
                        <TableCell className="py-1.5 font-currency-mono tabular-nums text-slate-800">
                          {ils.format(row.budgetedAmount)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "py-1.5 font-currency-mono tabular-nums",
                            over ? "font-semibold text-red-600" : "text-slate-800"
                          )}
                        >
                          {ils.format(row.actualCost)}
                        </TableCell>
                        <TableCell className="py-1.5 font-currency-mono tabular-nums text-slate-800">
                          {pct.format(util)}%
                        </TableCell>
                        <TableCell
                          className={cn(
                            "py-1.5 font-currency-mono tabular-nums",
                            dev > 0
                              ? "font-semibold text-red-600"
                              : dev < 0
                                ? "text-emerald-700"
                                : "text-slate-700"
                          )}
                        >
                          {dev === 0 ? "—" : ils.format(dev)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        </DenseDetailPanel>
      }
    />
  )
}

function KpiTile({
  label,
  value,
  valueClassName,
  sub,
}: {
  label: string
  value: string
  valueClassName?: string
  sub?: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-card p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={cn("mt-1 text-lg font-bold tabular-nums", valueClassName)}>
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 text-[10px] leading-tight text-slate-500">{sub}</p>
      ) : null}
    </div>
  )
}
