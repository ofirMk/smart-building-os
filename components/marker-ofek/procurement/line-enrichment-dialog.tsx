"use client"

/**
 * LineEnrichmentDialog — Phase 7.13.2
 *
 * דיאלוג עריכה של 7 שדות ה-enrichment של שורת PO שעד היום היו חסרים
 * בטופס יצירת ההזמנה (היו רק `quantity`, `unitPrice`, `description`):
 *
 *   1. supplyDate          — תאריך אספקה נדרש (YYYY-MM-DD).
 *   2. discountPct         — אחוז הנחה ספציפי לשורה.
 *   3. lineCurrency        — מטבע השורה (לעקיפה של המטבע ההיררכי).
 *   4. exchangeRate        — שער המרה רק אם lineCurrency שונה ממטבע הכותרת.
 *   5. manufacturerName    — יצרן (חופף ל-Priority field "שם יצרן").
 *   6. lineNotes           — הערות פר-שורה (חופף ל-Priority field "הערות").
 *   7. priceSource         — מקור המחיר (PRICELIST/QUOTE/MANUAL/...).
 *
 * עבודה ב-uncontrolled-mode פנימי:
 *   הדיאלוג מקבל ערכים נוכחיים, מאפשר עריכה, ובסיום מחזיר את הערכים החדשים
 *   דרך `onSave`. הוא לא יודע על RHF / useFieldArray ישירות — הקריאה
 *   ל-`setValue` קורה ב-parent. זה שומר על הקומפוננטה כללית למסכי
 *   detail/drawer עתידיים (למשל edit בתוך מסך הפרט).
 */

import * as React from "react"
import { Calendar, Info, Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

// ============================================================================
// Public types
// ============================================================================

export const LINE_PRICE_SOURCES = [
  "MANUAL",
  "SUPPLIER_PRICELIST",
  "LAST_PURCHASE",
  "QUOTE",
  "FRAMEWORK",
  "AI_CROSS_SUPPLIER",
] as const
export type LinePriceSource = (typeof LINE_PRICE_SOURCES)[number]

export const PRICE_SOURCE_LABEL: Record<LinePriceSource, string> = {
  MANUAL: "ידני",
  SUPPLIER_PRICELIST: "מחירון ספק",
  LAST_PURCHASE: "רכישה אחרונה",
  QUOTE: "הצעת מחיר",
  FRAMEWORK: "הסכם מסגרת",
  AI_CROSS_SUPPLIER: "AI / חלופה חוצת ספקים",
}

const SUPPORTED_LINE_CURRENCIES = ["", "ILS", "USD", "EUR"] as const

export type LineEnrichmentValues = {
  supplyDate: string | null
  discountPct: number | null
  lineCurrency: string | null
  exchangeRate: number | null
  manufacturerName: string | null
  lineNotes: string | null
  priceSource: LinePriceSource | null
}

export const EMPTY_LINE_ENRICHMENT: LineEnrichmentValues = {
  supplyDate: null,
  discountPct: null,
  lineCurrency: null,
  exchangeRate: null,
  manufacturerName: null,
  lineNotes: null,
  priceSource: null,
}

/**
 * עוזר חיצוני: סופר כמה שדות enrichment באמת מולאו (לא ריקים) — משמש לתצוגת
 * badge על כפתור "פרטים מורחבים" כדי שהמשתמש יראה מבט עין שיש שם תוכן.
 */
export function countFilledEnrichmentFields(
  values: LineEnrichmentValues
): number {
  let count = 0
  if (values.supplyDate) count++
  if (values.discountPct != null && values.discountPct > 0) count++
  if (values.lineCurrency) count++
  if (values.exchangeRate != null && values.exchangeRate !== 1) count++
  if (values.manufacturerName?.trim()) count++
  if (values.lineNotes?.trim()) count++
  if (values.priceSource && values.priceSource !== "MANUAL") count++
  return count
}

// ============================================================================
// Component
// ============================================================================

type LineEnrichmentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  values: LineEnrichmentValues
  /** מטבע הכותרת — מוצג כברירת מחדל ב-lineCurrency כשלא נבחר ערך. */
  headerCurrency: string
  /** למספר שורה בכותרת בלבד (UX). */
  lineIndex: number
  onSave: (next: LineEnrichmentValues) => void
}

