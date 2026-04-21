"use client"

import * as React from "react"
import { ArrowLeft, Library, Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  applyDekelPriceToBoQ,
  getTenderDekelDefaults,
  searchDekelPrices,
} from "@/lib/marker-ofek/tenders/dekel-actions"
import { cn } from "@/lib/utils"
import type { RefDekelPriceRow } from "@/types/marker-ofek"

const currencyList = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const FAST_CATEGORIES = ["חשמל", "תשתיות", "בנייה", "שיפוצים"] as const

type DekelPricePickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenderProjectId: string | null
  boqItemId: string | null
  onApplied: () => void
}

export function DekelPricePickerDialog({
  open,
  onOpenChange,
  tenderProjectId,
  boqItemId,
  onApplied,
}: DekelPricePickerDialogProps) {
  const [query, setQuery] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [categoryRibbon, setCategoryRibbon] = React.useState<string | null>(null)
  const [rows, setRows] = React.useState<RefDekelPriceRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [multiplier, setMultiplier] = React.useState("1.10")
  const [applyingId, setApplyingId] = React.useState<string | null>(null)

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 280)
    return () => window.clearTimeout(t)
  }, [query])

  React.useEffect(() => {
    if (!open || !tenderProjectId) return
    let cancelled = false
    void (async () => {
      const res = await getTenderDekelDefaults(tenderProjectId)
      if (cancelled) return
      if (res.ok) {
        setMultiplier(String(res.defaultDekelMultiplier))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, tenderProjectId])

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      const res = await searchDekelPrices({
        query: debounced,
        category: categoryRibbon,
        limit: 45,
      })
      if (cancelled) return
      if (!res.ok) {
        toast.error(res.error)
        setRows([])
      } else {
        setRows(res.rows)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, debounced, categoryRibbon])

  React.useEffect(() => {
    if (open) {
      setQuery("")
      setDebounced("")
      setCategoryRibbon(null)
    }
  }, [open])

  async function applyRow(d: RefDekelPriceRow) {
    if (!boqItemId) {
      toast.error("לא נבחרה שורת BoQ")
      return
    }
    const m = parseFloat(multiplier.replace(",", "."))
    if (!Number.isFinite(m) || m <= 0) {
      toast.error("מקדם לא תקין")
      return
    }
    setApplyingId(d.id)
    const res = await applyDekelPriceToBoQ({
      boqItemId,
      dekelId: d.id,
      multiplier: m,
    })
    setApplyingId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("השורה מולאה ממחירון דקל")
    onApplied()
    onOpenChange(false)
  }

  const multNum = parseFloat(multiplier.replace(",", "."))
  const multOk = Number.isFinite(multNum) && multNum > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(92vh,620px)] gap-0 overflow-hidden border-slate-100 bg-card p-0 sm:max-w-xl"
        showCloseButton
      >
        <DialogHeader className="border-b border-slate-100 bg-card px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-[#1e293b]">
            <Library className="size-5 text-indigo-600" aria-hidden />
            משוך מדקל
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            חשמל ותשתיות מוצגים בראש התוצאות. חיפוש תומך בקידומות עבריות (למשל החשמל → חשמל). בחרו קטגוריה
            מהירה או הקלידו לסינון.
          </DialogDescription>
        </DialogHeader>

        {!boqItemId ? (
          <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-950">
            לא נבחרה שורת BoQ — סגרו ולחצו &quot;משוך מדקל&quot; ליד השורה.
          </p>
        ) : null}

        <div className="border-b border-slate-100 bg-card px-3 py-2">
          <p className="mb-2 text-[11px] font-medium text-slate-500">קטגוריות מהירות</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryRibbon(null)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                categoryRibbon === null
                  ? "border-indigo-200 bg-indigo-50 text-indigo-900"
                  : "border-slate-100 bg-card text-slate-600 hover:bg-background"
              )}
            >
              הכל
            </button>
            {FAST_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryRibbon(c)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  categoryRibbon === c
                    ? "border-indigo-200 bg-indigo-50 text-indigo-900"
                    : "border-slate-100 bg-card text-slate-600 hover:bg-background"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 bg-card px-4 py-3">
          <div className="grid gap-1">
            <Label htmlFor="dekel-q" className="text-xs text-slate-500">
              חיפוש
            </Label>
            <Input
              id="dekel-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-slate-100 bg-card"
              placeholder="תיאור, מק״ט, קטגוריה…"
              dir="rtl"
              autoComplete="off"
            />
          </div>
          <div className="grid max-w-[11rem] gap-1">
            <Label htmlFor="dekel-mult" className="text-xs text-slate-500">
              מקדם (מחיר דקל → המחיר שלך)
            </Label>
            <Input
              id="dekel-mult"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              className="border-slate-100 bg-card font-currency-mono tabular-nums"
              inputMode="decimal"
              dir="ltr"
            />
            <span className="text-[10px] text-slate-400">
              ברירת המכרז נטענת אוטומטית — ניתן לשמור בהגדרות המכרז בדף BoQ.
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-card px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              טוען…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">אין תוצאות</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-100 bg-card">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-background/80 text-start text-[11px] text-slate-500">
                    <th className="px-3 py-2 font-medium">תיאור · יח׳</th>
                    <th className="px-2 py-2 text-end font-medium">מחיר דקל</th>
                    <th className="w-8 px-0 py-2 text-center font-normal text-slate-400">
                      <ArrowLeft className="mx-auto size-3" aria-hidden />
                    </th>
                    <th className="px-2 py-2 text-end font-medium">המחיר שלך</th>
                    <th className="w-[1%] px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const base = Number(r.list_price ?? 0)
                    const your =
                      multOk && Number.isFinite(base)
                        ? Math.round(base * multNum * 100) / 100
                        : null
                    return (
                      <tr key={r.id} className="border-b border-slate-100 last:border-0">
                        <td className="max-w-[220px] px-3 py-2 align-top">
                          <p className="font-medium leading-snug text-[#1e293b]">
                            {r.item_description ?? "—"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            <span className="font-currency-mono">{r.external_sku ?? "—"}</span>
                            {r.category ? (
                              <>
                                {" "}
                                · {r.category}
                              </>
                            ) : null}
                            {r.unit ? (
                              <>
                                {" "}
                                · {r.unit}
                              </>
                            ) : null}
                          </p>
                        </td>
                        <td className="px-2 py-2 text-end align-middle">
                          <span className="font-currency-mono text-sm tabular-nums text-slate-700">
                            {Number.isFinite(base) ? currencyList.format(base) : "—"}
                          </span>
                        </td>
                        <td className="px-0 py-2 text-center align-middle text-slate-300">→</td>
                        <td className="px-2 py-2 text-end align-middle">
                          <span className="font-currency-mono text-sm font-semibold tabular-nums text-indigo-900">
                            {your != null ? currencyList.format(your) : "—"}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-end align-middle">
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 bg-indigo-600 hover:bg-indigo-500"
                            disabled={!boqItemId || applyingId === r.id || !multOk}
                            onClick={() => void applyRow(r)}
                          >
                            {applyingId === r.id ? (
                              <Loader2 className="size-4 animate-spin" aria-hidden />
                            ) : (
                              "משוך לשורה"
                            )}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
