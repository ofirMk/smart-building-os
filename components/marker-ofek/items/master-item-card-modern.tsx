"use client"

/**
 * MasterItemCardModern — Phase 7.13.4 (extracted from [id]/page.tsx)
 *
 * הקומפוננטה מציגה כרטיס פריט מלא במבנה "טאבים מודרני":
 *   • Header עם תמונה + SKU + תיאור + Save/Reset.
 *   • 6 טאבים — 3 editable (כללי, לוגיסטיקה, מחירים) + 3 read-only (נכסים,
 *     מיפויי ספקים, היסטוריית רכש).
 *   • RHF FormProvider — שיתוף מצב טופס בין הטאבים.
 *
 * `topSlot` — אופציונלי, מאפשר להזריק banner של בחירת-גרסה מעל הכרטיס,
 *             כשהקומפוננטה משמשת ב-routes ההשוואה (v1/v2/v3).
 */

import * as React from "react"
import Link from "next/link"
import { FormProvider, useForm } from "react-hook-form"
import {
  ArrowRight,
  Banknote,
  FileStack,
  History,
  Loader2,
  Package,
  Save,
  ShoppingBag,
  Warehouse,
} from "lucide-react"
import { toast } from "sonner"

import { ItemAssetsTab } from "@/components/marker-ofek/items/item-assets-tab"
import {
  type ItemEditFormValues,
  type SupplierLookupOption,
  type UomLookupOption,
} from "@/components/marker-ofek/items/item-edit-form-types"
import { ItemGeneralTab } from "@/components/marker-ofek/items/item-general-tab"
import { ItemImageHeader } from "@/components/marker-ofek/items/item-image-header"
import { ItemLogisticsTab } from "@/components/marker-ofek/items/item-logistics-tab"
import {
  ItemPricingTab,
  type LegacySupplierPriceRow,
} from "@/components/marker-ofek/items/item-pricing-tab"
import { ItemPurchaseHistoryTab } from "@/components/marker-ofek/items/item-purchase-history-tab"
import { ItemSupplierMappingsTab } from "@/components/marker-ofek/items/item-supplier-mappings-tab"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MasterDetailShell } from "@/components/infrastructure/master-detail/master-detail-shell"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn, formatError } from "@/lib/utils"

// ============================================================================
// DTO types — matches /api/master-data/items/[id] GET response (Phase 7.13.4).
// ============================================================================

export interface ItemDto {
  id: string
  sku: string
  itemNumber: string
  description: string
  foreignDescription: string | null
  descriptionEn: string | null
  uom: string | null
  unitOfMeasure: string | null
  uomDescription: string | null
  productFamilyId: string | null
  isInventoryManaged: boolean
  status: string
  minOrderQuantity: number
  itemType: string | null
  // ── Phase 7.13.4 ──
  barcode: string | null
  isSerialTracked: boolean
  standardCost: number | null
  purchasingUom: string | null
  purchasingUomDescription: string | null
  imageUrl: string | null
  // Legacy / pricing
  legacyDefaultPrice: number | null
  defaultPrice: number | null
  factoryUom: string | null
  conversionFactor: number | null
  preferredSupplierId: string | null
  // ── Phase 7.14.2 — Resolved Pricing ──
  preferredUnitPrice: number | null
  preferredCurrency: string | null
  cheapestSupplierId: string | null
  cheapestUnitPrice: number | null
  cheapestCurrency: string | null
  resolvedUnitPrice: number | null
  resolvedPriceSource: "preferred" | "cheapest" | "none"
  resolvedSupplierId: string | null
  resolvedCurrency: string | null
  preferredIsOptimal: boolean | null
  preferredPremium: number | null
  activeSupplierCount: number
}

/** Phase 7.14.2 — תת-קבוצה "pricing-only" של ItemDto, לעבירה לטאב המיפויים. */
export type ItemResolvedPricing = Pick<
  ItemDto,
  | "preferredUnitPrice"
  | "preferredCurrency"
  | "cheapestSupplierId"
  | "cheapestUnitPrice"
  | "cheapestCurrency"
  | "resolvedUnitPrice"
  | "resolvedPriceSource"
  | "resolvedSupplierId"
  | "resolvedCurrency"
  | "preferredIsOptimal"
  | "preferredPremium"
  | "activeSupplierCount"
>;

interface SupplierItemDtoRaw {
  id: string
  supplierId: string
  supplierSku: string | null
  basePrice: number
  discountPercentage: number
  aiLastParsedAt: string | null
  validFrom: string | null
}

// ============================================================================
// Helpers
// ============================================================================

