"use client"

/**
 * MasterItemCardSplit — Phase 7.13.6 (Parent/Child Split + Right Icon Rail).
 *
 * מבנה שלושה אזורים (לפי הבקשה המדויקת של המשתמש ב-1 במאי 2026):
 *   ┌──────────────────────────────────────────────┐
 *   │ Breadcrumbs                                  │  shrink-0
 *   │ [img] SKU · desc · badges  [Reset][Save]     │  shrink-0 (header)
 *   ├────────────────────────────────────┬─────────┤
 *   │                                    │         │
 *   │  Parent panel (scroll internal)    │ Right   │
 *   │   general / logistics / pricing    │ nav     │
 *   │                                    │ rail    │  נבעוטח פנימי
 *   ├───────── drag handle ──────────────┤ (icons) │
 *   │                                    │         │
 *   │  Tabs + Child panel (scroll int.)  │         │
 *   │   mappings / assets / history      │         │
 *   │                                    │         │
 *   └────────────────────────────────────┴─────────┘
 *
 * ה-**right rail** מכיל:
 *   • 3 איקונים של סקציות האב (כללי, לוגיסטיקה, מחירים) → scroll-to
 *   • קו מפריד
 *   • 3 איקונים של טאבי הבן (ספקים, נכסים, היסטוריה) → switch activeTab
 *
 * State הפעיל במ Rail:
 *   • לסקציות: IntersectionObserver על ה-scroll-container של האב
 *   • לטאבים: משווה ל-`activeTab`
 *
 * השיפורים המצטברים (מה-iteration הקודם + החדשים):
 *   • Resizable split (drag handle, לוקאל-סטורג׳, keyboard arrows)
 *   • Collapse bottom (מצב פוקוס עריכה)
 *   • Ctrl/Cmd+S שמירה
 *   • Dirty indicator בכותרת
 *   • Persistent tab selection
 *   • Scrollbar gutter stable
 *   • Active-section highlighting ב-rail (Scroll-spy)
 *   • Scroll-to-section בקליק על rail
 *   • כפתורים ב-rail עם focus-visible + aria-current + role=tablist semantics
 *
 * חוזה מול ה-DashboardShell: הדף חייב להיות `flex-1 min-h-0 overflow-hidden`
 * כי ה-main שומר על invariant של "גלילה פנימית".
 */

import * as React from "react"
import { FormProvider, useForm } from "react-hook-form"
import {
  Banknote,
  Barcode,
  ChevronDown,
  ChevronUp,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn, formatError } from "@/lib/utils"

// ============================================================================
// Types
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
  barcode: string | null
  isSerialTracked: boolean
  standardCost: number | null
  purchasingUom: string | null
  purchasingUomDescription: string | null
  imageUrl: string | null
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

export interface MasterItemCardSplitProps {
  itemId: string
}

type ParentSectionId = "general" | "logistics" | "pricing"
type ChildTabId = "mappings" | "assets" | "history"

interface RailItem {
  kind: "section" | "tab"
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const PARENT_SECTIONS: RailItem[] = [
  { kind: "section", id: "general", label: "כללי", icon: Package },
  {
    kind: "section",
    id: "logistics",
    label: "לוגיסטיקה",
    icon: Warehouse,
  },
  { kind: "section", id: "pricing", label: "מחירים", icon: Banknote },
]

const CHILD_TABS: RailItem[] = [
  { kind: "tab", id: "mappings", label: "ספקים", icon: ShoppingBag },
  { kind: "tab", id: "assets", label: "נכסים", icon: FileStack },
  { kind: "tab", id: "history", label: "היסטוריה", icon: History },
]

// תיוגים ארוכים עבור TabsTrigger בלבד (רכיב ה-rail משתמש ב-label הקצר).
const CHILD_TAB_FULL_LABEL: Record<ChildTabId, string> = {
  mappings: "מיפויי ספקים",
  assets: "נכסים וקבצים",
  history: "היסטוריית רכש",
}

// ============================================================================
// localStorage keys
// ============================================================================

const LS_TOP_PCT = "marker-ofek.items.split.top-pct"
const LS_BOTTOM_COLLAPSED = "marker-ofek.items.split.bottom-collapsed"
const LS_ACTIVE_TAB = "marker-ofek.items.split.active-tab"

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
    standardCost: item.standardCost != null ? String(item.standardCost) : "",
    defaultPrice: item.defaultPrice != null ? String(item.defaultPrice) : "",
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

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 60
  return Math.max(20, Math.min(80, v))
}

// ============================================================================
// Component
// ============================================================================

