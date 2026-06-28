"use client"

/**
 * ItemSupplierMappingsTab — Phase 7.13.3.B → Phase 7.14.3 (unified)
 *
 * Phase 7.14.3: מציג את ספקי הפריט כטבלה אחת מאוחדת, במקום שתי טבלאות נפרדות.
 * מאגד שני מקורות ב-DB:
 *   • `erp_md_supplier_items`          — מחיר (base/net/discount/preferred/valid)
 *   • `erp_md_supplier_item_mapping`   — semantic match (confidence, verified_by_user)
 *
 * ה-API החדש `/api/master-data/items/[id]/suppliers` מבצע merge לפי
 * (supplier_id + supplier_sku) ומחזיר שורות עם `sources[]` flag
 * שמציין מאיזה מקור השורה הגיעה. המשתמש רואה סטטוס מלא לכל ספק במבט אחד.
 *
 * UX:
 *   • Badge "מחיר + AI" / "רק מחיר" / "רק מיפוי" לפי sources[].
 *   • Confidence Tier badge (A/B/C) — כשיש מיפוי.
 *   • Star לספק המועדף (is_preferred=true ב-pricing).
 *   • ShieldCheck ירוק אם verified_by_user.
 *   • toggle "כולל היסטוריה" — חושף שורות עם valid_to בעבר.
 */

import * as React from "react"
import { useFormContext } from "react-hook-form"
import {
  AlertTriangle,
  Banknote,
  Bot,
  ExternalLink,
  History,
  Info,
  Loader2,
  ShieldCheck,
  ShieldQuestion,
  Star,
  TrendingDown,
} from "lucide-react"

import { SupplierComboBox } from "@/components/marker-ofek/items/supplier-combobox"
import type {
  ItemEditFormValues,
  SupplierLookupOption,
} from "@/components/marker-ofek/items/item-edit-form-types"
import type { ItemResolvedPricing } from "@/components/marker-ofek/items/master-item-card-modern"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"

// ============================================================================
// Types
// ============================================================================

// Phase 7.14.3 — DTO֧ של שורה מאוחדת מה-endpoint החדש.
// מקביל את שני המקורות ומציין sources[] לראות מאיפה הגיעה השורה.
type UnifiedSupplierRow = {
  rowKey: string
  sources: Array<"pricing" | "mapping">
  supplierId: string
  supplierName: string | null
  supplierSku: string
  supplierItemId: string | null
  mappingId: string | null
  unitPrice: number | null
  netUnitPrice: number | null
  basePrice: number | null
  discountPercentage: number | null
  currency: string | null
  isPreferred: boolean | null
  supplierDescription: string | null
  confidence: number | null
  matchedByAi: boolean
  verifiedByUser: boolean
  sourceType: string | null
  sourceReference: string | null
  modelProvider: string | null
  modelName: string | null
  uom: string | null
  minQty: number | null
  leadTimeDays: number | null
  validFrom: string | null
  validTo: string | null
  isActive: boolean
  createdAt: string | null
}

const SOURCE_TYPE_LABEL: Record<string, string> = {
  SUPPLIER_CATALOG: "קטלוג ספק",
  INVOICE_OCR: "OCR מחשבונית",
  MANUAL_ENTRY: "הוזן ידנית",
  HISTORICAL_PURCHASE: "רכישה היסטורית",
  RFQ_RESPONSE: "מענה ל-RFQ",
}

const numberFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
})

function formatDate(value: string | null): string | null {
  if (!value) return null
  try {
    return dateFormatter.format(new Date(value))
  } catch {
    return value
  }
}

function confidenceTier(c: number | null): "A" | "B" | "C" | null {
  if (c == null) return null
  if (c >= 0.9) return "A"
  if (c >= 0.7) return "B"
  return "C"
}

const TIER_COLOR: Record<"A" | "B" | "C", string> = {
  A: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800",
  B: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  C: "border-rose-500/40 bg-rose-500/10 text-rose-800",
}

