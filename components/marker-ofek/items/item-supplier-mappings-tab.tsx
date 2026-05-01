"use client"

/**
 * ItemSupplierMappingsTab — Phase 7.13.3.B
 *
 * חושף את `erp_md_supplier_item_mapping` עבור Master SKU. כל שורה מתארת
 * את "השפה הפרטית" של ספק לפריט הזה: ה-supplier_sku, התיאור, המחיר, ה-
 * confidence שה-AI ייצר וה-verified_by_user שלנו.
 *
 * UX:
 *   • toggle "כולל היסטוריה" (?includeHistory=1) להצגת mappings לא-פעילים.
 *   • Confidence Tier badge (A/B/C) — חופף ל-CHECK constraint:
 *     A ≥ 0.90 (auto-applied), B 0.70–0.89 (review queue), C < 0.70.
 *   • verified_by_user badge ירוק עם shield icon כשמאומת.
 *   • Lead time + min qty כעמודות נוספות לתועלת רכש.
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

type SupplierMapping = {
  id: string
  supplierId: string
  supplierName: string | null
  supplierSku: string
  supplierDescription: string | null
  unitPrice: number | null
  currency: string | null
  uom: string | null
  minQty: number | null
  leadTimeDays: number | null
  confidence: number | null
  matchedByAi: boolean
  verifiedByUser: boolean
  validFrom: string
  validTo: string | null
  sourceType: string | null
  sourceReference: string | null
  modelProvider: string | null
  modelName: string | null
  createdAt: string
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
        "rounded-lg border bg-card/50 p-4 shadow-sm",
        isPremium
          ? "border-amber-500/40 bg-amber-500/5"
          : noPrice
            ? "border-dashed border-border/70"
            : "border-border/70"
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
  const [mappings, setMappings] = React.useState<SupplierMapping[]>([])
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
        const url = `/api/master-data/items/${encodeURIComponent(itemId)}/supplier-mappings${
          includeHistory ? "?includeHistory=1" : ""
        }`
        const result = await masterDataFetch<SupplierMapping[]>(url)
        if (!cancelled) setMappings(result)
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "טעינת מיפויים נכשלה")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [itemId, includeHistory])

  // Phase 7.14.1: האם הספק המועדף מופיע גם במיפויי הפריט?
  // זה לא blocking — משמש להצגת אזהרה למשתמש שמומלץ להוסיף מיפוי (ספק-פריט מלא).
  const preferredHasMapping = React.useMemo(() => {
    if (!preferredSupplierId) return true
    return mappings.some((m) => m.supplierId === preferredSupplierId)
  }, [mappings, preferredSupplierId])

  return (
    <div className="space-y-4">
      {/* ├─ Phase 7.14.1: סקציית ספק מועדף ──────────────────────────────────*/}
      <section className="rounded-lg border border-border/70 bg-card/50 p-4 shadow-sm">
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

      {/* ├─ טבלת מיפויים ─────────────────────────────────────────────────*/}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold">מיפויי ספקים</h3>
          <p className="text-xs text-muted-foreground">
            כיצד כל ספק מסמן את הפריט הזה בקטלוג שלו. בסיס ל-Cross-Supplier
            Optimizer.
          </p>
        </div>
        <Label className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox
            checked={includeHistory}
            onCheckedChange={(v) => setIncludeHistory(Boolean(v))}
          />
          <History className="size-3.5" aria-hidden />
          כולל היסטוריה (mappings לא-פעילים)
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
      ) : mappings.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/10 p-10 text-center">
          <ShieldQuestion className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">אין מיפויי ספקים</p>
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
                <TableHead className="text-start">Confidence</TableHead>
                <TableHead className="text-start">מקור</TableHead>
                <TableHead className="text-start">תוקף</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((m) => (
                <MappingRow
                  key={m.id}
                  mapping={m}
                  isPreferred={m.supplierId === preferredSupplierId}
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
// Single row
// ============================================================================

function MappingRow({
  mapping,
  isPreferred = false,
}: {
  mapping: SupplierMapping
  /** Phase 7.14.1: מסמן את השורה במידה וזו השורה של הספק המועדף. */
  isPreferred?: boolean
}) {
  const tier = confidenceTier(mapping.confidence)
  const isExpired = mapping.validTo != null
  const validFromText = formatDate(mapping.validFrom)
  const validToText = formatDate(mapping.validTo)

  return (
    <TableRow
      className={cn(
        isExpired && "opacity-60",
        isPreferred && "bg-amber-500/10 hover:bg-amber-500/15"
      )}
    >
      <TableCell>
        <div className="flex items-center gap-2">
          {isPreferred ? (
            <Star
              className="size-3.5 fill-amber-400 text-amber-500"
              aria-hidden
              aria-label="ספק מועדף"
            />
          ) : null}
          <span className="truncate font-medium">
            {mapping.supplierName ?? `#${mapping.supplierId.slice(0, 8)}`}
          </span>
          {mapping.verifiedByUser ? (
            <ShieldCheck
              className="size-3.5 text-emerald-600"
              aria-hidden
              aria-label="מאומת עב&quot;י משתמש"
            />
          ) : mapping.matchedByAi ? (
            <Bot
              className="size-3.5 text-violet-600"
              aria-hidden
              aria-label="מופק עב&quot;י AI"
            />
          ) : null}
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs">{mapping.supplierSku}</TableCell>
      <TableCell className="max-w-[24ch] truncate text-xs text-muted-foreground">
        {mapping.supplierDescription ?? "—"}
      </TableCell>
      <TableCell className="text-end font-mono tabular-nums">
        {mapping.unitPrice != null ? (
          <>
            {numberFormatter.format(mapping.unitPrice)}{" "}
            <span className="text-xs text-muted-foreground">
              {mapping.currency ?? "ILS"}
            </span>
          </>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {mapping.uom ?? "—"}
      </TableCell>
      <TableCell className="text-end font-mono tabular-nums text-xs">
        {mapping.minQty != null ? mapping.minQty : "—"}
      </TableCell>
      <TableCell className="text-end font-mono tabular-nums text-xs">
        {mapping.leadTimeDays != null ? `${mapping.leadTimeDays}d` : "—"}
      </TableCell>
      <TableCell>
        {tier ? (
          <Badge
            variant="outline"
            className={cn("gap-1 font-mono text-xs", TIER_COLOR[tier])}
            title={TIER_LABEL[tier]}
          >
            {tier}
            <span className="font-normal opacity-60">
              {(mapping.confidence! * 100).toFixed(0)}%
            </span>
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {mapping.sourceType ? (
          <span className="inline-flex items-center gap-1 text-xs">
            {SOURCE_TYPE_LABEL[mapping.sourceType] ?? mapping.sourceType}
            {mapping.sourceReference?.startsWith("http") ? (
              <a
                href={mapping.sourceReference}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
                title={mapping.sourceReference}
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
        {validFromText}
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
