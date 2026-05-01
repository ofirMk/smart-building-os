"use client"

/**
 * MasterItemCardOnePage — Phase 7.13.4 גרסה C (Single-Page Scroll).
 *
 * המוטיבציה:
 *   במקום טאבים, חושפים את כל הסקציות בו-זמנית בעמוד אחד עם sticky-nav צד.
 *   טוב ל-audit, להדפסה/PDF, ולסקירת פריט מהירה ללא קליקים. פחות טוב
 *   לדאטה-אנטרי כבד עם הרבה שדות כי הדף הופך ארוך.
 *
 * שיתוף קוד:
 *   הקומפוננטה משתמשת בדיוק באותם 3 הטאבים-editable של גרסה B
 *   (`ItemGeneralTab`, `ItemLogisticsTab`, `ItemPricingTab`) ובאותו
 *   FormProvider — רק שעוטפת אותם כסקציות במקום TabsContent.
 *   הסקציות read-only (assets / mappings / history) רעוננות ב-state-loading.
 */

import * as React from "react"
import { FormProvider, useForm } from "react-hook-form"
import {
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

import { ErpMasterDetailBreadcrumbs } from "@/components/marker-ofek/data-grid/erp-master-detail-layout"
import { ItemAssetsTab } from "@/components/marker-ofek/items/item-assets-tab"
import {
  type ItemEditFormValues,
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
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn, formatError } from "@/lib/utils"

// ============================================================================
// Types — DTO של פריט מלא לפי /api/master-data/items/[id] (Phase 7.13.4).
// ============================================================================

interface ItemDto {
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
}

interface SupplierItemDtoRaw {
  id: string
  supplierId: string
  supplierSku: string | null
  basePrice: number
  discountPercentage: number
  aiLastParsedAt: string | null
  validFrom: string | null
}

export interface MasterItemCardOnePageProps {
  itemId: string
}

interface SectionDef {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const SECTIONS: SectionDef[] = [
  { id: "general", label: "כללי", icon: Package },
  { id: "logistics", label: "לוגיסטיקה ומלאי", icon: Warehouse },
  { id: "pricing", label: "מחירים", icon: Banknote },
  { id: "assets", label: "נכסים וקבצים", icon: FileStack },
  { id: "mappings", label: "מיפויי ספקים", icon: ShoppingBag },
  { id: "history", label: "היסטוריית רכש", icon: History },
]

// ============================================================================
// Helpers (משוכפלים מקומית — אותו מבנה כמו modern, כדי לשמור על הקומפוננטה
// self-contained ולא לתלות בייצוא של helpers).
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

export function MasterItemCardOnePage({ itemId }: MasterItemCardOnePageProps) {
  const id = itemId

  const [item, setItem] = React.useState<ItemDto | null>(null)
  const [uoms, setUoms] = React.useState<UomLookupOption[]>([])
  const [legacySuppliers, setLegacySuppliers] = React.useState<
    LegacySupplierPriceRow[]
  >([])
  const [loading, setLoading] = React.useState(true)
  const [uomsLoading, setUomsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [activeSection, setActiveSection] = React.useState<string>("general")

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
            masterDataFetch<Array<{ id: string; name: string }>>(
              "/api/erp/master-data/suppliers"
            ).catch(() => [] as Array<{ id: string; name: string }>),
          ])
        if (cancelled) return
        const supplierMap = new Map(supplierRows.map((s) => [s.id, s.name]))
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
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id, reset])

  // IntersectionObserver לזיהוי הסקציה הפעילה ב-sticky-nav.
  React.useEffect(() => {
    if (loading || !item) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActiveSection(visible.target.id)
      },
      { rootMargin: "-30% 0px -50% 0px", threshold: [0, 0.25, 0.5, 1] }
    )
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [loading, item])

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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 py-6">
        <ErpMasterDetailBreadcrumbs
          items={[
            { label: "מרקר אופק", href: "/marker-ofek" },
            { label: "נתוני אב", href: "/marker-ofek/master-data" },
            { label: "קטלוג פריטים", href: "/marker-ofek/items" },
            { label: "שגיאה" },
          ]}
        />
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
        className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-12"
      >
        <ErpMasterDetailBreadcrumbs
          items={[
            { label: "מרקר אופק", href: "/marker-ofek" },
            { label: "נתוני אב", href: "/marker-ofek/master-data" },
            { label: "קטלוג פריטים", href: "/marker-ofek/items" },
            { label: item.sku },
          ]}
        />

        {/* Header */}
        <header className="rounded-2xl border border-border/70 bg-card/60 p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
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
              <div className="min-w-0 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  מאסטר SKU
                </p>
                <h1 className="font-mono text-2xl font-bold tracking-tight md:text-3xl">
                  {item.sku}
                </h1>
                <p className="text-base leading-relaxed text-foreground">
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
          </div>
        </header>

        {/* Two-column layout: sticky nav + scrollable sections */}
        <div className="grid gap-6 md:grid-cols-[200px_1fr]">
          {/* Sticky side-nav */}
          <nav
            aria-label="ניווט סקציות פריט"
            className="sticky top-32 hidden h-fit flex-col gap-1 md:flex"
          >
            {SECTIONS.map((s) => {
              const Icon = s.icon
              const isActive = activeSection === s.id
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault()
                    document
                      .getElementById(s.id)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    setActiveSection(s.id)
                  }}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {s.label}
                </a>
              )
            })}
          </nav>

          {/* Scrollable sections — scroll-margin-top מבטיח שהעוגן לא ייגזר ע״י ה-sticky banner */}
          <div className="flex flex-col gap-10">
            <Section id="general" label="כללי">
              <ItemGeneralTab />
            </Section>

            <Section id="logistics" label="לוגיסטיקה ומלאי">
              <ItemLogisticsTab
                uoms={uoms}
                baseUom={item.unitOfMeasure}
                uomsLoading={uomsLoading}
              />
            </Section>

            <Section id="pricing" label="מחירים">
              <ItemPricingTab legacySuppliers={legacySuppliers} />
            </Section>

            <Section id="assets" label="נכסים וקבצים">
              <ItemAssetsTab itemId={id} />
            </Section>

            <Section id="mappings" label="מיפויי ספקים">
              <ItemSupplierMappingsTab itemId={id} />
            </Section>

            <Section id="history" label="היסטוריית רכש">
              <ItemPurchaseHistoryTab itemId={id} />
            </Section>
          </div>
        </div>
      </form>
    </FormProvider>
  )
}

// ============================================================================
// Section — wrapper לסקציה בודדת.
// ============================================================================

function Section({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      style={{ scrollMarginTop: "8rem" }}
      className="space-y-3 border-t border-dashed border-border/40 pt-6 first:border-t-0 first:pt-0"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
        {label}
      </h2>
      {children}
    </section>
  )
}
