"use client"

import * as React from "react"
import { LayoutGrid, PackageSearch, Plus, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  TECHNICAL_CATALOG_MASTER_MOCK,
  getCatalogWorkspaceDetail,
  type CatalogMasterRow,
} from "@/lib/marker-ofek/technical-catalog-workspace-data"
import { cn } from "@/lib/utils"

const CATEGORY_ALL = "__all__"

const currencyNis = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 1,
})

const currencyUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

const fieldLabel = "text-[11px] font-semibold text-slate-500"
const fieldValue = "text-sm font-medium text-slate-900"

const tabListJimmy =
  "h-auto w-full flex-wrap justify-start gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 data-[variant=line]:rounded-lg"
const tabTriggerJimmy =
  "text-xs data-active:bg-white data-active:text-slate-900 data-active:shadow-sm md:text-sm dark:!bg-transparent dark:data-active:!bg-white dark:data-active:!text-slate-900"

function ReadonlyField({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/50 px-2 py-1.5">
      <p className={fieldLabel}>{label}</p>
      <p className={cn(fieldValue, "mt-0.5 break-words")}>{value}</p>
    </div>
  )
}

export function TechnicalCatalogWorkspace() {
  const [query, setQuery] = React.useState("")
  const [category, setCategory] = React.useState<string>(CATEGORY_ALL)
  const [activeSku, setActiveSku] = React.useState<string | null>(null)

  const categories = React.useMemo(() => {
    const s = new Set<string>()
    for (const r of TECHNICAL_CATALOG_MASTER_MOCK) s.add(r.category)
    return Array.from(s).sort((a, b) => a.localeCompare(b, "he"))
  }, [])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return TECHNICAL_CATALOG_MASTER_MOCK.filter((row) => {
      if (category !== CATEGORY_ALL && row.category !== category) return false
      if (!q) return true
      const blob = `${row.sku} ${row.name} ${row.category}`.toLowerCase()
      return blob.includes(q)
    })
  }, [query, category])

  const activeRow: CatalogMasterRow | null = React.useMemo(() => {
    if (!activeSku) return null
    return (
      TECHNICAL_CATALOG_MASTER_MOCK.find((r) => r.sku === activeSku) ?? null
    )
  }, [activeSku])

  const detail = React.useMemo(() => {
    if (!activeRow) return null
    return getCatalogWorkspaceDetail(activeRow)
  }, [activeRow])

  React.useEffect(() => {
    if (activeSku && !filtered.some((r) => r.sku === activeSku)) {
      setActiveSku(null)
    }
  }, [filtered, activeSku])

  return (
    <div
      dir="rtl"
      className="flex min-h-0 w-full max-w-none flex-1 flex-col bg-white text-slate-900 [color-scheme:light]"
    >
      <header className="shrink-0 border-b border-slate-200 pb-3">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          קטלוג פריטים טכני (מאסטר)
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Phase 2 — מרחב עבודה Master-Detail (Priority / SAP-style)
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-0 [min-height:min(640px,78vh)]">
        {/* Top 40% — Master grid */}
        <section className="flex min-h-0 flex-[2] flex-col overflow-hidden">
          <div className="shrink-0 space-y-2 border-b border-slate-200 pb-2 pt-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-md">
                <Label
                  htmlFor="catalog-search"
                  className="text-xs font-semibold text-slate-600"
                >
                  חיפוש
                </Label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute end-2 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                    aria-hidden
                  />
                  <Input
                    id="catalog-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="מק״ט, שם או קטגוריה…"
                    className="h-8 border-slate-200 bg-white pe-9 text-sm text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>
              <div className="flex w-full flex-col gap-1.5 sm:w-52">
                <Label
                  htmlFor="catalog-cat"
                  className="text-xs font-semibold text-slate-600"
                >
                  קטגוריה
                </Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v ?? CATEGORY_ALL)}
                >
                  <SelectTrigger
                    id="catalog-cat"
                    size="sm"
                    className="h-8 border-slate-200 bg-white text-sm text-slate-900"
                  >
                    <SelectValue placeholder="הכל" />
                  </SelectTrigger>
                  <SelectContent className="border border-slate-200 bg-white">
                    <SelectItem value={CATEGORY_ALL} className="text-sm">
                      הכל
                    </SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c} className="text-sm">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                className="h-8 shrink-0 gap-1.5 bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-600 sm:self-end"
                onClick={() => {
                  console.log("[catalog] Add New Item — DB not wired yet")
                }}
              >
                <Plus className="size-4" aria-hidden />
                פריט חדש
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">
              מוצגים {filtered.length} מתוך {TECHNICAL_CATALOG_MASTER_MOCK.length}{" "}
              פריטים — לחצו על שורה לפרטים.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="h-8 py-1 text-end text-xs font-bold text-slate-700">
                    מק״ט
                  </TableHead>
                  <TableHead className="h-8 py-1 text-end text-xs font-bold text-slate-700">
                    שם פריט
                  </TableHead>
                  <TableHead className="h-8 py-1 text-end text-xs font-bold text-slate-700">
                    קטגוריה
                  </TableHead>
                  <TableHead className="h-8 py-1 text-end text-xs font-bold text-slate-700">
                    יחידת מידה
                  </TableHead>
                  <TableHead className="h-8 py-1 text-end text-xs font-bold text-slate-700">
                    מחיר בסיס
                  </TableHead>
                  <TableHead className="h-8 py-1 text-end text-xs font-bold text-slate-700">
                    סטטוס
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow className="border-slate-100">
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-sm text-slate-500"
                    >
                      אין תוצאות — נסו לשנות חיפוש או קטגוריה.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => {
                    const selected = activeSku === row.sku
                    return (
                      <TableRow
                        key={row.sku}
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveSku(row.sku)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setActiveSku(row.sku)
                          }
                        }}
                        className={cn(
                          "cursor-pointer border-slate-100 transition-colors",
                          selected
                            ? "bg-blue-50 hover:bg-blue-50/95"
                            : "hover:bg-slate-50/90"
                        )}
                      >
                        <TableCell className="py-1 font-mono text-[13px] tabular-nums text-slate-800">
                          {row.sku}
                        </TableCell>
                        <TableCell className="max-w-[22rem] py-1 text-sm text-slate-900">
                          {row.name}
                        </TableCell>
                        <TableCell className="py-1 text-sm text-slate-700">
                          {row.category}
                        </TableCell>
                        <TableCell className="py-1 text-sm text-slate-700">
                          {row.uom}
                        </TableCell>
                        <TableCell className="py-1 text-end font-mono text-sm tabular-nums text-slate-900">
                          {currencyNis.format(row.basePriceNis)}
                        </TableCell>
                        <TableCell className="py-1 text-end">
                          {row.active ? (
                            <Badge
                              variant="outline"
                              className="h-6 border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-900"
                            >
                              פעיל
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="h-6 border-slate-200 bg-slate-100 px-2 text-[11px] font-semibold text-slate-600"
                            >
                              לא פעיל
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Bottom 60% — Detail workspace */}
        <section className="flex min-h-0 flex-[3] flex-col overflow-hidden border-t-2 border-slate-300 bg-white">
          {!detail || !activeRow ? (
            <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
              <div className="rounded-full border border-slate-200 bg-slate-50 p-4">
                <PackageSearch
                  className="size-10 text-slate-400"
                  aria-hidden
                />
              </div>
              <p className="max-w-md text-sm font-medium text-slate-700">
                בחר פריט מהרשימה להצגת פרטים
              </p>
              <p className="max-w-sm text-xs text-slate-500">
                התחתית מציגה כרטיס מאסטר עם טאבים: זיהוי, ספקים, MRP ותמחיר — כמו
                ב-Priority ERP.
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3 md:p-4">
              <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    פריט מאסטר נבחר
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                    {detail.sku}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                    {activeRow.name}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="h-7 shrink-0 border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700"
                >
                  <LayoutGrid className="size-3.5 opacity-70" aria-hidden />
                  <span className="mr-1">תצוגת עבודה</span>
                </Badge>
              </div>

              <Tabs
                key={detail.sku}
                defaultValue="general"
                className="flex min-h-0 flex-1 flex-col gap-0"
              >
                <TabsList
                  variant="line"
                  className={cn("shrink-0", tabListJimmy)}
                >
                  <TabsTrigger
                    value="general"
                    className={tabTriggerJimmy}
                  >
                    פרטים מזהים
                  </TabsTrigger>
                  <TabsTrigger
                    value="suppliers"
                    className={tabTriggerJimmy}
                  >
                    ספקים מקושרים
                  </TabsTrigger>
                  <TabsTrigger value="mrp" className={tabTriggerJimmy}>
                    מלאי ועיתוד (MRP)
                  </TabsTrigger>
                  <TabsTrigger value="costing" className={tabTriggerJimmy}>
                    תמחיר ויבוא
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  value="general"
                  className="mt-2 min-h-0 flex-1 overflow-y-auto outline-none"
                >
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <ReadonlyField
                      label="ברקוד (Barcode)"
                      value={detail.general.barcode}
                    />
                    <ReadonlyField
                      label="סוג P/R/O"
                      value={
                        <span className="inline-flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="h-6 border-blue-200 bg-blue-50 px-2 font-mono text-[11px] text-blue-900"
                          >
                            {detail.general.proType}
                          </Badge>
                          <span className="text-xs text-slate-600">
                            {detail.general.proTypeLabel}
                          </span>
                        </span>
                      }
                    />
                    <ReadonlyField
                      label="תיאור באנגלית (English Description)"
                      value={detail.general.englishDescription}
                    />
                    <ReadonlyField
                      label="משפחת מוצר (Product Family)"
                      value={detail.general.productFamily}
                    />
                  </div>
                </TabsContent>

                <TabsContent
                  value="suppliers"
                  className="mt-2 min-h-0 flex-1 overflow-hidden outline-none"
                >
                  <div className="max-h-[min(280px,40vh)] overflow-auto rounded-lg border border-slate-200 bg-white">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-200 bg-slate-50 hover:bg-slate-50">
                          <TableHead className="h-8 py-1 text-end text-xs font-bold text-slate-700">
                            ספק
                          </TableHead>
                          <TableHead className="h-8 py-1 text-end text-xs font-bold text-slate-700">
                            מק״ט ספק
                          </TableHead>
                          <TableHead className="h-8 py-1 text-end text-xs font-bold text-slate-700">
                            מחיר אחרון
                          </TableHead>
                          <TableHead className="h-8 py-1 text-end text-xs font-bold text-slate-700">
                            מועדף
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.linkedSuppliers.map((s, i) => (
                          <TableRow
                            key={`${s.supplierSku}-${i}`}
                            className="border-slate-100"
                          >
                            <TableCell className="py-1 text-sm text-slate-900">
                              {s.supplierName}
                            </TableCell>
                            <TableCell className="py-1 font-mono text-[13px] text-slate-800">
                              {s.supplierSku}
                            </TableCell>
                            <TableCell className="py-1 text-end font-mono text-sm tabular-nums">
                              {currencyNis.format(s.lastPriceNis)}
                            </TableCell>
                            <TableCell className="py-1 text-end">
                              {s.preferred ? (
                                <Badge className="h-6 border-amber-200 bg-amber-50 px-2 text-[11px] font-semibold text-amber-950">
                                  מועדף
                                </Badge>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent
                  value="mrp"
                  className="mt-2 min-h-0 flex-1 overflow-y-auto outline-none"
                >
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    <ReadonlyField
                      label="Min Order"
                      value={detail.mrp.minOrder}
                    />
                    <ReadonlyField
                      label="Max Order"
                      value={detail.mrp.maxOrder}
                    />
                    <ReadonlyField
                      label="Safety Stock"
                      value={detail.mrp.safetyStock}
                    />
                    <ReadonlyField
                      label="סיווג ABC"
                      value={
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-6 px-2 font-mono text-[11px]",
                            detail.mrp.abcClass === "A" &&
                              "border-violet-200 bg-violet-50 text-violet-900",
                            detail.mrp.abcClass === "B" &&
                              "border-sky-200 bg-sky-50 text-sky-900",
                            detail.mrp.abcClass === "C" &&
                              "border-slate-200 bg-slate-100 text-slate-700"
                          )}
                        >
                          {detail.mrp.abcClass}
                        </Badge>
                      }
                    />
                    <ReadonlyField
                      label="Lead Time"
                      value={`${detail.mrp.leadTimeDays} ימים`}
                    />
                  </div>
                </TabsContent>

                <TabsContent
                  value="costing"
                  className="mt-2 min-h-0 flex-1 overflow-y-auto outline-none"
                >
                  <div className="grid gap-2 sm:grid-cols-3">
                    <ReadonlyField
                      label="Standard Cost ($)"
                      value={currencyUsd.format(detail.costing.standardCostUsd)}
                    />
                    <ReadonlyField
                      label="עלות יבוא אוויר (% מ-CIF)"
                      value={`${detail.costing.importAirPct}%`}
                    />
                    <ReadonlyField
                      label="עלות יבוא ים (% מ-CIF)"
                      value={`${detail.costing.importSeaPct}%`}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
