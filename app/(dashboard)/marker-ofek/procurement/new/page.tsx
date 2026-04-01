"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Loader2,
  Package,
  Plus,
  Save,
  Scale,
  Trash2,
  Truck,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SupplierCompareSheet } from "@/components/marker-ofek/supplier-compare-sheet"
import { DualPaneLayout } from "@/components/marker-ofek/workspace/dual-pane-layout"
import { useMarkerOfekWorkspace } from "@/components/marker-ofek/workspace/marker-ofek-workspace-context"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"

type ProjectOption = { id: string; name: string; internal_project_code: string }
type SupplierOption = { id: string; name: string; type: string }
type CatalogItem = {
  id: string
  sku: string
  description: string
  unit: string | null
  default_price: number | null
}

type LineForm = {
  id: string
  masterItemId: string
  selectedSupplierItemId: string | null
  sku: string
  description: string
  quantity: string
  unit: string
  unitPrice: string
}

const NO_MASTER_VALUE = "__none__"

/** מזהה יציב לשורה הראשונה — חייב להיות קבוע בין SSR ללקוח (לא random בזמן רינדור). */
const INITIAL_LINE_ROW_ID = "po-line-initial"

function createEmptyLine(stableId: string): LineForm {
  return {
    id: stableId,
    masterItemId: "",
    selectedSupplierItemId: null,
    sku: "",
    description: "",
    quantity: "",
    unit: "",
    unitPrice: "",
  }
}

function createNewLineRow(): LineForm {
  return createEmptyLine(crypto.randomUUID())
}

