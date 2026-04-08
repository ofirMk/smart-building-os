"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import * as React from "react"
import {
  ArrowRight,
  FileSpreadsheet,
  Loader2,
  Plus,
  Save,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import { processBoQFileAI } from "./actions/tender-boq-actions"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createSupabaseBrowserClient as createClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"

type TenderListRow = {
  id: string
  project_name_from_ai: string | null
  created_at: string
  updated_at: string
}

/** שורת BoQ במצב מקומי — `fromDb` מסמן שורות שנשמרו ב-DB (ניתן לעדכן תמחור). */
export type BoqWorksheetRow = {
  id: string
  section: string
  itemNo: string
  description: string
  unit: string
  quantity: number
  estimatedCost: number | null
  fromDb: boolean
}

const sectionEnter =
  "animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-500 ease-out motion-reduce:animate-none"

const primaryPress =
  "transition-transform duration-150 ease-out active:scale-95 motion-reduce:active:scale-100"

function formatNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—"
  return new Intl.NumberFormat("he-IL", {
    maximumFractionDigits: 2,
  }).format(n)
}

function computeFinalUnitPrice(
  estimatedCost: number | null,
  markupPercent: number
): number | null {
  if (estimatedCost === null || Number.isNaN(estimatedCost)) return null
  return estimatedCost * (1 + markupPercent / 100)
}

function formatNumInput(n: number | null): string {
  if (n === null || Number.isNaN(n)) return ""
  return String(n)
}