function toFormDefaults(item: ItemDto): ItemEditFormValues {
  return {
    description: item.description ?? "",
    descriptionEn: item.descriptionEn ?? "",
    barcode: item.barcode ?? "",
    status:
      (item.status as ItemEditFormValues["status"] | undefined) ?? "ACTIVE",
    minOrderQuantity:
      item.minOrderQuantity != null ? String(item.minOrderQuantity) : "1",
    isInventoryManaged: Boolean(item.isInventoryManaged),
    isSerialTracked: Boolean(item.isSerialTracked),
    purchasingUom: item.purchasingUom ?? "",
    conversionFactor:
      item.conversionFactor != null ? String(item.conversionFactor) : "1",
    standardCost:
      item.standardCost != null ? String(item.standardCost) : "",
    defaultPrice:
      item.defaultPrice != null ? String(item.defaultPrice) : "",
    // Phase 7.14.1: ספק מועדף — UUID או "".
    preferredSupplierId: item.preferredSupplierId ?? "",
    imageUrl: item.imageUrl ?? "",
  }
}

function labelForStatus(status: string): string {
  switch (status.toUpperCase()) {
    case "ACTIVE":
      return "פעיל"
    case "INACTIVE":
      return "לא פעיל"
    case "PURCHASE_ONLY":
      return "רכש בלבד"
    case "INTERNAL_ONLY":
      return "פנימי בלבד"
    case "OBSOLETE":
      return "יצא משימוש"
    default:
      return status
  }
}

// ============================================================================
// Component
// ============================================================================

export interface MasterItemCardModernProps {
  itemId: string
  /** banner אופציונלי שיוטמע מעל ה-Header (לשימוש ב-routes השוואה). */
  topSlot?: React.ReactNode
  /** הסתרת ה-link "חזרה לקטלוג" (כש-banner השוואה כבר מספק ניווט). */
  hideBackLink?: boolean
}