export function MasterItemCardSplit({ itemId }: MasterItemCardSplitProps) {
  const id = itemId

  // ── Data state ─────────────────────────────────────────────────────────
  const [item, setItem] = React.useState<ItemDto | null>(null)
  const [uoms, setUoms] = React.useState<UomLookupOption[]>([])
  const [legacySuppliers, setLegacySuppliers] = React.useState<
    LegacySupplierPriceRow[]
  >([])
  const [loading, setLoading] = React.useState(true)
  const [uomsLoading, setUomsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // ── Split state (persisted) ────────────────────────────────────────────
  const [topSizePct, setTopSizePct] = React.useState<number>(60)
  const [bottomCollapsed, setBottomCollapsed] = React.useState<boolean>(false)
  const [activeTab, setActiveTab] = React.useState<ChildTabId>("mappings")
  const [activeSection, setActiveSection] =
    React.useState<ParentSectionId>("general")
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    try {
      const rawPct = window.localStorage.getItem(LS_TOP_PCT)
      if (rawPct) setTopSizePct(clampPct(Number(rawPct)))
      const rawCol = window.localStorage.getItem(LS_BOTTOM_COLLAPSED)
      if (rawCol === "1") setBottomCollapsed(true)
      const rawTab = window.localStorage.getItem(LS_ACTIVE_TAB) as
        | ChildTabId
        | null
      if (rawTab && ["mappings", "assets", "history"].includes(rawTab)) {
        setActiveTab(rawTab)
      }
    } catch {
      /* localStorage unavailable */
    }
    setHydrated(true)
  }, [])

  React.useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(LS_TOP_PCT, String(Math.round(topSizePct)))
    } catch {
      /* noop */
    }
  }, [topSizePct, hydrated])

  React.useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(
        LS_BOTTOM_COLLAPSED,
        bottomCollapsed ? "1" : "0"
      )
    } catch {
      /* noop */
    }
  }, [bottomCollapsed, hydrated])

  React.useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(LS_ACTIVE_TAB, activeTab)
    } catch {
      /* noop */
    }
  }, [activeTab, hydrated])

  // ── Form ───────────────────────────────────────────────────────────────
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
  const imageUrl = watch("imageUrl")

  // ── Fetch ──────────────────────────────────────────────────────────────
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

  // ── Submit ─────────────────────────────────────────────────────────────
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

  const isDirty = formState.isDirty

  // ── Keyboard: Ctrl/Cmd+S ───────────────────────────────────────────────
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        if (isDirty && !saving) {
          void onSubmit()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isDirty, saving, onSubmit])

  // ── Drag handle ────────────────────────────────────────────────────────
  const splitRef = React.useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = React.useState(false)

  const onHandlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const container = splitRef.current
      if (!container) return

      setDragging(true)
      document.body.style.cursor = "row-resize"
      document.body.style.userSelect = "none"

      function onMove(ev: PointerEvent) {
        if (!container) return
        const rect = container.getBoundingClientRect()
        const y = ev.clientY - rect.top
        const pct = (y / rect.height) * 100
        setTopSizePct(clampPct(pct))
      }
      function onUp() {
        setDragging(false)
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    []
  )

  // ── Scroll-spy: IntersectionObserver על scroll-container של האב ───────
  const parentScrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (loading || !item) return
    const root = parentScrollRef.current
    if (!root) return

    const observer = new IntersectionObserver(
      (entries) => {
        // בוחרים את הסקציה עם ה-intersectionRatio הגבוה ביותר
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible && visible.target.id) {
          setActiveSection(visible.target.id as ParentSectionId)
        }
      },
      {
        root,
        rootMargin: "-10% 0px -60% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    )

    PARENT_SECTIONS.forEach((s) => {
      const el = document.getElementById(`parent-section-${s.id}`)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [loading, item])

  function scrollToParentSection(sectionId: ParentSectionId) {
    const el = document.getElementById(`parent-section-${sectionId}`)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "start" })
    // Optimistic highlight — observer ייעדכן בעצמו אחרי גלילה
    setActiveSection(sectionId)
  }

  // ── Early returns ──────────────────────────────────────────────────────
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

  const statusLabel = labelForStatus(item.status)

  return (
    <FormProvider {...form}>
      <form
        onSubmit={onSubmit}
        className="flex h-full min-h-0 w-full flex-col gap-2"
      >
        {/* Breadcrumbs */}
        <ErpMasterDetailBreadcrumbs
          items={[
            { label: "מרקר אופק", href: "/marker-ofek" },
            { label: "נתוני אב", href: "/marker-ofek/master-data" },
            { label: "קטלוג פריטים", href: "/marker-ofek/items" },
            { label: item.sku },
          ]}
        />

        {/* Top header — image + identity + actions. רוחב מלא, מתיישר
            לקצה הימני של rail+content (שניהם יחד = כל הרוחב). */}
        <header className="flex shrink-0 items-start gap-3 rounded-xl border border-border/70 bg-card/70 p-3 shadow-sm">
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
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                מאסטר SKU
              </span>
              <span className="font-mono text-lg font-bold tracking-tight text-foreground">
                {item.sku}
              </span>
            </div>
            <p className="line-clamp-2 text-sm leading-snug text-foreground">
              {item.description}
            </p>
            {item.descriptionEn ? (
              <p
                className="line-clamp-1 text-[12px] text-muted-foreground"
                dir="ltr"
              >
                {item.descriptionEn}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <Badge variant="secondary" className="text-[11px]">
                {statusLabel}
              </Badge>
              {item.uomDescription ? (
                <Badge variant="outline" className="gap-1 text-[11px]">
                  <Warehouse className="size-3" aria-hidden />
                  {item.uomDescription}
                </Badge>
              ) : null}
              {item.barcode ? (
                <Badge
                  variant="outline"
                  className="gap-1 font-mono text-[11px]"
                >
                  <Barcode className="size-3" aria-hidden />
                  {item.barcode}
                </Badge>
              ) : null}
              {isDirty ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-400"
                >
                  יש שינויים לא שמורים
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-1.5">
            <Button
              type="submit"
              size="sm"
              disabled={!isDirty || saving}
              className="gap-1.5"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Save className="size-3.5" aria-hidden />
              )}
              שמור
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!isDirty || saving}
              onClick={() => reset(toFormDefaults(item))}
            >
              איפוס
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setBottomCollapsed((v) => !v)}
              aria-label={
                bottomCollapsed ? "הצג פאנל ילדים" : "כווץ פאנל ילדים"
              }
              className="gap-1.5"
            >
              {bottomCollapsed ? (
                <ChevronUp className="size-3.5" aria-hidden />
              ) : (
                <ChevronDown className="size-3.5" aria-hidden />
              )}
              {bottomCollapsed ? "הצג ילדים" : "פוקוס"}
            </Button>
          </div>
        </header>

        {/* Body: 2 columns — main-split (flex-1) | right-rail (shrink-0).
            ב-RTL מיקום ויזואלי: ה-rail בצד הימני (פיקסלי), ה-main בצד שמאל. */}
        <div className="flex min-h-0 flex-1 gap-2">
          {/* Main split container (parent + child) */}
          <div
            ref={splitRef}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {/* Parent panel */}
            <div
              className={cn(
                "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40",
                dragging && "select-none"
              )}
              style={
                bottomCollapsed
                  ? { flex: "1 1 0%", minHeight: 0 }
                  : { flex: `0 0 ${topSizePct}%`, minHeight: 0 }
              }
              aria-label="נתוני אב — פריט"
            >
              <div
                ref={parentScrollRef}
                className="flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable]"
              >
                <div className="flex flex-col gap-6">
                  <ParentSection id="general" label="כללי" icon={Package}>
                    <ItemGeneralTab />
                  </ParentSection>

                  <ParentSection
                    id="logistics"
                    label="לוגיסטיקה ומלאי"
                    icon={Warehouse}
                  >
                    <ItemLogisticsTab
                      uoms={uoms}
                      baseUom={item.unitOfMeasure}
                      uomsLoading={uomsLoading}
                    />
                  </ParentSection>

                  <ParentSection id="pricing" label="מחירים" icon={Banknote}>
                    <ItemPricingTab legacySuppliers={legacySuppliers} />
                  </ParentSection>
                </div>
              </div>
            </div>

            {/* Drag handle */}
            {!bottomCollapsed ? (
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="גרור לשינוי יחס אב / ילדים"
                aria-valuemin={20}
                aria-valuemax={80}
                aria-valuenow={Math.round(topSizePct)}
                tabIndex={0}
                onPointerDown={onHandlePointerDown}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault()
                    setTopSizePct((v) => clampPct(v - 5))
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault()
                    setTopSizePct((v) => clampPct(v + 5))
                  }
                }}
                className={cn(
                  "group my-0.5 flex h-2 shrink-0 cursor-row-resize items-center justify-center rounded-full transition-colors",
                  "hover:bg-primary/5 focus-visible:bg-primary/10 focus-visible:outline-none",
                  dragging && "bg-primary/10"
                )}
              >
                <div
                  className={cn(
                    "h-1 w-20 rounded-full bg-border transition-colors",
                    "group-hover:bg-primary/50 group-focus-visible:bg-primary",
                    dragging && "bg-primary"
                  )}
                />
              </div>
            ) : null}

            {/* Child panel (tabs) */}
            {!bottomCollapsed ? (
              <div
                className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40"
                style={{
                  flex: `0 0 ${100 - topSizePct}%`,
                  minHeight: 0,
                }}
                aria-label="נתוני ילדים ונכדים — פריט"
              >
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => setActiveTab(v as ChildTabId)}
                  className="flex h-full min-h-0 flex-col gap-0"
                >
                  <div className="shrink-0 border-b border-border/70 px-3 py-1.5">
                    <TabsList variant="line" className="h-auto gap-1">
                      {CHILD_TABS.map((t) => (
                        <TabsTrigger
                          key={t.id}
                          value={t.id}
                          className="gap-1.5"
                        >
                          <t.icon className="size-3.5" aria-hidden />
                          {CHILD_TAB_FULL_LABEL[t.id as ChildTabId]}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                  <TabsContent
                    value="mappings"
                    className="min-h-0 overflow-y-auto p-4 [scrollbar-gutter:stable]"
                  >
                    <ItemSupplierMappingsTab itemId={id} />
                  </TabsContent>
                  <TabsContent
                    value="assets"
                    className="min-h-0 overflow-y-auto p-4 [scrollbar-gutter:stable]"
                  >
                    <ItemAssetsTab itemId={id} />
                  </TabsContent>
                  <TabsContent
                    value="history"
                    className="min-h-0 overflow-y-auto p-4 [scrollbar-gutter:stable]"
                  >
                    <ItemPurchaseHistoryTab itemId={id} />
                  </TabsContent>
                </Tabs>
              </div>
            ) : null}
          </div>

          {/* Right icon rail — ניווט אנכי לסקציות האב וטאבי הבן */}
          <aside
            className="flex w-16 shrink-0 flex-col items-stretch gap-1 rounded-xl border border-border/70 bg-card/60 p-1.5 shadow-sm"
            aria-label="ניווט סקציות וילדים"
          >
            {PARENT_SECTIONS.map((s) => {
              const isActive = activeSection === s.id
              return (
                <RailButton
                  key={s.id}
                  icon={s.icon}
                  label={s.label}
                  active={isActive}
                  onClick={() =>
                    scrollToParentSection(s.id as ParentSectionId)
                  }
                  tone="parent"
                />
              )
            })}
            <div className="my-1 h-px bg-border/70" role="separator" />
            {CHILD_TABS.map((t) => {
              const isActive = activeTab === t.id
              return (
                <RailButton
                  key={t.id}
                  icon={t.icon}
                  label={t.label}
                  active={isActive}
                  onClick={() => {
                    setActiveTab(t.id as ChildTabId)
                    // אם ה-bottom מכווץ — נפתח כדי שהטאב באמת יוצג
                    if (bottomCollapsed) setBottomCollapsed(false)
                  }}
                  tone="child"
                />
              )
            })}
          </aside>
        </div>
      </form>
    </FormProvider>
  )
}