export function LineEnrichmentDialog({
  open,
  onOpenChange,
  values,
  headerCurrency,
  lineIndex,
  onSave,
}: LineEnrichmentDialogProps) {
  // Local draft state — only commits to parent on Save.
  const [draft, setDraft] = React.useState<LineEnrichmentValues>(values)
  const [busy, setBusy] = React.useState(false)

  // Reset draft when dialog opens or external values change.
  React.useEffect(() => {
    if (open) setDraft(values)
  }, [open, values])

  const exchangeRateRequired = Boolean(
    draft.lineCurrency && draft.lineCurrency !== headerCurrency
  )

  const handleChange = <K extends keyof LineEnrichmentValues>(
    key: K,
    value: LineEnrichmentValues[K]
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    // Light client validation: require exchangeRate if currency mismatches.
    if (exchangeRateRequired && (draft.exchangeRate == null || draft.exchangeRate <= 0)) {
      // surface error inline rather than blocking with a toast — reduces noise.
      return
    }
    setBusy(true)
    try {
      onSave({
        supplyDate: draft.supplyDate?.trim() ? draft.supplyDate.trim() : null,
        discountPct:
          draft.discountPct != null && Number.isFinite(draft.discountPct)
            ? draft.discountPct
            : null,
        lineCurrency: draft.lineCurrency || null,
        exchangeRate:
          draft.exchangeRate != null && Number.isFinite(draft.exchangeRate)
            ? draft.exchangeRate
            : null,
        manufacturerName: draft.manufacturerName?.trim() || null,
        lineNotes: draft.lineNotes?.trim() || null,
        priceSource: draft.priceSource || null,
      })
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  const handleClear = () => {
    setDraft(EMPTY_LINE_ENRICHMENT)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-h-[90vh] max-w-2xl overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>פרטים מורחבים — שורה {lineIndex + 1}</DialogTitle>
          <DialogDescription>
            שדות אופציונליים שמועברים ל-Smart-Pricing engine ול-AI agents.
            ניתן להשאיר ריקים ולהשתמש בברירות המחדל של המערכת.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* supplyDate */}
          <div className="space-y-1.5">
            <Label htmlFor="line-supply-date" className="text-xs">
              <Calendar className="me-1 inline size-3" aria-hidden />
              תאריך אספקה נדרש
            </Label>
            <Input
              id="line-supply-date"
              type="date"
              value={draft.supplyDate ?? ""}
              onChange={(e) => handleChange("supplyDate", e.target.value || null)}
              className="h-9"
            />
            <p className="text-[10px] text-muted-foreground">
              YYYY-MM-DD. ברירת מחדל: ללא.
            </p>
          </div>

          {/* discountPct */}
          <div className="space-y-1.5">
            <Label htmlFor="line-discount" className="text-xs">
              אחוז הנחה
            </Label>
            <div className="relative">
              <Input
                id="line-discount"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={draft.discountPct ?? ""}
                onChange={(e) => {
                  const v = e.target.value
                  handleChange("discountPct", v === "" ? null : Number(v))
                }}
                className="h-9 pe-8 tabular-nums"
                placeholder="0"
              />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                %
              </span>
            </div>
          </div>

          {/* priceSource */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">מקור מחיר</Label>
            <Select
              value={draft.priceSource ?? ""}
              onValueChange={(v) =>
                handleChange("priceSource", (v as LinePriceSource) || null)
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="ברירת מחדל: MANUAL" />
              </SelectTrigger>
              <SelectContent>
                {LINE_PRICE_SOURCES.map((src) => (
                  <SelectItem key={src} value={src}>
                    <span className="font-medium">{PRICE_SOURCE_LABEL[src]}</span>
                    <span className="ms-2 font-mono text-xs text-muted-foreground">
                      {src}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="flex items-start gap-1 text-[10px] text-muted-foreground">
              <Info className="mt-0.5 size-3 flex-none" aria-hidden />
              ה-Smart-Pricing engine משתמש בערך זה לחישוב חריגות ולקביעת
              דרישות אישור ספציפיות.
            </p>
          </div>

          {/* lineCurrency */}
          <div className="space-y-1.5">
            <Label className="text-xs">מטבע שורה</Label>
            <Select
              value={draft.lineCurrency ?? "__inherit__"}
              onValueChange={(v) =>
                handleChange("lineCurrency", v === "__inherit__" ? null : v)
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__inherit__">
                  <span className="text-muted-foreground">
                    כמטבע הכותרת ({headerCurrency})
                  </span>
                </SelectItem>
                {SUPPORTED_LINE_CURRENCIES.filter((c) => c !== "").map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* exchangeRate */}
          <div className="space-y-1.5">
            <Label
              htmlFor="line-exchange-rate"
              className={cn(
                "text-xs",
                exchangeRateRequired && "text-foreground"
              )}
            >
              שער המרה
              {exchangeRateRequired ? (
                <span className="ms-1 text-destructive">*</span>
              ) : null}
            </Label>
            <Input
              id="line-exchange-rate"
              type="number"
              step="0.0001"
              min="0.0001"
              value={draft.exchangeRate ?? ""}
              disabled={!exchangeRateRequired}
              onChange={(e) => {
                const v = e.target.value
                handleChange("exchangeRate", v === "" ? null : Number(v))
              }}
              placeholder={exchangeRateRequired ? "חובה" : "1.0000"}
              className={cn(
                "h-9 tabular-nums",
                exchangeRateRequired &&
                  (draft.exchangeRate == null || draft.exchangeRate <= 0) &&
                  "border-destructive"
              )}
            />
            <p className="text-[10px] text-muted-foreground">
              {exchangeRateRequired
                ? `חובה כשמטבע השורה (${draft.lineCurrency}) שונה ממטבע הכותרת (${headerCurrency}).`
                : "מתעלם כשמטבע השורה זהה לכותרת."}
            </p>
          </div>

          {/* manufacturerName */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="line-manufacturer" className="text-xs">
              שם יצרן
            </Label>
            <Input
              id="line-manufacturer"
              value={draft.manufacturerName ?? ""}
              onChange={(e) =>
                handleChange("manufacturerName", e.target.value || null)
              }
              className="h-9"
              placeholder="לדוגמה: Schneider Electric"
            />
          </div>

          {/* lineNotes */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="line-notes" className="text-xs">
              הערות לשורה
            </Label>
            <Textarea
              id="line-notes"
              value={draft.lineNotes ?? ""}
              onChange={(e) =>
                handleChange("lineNotes", e.target.value || null)
              }
              rows={3}
              placeholder="הערות פנימיות לשורה זו (לא מועברות לספק כברירת מחדל)."
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={busy}
          >
            נקה הכל
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            ביטול
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={busy}
            className="gap-1.5"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="size-3.5" aria-hidden />
            )}
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
