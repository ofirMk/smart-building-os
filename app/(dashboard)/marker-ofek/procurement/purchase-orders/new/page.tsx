"use client"

import Link from "next/link"
import * as React from "react"
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  ClipboardList,
  PlusCircle,
  Loader2,
  Package,
  Search,
  Sparkles,
  ShoppingCart,
  TrendingDown,
} from "lucide-react"
import { toast } from "sonner"

import {
  createPurchaseOrderFromBoq,
  type CreatePoFromBoqLine,
} from "./actions"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { F1UnifiedSearchModal } from "@/components/modals/f1-unified-search"
import { useProcurementEngine } from "@/hooks/use-procurement-engine"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"

type TenderOption = {
  id: string
  project_name_from_ai: string | null
  created_at: string
}

type BoqDbRow = {
  id: string
  isManual?: boolean
  section: string | null
  item_number: string | null
  description: string | null
  unit: string | null
  quantity: number | string | null
  estimated_cost: number | string | null
  final_price: number | string | null
}

type RowState = {
  selected: boolean
  orderQty: string
  unitPrice: string
  catalogItemId?: string
  catalogDisplay?: string
  internalSku?: string
  supplierSku?: string
  supplierId?: string
}

type CatalogItem = {
  id: string
  sku: string
  description: string
  supplierSku: string
  unit: string | null
  defaultPrice: number | null
}

type CatalogQueryRow = {
  id: string
  sku: string
  description: string
  unit: string | null
  default_price: number | null
}

type SupplierPriceRow = {
  supplierId: string
  supplierName: string
  supplierSku: string
  lastPrice: number
  dateLabel: string
}