// ============================================================================
// ParentSection — wrapper קומפקטי לסקציה בודדת בתוך פאנל האב.
// ה-id משתמש בתחילית `parent-section-` כדי למנוע collision עם שאר IDs
// בדף (לדוגמה IDs של inputs).
// ============================================================================

function ParentSection({
  id,
  label,
  icon: Icon,
  children,
}: {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <section
      id={`parent-section-${id}`}
      style={{ scrollMarginTop: "1rem" }}
      className="space-y-3 border-t border-dashed border-border/40 pt-5 first:border-t-0 first:pt-0"
    >
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        {label}
      </h2>
      {children}
    </section>
  )
}

// ============================================================================
// RailButton — כפתור icon+label אנכי ב-rail.
// Tone מבדיל בין קבוצת האב (primary tone) לבין קבוצת הבן (secondary tone).
// ============================================================================

function RailButton({
  icon: Icon,
  label,
  active,
  onClick,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active: boolean
  onClick: () => void
  tone: "parent" | "child"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        active
          ? tone === "parent"
            ? "bg-primary/10 text-primary"
            : "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      title={label}
    >
      <Icon
        className={cn(
          "size-4 transition-transform",
          active && "scale-110",
          !active && "group-hover:scale-105"
        )}
        aria-hidden
      />
      <span className="truncate leading-tight">{label}</span>
    </button>
  )
}