const TIER_LABEL: Record<"A" | "B" | "C", string> = {
  A: "Tier A — אוטומטי",
  B: "Tier B — לסקירה",
  C: "Tier C — נמוך",
}

// ============================================================================
// ResolvedPricingSummary — סקציית תמחור פתור (Phase 7.14.2.4)
// ============================================================================

function ResolvedPricingSummary({
  pricing,
}: {
  pricing: ItemResolvedPricing | null
}) {
  if (!pricing) return null
  const noPrice = pricing.resolvedPriceSource === "none"
  const isPreferred = pricing.resolvedPriceSource === "preferred"
  const isPremium = isPreferred && pricing.preferredIsOptimal === false

  return (
    <section
      className={cn(
        "rounded-lg border bg-card p-4",
        isPremium
          ? "border-amber-500/40 bg-amber-500/5"
          : noPrice
            ? "border-dashed border-border"
            : "border-border"
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Banknote className="size-4 text-muted-foreground" aria-hidden />
            <h3 className="text-sm font-semibold">תמחור פתור</h3>
            {!noPrice ? (
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 text-[10px]",
                  isPreferred
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                )}
              >
                {isPreferred ? (
                  <>
                    <Star className="size-2.5 fill-current" aria-hidden />
                    מהמועדף
                  </>
                ) : (
                  <>
                    <TrendingDown className="size-2.5" aria-hidden />
                    מהזול ביותר
                  </>
                )}
              </Badge>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            מחיר הרכש הנגזר אוטומטית לפי הכלל: עדיפות לספק המועדף אם יש לו מיפוי פעיל, אחרת —
            הספק הזול ביותר מתוך המיפויים הפעילים.
          </p>
        </div>
        {!noPrice ? (
          <div className="text-end md:min-w-[10rem]">
            <p className="font-currency-mono text-2xl font-bold tabular-nums leading-none">
              {formatPrice(pricing.resolvedUnitPrice, pricing.resolvedCurrency)}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {pricing.activeSupplierCount} ספקים פעילים
            </p>
          </div>
        ) : null}
      </div>

      {noPrice ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">אין מחיר פתור</p>
            <p>
              {pricing.activeSupplierCount === 0
                ? "לא הוגדרו מיפויי ספק פעילים לפריט הזה. הוסף מיפוי (טבלת המיפויים למטה) כדי לקבל מחיר פתור."
                : "המיפויים הקיימים הם ללא מחיר תקף (הסתיימו/טרם התחילו)."}
            </p>
          </div>
        </div>
      ) : isPremium ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50/60 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium">הספק המועדף אינו הזול ביותר</p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide opacity-70">מועדף</p>
                <p className="font-currency-mono font-semibold tabular-nums">
                  {formatPrice(pricing.preferredUnitPrice, pricing.preferredCurrency)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide opacity-70">זול ביותר</p>
                <p className="font-currency-mono font-semibold tabular-nums">
                  {formatPrice(pricing.cheapestUnitPrice, pricing.cheapestCurrency)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide opacity-70">הפרש</p>
                <p className="font-currency-mono font-semibold tabular-nums">
                  +{formatPrice(pricing.preferredPremium, pricing.resolvedCurrency)}
                </p>
              </div>
            </div>
            <p className="text-[11px] opacity-80">
              המחיר ממשיך להיגזר מהמועדף (מדיניות עסקית). למעבר למחיר הזול — הסר את
              הספק המועדף או הגדר מחדש את המועדף.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  )
}

// ============================================================================
// Main
// ============================================================================

/**
 * ItemSupplierMappingsTab
 *
 * Phase 7.13.3.B — התחילה כתצוגת מיפויים לבד.
 * Phase 7.14.1 — הורחב לסקציית "ספק מועדף" בראש הטאב.
 *   • משתמש ב-`useFormContext` מה-RHF הגלובלי של כרטיס הפריט.
 *   • Save מתבצע דרך כפתור השמירה הגלובלי ב-Header (PUT ל-`/api/master-data/items/[id]`).
 *   • Warning אם הספק המועדף אינו תחת מיפוי פעיל לפריט — זה לא חוסם, המשתמש יכול
 *     להגדיר מראש ולהוסיף מיפוי אח"כ, אבל זה signal שהטיפול במחיר יהיה מגבלה ללא supplier-item.
 */
export interface ItemSupplierMappingsTabProps {
  itemId: string
  /** Phase 7.14.1: רשימת כל הספקים בחברה (ללא תלות במיפויי הפריט). */
  suppliers?: SupplierLookupOption[]
  /** Phase 7.14.1: סטטוס טעינת רשימת הספקים — אם loading, ה-combobox משבת ומציג spinner. */
  suppliersLoading?: boolean
  /** Phase 7.14.2: נתוני תמחור פתור (מועדף או זול ביותר). null — לא נטען. */
  pricing?: ItemResolvedPricing | null
}

// Phase 7.14.2: פורמטור מטבע דינמי לסקציית התמחור.
function formatPrice(value: number | null, currency: string | null): string {
  if (value == null) return "—"
  const cur = currency ?? "ILS"
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ${cur}`
  }
}

export function ItemSupplierMappingsTab({
  itemId,
  suppliers = [],
  suppliersLoading = false,
  pricing = null,
}: ItemSupplierMappingsTabProps) {
  const [rows, setRows] = React.useState<UnifiedSupplierRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [includeHistory, setIncludeHistory] = React.useState(false)

  // Phase 7.14.1: אינטגרציה ל-RHF מה ה-Header של הכרטיס.
  // ה-Provider לעולם חי ב-MasterItemCardModern, אז useFormContext תמיד מחזיר גישה אמיתית.
  const formCtx = useFormContext<ItemEditFormValues>()
  const preferredSupplierId = formCtx.watch("preferredSupplierId") ?? ""

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        // Phase 7.14.3: endpoint המאוחד מחליף את הישן `/supplier-mappings` (המקורי נשמר לתאימות לאחור).
        const url = `/api/master-data/items/${encodeURIComponent(itemId)}/suppliers${
          includeHistory ? "?includeHistory=1" : ""
        }`
        const result = await masterDataFetch<UnifiedSupplierRow[]>(url)
        if (!cancelled) setRows(result)
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "טעינת ספקים נכשלה")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [itemId, includeHistory])

  // Phase 7.14.3: האם הספק המועדף מופיע כשורה עם pricing פעיל?
  // משמש להצגת אזהרה למשתמש — גזירת מחיר פתור דורשת רשומת pricing פעילה (לא רק mapping).
  const preferredHasMapping = React.useMemo(() => {
    if (!preferredSupplierId) return true
    return rows.some(
      (r) => r.supplierId === preferredSupplierId && r.sources.includes("pricing") && r.isActive
    )
  }, [rows, preferredSupplierId])

  return (
    <div className="space-y-4">
      {/* ├─ Phase 7.14.1: סקציית ספק מועדף ──────────────────────────────────*/}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Star
                className="size-4 fill-amber-400 text-amber-500"
                aria-hidden
              />
              <h3 className="text-sm font-semibold">ספק מועדף</h3>
              {preferredSupplierId ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400"
                >
                  מוגדר
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  לא מוגדר — מחיר נגזר מהזול ביותר
                </Badge>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              הספק המועדף שלט בגזירת המחיר להזמנות רכש חדשות. אם לא
              מוגדר — המערכת תיגזור אוטומטית מהספק הזול ביותר במיפויים הפעילים.
            </p>
          </div>
          <div className="w-full md:w-80">
            <SupplierComboBox
              value={preferredSupplierId}
              onChange={(next) =>
                formCtx.setValue("preferredSupplierId", next, {
                  shouldDirty: true,
                  shouldTouch: true,
                })
              }
              options={suppliers}
              loading={suppliersLoading}
              placeholder="בחר ספק מועדף…"
            />
          </div>
        </div>
        {preferredSupplierId && !preferredHasMapping ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <div className="space-y-0.5">
              <p className="font-medium">
                לספק הנבחר אין מיפוי פעיל לפריט הזה.
              </p>
              <p>
                גזירת מחיר אוטומטית תהיה זמינה רק לאחר שיותוסף מיפוי
                Master ↔ Supplier (מתוך OCR או הזנה ידנית מטבלת `erp_md_supplier_items`).
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {/* ├─ Phase 7.14.2: תמחור פתור ───────────────────────────────────────────────────*/}
      <ResolvedPricingSummary pricing={pricing} />

      {/* ├─ טבלת ספקי הפריט (מאוחדת) ────────────────────────*/}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold">ספקי הפריט</h3>
          <p className="text-xs text-muted-foreground">
            כל הספקים שמוכרים את הפריט הזה — עם מחיר + המיפוי הסמנטי באותה טבלה. בסיס
            ל-Cross-Supplier Optimizer.
          </p>
        </div>
        <Label className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox
            checked={includeHistory}
            onCheckedChange={(v) => setIncludeHistory(Boolean(v))}
          />
          <History className="size-3.5" aria-hidden />
          כולל היסטוריה (לא-פעילים)
        </Label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/10 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          טוען…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="size-4" aria-hidden />
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/10 p-10 text-center">
          <ShieldQuestion className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">אין ספקים לפריט הזה</p>
          <p className="max-w-md text-xs text-muted-foreground">
            ה-Semantic Matcher (Phase 7.10.1) ימפה ספקים אוטומטית כשתעלה
            חשבוניות / הצעות מחיר. ניתן גם להוסיף ידנית ממסך הספקים.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-start">ספק</TableHead>
                <TableHead className="text-start">מק&quot;ט ספק</TableHead>
                <TableHead className="text-start">תיאור</TableHead>
                <TableHead className="text-end">מחיר</TableHead>
                <TableHead className="text-start">UoM</TableHead>
                <TableHead className="text-end">מינ&apos; כמות</TableHead>
                <TableHead className="text-end">Lead</TableHead>
                <TableHead className="text-start">מקורות</TableHead>
                <TableHead className="text-start">תוקף</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <UnifiedRow
                  key={r.rowKey}
                  row={r}
                  isPreferredSupplier={r.supplierId === preferredSupplierId}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// UnifiedRow — שורה מאוחדת פר-ספק (Phase 7.14.3)
// ============================================================================

function UnifiedRow({
  row,
  isPreferredSupplier = false,
}: {
  row: UnifiedSupplierRow
  /** האם זה הספק המועדף על הפריט (מתוך ה-form הגלובלי). שונה מ-row.isPreferred שהוא flag סקטוריאלי על ה-pricing row. */
  isPreferredSupplier?: boolean
}) {
  const tier = confidenceTier(row.confidence)
  const hasPricing = row.sources.includes("pricing")
  const hasMapping = row.sources.includes("mapping")
  const isExpired = !row.isActive
  const validFromText = formatDate(row.validFrom)
  const validToText = formatDate(row.validTo)

  // המחיר לתצוגה: net_unit_price אם יש, אחרת unitPrice (fallback מ-mapping).
  const displayPrice = row.netUnitPrice ?? row.unitPrice
  const priceTooltipParts: string[] = []
  if (row.basePrice != null) {
    priceTooltipParts.push(`בסיס: ${numberFormatter.format(row.basePrice)}`)
  }
  if (row.discountPercentage != null && row.discountPercentage > 0) {
    priceTooltipParts.push(`הנחה: ${row.discountPercentage}%`)
  }

  return (
    <TableRow
      className={cn(
        isExpired && "opacity-60",
        isPreferredSupplier && "bg-amber-500/10 hover:bg-amber-500/15"
      )}
    >
      <TableCell>
        <div className="flex items-center gap-2">
          {isPreferredSupplier ? (
            <Star
              className="size-3.5 fill-amber-400 text-amber-500"
              aria-hidden
              aria-label="ספק מועדף"
            />
          ) : null}
          <span className="truncate font-medium">
            {row.supplierName ?? `#${row.supplierId.slice(0, 8)}`}
          </span>
          {row.verifiedByUser ? (
            <ShieldCheck
              className="size-3.5 text-emerald-600"
              aria-hidden
              aria-label="מאומת עב&quot;י משתמש"
            />
          ) : row.matchedByAi ? (
            <Bot
              className="size-3.5 text-violet-600"
              aria-hidden
              aria-label="מופק עב&quot;י AI"
            />
          ) : null}
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs">{row.supplierSku || "—"}</TableCell>
      <TableCell className="max-w-[24ch] truncate text-xs text-muted-foreground">
        {row.supplierDescription ?? "—"}
      </TableCell>
      <TableCell className="text-end font-mono tabular-nums">
        {displayPrice != null ? (
          <span title={priceTooltipParts.join(" · ") || undefined}>
            {numberFormatter.format(displayPrice)}{" "}
            <span className="text-xs text-muted-foreground">
              {row.currency ?? "ILS"}
            </span>
          </span>
        ) : (
          <span
            className="text-xs text-muted-foreground"
            title="הספק ממופה סמנטית (AI) אבל ללא רשומת מחיר פעילה"
          >
            —
          </span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {row.uom ?? "—"}
      </TableCell>
      <TableCell className="text-end font-mono tabular-nums text-xs">
        {row.minQty != null ? row.minQty : "—"}
      </TableCell>
      <TableCell className="text-end font-mono tabular-nums text-xs">
        {row.leadTimeDays != null ? `${row.leadTimeDays}d` : "—"}
      </TableCell>
      <TableCell>
        {/* ג'יפ אחד משלב sources + tier: “מחיר + AI” / “רק מחיר” / “רק מיפוי” + Tier badge לצדו. */}
        <div className="flex flex-wrap items-center gap-1">
          {hasPricing && hasMapping ? (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
              title="קיים מחיר פעיל גם מיפוי AI — המצב הבריא"
            >
              מחיר + AI
            </Badge>
          ) : hasPricing ? (
            <Badge
              variant="outline"
              className="gap-1 border-sky-500/40 bg-sky-500/10 text-[10px] text-sky-700 dark:text-sky-300"
              title="מחיר מבוסס OCR/הזנה ידנית בלי מיפוי AI"
            >
              רק מחיר
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400"
              title="ה-AI מיפה את הספק לפריט אבל אין עדיין מחיר פעיל — הוסף מחיר ידנית או העלה חשבונית"
            >
              רק מיפוי
            </Badge>
          )}
          {tier ? (
            <Badge
              variant="outline"
              className={cn("gap-1 font-mono text-[10px]", TIER_COLOR[tier])}
              title={TIER_LABEL[tier]}
            >
              {tier}
              <span className="font-normal opacity-60">
                {(row.confidence! * 100).toFixed(0)}%
              </span>
            </Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        {row.sourceType ? (
          <span className="inline-flex items-center gap-1 text-xs">
            {SOURCE_TYPE_LABEL[row.sourceType] ?? row.sourceType}
            {row.sourceReference?.startsWith("http") ? (
              <a
                href={row.sourceReference}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
                title={row.sourceReference}
              >
                <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {validFromText ?? "—"}
        {validToText ? (
          <>
            <span className="mx-1">→</span>
            {validToText}
          </>
        ) : null}
      </TableCell>
    </TableRow>
  )
}