export function MasterItemCardModern({
  itemId,
  topSlot,
  hideBackLink = false,
}: MasterItemCardModernProps) {
  const id = itemId

  const [item, setItem] = React.useState<ItemDto | null>(null)
  const [uoms, setUoms] = React.useState<UomLookupOption[]>([])
  const [legacySuppliers, setLegacySuppliers] = React.useState<
    LegacySupplierPriceRow[]
  >([])
  // Phase 7.14.1: רשימת ספקים מלאה לבחירת ספק מועדף.
  const [suppliers, setSuppliers] = React.useState<SupplierLookupOption[]>([])
  const [suppliersLoading, setSuppliersLoading] = React.useState(true)
  const [loading, setLoading] = React.useState(true)
  const [uomsLoading, setUomsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const form = useForm<ItemEditFormValues>({
    defaultValues: {
      description: "",
      descriptionEn: "",
      barcode: "",
      status: "ACTIVE",
      minOrderQuantity: "1",
      isInventoryManaged: true,
      isSerialTracked: false,
      purchasingUom: "",
      conversionFactor: "1",
      standardCost: "",
      defaultPrice: "",
      preferredSupplierId: "",
      imageUrl: "",
    },
  })
  const { reset, handleSubmit, watch, setValue, formState } = form

  React.useEffect(() => {
    if (!id) {
      setLoading(false)
      setError("מזהה פריט חסר")
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [itemData, uomData, supplierItemsRaw, supplierRows] =
          await Promise.all([
            masterDataFetch<ItemDto>(`/api/master-data/items/${id}`),
            masterDataFetch<UomLookupOption[]>("/api/master-data/uoms").catch(
              () => [] as UomLookupOption[]
            ),
            masterDataFetch<SupplierItemDtoRaw[]>(
              `/api/erp/master-data/supplier-items?itemId=${id}`
            ).catch(() => [] as SupplierItemDtoRaw[]),
            // Phase 7.14.1: API מודרני שמחזיר גם supplierNumber, לבחירת combobox עשיר יותר.
            masterDataFetch<SupplierLookupOption[]>(
              "/api/master-data/suppliers"
            ).catch(() => [] as SupplierLookupOption[]),
          ])
        if (cancelled) return
        const supplierList: SupplierLookupOption[] = Array.isArray(supplierRows)
          ? supplierRows
          : []
        const supplierMap = new Map(supplierList.map((s) => [s.id, s.name]))
        const mappedSuppliers: LegacySupplierPriceRow[] = supplierItemsRaw.map(
          (row) => ({
            id: row.id,
            supplierName: supplierMap.get(row.supplierId) ?? "—",
            supplierSku: row.supplierSku,
            unitPrice: Number(row.basePrice ?? 0),
            discountPct: Number(row.discountPercentage ?? 0),
            lastUpdated: row.aiLastParsedAt ?? row.validFrom,
          })
        )
        setItem(itemData)
        setUoms(Array.isArray(uomData) ? uomData : [])
        setLegacySuppliers(mappedSuppliers)
        setSuppliers(supplierList)
        reset(toFormDefaults(itemData))
      } catch (e) {
        if (!cancelled) {
          setItem(null)
          setError(formatError(e) || "טעינת הפריט נכשלה")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setUomsLoading(false)
          setSuppliersLoading(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id, reset])

  const imageUrl = watch("imageUrl")

  const onSubmit = handleSubmit(async (values) => {
    if (!id) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        description: values.description.trim() || undefined,
        descriptionEn: values.descriptionEn.trim(),
        barcode: values.barcode.trim(),
        status: values.status,
        isInventoryManaged: values.isInventoryManaged,
        isSerialTracked: values.isSerialTracked,
        purchasingUom: values.purchasingUom.trim(),
        conversionFactor: values.conversionFactor.trim().replace(",", "."),
        standardCost: values.standardCost.trim()
          ? values.standardCost.trim().replace(",", ".")
          : undefined,
        defaultPrice: values.defaultPrice.trim()
          ? values.defaultPrice.trim().replace(",", ".")
          : null,
        // Phase 7.14.1: ספק מועדף — "" → null (שיחזור ל"אין מועדף").
        preferredSupplierId: values.preferredSupplierId.trim() || null,
        imageUrl: values.imageUrl.trim(),
        minOrderQuantity: values.minOrderQuantity.trim()
          ? Number(values.minOrderQuantity.trim().replace(",", "."))
          : undefined,
      }
      const updated = await masterDataFetch<ItemDto>(
        `/api/master-data/items/${id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )
      setItem(updated)
      reset(toFormDefaults(updated))
      toast.success("הפריט נשמר")
    } catch (e) {
      toast.error(formatError(e) || "שמירה נכשלה")
    } finally {
      setSaving(false)
    }
  })

  if (!id) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-center text-sm text-muted-foreground">
        קישור לא תקין.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        טוען כרטיס פריט…
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 py-10">
        {topSlot}
        {!hideBackLink ? (
          <Link
            href="/marker-ofek/items"
            className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="size-4 rotate-180" aria-hidden />
            חזרה לקטלוג
          </Link>
        ) : null}
        <p className="text-sm text-destructive">
          {error ?? "הפריט לא נמצא או שאין הרשאה."}
        </p>
      </div>
    )
  }

  const isDirty = formState.isDirty

  return (
    <FormProvider {...form}>
      <form
        onSubmit={onSubmit}
        className="flex h-full min-h-0 flex-col"
      >
        <MasterDetailShell
          activeMasterId={id}
          onActiveMasterIdChange={() => {}}
          masterContent={
            <div dir="rtl" className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
              {topSlot}
              {/* Page header — same style as items-catalog-scaffold */}
              <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
                <div className="flex flex-col gap-2">
                  {!hideBackLink ? (
                    <Link
                      href="/marker-ofek/items"
                      className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ArrowRight className="size-3 rotate-180" aria-hidden />
                      קטלוג פריטים
                    </Link>
                  ) : null}
                  <div className="flex items-start gap-4">
                    <ItemImageHeader
                      value={imageUrl}
                      onChange={(next) =>
                        setValue("imageUrl", next, {
                          shouldDirty: true,
                          shouldTouch: true,
                        })
                      }
                      sku={item.sku}
                    />
                    <div className="min-w-0 space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        מאסטר SKU
                      </p>
                      <h1 className="font-mono text-2xl font-bold tracking-tight">
                        {item.sku}
                      </h1>
                      <p className="text-sm leading-relaxed text-foreground">
                        {item.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {item.status ? (
                          <Badge variant="secondary">
                            {labelForStatus(item.status)}
                          </Badge>
                        ) : null}
                        {item.uomDescription ? (
                          <Badge variant="outline" className="gap-1">
                            <Warehouse className="size-3" aria-hidden />
                            {item.uomDescription}
                          </Badge>
                        ) : null}
                        {item.barcode ? (
                          <Badge variant="outline" className="font-mono">
                            {item.barcode}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start">
                  <Button
                    type="submit"
                    disabled={!isDirty || saving}
                    className="gap-2"
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Save className="size-4" aria-hidden />
                    )}
                    שמור שינויים
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={!isDirty || saving}
                    onClick={() => reset(toFormDefaults(item))}
                  >
                    איפוס
                  </Button>
                </div>
              </header>

              {/* KPI strip — item-specific stats, mirrors list page pattern */}
              <section
                aria-label="נתוני פריט"
                className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
              >
                <ItemKpiCard
                  title="סטטוס"
                  value={labelForStatus(item.status)}
                  tone={
                    item.status === "ACTIVE"
                      ? "success"
                      : item.status === "OBSOLETE"
                        ? "warning"
                        : "neutral"
                  }
                />
                <ItemKpiCard
                  title="מחיר נגזר"
                  value={
                    item.resolvedPriceSource !== "none" &&
                    item.resolvedUnitPrice != null
                      ? formatItemPrice(
                          item.resolvedUnitPrice,
                          item.resolvedCurrency,
                        )
                      : "—"
                  }
                  hint={
                    item.resolvedPriceSource === "preferred"
                      ? "ספק מועדף"
                      : item.resolvedPriceSource === "cheapest"
                        ? "ספק זול ביותר"
                        : "אין מיפוי ספק"
                  }
                  tone={
                    item.resolvedPriceSource !== "none" ? "success" : "warning"
                  }
                />
                <ItemKpiCard
                  title="ספקים פעילים"
                  value={`${item.activeSupplierCount}`}
                  hint={
                    item.activeSupplierCount === 0
                      ? "אין ספקים פעילים"
                      : `${item.activeSupplierCount} ספק${item.activeSupplierCount !== 1 ? "ים" : ""}`
                  }
                  tone={item.activeSupplierCount === 0 ? "warning" : "success"}
                />
                <ItemKpiCard
                  title="יח׳ מידה"
                  value={item.uomDescription ?? item.uom ?? "—"}
                  hint={
                    item.uom &&
                    item.uomDescription &&
                    item.uomDescription !== item.uom
                      ? item.uom
                      : undefined
                  }
                />
                <ItemKpiCard
                  title="כמות מינ׳"
                  value={`${item.minOrderQuantity ?? 1}`}
                  hint="מינימום לרכש"
                />
                <ItemKpiCard
                  title="ניהול מלאי"
                  value={item.isInventoryManaged ? "כן" : "לא"}
                  tone={item.isInventoryManaged ? "success" : "neutral"}
                />
              </section>
            </div>
          }
          detailTabs={[
            {
              id: "general",
              label: "כללי",
              icon: Package,
              render: () => <ItemGeneralTab />,
            },
            {
              id: "logistics",
              label: "לוגיסטיקה ומלאי",
              icon: Warehouse,
              render: () => (
                <ItemLogisticsTab
                  uoms={uoms}
                  baseUom={item.unitOfMeasure}
                  uomsLoading={uomsLoading}
                />
              ),
            },
            {
              id: "pricing",
              label: "מחירים",
              icon: Banknote,
              render: () => (
                <ItemPricingTab legacySuppliers={legacySuppliers} />
              ),
            },
            {
              id: "assets",
              label: "נכסים וקבצים",
              icon: FileStack,
              render: () => <ItemAssetsTab itemId={id} />,
            },
            {
              id: "mappings",
              label: "מיפויי ספקים",
              icon: ShoppingBag,
              render: () => (
                <ItemSupplierMappingsTab
                  itemId={id}
                  suppliers={suppliers}
                  suppliersLoading={suppliersLoading}
                  pricing={
                    item
                      ? {
                          preferredUnitPrice: item.preferredUnitPrice,
                          preferredCurrency: item.preferredCurrency,
                          cheapestSupplierId: item.cheapestSupplierId,
                          cheapestUnitPrice: item.cheapestUnitPrice,
                          cheapestCurrency: item.cheapestCurrency,
                          resolvedUnitPrice: item.resolvedUnitPrice,
                          resolvedPriceSource: item.resolvedPriceSource,
                          resolvedSupplierId: item.resolvedSupplierId,
                          resolvedCurrency: item.resolvedCurrency,
                          preferredIsOptimal: item.preferredIsOptimal,
                          preferredPremium: item.preferredPremium,
                          activeSupplierCount: item.activeSupplierCount,
                        }
                      : null
                  }
                />
              ),
            },
            {
              id: "history",
              label: "היסטוריית רכש",
              icon: History,
              render: () => <ItemPurchaseHistoryTab itemId={id} />,
            },
          ]}
          initialTabId="general"
          defaultMasterSize={38}
        />
      </form>
    </FormProvider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Local helpers (mirrors items-catalog-scaffold.tsx)
// ─────────────────────────────────────────────────────────────────────────────

function formatItemPrice(value: number | null, currency: string | null): string {
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

function ItemKpiCard({
  title,
  value,
  hint,
  tone = "neutral",
}: {
  title: string
  value: string
  hint?: string
  tone?: "neutral" | "success" | "warning"
}) {
  const valueTone =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground"

  return (
    <Card className="border-border">
      <CardHeader className="px-3 pb-1 pt-2">
        <CardTitle className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5 px-3 pb-2">
        <p className={cn("text-lg font-semibold tracking-tight", valueTone)}>
          {value}
        </p>
        {hint ? (
          <p className="line-clamp-1 text-[10px] leading-tight text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