type PendingPoSubmission = {
  tenderId: string
  supplierName: string
  lines: CreatePoFromBoqLine[]
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function parseDecimal(s: string): number {
  const n = parseFloat(String(s).replace(",", ".").trim())
  return Number.isFinite(n) ? n : 0
}

function defaultUnitPrice(row: BoqDbRow): number {
  const est = row.estimated_cost
  const fin = row.final_price
  if (est != null && est !== "" && Number.isFinite(Number(est))) {
    return Number(est)
  }
  if (fin != null && fin !== "" && Number.isFinite(Number(fin))) {
    return Number(fin)
  }
  return 0
}

function defaultQty(row: BoqDbRow): string {
  const q = row.quantity
  if (q == null || q === "") return "0"
  const n = Number(q)
  return Number.isFinite(n) ? String(n) : "0"
}

function lineDescription(row: BoqDbRow): string {
  const sec = (row.section ?? "").trim()
  const no = (row.item_number ?? "").trim()
  const desc = (row.description ?? "").trim()
  const head = [sec, no].filter(Boolean).join(" · ")
  return head ? `${head} — ${desc || "—"}` : desc || "—"
}

export default function NewPurchaseOrderFromBoqPage() {
  const [tenders, setTenders] = React.useState<TenderOption[]>([])
  const [loadingTenders, setLoadingTenders] = React.useState(true)
  const [tenderId, setTenderId] = React.useState<string>("")

  const [boqRows, setBoqRows] = React.useState<BoqDbRow[]>([])
  const [loadingBoq, setLoadingBoq] = React.useState(false)
  const [rowState, setRowState] = React.useState<Record<string, RowState>>({})

  const [supplierName, setSupplierName] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const [catalogItems, setCatalogItems] = React.useState<CatalogItem[]>([])
  const [loadingCatalog, setLoadingCatalog] = React.useState(true)
  const [catalogOpenRowId, setCatalogOpenRowId] = React.useState<string | null>(null)
  const [catalogQueryByRow, setCatalogQueryByRow] = React.useState<
    Record<string, string>
  >({})
  const [focusedRowId, setFocusedRowId] = React.useState<string | null>(null)
  const [comparisonLoading, setComparisonLoading] = React.useState(false)
  const [comparisonRows, setComparisonRows] = React.useState<SupplierPriceRow[]>([])
  const comparisonCacheRef = React.useRef<Record<string, SupplierPriceRow[]>>({})
  const [optimizationSummary, setOptimizationSummary] = React.useState<{
    ultimatePrice: number
    thresholdPrice: number
    recommendedSupplierName: string | null
    recommendedSupplierTotal: number | null
    rationale: string
  } | null>(null)
  const [isProjectModalOpen, setIsProjectModalOpen] = React.useState(false)
  const [isSupplierModalOpen, setIsSupplierModalOpen] = React.useState(false)

  const [newProjectName, setNewProjectName] = React.useState("")
  const [newProjectLocation, setNewProjectLocation] = React.useState("")
  const [newSupplierName, setNewSupplierName] = React.useState("")
  const [newSupplierHp, setNewSupplierHp] = React.useState("")
  const tenderTriggerRef = React.useRef<HTMLButtonElement | null>(null)
  const supplierInputRef = React.useRef<HTMLInputElement | null>(null)
  const [isItemModalOpen, setIsItemModalOpen] = React.useState(false)
  const [itemCreateTargetRowId, setItemCreateTargetRowId] =
    React.useState<string | null>(null)
  const [newItemName, setNewItemName] = React.useState("")
  const [newItemUnit, setNewItemUnit] = React.useState("יחידה")
  const [newItemSku, setNewItemSku] = React.useState("")
  const [isCatalogSearchModalOpen, setIsCatalogSearchModalOpen] =
    React.useState(false)
  const [catalogModalTargetRowId, setCatalogModalTargetRowId] =
    React.useState<string | null>(null)
  const [catalogModalTargetField, setCatalogModalTargetField] = React.useState<
    "sku" | "item"
  >("sku")
  const [catalogModalQuery, setCatalogModalQuery] = React.useState("")
  const [catalogModalActiveIndex, setCatalogModalActiveIndex] = React.useState(0)
  const catalogModalInputRef = React.useRef<HTMLInputElement | null>(null)
  const [isPriceWarningOpen, setIsPriceWarningOpen] = React.useState(false)
  const [pendingSubmission, setPendingSubmission] =
    React.useState<PendingPoSubmission | null>(null)
  const [priceWarningSnapshot, setPriceWarningSnapshot] = React.useState<{
    minTotal: number
    selectedTotal: number
  } | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingTenders(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from("tenders")
          .select("id, project_name_from_ai, created_at")
          .order("created_at", { ascending: false })
        if (error) throw error
        if (!cancelled) {
          setTenders((data ?? []) as TenderOption[])
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(formatError(e))
        }
      } finally {
        if (!cancelled) setLoadingTenders(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    const selectedItemIds = boqRows
      .filter((r) => rowState[r.id]?.selected)
      .map((r) => rowState[r.id]?.catalogItemId)
      .filter((id): id is string => Boolean(id))

    if (selectedItemIds.length === 0) return

    let cancelled = false
    void (async () => {
      for (const itemId of selectedItemIds) {
        if (cancelled) return
        if (comparisonCacheRef.current[itemId]) continue
        try {
          await fetchSupplierComparisonForItem(itemId)
        } catch {
          // Summary can still fallback to entered price.
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [boqRows, rowState])

  React.useEffect(() => {
    if (!isCatalogSearchModalOpen) return
    requestAnimationFrame(() => {
      catalogModalInputRef.current?.focus()
      catalogModalInputRef.current?.select()
    })
  }, [isCatalogSearchModalOpen])

  React.useEffect(() => {
    if (!tenderId) {
      setBoqRows([])
      setRowState({})
      return
    }
    let cancelled = false
    void (async () => {
      setLoadingBoq(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from("tender_boq_items")
          .select(
            "id, section, item_number, description, unit, quantity, estimated_cost, final_price"
          )
          .eq("tender_id", tenderId)
          .order("id", { ascending: true })
        if (error) throw error
        const rows = (data ?? []) as BoqDbRow[]
        if (cancelled) return
        setBoqRows(rows)
        const next: Record<string, RowState> = {}
        for (const r of rows) {
          next[r.id] = {
            selected: false,
            orderQty: defaultQty(r),
            unitPrice: String(defaultUnitPrice(r)),
          }
        }
        setRowState(next)
      } catch (e) {
        if (!cancelled) {
          toast.error(formatError(e))
          setBoqRows([])
          setRowState({})
        }
      } finally {
        if (!cancelled) setLoadingBoq(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tenderId])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingCatalog(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from("items_catalog")
          .select("id, sku, description, unit, default_price")
          .order("description", { ascending: true })
          .limit(700)
        if (error) throw error
        if (cancelled) return
        const rows = (data ?? []) as CatalogQueryRow[]
        setCatalogItems(
          rows.map((r) => ({
            id: r.id,
            sku: String(r.sku ?? ""),
            description: String(r.description ?? ""),
            supplierSku: "",
            unit: r.unit ?? null,
            defaultPrice: r.default_price == null ? null : Number(r.default_price),
          }))
        )
      } catch (e) {
        if (!cancelled) {
          toast.error(`טעינת קטלוג נכשלה: ${formatError(e)}`)
          setCatalogItems([])
        }
      } finally {
        if (!cancelled) setLoadingCatalog(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const poTotal = React.useMemo(() => {
    let s = 0
    for (const r of boqRows) {
      const st = rowState[r.id]
      if (!st?.selected) continue
      s += parseDecimal(st.orderQty) * parseDecimal(st.unitPrice)
    }
    return Math.round(s * 100) / 100
  }, [boqRows, rowState])

  const selectedRowsCount = React.useMemo(
    () => boqRows.filter((r) => rowState[r.id]?.selected).length,
    [boqRows, rowState]
  )

  const catalogModalResults = React.useMemo(() => {
    const q = catalogModalQuery.trim().toLowerCase()
    if (!q) return catalogItems.slice(0, 60)

    const score = (item: CatalogItem): number => {
      const sku = item.sku.toLowerCase()
      const supplierSku = item.supplierSku.toLowerCase()
      const itemName = item.description.toLowerCase()
      let s = 0
      if (sku.startsWith(q)) s += 120
      if (supplierSku.startsWith(q)) s += 90
      if (itemName.startsWith(q)) s += 80
      if (sku.includes(q)) s += 50
      if (supplierSku.includes(q)) s += 35
      if (itemName.includes(q)) s += 40
      return s
    }

    return catalogItems
      .map((item) => ({ item, score: score(item) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 120)
      .map((entry) => entry.item)
  }, [catalogItems, catalogModalQuery])

  const { costSummary, calculateTotals, getDeviation } = useProcurementEngine({
    boqRows,
    rowState,
    comparisonCacheRef,
    fetchSupplierComparisonForItem,
  })

  React.useEffect(() => {
    setCatalogModalActiveIndex((prev) => {
      if (catalogModalResults.length === 0) return 0
      if (prev < 0) return 0
      if (prev >= catalogModalResults.length) return catalogModalResults.length - 1
      return prev
    })
  }, [catalogModalResults])

  function setRow(id: string, patch: Partial<RowState>) {
    setRowState((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }))
  }

  function toggleAll(checked: boolean) {
    setRowState((prev) => {
      const next = { ...prev }
      for (const r of boqRows) {
        next[r.id] = { ...next[r.id], selected: checked }
      }
      return next
    })
  }

  function setCatalogQuery(rowId: string, query: string) {
    setCatalogQueryByRow((prev) => ({ ...prev, [rowId]: query }))
  }

  function catalogResults(rowId: string): CatalogItem[] {
    const q = (catalogQueryByRow[rowId] ?? "").trim().toLowerCase()
    if (!q) return catalogItems.slice(0, 12)
    return catalogItems
      .filter((it) => {
        const text = `${it.description} ${it.sku} ${it.supplierSku}`.toLowerCase()
        return text.includes(q)
      })
      .slice(0, 20)
  }

  function selectCatalogItemForRow(rowId: string, item: CatalogItem) {
    setRow(rowId, {
      catalogItemId: item.id,
      catalogDisplay: item.description,
      internalSku: item.sku,
      unitPrice:
        item.defaultPrice != null && Number.isFinite(item.defaultPrice)
          ? String(item.defaultPrice)
          : undefined,
    })
    setBoqRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              description: item.description,
              unit: item.unit ?? r.unit,
            }
          : r
      )
    )
    setCatalogQuery(rowId, `${item.description} · ${item.sku}`)
    setCatalogOpenRowId(null)
  }

  function addManualCatalogRow() {
    const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setBoqRows((prev) => [
      ...prev,
      {
        id,
        isManual: true,
        section: null,
        item_number: null,
        description: "",
        unit: "יחידה",
        quantity: 1,
        estimated_cost: null,
        final_price: null,
      },
    ])
    setRowState((prev) => ({
      ...prev,
      [id]: {
        selected: true,
        orderQty: "1",
        unitPrice: "0",
      },
    }))
    setFocusedRowId(id)
    requestAnimationFrame(() => {
      document.getElementById(`catalog-search-${id}`)?.focus()
    })
  }

  function generateInternalSkuFromName(name: string): string {
    const ascii = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 16)
    const suffix = Date.now().toString().slice(-4)
    return `MO-${ascii || "ITEM"}-${suffix}`
  }

  async function saveQuickCatalogItem() {
    const name = newItemName.trim()
    if (!name) {
      toast.error("נא להזין שם פריט")
      return
    }
    const sku = newItemSku.trim() || generateInternalSkuFromName(name)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase
        .from("items_catalog")
        .insert({
          sku,
          description: name,
          unit: newItemUnit.trim() || "יחידה",
          default_price: 0,
          is_inventory: true,
        })
        .select("id, sku, description, unit, default_price")
        .single()
      if (error || !data?.id) {
        toast.error(error?.message ?? "שמירת פריט נכשלה")
        return
      }
      const row = data as {
        id: string
        sku: string
        description: string
        unit: string | null
        default_price: number | null
      }
      const created: CatalogItem = {
        id: row.id,
        sku: row.sku,
        description: row.description,
        supplierSku: "",
        unit: row.unit ?? null,
        defaultPrice:
          row.default_price == null ? null : Number(row.default_price),
      }
      setCatalogItems((prev) => [created, ...prev])
      if (itemCreateTargetRowId) {
        selectCatalogItemForRow(itemCreateTargetRowId, created)
      }
      setIsItemModalOpen(false)
      setNewItemName("")
      setNewItemUnit("יחידה")
      setNewItemSku("")
      toast.success("הפריט נוסף לקטלוג ונבחר בשורה")
    } catch (e) {
      toast.error(formatError(e))
    }
  }

  async function fetchSupplierComparisonForItem(
    itemId: string
  ): Promise<SupplierPriceRow[]> {
    if (comparisonCacheRef.current[itemId]) {
      return comparisonCacheRef.current[itemId]!
    }
    const supabase = createSupabaseBrowserClient()

    const mapRows = (
      rows: Array<Record<string, unknown>>,
      priceKey: "last_price" | "unit_price",
      dateKey: "last_price_date" | "last_updated"
    ): SupplierPriceRow[] =>
      rows
        .map((row) => {
          const supplierId = String(row.supplier_id ?? "")
          const supplierSku = String(row.supplier_sku ?? "")
          const rawEnt = row.entities as { name?: string } | { name?: string }[] | null
          const ent = embedOne(rawEnt)
          const supplierName = String(ent?.name ?? "ספק")
          const lastPrice = Number(row[priceKey] ?? 0)
          const dateRaw = row[dateKey]
          const dateLabel =
            typeof dateRaw === "string" && dateRaw
              ? new Date(dateRaw).toLocaleDateString("he-IL")
              : "—"
          if (!supplierId || !Number.isFinite(lastPrice)) return null
          return {
            supplierId,
            supplierName,
            supplierSku,
            lastPrice,
            dateLabel,
          }
        })
        .filter((x): x is SupplierPriceRow => x != null)
        .sort((a, b) => a.lastPrice - b.lastPrice)

    const pricesRes = await supabase
      .from("supplier_item_prices")
      .select(
        "supplier_id, supplier_sku, last_price, last_price_date, entities ( name )"
      )
      .eq("master_item_id", itemId)
      .limit(60)

    let out: SupplierPriceRow[] = []
    if (!pricesRes.error && pricesRes.data && pricesRes.data.length > 0) {
      out = mapRows(
        pricesRes.data as Array<Record<string, unknown>>,
        "last_price",
        "last_price_date"
      )
    } else {
      const fallback = await supabase
        .from("supplier_items")
        .select(
          "supplier_id, supplier_sku, unit_price, last_updated, entities ( name )"
        )
        .eq("master_item_id", itemId)
        .limit(60)
      if (!fallback.error && fallback.data) {
        out = mapRows(
          fallback.data as Array<Record<string, unknown>>,
          "unit_price",
          "last_updated"
        )
      }
    }

    comparisonCacheRef.current[itemId] = out
    return out
  }

  React.useEffect(() => {
    const rowId = focusedRowId
    if (!rowId) {
      setComparisonRows([])
      return
    }
    const itemId = rowState[rowId]?.catalogItemId
    if (!itemId) {
      setComparisonRows([])
      return
    }
    let cancelled = false
    void (async () => {
      setComparisonLoading(true)
      try {
        const rows = await fetchSupplierComparisonForItem(itemId)
        if (!cancelled) setComparisonRows(rows)
      } catch (e) {
        if (!cancelled) {
          setComparisonRows([])
          toast.error(`טעינת השוואת ספקים נכשלה: ${formatError(e)}`)
        }
      } finally {
        if (!cancelled) setComparisonLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [focusedRowId, rowState])

  async function runSmartProcurementOptimization() {
    const selectedRows = boqRows.filter((r) => rowState[r.id]?.selected)
    if (selectedRows.length === 0) {
      toast.error("אין שורות מסומנות לאופטימיזציה")
      return
    }

    let ultimatePrice = 0
    const supplierTotals = new Map<
      string,
      { name: string; total: number; coverage: number }
    >()

    for (const row of selectedRows) {
      const st = rowState[row.id]
      const qty = parseDecimal(st?.orderQty ?? "0")
      if (qty <= 0) continue

      const itemId = st?.catalogItemId
      const itemRows = itemId
        ? await fetchSupplierComparisonForItem(itemId)
        : []

      if (itemRows.length === 0) {
        const fallbackUnit = parseDecimal(st?.unitPrice ?? "0")
        ultimatePrice += qty * fallbackUnit
        continue
      }

      const best = itemRows[0]!
      ultimatePrice += qty * best.lastPrice

      for (const s of itemRows) {
        const entry = supplierTotals.get(s.supplierId) ?? {
          name: s.supplierName,
          total: 0,
          coverage: 0,
        }
        entry.total += qty * s.lastPrice
        entry.coverage += 1
        supplierTotals.set(s.supplierId, entry)
      }
    }

    const itemCountForCoverage = selectedRows.filter(
      (r) => parseDecimal(rowState[r.id]?.orderQty ?? "0") > 0
    ).length

    const eligibleSingleSource = [...supplierTotals.entries()]
      .map(([supplierId, data]) => ({ supplierId, ...data }))
      .filter((s) => s.coverage >= itemCountForCoverage)
      .sort((a, b) => a.total - b.total)

    const thresholdPrice = ultimatePrice * 1.08
    const bestSingle = eligibleSingleSource[0] ?? null

    if (bestSingle && bestSingle.total <= thresholdPrice) {
      setSupplierName(bestSingle.name)
      setOptimizationSummary({
        ultimatePrice,
        thresholdPrice,
        recommendedSupplierName: bestSingle.name,
        recommendedSupplierTotal: bestSingle.total,
        rationale:
          "נמצא ספק יחיד בטווח עד 8% מהמחיר האולטימטיבי. מומלץ לרכז הזמנה.",
      })

      setRowState((prev) => {
        const next = { ...prev }
        for (const r of selectedRows) {
          const st = next[r.id]
          if (!st?.catalogItemId) continue
          const prices = comparisonCacheRef.current[st.catalogItemId] ?? []
          const chosen = prices.find((p) => p.supplierName === bestSingle.name)
          next[r.id] = {
            ...st,
            supplierId: chosen?.supplierId,
            supplierSku: chosen?.supplierSku || st.supplierSku,
          }
        }
        return next
      })

      toast.success(
        `ספק מועדף להזמנה: ${bestSingle.name} (בתוך כלל 8%)`
      )
      return
    }

    setOptimizationSummary({
      ultimatePrice,
      thresholdPrice,
      recommendedSupplierName: null,
      recommendedSupplierTotal: bestSingle?.total ?? null,
      rationale:
        "לא נמצא ספק יחיד שעומד בכלל 8%. מומלץ פיצול רכש לפי ספק מועדף לכל פריט.",
    })
    toast.message("לא נמצא ספק יחיד שעומד בכלל 8%")
  }

  function handleTenderFieldKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "F2") return
    e.preventDefault()
    setIsProjectModalOpen(true)
  }

  function handleSupplierFieldKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "F2") return
    e.preventDefault()
    setIsSupplierModalOpen(true)
  }

  function handleItemFieldKeyDown(
    e: React.KeyboardEvent,
    rowId: string
  ) {
    if (e.key === "Enter") {
      const q = (catalogQueryByRow[rowId] ?? "").trim()
      if (!q) return
      const matches = catalogResults(rowId)
      if (matches.length === 0) {
        e.preventDefault()
        setItemCreateTargetRowId(rowId)
        setNewItemName(q)
        setIsItemModalOpen(true)
      }
      return
    }
    if (e.key === "F1") {
      e.preventDefault()
      openCatalogSearchModal(
        rowId,
        "item",
        catalogQueryByRow[rowId] ?? rowState[rowId]?.catalogDisplay ?? ""
      )
      return
    }
    if (e.key === "F2") {
      e.preventDefault()
      setItemCreateTargetRowId(rowId)
      setIsItemModalOpen(true)
    }
  }

  function openCatalogSearchModal(
    rowId: string,
    targetField: "sku" | "item",
    seedQuery?: string
  ) {
    setCatalogModalTargetRowId(rowId)
    setCatalogModalTargetField(targetField)
    setFocusedRowId(rowId)
    const fallbackSeed =
      targetField === "sku"
        ? rowState[rowId]?.internalSku?.trim() || ""
        : catalogQueryByRow[rowId]?.trim() || rowState[rowId]?.catalogDisplay?.trim() || ""
    setCatalogModalQuery(seedQuery?.trim() || fallbackSeed)
    setCatalogModalActiveIndex(0)
    setIsCatalogSearchModalOpen(true)
  }

  function handleSkuFieldKeyDown(e: React.KeyboardEvent, rowId: string) {
    if (e.key !== "F1") return
    e.preventDefault()
    openCatalogSearchModal(rowId, "sku", rowState[rowId]?.internalSku ?? "")
  }

  function handleCatalogSearchModalOpenChange(open: boolean) {
    setIsCatalogSearchModalOpen(open)
    if (!open) {
      const rowId = catalogModalTargetRowId
      const targetField = catalogModalTargetField
      setCatalogModalTargetRowId(null)
      setCatalogModalTargetField("sku")
      setCatalogModalQuery("")
      setCatalogModalActiveIndex(0)
      if (rowId) {
        requestAnimationFrame(() => {
          const targetId =
            targetField === "item" ? `catalog-search-${rowId}` : `sku-search-${rowId}`
          document.getElementById(targetId)?.focus()
        })
      }
    }
  }

  function selectCatalogItemFromModal(item: CatalogItem) {
    const rowId = catalogModalTargetRowId
    if (!rowId) return
    selectCatalogItemForRow(rowId, item)
    setIsCatalogSearchModalOpen(false)
    setCatalogModalTargetRowId(null)
    setCatalogModalQuery("")
    setCatalogModalActiveIndex(0)
    requestAnimationFrame(() => {
      document.getElementById(`order-qty-${rowId}`)?.focus()
    })
  }

  function handleCatalogModalInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault()
      setIsCatalogSearchModalOpen(false)
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setCatalogModalActiveIndex((prev) =>
        Math.min(prev + 1, Math.max(0, catalogModalResults.length - 1))
      )
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setCatalogModalActiveIndex((prev) => Math.max(prev - 1, 0))
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      const selected = catalogModalResults[catalogModalActiveIndex]
      if (selected) selectCatalogItemFromModal(selected)
    }
  }

  function saveQuickProject() {
    const name = newProjectName.trim()
    if (!name) {
      toast.error("נא להזין שם פרויקט")
      return
    }
    const now = new Date().toISOString()
    const tempId = `temp-${Date.now()}`
    setTenders((prev) => [
      {
        id: tempId,
        project_name_from_ai: newProjectLocation.trim()
          ? `${name} (${newProjectLocation.trim()})`
          : name,
        created_at: now,
      },
      ...prev,
    ])
    setTenderId(tempId)
    setIsProjectModalOpen(false)
    setNewProjectName("")
    setNewProjectLocation("")
    toast.success("הפרויקט נוסף זמנית לטופס. ניתן להמשיך בהזמנה.")
  }

  function saveQuickSupplier() {
    const name = newSupplierName.trim()
    if (!name) {
      toast.error("נא להזין שם ספק")
      return
    }
    const suffix = newSupplierHp.trim() ? ` · ח.פ ${newSupplierHp.trim()}` : ""
    setSupplierName(`${name}${suffix}`)
    setIsSupplierModalOpen(false)
    setNewSupplierName("")
    setNewSupplierHp("")
    toast.success("הספק מולא בטופס הנוכחי.")
  }

  function handleProjectModalOpenChange(open: boolean) {
    setIsProjectModalOpen(open)
    if (!open) {
      requestAnimationFrame(() => {
        tenderTriggerRef.current?.focus()
      })
    }
  }

  function handleSupplierModalOpenChange(open: boolean) {
    setIsSupplierModalOpen(open)
    if (!open) {
      requestAnimationFrame(() => {
        supplierInputRef.current?.focus()
      })
    }
  }

  async function submitPurchaseOrder(payload: PendingPoSubmission) {
    setSubmitting(true)
    try {
      const res = await createPurchaseOrderFromBoq(payload)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        res.poNumber
          ? `הזמנת רכש ${res.poNumber} נוצרה ונשמרה`
          : "הזמנת רכש נוצרה ונשמרה"
      )
      if (res.ceoApprovalRequired) {
        toast.message(
          `ההזמנה נשלחה לאישור מנכ״ל (${res.priceDeviationPercent.toLocaleString(
            "he-IL",
            { minimumFractionDigits: 2, maximumFractionDigits: 2 }
          )}%)`
        )
      }
      setTenderId("")
      setSupplierName("")
      setBoqRows([])
      setRowState({})
      setPendingSubmission(null)
      setPriceWarningSnapshot(null)
      setIsPriceWarningOpen(false)
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tenderId) {
      toast.error("נא לבחור מכרז")
      return
    }
    const name = supplierName.trim()
    if (!name) {
      toast.error("נא להזין שם ספק")
      return
    }

    const lines: CreatePoFromBoqLine[] = []
    for (const r of boqRows) {
      const st = rowState[r.id]
      if (!st?.selected) continue
      const qty = parseDecimal(st.orderQty)
      const up = parseDecimal(st.unitPrice)
      if (qty <= 0) continue
        const fullDesc = st?.catalogDisplay?.trim()
          ? `${st.catalogDisplay}${st.internalSku ? ` · מק״ט פנימי: ${st.internalSku}` : ""}${
              st.supplierSku ? ` · מק״ט ספק: ${st.supplierSku}` : ""
            }`
          : lineDescription(r)
      lines.push({
        tenderBoqItemId: r.id,
        description: fullDesc,
        unit: r.unit,
        quantity: qty,
        unitPrice: up,
        catalogItemId: st?.catalogItemId ?? null,
      })
    }
    if (lines.length === 0) {
      toast.error("סמנו לפחות שורה אחת עם כמות להזמנה חיובית")
      return
    }

    const payload: PendingPoSubmission = {
      tenderId,
      supplierName: name,
      lines,
    }

    const { minTotal, selectedTotal } = await calculateTotals(lines)
    if (selectedTotal > minTotal) {
      setPendingSubmission(payload)
      setPriceWarningSnapshot({ minTotal, selectedTotal })
      setIsPriceWarningOpen(true)
      return
    }

    await submitPurchaseOrder(payload)
  }

  async function handleConfirmPriceWarning() {
    if (!pendingSubmission) {
      setIsPriceWarningOpen(false)
      return
    }
    await submitPurchaseOrder(pendingSubmission)
  }

  function handleBackToReview() {
    setIsPriceWarningOpen(false)
  }

  const deviation = getDeviation(
    priceWarningSnapshot?.selectedTotal ?? 0,
    priceWarningSnapshot?.minTotal ?? 0
  )
  const warningDiffRaw = deviation.diff
  const warningPercentRaw = deviation.percent
  const isCriticalWarning = deviation.isCritical

  const warningLevelText = isCriticalWarning ? "אזהרה קריטית" : "אזהרה מתונה"
  const warningLevelStyles = isCriticalWarning
    ? "border-red-500/35 bg-red-500/[0.08] text-red-700 dark:text-red-300"
    : "border-amber-500/35 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300"

  const warningMessage = `שים לב: הזמנה זו יקרה ב-${warningDiffRaw.toLocaleString(
    "he-IL",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  )} ש"ח (${warningPercentRaw.toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%) מהמחיר האולטימטיבי שהמערכת מצאה.`

  const selectedCount = boqRows.filter(
    (r) => rowState[r.id]?.selected
  ).length

  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-12 pt-2"
    >
      <Link
        href="/marker-ofek/procurement"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לרכש
      </Link>

      <header className="space-y-2 text-start">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            <ShoppingCart className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              מודול 2.1 · רכש
            </p>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              יצירת הזמנת רכש
            </h1>
          </div>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          בחרו פרויקט וספק, הגדירו את שורות ההזמנה והמחירים — והפיקו הזמנת רכש
          בצורה מהירה ומדויקת.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="text-start">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="size-5 text-muted-foreground" aria-hidden />
              פרטי הזמנה
            </CardTitle>
            <CardDescription>
              מקור המכרז ושם הספק (ייווצר ישות ספק אם אינו קיים בקטלוג)
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2 text-start">
              <Label htmlFor="po-tender" className="inline-flex items-center gap-2">
                <span>פרויקט / מכרז</span>
                <kbd className="mr-2 rounded border border-border/80 bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  F2
                </kbd>
              </Label>
              <Select
                value={tenderId || undefined}
                onValueChange={(v) => setTenderId(v ?? "")}
                disabled={loadingTenders}
              >
                <SelectTrigger
                  id="po-tender"
                  ref={tenderTriggerRef}
                  className="w-full"
                  onKeyDown={handleTenderFieldKeyDown}
                >
                  <SelectValue placeholder="בחרו מכרז…" />
                </SelectTrigger>
                <SelectContent>
                  {tenders.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {(t.project_name_from_ai?.trim() || "ללא שם") +
                        ` — ${new Date(t.created_at).toLocaleDateString("he-IL")}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 text-start">
              <Label htmlFor="po-supplier" className="inline-flex items-center gap-2">
                <span>שם ספק</span>
                <kbd className="mr-2 rounded border border-border/80 bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  F2
                </kbd>
              </Label>
              <Input
                id="po-supplier"
                ref={supplierInputRef}
                autoComplete="organization"
                placeholder="למשל: ספק חשמל בע״מ"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                onKeyDown={handleSupplierFieldKeyDown}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="text-start">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="size-5 text-muted-foreground" aria-hidden />
                  בחירת שורות BoQ
                </CardTitle>
                <CardDescription>
                  סמנו שורות, ערכו כמות להזמנה (ברירת מחדל: כמות ב־BoQ) ומחיר ליחידה
                  (ברירת מחדל: עלות מוערכת)
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={addManualCatalogRow}
              >
                <PlusCircle className="size-4" aria-hidden />
                הוסף פריט ידני / מהקטלוג
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!tenderId ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                בחרו מכרז כדי לטעון את כתב הכמויות
              </p>
            ) : loadingBoq ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden />
                טוען כתב כמויות…
              </div>
            ) : boqRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                אין שורות BoQ למכרז זה. ייבאו כתב כמויות במסך תמחור המכרז.
              </p>
            ) : (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="overflow-x-auto rounded-lg border border-border/60">
                  <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 p-2 text-center">
                        <Checkbox
                          checked={
                            selectedCount === boqRows.length && boqRows.length > 0
                          }
                          onCheckedChange={(v) => toggleAll(Boolean(v))}
                          aria-label="בחר הכל"
                        />
                      </TableHead>
                      <TableHead className="min-w-[260px] text-start">
                        <span className="inline-flex items-center gap-1.5">
                          פריט קטלוג / תיאור
                          <kbd className="rounded border border-border/80 bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            F1
                          </kbd>
                        </span>
                      </TableHead>
                      <TableHead className="w-44 text-start">
                        <span className="inline-flex items-center gap-1.5">
                          מק״ט פנימי / מק״ט
                          <kbd className="rounded border border-border/80 bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            F1
                          </kbd>
                        </span>
                      </TableHead>
                      <TableHead className="w-28 text-start">
                        מק״ט ספק
                      </TableHead>
                      <TableHead className="min-w-[180px] text-start">תיאור</TableHead>
                      <TableHead className="text-start">יחידה</TableHead>
                      <TableHead className="text-start">כמות BoQ</TableHead>
                      <TableHead className="w-28 text-start">
                        כמות להזמנה
                      </TableHead>
                      <TableHead className="w-32 text-start">
                        מחיר ליחידה
                      </TableHead>
                      <TableHead className="w-36 text-start">סה״כ שורה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {boqRows.map((r) => {
                      const st = rowState[r.id]
                      const sel = st?.selected ?? false
                      const qty = parseDecimal(st?.orderQty ?? "0")
                      const up = parseDecimal(st?.unitPrice ?? "0")
                      const lineTot = Math.round(qty * up * 100) / 100
                      const boqQ = defaultQty(r)
                      return (
                        <TableRow
                          key={r.id}
                          className={cn(sel && "bg-muted/30")}
                          onClick={() => setFocusedRowId(r.id)}
                          onFocusCapture={() => setFocusedRowId(r.id)}
                        >
                          <TableCell className="p-2 text-center">
                            <Checkbox
                              checked={sel}
                              onCheckedChange={(v) =>
                                setRow(r.id, { selected: Boolean(v) })
                              }
                              aria-label="בחר שורה"
                            />
                          </TableCell>
                          <TableCell className="max-w-[280px] align-top text-start text-sm">
                            <div className="relative">
                              <div className="flex items-center gap-2">
                                <Search className="size-3.5 text-muted-foreground" aria-hidden />
                                <Input
                                  id={`catalog-search-${r.id}`}
                                  className="h-8"
                                  placeholder={
                                    loadingCatalog
                                      ? "טוען קטלוג..."
                                      : "חיפוש לפי שם / מק״ט פנימי / מק״ט ספק (F1)"
                                  }
                                  value={catalogQueryByRow[r.id] ?? ""}
                                  onFocus={() => {
                                    setFocusedRowId(r.id)
                                    setCatalogOpenRowId(r.id)
                                  }}
                                  onKeyDown={(e) => handleItemFieldKeyDown(e, r.id)}
                                  onChange={(e) => {
                                    setCatalogQuery(r.id, e.target.value)
                                    setCatalogOpenRowId(r.id)
                                  }}
                                  onBlur={() => {
                                    window.setTimeout(() => {
                                      setCatalogOpenRowId((curr) =>
                                        curr === r.id ? null : curr
                                      )
                                    }, 120)
                                  }}
                                />
                              </div>
                              {catalogOpenRowId === r.id ? (
                                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
                                  {catalogResults(r.id).length === 0 ? (
                                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                      לא נמצאו פריטים תואמים
                                    </p>
                                  ) : (
                                    catalogResults(r.id).map((item) => (
                                      <button
                                        key={item.id}
                                        type="button"
                                        className="flex w-full items-start justify-between rounded px-2 py-1.5 text-start text-xs hover:bg-accent"
                                        onMouseDown={(e) => {
                                          e.preventDefault()
                                          selectCatalogItemForRow(r.id, item)
                                        }}
                                      >
                                        <span className="min-w-0 flex-1 truncate">
                                          {item.description}
                                        </span>
                                        <span className="ms-2 shrink-0 text-muted-foreground">
                                          {item.sku}
                                        </span>
                                      </button>
                                    ))
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-start">
                            <Input
                              id={`sku-search-${r.id}`}
                              className="h-8 text-xs tabular-nums"
                              placeholder="מק״ט פנימי / F1"
                              value={st?.internalSku ?? ""}
                              onFocus={() => setFocusedRowId(r.id)}
                              onChange={(e) =>
                                setRow(r.id, { internalSku: e.target.value })
                              }
                              onKeyDown={(e) => handleSkuFieldKeyDown(e, r.id)}
                            />
                          </TableCell>
                          <TableCell className="tabular-nums text-xs text-muted-foreground">
                            {st?.supplierSku?.trim() || "—"}
                          </TableCell>
                          <TableCell className="max-w-[220px] text-start text-sm">
                            {st?.catalogDisplay?.trim() || lineDescription(r)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {(r.unit ?? "—").trim() || "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {boqQ}
                          </TableCell>
                          <TableCell>
                            <Input
                              id={`order-qty-${r.id}`}
                              className="h-8 tabular-nums"
                              inputMode="decimal"
                              disabled={!sel}
                              value={st?.orderQty ?? ""}
                              onChange={(e) =>
                                setRow(r.id, { orderQty: e.target.value })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 tabular-nums"
                              inputMode="decimal"
                              disabled={!sel}
                              value={st?.unitPrice ?? ""}
                              onChange={(e) =>
                                setRow(r.id, { unitPrice: e.target.value })
                              }
                            />
                          </TableCell>
                          <TableCell className="tabular-nums font-medium">
                            {currencyFormatter.format(lineTot)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                  </Table>
                </div>

                <Card className="h-fit border-border/70 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">השוואת מחירי ספקים</CardTitle>
                    <CardDescription>
                      מתעדכן לפי השורה הפעילה בטבלה
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {comparisonLoading ? (
                      <p className="text-muted-foreground">טוען מחירי ספקים…</p>
                    ) : !focusedRowId ? (
                      <p className="text-muted-foreground">
                        בחרו/מקדו שורה לקבלת השוואת מחירים.
                      </p>
                    ) : comparisonRows.length === 0 ? (
                      <p className="text-muted-foreground">
                        אין היסטוריית מחירים לפריט זה.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {comparisonRows.map((row, idx) => (
                          <div
                            key={`${row.supplierId}-${row.supplierSku}-${idx}`}
                            className={cn(
                              "grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border px-2 py-1.5",
                              idx === 0 &&
                                "border-emerald-400/60 bg-emerald-500/[0.08]"
                            )}
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {row.supplierName}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {row.supplierSku || "ללא מק״ט ספק"}
                              </p>
                            </div>
                            <p className="text-xs tabular-nums text-muted-foreground">
                              {row.dateLabel}
                            </p>
                            <div className="text-end">
                              <p className="text-sm font-semibold tabular-nums">
                                {currencyFormatter.format(row.lastPrice)}
                              </p>
                              {idx === 0 ? (
                                <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  ספק מועדף
                                </p>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-emerald-500/25 bg-emerald-500/[0.04] shadow-sm">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-start">
              <p className="text-sm text-muted-foreground">סה״כ ערך ההזמנה</p>
              <p className="text-2xl font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
                {currencyFormatter.format(poTotal)}
              </p>
              {selectedCount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {selectedCount} שורות נבחרו
                </p>
              ) : null}
              <div className="mt-3 space-y-1 text-xs">
                <p className="text-muted-foreground">סיכום עלות (Price Guard)</p>
                <p>
                  סה״כ נבחר:{" "}
                  <span className="font-semibold tabular-nums">
                    {currencyFormatter.format(costSummary.selectedTotal)}
                  </span>
                </p>
                <p
                  className={cn(
                    "tabular-nums",
                    costSummary.potentialSavings > 0
                      ? "font-semibold text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                  )}
                >
                  חיסכון פוטנציאלי:{" "}
                  {currencyFormatter.format(costSummary.potentialSavings)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={selectedRowsCount === 0}
                onClick={() => void runSmartProcurementOptimization()}
              >
                <Sparkles className="size-4" aria-hidden />
                אופטימיזציית רכש חכמה
              </Button>
              <Button
                type="submit"
                size="lg"
                disabled={
                  submitting ||
                  !tenderId ||
                  !supplierName.trim() ||
                  selectedRowsCount === 0
                }
                className="gap-2 min-w-[200px]"
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                הפק הזמנת רכש
              </Button>
            </div>
          </CardContent>
        </Card>
        {optimizationSummary ? (
          <Card className="border-violet-500/25 bg-violet-500/[0.04] shadow-sm">
            <CardHeader className="pb-2 text-start">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="size-4 text-violet-600 dark:text-violet-400" />
                ניתוח אופטימיזציה (כלל 8%)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-start">
              <p>
                מחיר אולטימטיבי (מינימום לכל פריט):{" "}
                <span className="font-semibold tabular-nums">
                  {currencyFormatter.format(optimizationSummary.ultimatePrice)}
                </span>
              </p>
              <p>
                סף ספק יחיד (‎+8%):{" "}
                <span className="font-semibold tabular-nums">
                  {currencyFormatter.format(optimizationSummary.thresholdPrice)}
                </span>
              </p>
              <p>
                המלצה:{" "}
                <span className="font-semibold">
                  {optimizationSummary.recommendedSupplierName
                    ? `${optimizationSummary.recommendedSupplierName} (${currencyFormatter.format(
                        optimizationSummary.recommendedSupplierTotal ?? 0
                      )})`
                    : "אין ספק יחיד עומד בכלל 8%"}
                </span>
              </p>
              <p className="text-muted-foreground">{optimizationSummary.rationale}</p>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2 text-start">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="size-4 text-muted-foreground" />
              נתוני יצוא ממותג ל-PDF
            </CardTitle>
            <CardDescription>
              המבנה מוכן להפקת הזמנת רכש עם לוגו מרקר אופק, מק״ט פנימי ומק״ט ספק.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-start text-xs text-muted-foreground">
            <pre className="max-h-56 overflow-auto rounded-md border border-border/60 bg-muted/30 p-3" dir="ltr">
{JSON.stringify(
  {
    brand: {
      companyName: "מרקר אופק יזמות וביצוע",
      logoPath: "/marker-ofek-logo.png",
    },
    supplierName: supplierName.trim() || null,
    lines: boqRows
      .filter((r) => rowState[r.id]?.selected)
      .map((r) => ({
        description: rowState[r.id]?.catalogDisplay || lineDescription(r),
        internalSku: rowState[r.id]?.internalSku || null,
        supplierSku: rowState[r.id]?.supplierSku || null,
        quantity: parseDecimal(rowState[r.id]?.orderQty ?? "0"),
        unitPrice: parseDecimal(rowState[r.id]?.unitPrice ?? "0"),
      })),
  },
  null,
  2
)}
            </pre>
          </CardContent>
        </Card>
      </form>

      <F1UnifiedSearchModal
        open={isCatalogSearchModalOpen}
        query={catalogModalQuery}
        activeIndex={catalogModalActiveIndex}
        items={catalogModalResults.map((item) => ({
          id: item.id,
          sku: item.sku,
          name: item.description,
          unit: item.unit,
          lastPrice:
            comparisonCacheRef.current[item.id]?.[0]?.lastPrice ??
            item.defaultPrice ??
            null,
        }))}
        inputRef={catalogModalInputRef}
        onOpenChange={handleCatalogSearchModalOpenChange}
        onQueryChange={setCatalogModalQuery}
        onActiveIndexChange={setCatalogModalActiveIndex}
        onInputKeyDown={handleCatalogModalInputKeyDown}
        onSelect={(it) => {
          const item = catalogItems.find((x) => x.id === it.id)
          if (item) selectCatalogItemFromModal(item)
        }}
        currencyFormatter={currencyFormatter}
      />

      <Dialog open={isPriceWarningOpen} onOpenChange={setIsPriceWarningOpen}>
        <DialogContent dir="rtl" className="sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isCriticalWarning ? (
                <AlertTriangle className="size-4 text-red-600 dark:text-red-400" />
              ) : (
                <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
              )}
              Price Guard - אישור חריגה
            </DialogTitle>
            <DialogDescription>
              המערכת זיהתה שההזמנה אינה במחיר הנמוך ביותר הזמין היסטורית.
            </DialogDescription>
          </DialogHeader>
          <div className={cn("rounded-lg border p-3 text-sm", warningLevelStyles)}>
            <p className="mb-1 font-semibold">
              {isCriticalWarning ? "! " : ""}
              {warningLevelText}
            </p>
            <p>{warningMessage}</p>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              variant={isCriticalWarning ? "destructive" : "default"}
              onClick={() => void handleConfirmPriceWarning()}
            >
              אשר והמשך
            </Button>
            <Button type="button" variant="outline" onClick={handleBackToReview}>
              חזור לבדיקה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isProjectModalOpen} onOpenChange={handleProjectModalOpenChange}>
        <DialogContent dir="rtl" className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>הקמת פרויקט חדש</DialogTitle>
            <DialogDescription>
              יצירה מהירה מתוך הזמנת הרכש (F2). ניתן להשלים פרטים בהמשך.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 text-start">
              <Label htmlFor="quick-project-name">שם פרויקט</Label>
              <Input
                id="quick-project-name"
                placeholder="למשל: Rainbow Sde Dov"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </div>
            <div className="space-y-2 text-start">
              <Label htmlFor="quick-project-location">מיקום</Label>
              <Input
                id="quick-project-location"
                placeholder="עיר / כתובת"
                value={newProjectLocation}
                onChange={(e) => setNewProjectLocation(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProjectModalOpen(false)}>
              ביטול
            </Button>
            <Button onClick={saveQuickProject}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSupplierModalOpen} onOpenChange={handleSupplierModalOpenChange}>
        <DialogContent dir="rtl" className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>הקמת ספק חדש</DialogTitle>
            <DialogDescription>
              יצירה מהירה מתוך מסך ההזמנה (F2). הנתון יוזן לטופס הנוכחי.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 text-start">
              <Label htmlFor="quick-supplier-name">שם ספק</Label>
              <Input
                id="quick-supplier-name"
                placeholder="שם חברה / ספק"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
              />
            </div>
            <div className="space-y-2 text-start">
              <Label htmlFor="quick-supplier-hp">ח.פ</Label>
              <Input
                id="quick-supplier-hp"
                placeholder="מספר ח.פ"
                value={newSupplierHp}
                onChange={(e) => setNewSupplierHp(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSupplierModalOpen(false)}>
              ביטול
            </Button>
            <Button onClick={saveQuickSupplier}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isItemModalOpen}
        onOpenChange={(open) => {
          setIsItemModalOpen(open)
          if (!open && itemCreateTargetRowId) {
            requestAnimationFrame(() => {
              document
                .getElementById(`catalog-search-${itemCreateTargetRowId}`)
                ?.focus()
            })
          }
        }}
      >
        <DialogContent dir="rtl" className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>הקמת פריט חדש בקטלוג</DialogTitle>
            <DialogDescription>
              יצירה מהירה מתוך שורת ההזמנה (F2). אם מק״ט פנימי ריק, ייווצר אוטומטית.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 text-start">
              <Label htmlFor="quick-item-name">שם פריט</Label>
              <Input
                id="quick-item-name"
                placeholder="למשל: כבל הזנה 3X240"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
              />
            </div>
            <div className="space-y-2 text-start">
              <Label htmlFor="quick-item-unit">יחידת מידה</Label>
              <Select
                value={newItemUnit}
                onValueChange={(v) => setNewItemUnit(v ?? "יחידה")}
              >
                <SelectTrigger id="quick-item-unit">
                  <SelectValue placeholder="בחרו יחידה" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="מ'">מ'</SelectItem>
                  <SelectItem value="ק&quot;ג">ק&quot;ג</SelectItem>
                  <SelectItem value="יחידה">יחידה</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 text-start">
              <Label htmlFor="quick-item-sku">מק״ט פנימי (אופציונלי)</Label>
              <Input
                id="quick-item-sku"
                placeholder="אם ריק — ייווצר אוטומטית"
                value={newItemSku}
                onChange={(e) => setNewItemSku(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsItemModalOpen(false)}>
              ביטול
            </Button>
            <Button onClick={() => void saveQuickCatalogItem()}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