function parseNum(s: string): number {
  const n = parseFloat(String(s).replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

function lineRowTotal(row: LineForm): number {
  return parseNum(row.quantity) * parseNum(row.unitPrice)
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function entityTypeLabel(t: string): string {
  if (t === "supplier") return "ספק"
  if (t === "subcontractor") return "קבלן משנה"
  return t
}

/** מחיר ברירת מחדל בקטלוג לשורת הזמנה (להשוואת מחיר יחידה) */
function catalogDefaultUnitPrice(
  masterItemId: string,
  items: CatalogItem[]
): number | null {
  if (!masterItemId) return null
  const c = items.find((x) => x.id === masterItemId)
  const p = c?.default_price
  if (p == null || !Number.isFinite(Number(p))) return null
  return Number(p)
}

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const { setContextProjectId } = useMarkerOfekWorkspace()
  const [dualSplit, setDualSplit] = React.useState(false)
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [suppliers, setSuppliers] = React.useState<SupplierOption[]>([])
  const [catalog, setCatalog] = React.useState<CatalogItem[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loadingRefs, setLoadingRefs] = React.useState(true)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const [projectId, setProjectId] = React.useState("")
  const [supplierId, setSupplierId] = React.useState("")
  const [expectedDeliveryDate, setExpectedDeliveryDate] = React.useState("")
  const [lines, setLines] = React.useState<LineForm[]>(() => [
    createEmptyLine(INITIAL_LINE_ROW_ID),
  ])
  const [compareTarget, setCompareTarget] = React.useState<{
    lineId: string
    masterItemId: string
    masterLabel: string
  } | null>(null)

  React.useEffect(() => {
    setContextProjectId(projectId || null)
  }, [projectId, setContextProjectId])

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingRefs(true)
      setLoadError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const [pRes, sRes, cRes] = await Promise.all([
          supabase
            .from("projects")
            .select("id, name, internal_project_code")
            .eq("is_deleted", false)
            .order("name", { ascending: true }),
          supabase
            .from("entities")
            .select("id, name, type")
            .eq("is_deleted", false)
            .in("type", ["subcontractor", "supplier"])
            .order("name", { ascending: true }),
          supabase
            .from("items_catalog")
            .select("id, sku, description, unit, default_price")
            .order("sku", { ascending: true })
            .limit(200),
        ])
        if (pRes.error) throw pRes.error
        if (sRes.error) throw sRes.error
        if (cRes.error) throw cRes.error
        if (!cancelled) {
          setProjects((pRes.data as ProjectOption[]) ?? [])
          setSuppliers((sRes.data as SupplierOption[]) ?? [])
          setCatalog((cRes.data as CatalogItem[]) ?? [])
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(formatError(e))
        }
      } finally {
        if (!cancelled) setLoadingRefs(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const grandTotal = React.useMemo(
    () => lines.reduce((s, row) => s + lineRowTotal(row), 0),
    [lines]
  )

  function updateLine(id: string, patch: Partial<LineForm>) {
    setLines((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    )
  }

  function addLine() {
    setLines((prev) => [...prev, createNewLineRow()])
  }

  function removeLine(id: string) {
    setLines((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((r) => r.id !== id)
    })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!projectId || !supplierId) {
      toast.error("יש לבחור פרויקט וספק לפני השמירה")
      return
    }

    const resolvedLines = lines
      .map((row) => {
        const desc = row.description.trim()
        const sku = row.sku.trim()
        const description = desc || sku || ""
        const quantity = parseNum(row.quantity)
        const unitPrice = parseNum(row.unitPrice)
        const lineTotal = roundMoney(quantity * unitPrice)
        return {
          description,
          quantity,
          unit: row.unit.trim(),
          unitPrice,
          lineTotal,
          item_id: row.masterItemId.trim() || null,
          selected_supplier_item_id: row.selectedSupplierItemId,
        }
      })
      .filter(
        (row) =>
          row.description.length > 0 && row.quantity > 0 && row.unitPrice >= 0
      )

    if (resolvedLines.length === 0) {
      toast.error(
        "יש להזין לפחות שורה אחת עם תיאור (או מק״ט) וכמות חיובית"
      )
      return
    }

    const totalAmount = roundMoney(
      resolvedLines.reduce((s, row) => s + row.lineTotal, 0)
    )

    const supabase = createSupabaseBrowserClient()
    setIsSubmitting(true)

    try {
      const { data: poRow, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          project_id: projectId,
          supplier_id: supplierId,
          po_number: null,
          expected_delivery_date: expectedDeliveryDate.trim() || null,
          total_amount: totalAmount,
          status: "approved",
        })
        .select("id, po_number")
        .single()

      if (poErr) throw poErr
      if (!poRow?.id) throw new Error("לא התקבל מזהה הזמנה מהשרת")

      const linePayload = resolvedLines.map((row) => ({
        po_id: poRow.id,
        item_id: row.item_id,
        description: row.description,
        quantity: row.quantity,
        unit: row.unit || null,
        unit_price: row.unitPrice,
        total_price: row.lineTotal,
        selected_supplier_item_id: row.selected_supplier_item_id,
      }))

      const { error: linesErr } = await supabase
        .from("po_line_items")
        .insert(linePayload)

      if (linesErr) {
        await supabase.from("purchase_orders").delete().eq("id", poRow.id)
        throw linesErr
      }

      const savedPo =
        typeof poRow.po_number === "string" ? poRow.po_number : ""
      toast.success(`הזמנת רכש ${savedPo} נוצרה בהצלחה!`)
      router.push("/marker-ofek/procurement")
      router.refresh()
    } catch (err) {
      console.error("[Marker Ofek] שמירת הזמנת רכש נכשלה", err)
      toast.error(`שמירת ההזמנה נכשלה: ${formatError(err)}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const referencePanel = (
    <div className="space-y-3 text-xs">
      <p className="font-semibold text-foreground">קטלוג מאסטר (עזר)</p>
      <p className="text-muted-foreground">
        בחרו מק״ט ומחיר ברירת מחדל מהרשימה בזמן מילוי שורות בטופס.
      </p>
      <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-border/50 bg-background/80 p-2 font-mono text-[11px]">
        {catalog.length === 0 ? (
          <span className="text-muted-foreground">אין פריטים בקטלוג</span>
        ) : (
          catalog.map((c) => (
            <div
              key={c.id}
              className="border-b border-border/30 py-1.5 last:border-0"
            >
              <span className="text-violet-600 dark:text-violet-400">{c.sku}</span>
              <span className="mx-1 text-muted-foreground">—</span>
              <span>{c.description}</span>
              {c.default_price != null ? (
                <span className="ms-1 tabular-nums text-emerald-700 dark:text-emerald-400">
                  {currencyFormatter.format(Number(c.default_price))}
                </span>
              ) : null}
            </div>
          ))
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        תמונות תעודות משלוח: לאחר יצירת ההזמנה — מסך קבלת סחורה.
      </p>
    </div>
  )

  return (
    <DualPaneLayout
      split={dualSplit}
      onSplitChange={setDualSplit}
      referenceTitle="קטלוג ועזר"
      reference={referencePanel}
    >
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-12">
      <Link
        href="/marker-ofek/procurement"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לרכש וספקים
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          הזמנת רכש חדשה
        </h1>
        <p className="text-sm text-muted-foreground">
          הזינו פרויקט, ספק או קבלן משנה, ושורות — הסכום מחושב אוטומטית ונשמר
          ב-Supabase.
        </p>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : null}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex flex-col gap-6"
        aria-busy={isSubmitting}
      >
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Building2 className="size-5" aria-hidden />
              </div>
              <div className="space-y-1">
                <CardTitle>כותרת ההזמנה</CardTitle>
                <CardDescription>
                  פרויקט יעד, ספק ותאריך אספקה צפוי.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 pt-6 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="po-project">פרויקט</Label>
              <Select
                value={projectId}
                onValueChange={(v) => setProjectId(v ?? "")}
                disabled={loadingRefs || isSubmitting}
              >
                <SelectTrigger id="po-project" className="w-full">
                  <SelectValue placeholder="בחרו פרויקט" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{" "}
                      <span className="font-mono text-muted-foreground">
                        ({p.internal_project_code})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="po-supplier">ספק / קבלן משנה</Label>
              <Select
                value={supplierId}
                onValueChange={(v) => setSupplierId(v ?? "")}
                disabled={loadingRefs || isSubmitting}
              >
                <SelectTrigger id="po-supplier" className="w-full">
                  <SelectValue placeholder="בחרו ספק או קבלן משנה" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.length === 0 ? (
                    <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                      אין ישויות מסוג ספק או קבלן משנה. הוסיפו בטבלת entities.
                    </div>
                  ) : (
                    suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}{" "}
                        <span className="text-muted-foreground">
                          ({entityTypeLabel(s.type)})
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label
                htmlFor="po-expected"
                className="inline-flex items-center gap-2"
              >
                <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
                תאריך אספקה צפוי
              </Label>
              <Input
                id="po-expected"
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                disabled={isSubmitting}
                className="max-w-xs"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-700 dark:text-violet-400">
                <Package className="size-5" aria-hidden />
              </div>
              <div className="space-y-1">
                <CardTitle>שורות הזמנה</CardTitle>
                <CardDescription>
                  ניתן לבחור פריט מאסטר מהקטלוג, להשוות ספקים ולעדכן מחיר נטו
                  ומק״ט ספק לפני השמירה.
                </CardDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={isSubmitting}
              onClick={addLine}
            >
              <Plus className="size-4" aria-hidden />
              הוסף שורה
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="hidden rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,0.55fr)_minmax(0,0.5fr)_auto] lg:gap-3">
              <span>מק״ט (פנימי / ספק)</span>
              <span>תיאור</span>
              <span>כמות</span>
              <span>יחידה</span>
              <span>מחיר יח׳</span>
              <span className="text-end">סה״כ שורה</span>
              <span className="text-center">פעולות</span>
            </div>

            <ul className="flex flex-col gap-4">
              {lines.map((row, index) => {
                const catalogRef = catalogDefaultUnitPrice(
                  row.masterItemId,
                  catalog
                )
                const enteredUnit = parseNum(row.unitPrice)
                const unitPriceOverCatalog =
                  catalogRef != null && enteredUnit > catalogRef + 0.005
                return (
                <li
                  key={row.id}
                  className="rounded-xl border border-border/60 bg-card/50 p-4 shadow-xs lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
                >
                  <div className="mb-2 text-xs font-medium text-muted-foreground lg:hidden">
                    שורה {index + 1}
                  </div>
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                    <div className="min-w-[min(100%,220px)] flex-1 space-y-1.5">
                      <Label htmlFor={`master-${row.id}`}>
                        פריט מאסטר (קטלוג)
                      </Label>
                      <Select
                        value={row.masterItemId ? row.masterItemId : NO_MASTER_VALUE}
                        onValueChange={(v) => {
                          const val = v ?? NO_MASTER_VALUE
                          if (val === NO_MASTER_VALUE) {
                            updateLine(row.id, {
                              masterItemId: "",
                              selectedSupplierItemId: null,
                            })
                            return
                          }
                          const c = catalog.find((x) => x.id === val)
                          updateLine(row.id, {
                            masterItemId: val,
                            selectedSupplierItemId: null,
                            sku: c?.sku ?? "",
                            description: c?.description ?? "",
                            unit: c?.unit?.trim() ?? "",
                            unitPrice:
                              c?.default_price != null &&
                              Number.isFinite(Number(c.default_price))
                                ? String(c.default_price)
                                : "",
                          })
                        }}
                        disabled={loadingRefs || isSubmitting}
                      >
                        <SelectTrigger id={`master-${row.id}`} className="w-full">
                          <SelectValue placeholder="בחרו פריט או הזנה ידנית" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_MASTER_VALUE}>
                            ללא — הזנה ידנית בלבד
                          </SelectItem>
                          {catalog.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              <span className="font-mono">{c.sku}</span>
                              <span className="text-muted-foreground">
                                {" "}
                                — {c.description}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {row.masterItemId ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="shrink-0 gap-1.5"
                        disabled={isSubmitting}
                        onClick={() => {
                          const c = catalog.find((x) => x.id === row.masterItemId)
                          const label = c
                            ? `${c.sku} — ${c.description}`
                            : row.masterItemId
                          setCompareTarget({
                            lineId: row.id,
                            masterItemId: row.masterItemId,
                            masterLabel: label,
                          })
                        }}
                      >
                        <Scale className="size-4" aria-hidden />
                        השוואת מחירים
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,0.55fr)_minmax(0,0.5fr)_auto] lg:items-end">
                    <div className="space-y-1.5">
                      <Label className="lg:sr-only" htmlFor={`sku-${row.id}`}>
                        מק״ט (בהזמנה / ספק)
                      </Label>
                      <Input
                        id={`sku-${row.id}`}
                        value={row.sku}
                        onChange={(e) =>
                          updateLine(row.id, { sku: e.target.value })
                        }
                        placeholder="SKU-001"
                        dir="ltr"
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="lg:sr-only" htmlFor={`desc-${row.id}`}>
                        תיאור
                      </Label>
                      <Input
                        id={`desc-${row.id}`}
                        value={row.description}
                        onChange={(e) =>
                          updateLine(row.id, { description: e.target.value })
                        }
                        placeholder="תיאור פריט"
                        dir="rtl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="lg:sr-only" htmlFor={`qty-${row.id}`}>
                        כמות
                      </Label>
                      <Input
                        id={`qty-${row.id}`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min={0}
                        value={row.quantity}
                        onChange={(e) =>
                          updateLine(row.id, { quantity: e.target.value })
                        }
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="lg:sr-only" htmlFor={`unit-${row.id}`}>
                        יחידה
                      </Label>
                      <Input
                        id={`unit-${row.id}`}
                        value={row.unit}
                        onChange={(e) =>
                          updateLine(row.id, { unit: e.target.value })
                        }
                        placeholder="יח׳"
                        dir="rtl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="lg:sr-only" htmlFor={`price-${row.id}`}>
                        מחיר יח׳
                      </Label>
                      <Input
                        id={`price-${row.id}`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min={0}
                        value={row.unitPrice}
                        onChange={(e) =>
                          updateLine(row.id, { unitPrice: e.target.value })
                        }
                        placeholder="0"
                        aria-invalid={unitPriceOverCatalog}
                        title={
                          unitPriceOverCatalog && catalogRef != null
                            ? `מחיר קטלוג: ${currencyFormatter.format(catalogRef)}`
                            : undefined
                        }
                        className={cn(
                          unitPriceOverCatalog &&
                            "border-destructive bg-destructive/5 text-destructive ring-2 ring-destructive/25 dark:bg-destructive/10"
                        )}
                      />
                      {unitPriceOverCatalog && catalogRef != null ? (
                        <p className="text-[11px] font-medium text-destructive">
                          מעל מחיר הקטלוג (
                          {currencyFormatter.format(catalogRef)})
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5 text-end">
                      <span className="block text-xs text-muted-foreground lg:sr-only">
                        סה״כ שורה
                      </span>
                      <span className="inline-block rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-sm font-semibold tabular-nums lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
                        {currencyFormatter.format(lineRowTotal(row))}
                      </span>
                    </div>
                    <div className="flex justify-end pb-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className={cn(
                          "text-destructive hover:bg-destructive/10 hover:text-destructive",
                          lines.length <= 1 && "pointer-events-none opacity-30"
                        )}
                        disabled={lines.length <= 1 || isSubmitting}
                        onClick={() => removeLine(row.id)}
                        aria-label="מחק שורה"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
            </ul>

            <div className="flex flex-col items-stretch justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 sm:flex-row sm:items-center">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <Truck className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                סכום כולל (הזמנה)
              </span>
              <span className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {currencyFormatter.format(grandTotal)}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            render={<Link href="/marker-ofek/procurement" />}
          >
            ביטול
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={loadingRefs || isSubmitting}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {loadingRefs || isSubmitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            {isSubmitting ? "שומרים…" : "שמור ואשר הזמנה"}
          </Button>
        </div>
      </form>

      <SupplierCompareSheet
        open={compareTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCompareTarget(null)
        }}
        masterItemId={compareTarget?.masterItemId ?? null}
        masterLabel={compareTarget?.masterLabel ?? ""}
        onPick={(payload) => {
          const lineId = compareTarget?.lineId
          if (!lineId) return
          updateLine(lineId, {
            selectedSupplierItemId: payload.supplierItemId,
            sku: payload.supplierSku,
            unitPrice: String(payload.netUnitPrice),
          })
          toast.success("עודכנו מק״ט ספק ומחיר נטו בשורה")
        }}
      />
    </div>
    </DualPaneLayout>
  )
}