export default function TenderPricingPage() {
  const searchParams = useSearchParams()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [tenders, setTenders] = React.useState<TenderListRow[]>([])
  const [loadingTenders, setLoadingTenders] = React.useState(true)
  const [selectedTenderId, setSelectedTenderId] = React.useState<string>("")
  const [loadingBoq, setLoadingBoq] = React.useState(false)
  const [isImporting, setIsImporting] = React.useState(false)
  const [savingPricing, setSavingPricing] = React.useState(false)
  const [markupPercent, setMarkupPercent] = React.useState(0)
  const [boqItems, setBoqItems] = React.useState<BoqWorksheetRow[]>([])

  const refreshTenders = React.useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("tenders")
      .select("id, project_name_from_ai, created_at, updated_at")
      .order("updated_at", { ascending: false })
    if (error) {
      toast.error(error.message)
      return
    }
    setTenders((data ?? []) as TenderListRow[])
  }, [])

  React.useEffect(() => {
    let alive = true
    void (async () => {
      setLoadingTenders(true)
      await refreshTenders()
      if (alive) setLoadingTenders(false)
    })()
    return () => {
      alive = false
    }
  }, [refreshTenders])

  React.useEffect(() => {
    const tid = searchParams.get("tender")
    if (!tid || loadingTenders || tenders.length === 0) return
    if (tenders.some((t) => t.id === tid)) {
      setSelectedTenderId(tid)
    }
  }, [searchParams, tenders, loadingTenders])

  const refreshBoqFromDb = React.useCallback(async (tenderId: string) => {
    if (!tenderId) {
      setBoqItems([])
      return
    }
    setLoadingBoq(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("tender_boq_items")
        .select(
          "id, section, item_number, description, unit, quantity, estimated_cost, final_price"
        )
        .eq("tender_id", tenderId)
        .order("id", { ascending: true })

      if (error) {
        toast.error(error.message)
        setBoqItems([])
        return
      }

      setBoqItems(
        (data ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          section: String(r.section ?? ""),
          itemNo: String(r.item_number ?? ""),
          description: String(r.description ?? ""),
          unit: String(r.unit ?? ""),
          quantity: Number(r.quantity) || 0,
          estimatedCost:
            r.estimated_cost !== null && r.estimated_cost !== undefined
              ? Number(r.estimated_cost)
              : null,
          fromDb: true,
        }))
      )
    } finally {
      setLoadingBoq(false)
    }
  }, [])

  React.useEffect(() => {
    if (!selectedTenderId) {
      setBoqItems([])
      return
    }
    void refreshBoqFromDb(selectedTenderId)
  }, [selectedTenderId, refreshBoqFromDb])

  const pricingTotals = React.useMemo(() => {
    let totalEstimated = 0
    let totalBid = 0
    for (const row of boqItems) {
      const q = row.quantity
      const est = row.estimatedCost
      const finalU = computeFinalUnitPrice(est, markupPercent)
      if (est !== null && !Number.isNaN(est)) {
        totalEstimated += q * est
      }
      if (finalU !== null && !Number.isNaN(finalU)) {
        totalBid += q * finalU
      }
    }
    return { totalEstimated, totalBid }
  }, [boqItems, markupPercent])

  function handleImportClick() {
    if (!selectedTenderId) {
      toast.error("נא לבחור מכרז לפני ייבוא כתב כמויות")
      return
    }
    fileInputRef.current?.click()
  }

  async function handleImportFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    e.target.value = ""
    if (!files?.length || !selectedTenderId) return

    const file = files[0]
    setIsImporting(true)
    try {
      const fd = new FormData()
      fd.set("file", file)
      const res = await processBoQFileAI(selectedTenderId, fd)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success(
        res.inserted === 0
          ? "לא נמצאו שורות לייבוא"
          : `יובאו ${res.inserted} שורות לכתב הכמויות`
      )
      await refreshBoqFromDb(selectedTenderId)
    } finally {
      setIsImporting(false)
    }
  }

  function handleAddManualRow() {
    if (!selectedTenderId) {
      toast.error("נא לבחור מכרז לפני הוספת סעיף")
      return
    }
    setBoqItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        section: "",
        itemNo: "",
        description: "",
        unit: "",
        quantity: 0,
        estimatedCost: null,
        fromDb: false,
      },
    ])
  }

  function updateRow(
    id: string,
    patch: Partial<Omit<BoqWorksheetRow, "id">>
  ) {
    setBoqItems((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    )
  }

  function parseOptionalNumber(s: string): number | null {
    const t = s.trim()
    if (t === "") return null
    const n = Number(t.replace(",", "."))
    return Number.isFinite(n) ? n : null
  }

  async function handleSavePricing() {
    if (!selectedTenderId) {
      toast.error("נא לבחור מכרז")
      return
    }
    const persisted = boqItems.filter((r) => r.fromDb)
    if (persisted.length === 0) {
      toast.message("אין שורות שנשמרו בשרת לעדכון (רק שורות מיובאות)")
      return
    }

    setSavingPricing(true)
    try {
      const supabase = createClient()
      const mk = markupPercent
      for (const row of persisted) {
        const est = row.estimatedCost
        const finalP = computeFinalUnitPrice(est, mk)
        const { error } = await supabase
          .from("tender_boq_items")
          .update({
            estimated_cost: est,
            final_price: finalP,
          })
          .eq("id", row.id)

        if (error) {
          toast.error(error.message)
          return
        }
      }
      toast.success("התמחור נשמר בהצלחה")
      await refreshBoqFromDb(selectedTenderId)
    } finally {
      setSavingPricing(false)
    }
  }

  const toolbarBusy = loadingTenders || loadingBoq || isImporting
  const showEmptyState =
    !selectedTenderId || (!loadingBoq && boqItems.length === 0)
  const emptyMessage = !selectedTenderId
    ? "בחרו מכרז מהרשימה כדי לטעון ולערוך את כתב הכמויות."
    : "אין עדיין שורות בכתב הכמויות. ייבאו קובץ Excel או PDF, או הוסיפו סעיפים ידנית."

  return (
    <div className="px-4 py-6 md:px-6" dir="rtl" lang="he">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf"
        className="sr-only"
        aria-hidden
        onChange={handleImportFiles}
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-12">
        <Link
          href="/marker-ofek/pre-construction"
          className={cn(
            sectionEnter,
            "inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground"
          )}
        >
          <ArrowRight className="size-4 rotate-180" aria-hidden />
          חזרה למכרזים ותמחור
        </Link>

        <div className={cn(sectionEnter, "delay-75 [animation-delay:75ms]")}>
          <h1 className="text-2xl font-semibold tracking-tight">
            כתב כמויות וגיליון תמחור
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            סעיף 1.3 — מנוע תמחור דינמי: עלות מוערכת, רווח קבלני, והצעת מחיר
            אוטומטית.
          </p>
        </div>

        <Card
          className={cn(sectionEnter, "delay-150 [animation-delay:150ms]")}
        >
          <CardHeader className="space-y-1">
            <CardTitle>בחירת מכרז</CardTitle>
            <CardDescription>
              כל שורות כתב הכמויות משויכות למכרז שנבחר.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="tender-pricing-select">מכרז</Label>
              <Select
                value={selectedTenderId || ""}
                onValueChange={(v) => setSelectedTenderId(v ?? "")}
                disabled={loadingTenders}
              >
                <SelectTrigger
                  id="tender-pricing-select"
                  className="max-w-md"
                >
                  <SelectValue placeholder="בחרו מכרז מהרשימה" />
                </SelectTrigger>
                <SelectContent>
                  {tenders.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {(t.project_name_from_ai?.trim() || "ללא שם") +
                        ` — ${new Date(t.updated_at).toLocaleDateString("he-IL")}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card
          className={cn(sectionEnter, "delay-200 [animation-delay:200ms]")}
        >
          <CardHeader className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-lg">גיליון תמחור</CardTitle>
              <CardDescription>
                עמודות: פרק, סעיף, תיאור, יחידה, כמות, עלות מוערכת ליחידה, מחיר
                סופי ליחידה (לפי רווח), סה״כ שורה.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                className={cn(primaryPress, "gap-2")}
                onClick={() => void handleImportClick()}
                disabled={toolbarBusy}
              >
                {isImporting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="size-4" aria-hidden />
                )}
                ייבוא כתב כמויות (Excel/PDF)
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(primaryPress, "gap-2")}
                onClick={() => handleAddManualRow()}
                disabled={toolbarBusy}
              >
                <Plus className="size-4" aria-hidden />
                הוסף סעיף ידני
              </Button>
              <Button
                type="button"
                className={cn(primaryPress, "gap-2")}
                onClick={() => void handleSavePricing()}
                disabled={
                  toolbarBusy ||
                  savingPricing ||
                  !selectedTenderId ||
                  boqItems.length === 0
                }
              >
                {savingPricing ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="size-4" aria-hidden />
                )}
                שמור תמחור
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {!showEmptyState && !loadingBoq && boqItems.length > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Card className="border bg-muted/30 shadow-none">
                    <CardHeader className="space-y-1 pb-2 pt-4">
                      <Label className="text-xs text-muted-foreground">
                        רווח קבלני (%)
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={-100}
                          step={0.01}
                          className="h-9 max-w-[120px] tabular-nums"
                          value={Number.isNaN(markupPercent) ? "" : markupPercent}
                          onChange={(e) => {
                            const v = e.target.value
                            if (v === "") {
                              setMarkupPercent(0)
                              return
                            }
                            const n = Number(v)
                            setMarkupPercent(Number.isFinite(n) ? n : 0)
                          }}
                          aria-label="אחוז רווח קבלני"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </CardHeader>
                  </Card>
                  <Card className="border bg-muted/30 shadow-none">
                    <CardHeader className="space-y-1 pb-2 pt-4">
                      <CardDescription className="text-xs">
                        סה״כ עלות צפויה
                      </CardDescription>
                      <p className="text-lg font-semibold tabular-nums">
                        {formatNum(pricingTotals.totalEstimated)} ₪
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Σ (כמות × עלות מוערכת ליחידה)
                      </p>
                    </CardHeader>
                  </Card>
                  <Card className="border bg-muted/30 shadow-none">
                    <CardHeader className="space-y-1 pb-2 pt-4">
                      <CardDescription className="text-xs">
                        סה״כ הצעת מחיר
                      </CardDescription>
                      <p className="text-lg font-semibold tabular-nums text-primary">
                        {formatNum(pricingTotals.totalBid)} ₪
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Σ (כמות × מחיר סופי ליחידה)
                      </p>
                    </CardHeader>
                  </Card>
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[100px] text-start">
                          פרק
                        </TableHead>
                        <TableHead className="w-[88px] text-start">
                          סעיף
                        </TableHead>
                        <TableHead className="min-w-[200px] text-start">
                          תיאור
                        </TableHead>
                        <TableHead className="w-[72px] text-start">
                          יח׳
                        </TableHead>
                        <TableHead className="w-[88px] text-start">
                          כמות
                        </TableHead>
                        <TableHead className="w-[120px] text-start">
                          עלות מוערכת
                        </TableHead>
                        <TableHead className="w-[120px] text-start">
                          מחיר סופי
                        </TableHead>
                        <TableHead className="w-[120px] text-start">
                          סה״כ
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {boqItems.map((row) => {
                        const finalUnit = computeFinalUnitPrice(
                          row.estimatedCost,
                          markupPercent
                        )
                        const lineTotal =
                          finalUnit !== null
                            ? row.quantity * finalUnit
                            : null
                        return (
                          <TableRow key={row.id} className="text-sm">
                            <TableCell className="p-1">
                              <Input
                                className="h-8 min-w-[80px] text-xs"
                                value={row.section}
                                onChange={(e) =>
                                  updateRow(row.id, {
                                    section: e.target.value,
                                  })
                                }
                                placeholder="פרק"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                className="h-8 w-full min-w-[72px] text-xs tabular-nums"
                                value={row.itemNo}
                                onChange={(e) =>
                                  updateRow(row.id, {
                                    itemNo: e.target.value,
                                  })
                                }
                                placeholder="מס׳"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                className="h-8 min-w-[180px] text-xs"
                                value={row.description}
                                onChange={(e) =>
                                  updateRow(row.id, {
                                    description: e.target.value,
                                  })
                                }
                                placeholder="תיאור"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                className="h-8 w-14 text-xs"
                                value={row.unit}
                                onChange={(e) =>
                                  updateRow(row.id, { unit: e.target.value })
                                }
                                placeholder="יח׳"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                type="number"
                                className="h-8 w-20 text-xs tabular-nums"
                                inputMode="decimal"
                                min={0}
                                step="any"
                                value={
                                  row.quantity === 0 ? "" : String(row.quantity)
                                }
                                onChange={(e) => {
                                  const raw = e.target.value
                                  if (raw === "") {
                                    updateRow(row.id, { quantity: 0 })
                                    return
                                  }
                                  const n = Number(raw)
                                  updateRow(row.id, {
                                    quantity: Number.isFinite(n) ? n : 0,
                                  })
                                }}
                                placeholder="0"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                type="number"
                                className="h-8 w-28 text-xs tabular-nums"
                                inputMode="decimal"
                                min={0}
                                step="any"
                                value={formatNumInput(row.estimatedCost)}
                                onChange={(e) => {
                                  const raw = e.target.value
                                  if (raw === "") {
                                    updateRow(row.id, { estimatedCost: null })
                                    return
                                  }
                                  const n = Number(raw)
                                  updateRow(row.id, {
                                    estimatedCost: Number.isFinite(n)
                                      ? n
                                      : null,
                                  })
                                }}
                                placeholder="0"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <div className="flex h-8 min-w-[5rem] items-center px-2 text-xs tabular-nums text-muted-foreground">
                                {formatNum(finalUnit)}
                              </div>
                            </TableCell>
                            <TableCell className="py-2 tabular-nums text-xs font-medium text-muted-foreground">
                              {formatNum(lineTotal)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : loadingBoq && selectedTenderId ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 py-12">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  טוען כתב כמויות…
                </p>
              </div>
            ) : showEmptyState ? (
              <div
                className={cn(
                  "flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-muted/20 px-6 py-12 text-center"
                )}
              >
                <div className="flex size-14 items-center justify-center rounded-full bg-muted/80 text-muted-foreground">
                  <FileSpreadsheet className="size-7" aria-hidden />
                </div>
                <div className="max-w-md space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    {!selectedTenderId
                      ? "לא נבחר מכרז"
                      : "כתב הכמויות ריק"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {emptyMessage}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-2"
                  onClick={() => void handleImportClick()}
                  disabled={toolbarBusy}
                >
                  {isImporting ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="size-4" aria-hidden />
                  )}
                  העלאת קובץ כתב כמויות
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
