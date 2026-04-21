"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
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
import { Switch } from "@/components/ui/switch"
import {
  TECHNICAL_CATALOG_MASTER_MOCK,
  createEmptyCatalogRow,
  getCatalogWorkspaceDetail,
  type CatalogMasterRow,
} from "@/lib/marker-ofek/technical-catalog-workspace-data"
import { MD_QUERY } from "@/lib/marker-ofek/master-detail-nav"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

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

const tabListJimmy =
  "h-auto w-full flex-wrap justify-start gap-1 rounded-lg border border-slate-200 bg-background p-1 data-[variant=line]:rounded-lg"
const tabTriggerJimmy =
  "text-xs data-active:bg-card data-active:text-foreground data-active:shadow-sm md:text-sm dark:!bg-transparent dark:data-active:!bg-card dark:data-active:!text-foreground"

/** שדה ERP: מפתח / ערך — יישור קבוע ללא טקסט צף */
function KvField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="break-words text-sm font-semibold text-foreground">
        {children}
      </div>
    </div>
  )
}

const detailKvGrid =
  "grid grid-cols-2 gap-6 p-4 md:grid-cols-4 lg:grid-cols-5"

export function TechnicalCatalogWorkspace() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [query, setQuery] = React.useState("")
  const [category, setCategory] = React.useState<string>(CATEGORY_ALL)
  const [activeSku, setActiveSku] = React.useState<string | null>(null)
  const [rows, setRows] = React.useState<CatalogMasterRow[]>(() => [
    ...TECHNICAL_CATALOG_MASTER_MOCK,
  ])

  const syncSkuUrl = React.useCallback(
    (sku: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (sku) params.set(MD_QUERY.sku, sku)
      else params.delete(MD_QUERY.sku)
      const q = params.toString()
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  React.useEffect(() => {
    const s = searchParams.get(MD_QUERY.sku)?.trim()
    if (s && rows.some((r) => r.sku === s)) {
      setActiveSku(s)
    }
  }, [searchParams, rows])

  const categories = React.useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) s.add(r.category)
    return Array.from(s).sort((a, b) => a.localeCompare(b, "he"))
  }, [rows])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (category !== CATEGORY_ALL && row.category !== category) return false
      if (!q) return true
      const blob =
        `${row.sku} ${row.supplierSku} ${row.name} ${row.category}`.toLowerCase()
      return blob.includes(q)
    })
  }, [query, category, rows])

  const patchRow = React.useCallback(
    (skuKey: string, patch: Partial<CatalogMasterRow>) => {
      setRows((prev) =>
        prev.map((r) => (r.sku === skuKey ? { ...r, ...patch } : r))
      )
      if (patch.sku !== undefined && patch.sku !== skuKey) {
        setActiveSku(patch.sku)
        syncSkuUrl(patch.sku)
      }
    },
    [syncSkuUrl]
  )

  const activeRow: CatalogMasterRow | null = React.useMemo(() => {
    if (!activeSku) return null
    return rows.find((r) => r.sku === activeSku) ?? null
  }, [activeSku, rows])

  const detail = React.useMemo(() => {
    if (!activeRow) return null
    return getCatalogWorkspaceDetail(activeRow)
  }, [activeRow])

  /** רק כשהמסננים משנים את הרשימה — לא בכל לחיצה (הימנעות מסנכרון שובר בחירה) */
  React.useEffect(() => {
    setActiveSku((sku) => {
      if (!sku) return sku
      return filtered.some((r) => r.sku === sku) ? sku : null
    })
  }, [filtered])

  return (
    <div
      dir="rtl"
      className="flex min-h-0 w-full max-w-none flex-1 flex-col bg-card text-foreground [color-scheme:light]"
    >
      <header className="shrink-0 border-b border-slate-200 pb-3">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          קטלוג פריטים טכני (מאסטר)
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Phase 2 — מרחב עבודה Master-Detail (Priority / SAP-style)
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-0 [min-height:min(640px,78vh)]">
        {/* Top 40% — Master grid */}
        <section className="relative z-10 flex min-h-0 flex-[2] flex-col overflow-hidden">
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
                    className="h-8 border-slate-200 bg-card pe-9 text-sm text-foreground placeholder:text-slate-400"
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
                    className="h-8 border-slate-200 bg-card text-sm text-foreground"
                  >
                    <SelectValue placeholder="הכל" />
                  </SelectTrigger>
                  <SelectContent className="border border-slate-200 bg-card">
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
                  const row = createEmptyCatalogRow()
                  setRows((prev) => [row, ...prev])
                  setActiveSku(row.sku)
                  syncSkuUrl(row.sku)
                  setCategory(CATEGORY_ALL)
                  setQuery("")
                  toast.success("נוצר פריט חדש", {
                    description: "ניתן לערוך את השדות בכרטיס למטה (שמירה מקומית בדפדפן).",
                  })
                }}
              >
                <Plus className="size-4" aria-hidden />
                פריט חדש
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">
              מוצגים {filtered.length} מתוך {rows.length} פריטים — לחצו על שורה
              לפרטים ועריכה.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-card">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="h-8 py-1 text-end text-xs font-bold text-slate-700">
                    מק״ט פנימי
                  </TableHead>
                  <TableHead className="h-8 py-1 text-end text-xs font-bold text-slate-700">
                    מק״ט ספק
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
                      colSpan={7}
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
                        data-catalog-sku={row.sku}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setActiveSku(row.sku)
                          syncSkuUrl(row.sku)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setActiveSku(row.sku)
                            syncSkuUrl(row.sku)
                          }
                        }}
                        className={cn(
                          "cursor-pointer border-slate-100 transition-colors select-none",
                          selected
                            ? "bg-blue-50 hover:bg-blue-50"
                            : "hover:bg-background"
                        )}
                      >
                        <TableCell className="py-1 font-mono text-[13px] tabular-nums text-slate-800">
                          {row.sku}
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate py-1 font-mono text-[13px] text-slate-700">
                          {row.supplierSku || "—"}
                        </TableCell>
                        <TableCell className="max-w-[22rem] py-1 text-sm text-foreground">
                          {row.name}
                        </TableCell>
                        <TableCell className="py-1 text-sm text-slate-700">
                          {row.category}
                        </TableCell>
                        <TableCell className="py-1 text-sm text-slate-700">
                          {row.uom}
                        </TableCell>
                        <TableCell className="py-1 text-end font-mono text-sm tabular-nums text-foreground">
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
        <section className="relative z-0 flex min-h-0 flex-[3] flex-col overflow-hidden border-t-2 border-slate-300 bg-card">
          {!activeSku || !activeRow || !detail ? (
            <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
              <div className="rounded-full border border-slate-200 bg-background p-4">
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
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card">
              <div className="shrink-0 border-b border-slate-200 bg-background px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="min-w-0 max-w-full text-base leading-snug text-foreground">
                    <span className="font-mono font-bold tracking-tight">
                      {detail.sku}
                    </span>
                    <span className="mx-2 font-light text-slate-400" aria-hidden>
                      —
                    </span>
                    <span className="font-normal text-slate-800">
                      {activeRow.name}
                    </span>
                  </h2>
                  <Badge
                    variant="outline"
                    className="h-7 shrink-0 border-slate-200 bg-card px-2.5 text-[11px] font-semibold text-slate-700 shadow-sm"
                  >
                    <LayoutGrid className="size-3.5 opacity-70" aria-hidden />
                    <span className="mr-1">תצוגת עבודה</span>
                  </Badge>
                </div>
              </div>

              <Tabs
                key={detail.sku}
                defaultValue="general"
                className="flex min-h-0 flex-1 flex-col gap-0"
              >
                <div className="shrink-0 border-b border-slate-100 bg-card px-3 pt-3">
                  <TabsList
                    variant="line"
                    className={cn("w-full", tabListJimmy)}
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
                </div>

                <TabsContent
                  value="general"
                  className="mt-0 min-h-0 flex-1 overflow-y-auto border-t border-slate-100 bg-card outline-none"
                >
                  {activeRow ? (
                    <div className="space-y-6 border-b border-slate-100 p-4">
                      <p className="text-xs font-semibold text-slate-700">
                        שדות מאסטר (ניתן לעריכה)
                      </p>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="flex flex-col gap-1.5">
                          <Label
                            htmlFor={`sku-${activeRow.sku}`}
                            className="text-xs font-semibold text-slate-600"
                          >
                            מק״ט פנימי
                          </Label>
                          <Input
                            id={`sku-${activeRow.sku}`}
                            dir="ltr"
                            className="h-9 border-slate-200 bg-card font-mono text-sm text-foreground"
                            value={activeRow.sku}
                            onChange={(e) =>
                              patchRow(activeRow.sku, { sku: e.target.value })
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label
                            htmlFor={`sup-sku-${activeRow.sku}`}
                            className="text-xs font-semibold text-slate-600"
                          >
                            מק״ט ספק
                          </Label>
                          <Input
                            id={`sup-sku-${activeRow.sku}`}
                            dir="ltr"
                            className="h-9 border-slate-200 bg-card font-mono text-sm text-foreground"
                            value={activeRow.supplierSku}
                            onChange={(e) =>
                              patchRow(activeRow.sku, {
                                supplierSku: e.target.value,
                              })
                            }
                            placeholder="למשל VND-…"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
                          <Label
                            htmlFor={`name-${activeRow.sku}`}
                            className="text-xs font-semibold text-slate-600"
                          >
                            שם פריט
                          </Label>
                          <Input
                            id={`name-${activeRow.sku}`}
                            className="h-9 border-slate-200 bg-card text-sm text-foreground"
                            value={activeRow.name}
                            onChange={(e) =>
                              patchRow(activeRow.sku, { name: e.target.value })
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label
                            htmlFor={`uom-${activeRow.sku}`}
                            className="text-xs font-semibold text-slate-600"
                          >
                            יחידת מידה
                          </Label>
                          <Input
                            id={`uom-${activeRow.sku}`}
                            className="h-9 border-slate-200 bg-card text-sm text-foreground"
                            value={activeRow.uom}
                            onChange={(e) =>
                              patchRow(activeRow.sku, { uom: e.target.value })
                            }
                            placeholder="מטר / יחידה / ק״ג…"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label
                            htmlFor={`price-${activeRow.sku}`}
                            className="text-xs font-semibold text-slate-600"
                          >
                            מחיר בסיס (₪)
                          </Label>
                          <Input
                            id={`price-${activeRow.sku}`}
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min={0}
                            dir="ltr"
                            className="h-9 border-slate-200 bg-card font-mono text-sm text-foreground"
                            value={Number.isFinite(activeRow.basePriceNis) ? activeRow.basePriceNis : 0}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value)
                              patchRow(activeRow.sku, {
                                basePriceNis: Number.isFinite(v) ? v : 0,
                              })
                            }}
                          />
                        </div>
                        <div className="flex flex-col justify-end gap-2 sm:col-span-2 lg:col-span-1">
                          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-background/80 px-3 py-2">
                            <Label
                              htmlFor={`active-${activeRow.sku}`}
                              className="text-xs font-semibold text-slate-700"
                            >
                              סטטוס פעיל
                            </Label>
                            <Switch
                              id={`active-${activeRow.sku}`}
                              checked={activeRow.active}
                              onCheckedChange={(checked) =>
                                patchRow(activeRow.sku, { active: checked })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className={detailKvGrid}>
                    <KvField label="ברקוד (Barcode)">
                      {detail.general.barcode}
                    </KvField>
                    <KvField label="סוג P/R/O">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="h-6 border-blue-200 bg-blue-50 px-2 font-mono text-[11px] font-semibold text-blue-900"
                        >
                          {detail.general.proType}
                        </Badge>
                        <span className="text-sm font-semibold text-slate-700">
                          {detail.general.proTypeLabel}
                        </span>
                      </span>
                    </KvField>
                    <KvField label="תיאור באנגלית (English Description)">
                      {detail.general.englishDescription}
                    </KvField>
                    <KvField label="משפחת מוצר (Product Family)">
                      {detail.general.productFamily}
                    </KvField>
                  </div>
                </TabsContent>

                <TabsContent
                  value="suppliers"
                  className="mt-0 min-h-0 flex-1 overflow-hidden border-t border-slate-100 bg-card outline-none"
                >
                  <div className="p-4">
                    <div className="max-h-[min(280px,42vh)] overflow-auto rounded-md border border-slate-200 bg-card shadow-sm">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-slate-200 hover:bg-transparent">
                            <TableHead className="bg-slate-100 py-2 text-end text-xs font-semibold text-slate-600">
                              ספק
                            </TableHead>
                            <TableHead className="bg-slate-100 py-2 text-end text-xs font-semibold text-slate-600">
                              מק״ט ספק
                            </TableHead>
                            <TableHead className="bg-slate-100 py-2 text-end text-xs font-semibold text-slate-600">
                              מחיר אחרון
                            </TableHead>
                            <TableHead className="bg-slate-100 py-2 text-end text-xs font-semibold text-slate-600">
                              מועדף
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.linkedSuppliers.map((s, i) => (
                            <TableRow
                              key={`${s.supplierSku}-${i}`}
                              className="border-slate-100 hover:bg-background/80"
                            >
                              <TableCell className="py-1.5 text-sm font-medium text-foreground">
                                {s.supplierName}
                              </TableCell>
                              <TableCell className="py-1.5 font-mono text-[13px] text-slate-800">
                                {s.supplierSku}
                              </TableCell>
                              <TableCell className="py-1.5 text-end font-mono text-sm font-semibold tabular-nums text-foreground">
                                {currencyNis.format(s.lastPriceNis)}
                              </TableCell>
                              <TableCell className="py-1.5 text-end">
                                {s.preferred ? (
                                  <Badge className="h-6 border-amber-200 bg-amber-50 px-2 text-[11px] font-semibold text-amber-950">
                                    מועדף
                                  </Badge>
                                ) : (
                                  <span className="text-sm text-slate-400">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent
                  value="mrp"
                  className="mt-0 min-h-0 flex-1 overflow-y-auto border-t border-slate-100 bg-card outline-none"
                >
                  <div className={detailKvGrid}>
                    <KvField label="Min Order">{detail.mrp.minOrder}</KvField>
                    <KvField label="Max Order">{detail.mrp.maxOrder}</KvField>
                    <KvField label="Safety Stock">
                      {detail.mrp.safetyStock}
                    </KvField>
                    <KvField label="סיווג ABC">
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-6 px-2 font-mono text-[11px] font-semibold",
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
                    </KvField>
                    <KvField label="Lead Time">
                      {`${detail.mrp.leadTimeDays} ימים`}
                    </KvField>
                  </div>
                </TabsContent>

                <TabsContent
                  value="costing"
                  className="mt-0 min-h-0 flex-1 overflow-y-auto border-t border-slate-100 bg-card outline-none"
                >
                  <div className={detailKvGrid}>
                    <KvField label="Standard Cost ($)">
                      {currencyUsd.format(detail.costing.standardCostUsd)}
                    </KvField>
                    <KvField label="עלות יבוא אוויר (% מ-CIF)">
                      {`${detail.costing.importAirPct}%`}
                    </KvField>
                    <KvField label="עלות יבוא ים (% מ-CIF)">
                      {`${detail.costing.importSeaPct}%`}
                    </KvField>
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
