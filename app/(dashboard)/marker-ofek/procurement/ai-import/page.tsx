"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  CheckCircle2,
  FileUp,
  Loader2,
  ScanText,
  Upload,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AiCopilotModal } from "./_components/AiCopilotModal"
import {
  completeProcurementAiCopilotSave,
  createRetroPurchaseOrderFromDeliveryScan,
  createProcurementCategory,
  listMarkerOfekProjectsForImport,
  saveSupplierInvoiceOcrImport,
  type CategoryLineResolution,
  type SaveOcrImportLineInput,
  type SaveRequiresHumanResolution,
} from "./actions"
import { DrillDownSetupBadge } from "@/components/marker-ofek/drill-down-setup-badge"
import {
  DRILL_DOWN_QUICK_SETUP_KEY,
  handleDrillDownQuickSetupKeyDown,
  PROCUREMENT_DRILLDOWN_URLS,
} from "@/lib/marker-ofek/drill-down-f2"
import { normalizeProcurementCategory } from "@/lib/marker-ofek/procurement-categories"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/format-error"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

/** תואם תשובת `/api/ocr-invoice` (Procurement Intelligence) + שדות ישנים לתאימות */
type OcrLineItem = {
  makat?: string
  original_name?: string
  normalized_name?: string
  quantity: number
  unit_of_measure?: string
  unit_price?: number
  total_line_price?: number
  category_name?: string
  additional_attributes?: Record<string, string | number | boolean | null>
  /** legacy OCR */
  name?: string
  price?: number
  unitPrice?: number
  additionalFields?: Record<string, string | number | boolean | null>
}

type OcrDocumentMetadata = {
  document_type?: string
  document_date?: string
  supplier_name?: string
}

type OcrSuccessPayload = {
  metadata?: OcrDocumentMetadata
  items: OcrLineItem[]
  meta?: { originalFileName?: string; model?: string }
}

type SupplierVerificationState = "unknown" | "known" | "new"

type ItemCatalogStatus = {
  status: "match" | "new" | "updated"
  internalSku: string | null
  trend: "up" | "down" | "flat" | null
  lastUnitPrice: number | null
}

function lineAttributes(
  row: OcrLineItem
): Record<string, string | number | boolean | null> | undefined {
  return row.additional_attributes ?? row.additionalFields
}

function coerceQuantity(row: OcrLineItem): number {
  const q = Number(row.quantity)
  return Number.isFinite(q) && q >= 0 ? q : 0
}

function coerceUnitPrice(row: OcrLineItem): number {
  const u = row.unit_price ?? row.price ?? row.unitPrice
  const n = Number(u)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function coerceLineTotal(row: OcrLineItem, qty: number, unit: number): number {
  const t = Number(row.total_line_price)
  if (Number.isFinite(t) && t >= 0) return Math.round(t * 100) / 100
  return Math.round(qty * unit * 100) / 100
}

function displayMakat(row: OcrLineItem): string {
  const s = String(row.makat ?? "").trim()
  return s && s !== "—" ? s : "—"
}

function displayOriginalName(row: OcrLineItem): string {
  const s = String(row.original_name ?? row.name ?? "").trim()
  return s || "—"
}

function displayNormalizedName(row: OcrLineItem): string {
  const s = String(
    row.normalized_name ?? row.original_name ?? row.name ?? ""
  ).trim()
  return s || "—"
}

function displayUom(row: OcrLineItem): string {
  const s = String(row.unit_of_measure ?? "").trim()
  return s || "יח"
}

function displayCategory(row: OcrLineItem): string {
  return normalizeProcurementCategory(row.category_name)
}

function upsertCategoryResolution(
  list: CategoryLineResolution[],
  entry: CategoryLineResolution
): CategoryLineResolution[] {
  const i = list.findIndex((x) => x.lineIndex === entry.lineIndex)
  if (i < 0) return [...list, entry]
  const next = [...list]
  next[i] = entry
  return next
}

function buildDocumentTitle(
  documentType: string | undefined,
  documentDate: string | undefined,
  supplierName: string | undefined
): string {
  let datePart = ""
  if (documentDate && /^\d{4}-\d{2}-\d{2}$/.test(documentDate)) {
    const [y, m, d] = documentDate.split("-")
    datePart = `${d}/${m}/${y}`
  } else if (documentDate?.trim()) {
    datePart = documentDate.trim()
  }
  const type = documentType?.trim() || "מסמך"
  const sup = supplierName?.trim() || "ספק לא ידוע"
  return datePart
    ? `${type} מתאריך ${datePart} - ${sup}`
    : `${type} - ${sup}`
}

export default function MarkerOfekAiImportPage() {
  const [dragActive, setDragActive] = React.useState(false)
  const [parsing, setParsing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  /** שורות הטבלה — מתחילות ריקות, מתמלאות רק מתשובת API מוצלחת */
  const [items, setItems] = React.useState<OcrLineItem[]>([])
  const [showPreview, setShowPreview] = React.useState(false)
  const [docMeta, setDocMeta] = React.useState<OcrDocumentMetadata>({})
  const [projectName, setProjectName] = React.useState("")
  const [profitCenterId, setProfitCenterId] = React.useState("")
  const [currency, setCurrency] = React.useState("ILS")
  const [isSaving, setIsSaving] = React.useState(false)
  const [projectOptions, setProjectOptions] = React.useState<
    Array<{ id: string; name: string; internal_project_code: string }>
  >([])
  const [categoryResolutions, setCategoryResolutions] = React.useState<
    CategoryLineResolution[]
  >([])
  const [confirmMasterLines, setConfirmMasterLines] = React.useState<number[]>(
    []
  )
  const [copilotOpen, setCopilotOpen] = React.useState(false)
  const [copilotPayload, setCopilotPayload] =
    React.useState<SaveRequiresHumanResolution | null>(null)
  const [supplierVerification, setSupplierVerification] =
    React.useState<SupplierVerificationState>("unknown")
  const [itemCatalogStatus, setItemCatalogStatus] = React.useState<
    Record<number, ItemCatalogStatus>
  >({})
  const [savedImportId, setSavedImportId] = React.useState<string | null>(null)
  const [supplierVerified, setSupplierVerified] = React.useState(false)
  const [saveSummary, setSaveSummary] = React.useState<{
    open: boolean
    invoicesSaved: number
    newItemsAdded: number
    pricesUpdated: number
    importId: string
  } | null>(null)
  const [retroPoBusy, setRetroPoBusy] = React.useState(false)
  const [directProjectPurchase, setDirectProjectPurchase] = React.useState(true)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const documentTitle = React.useMemo(
    () =>
      buildDocumentTitle(
        docMeta.document_type,
        docMeta.document_date,
        docMeta.supplier_name
      ),
    [docMeta.document_type, docMeta.document_date, docMeta.supplier_name]
  )

  const moneyFmt = React.useMemo(
    () =>
      new Intl.NumberFormat("he-IL", {
        style: "currency",
        currency: currency || "ILS",
        minimumFractionDigits: 2,
      }),
    [currency]
  )

  const isDeliveryNoteDoc = React.useMemo(() => {
    const t = `${docMeta.document_type ?? ""} ${documentTitle}`.toLowerCase()
    return (
      t.includes("delivery note") ||
      t.includes("delivery") ||
      t.includes("תעודת משלוח")
    )
  }, [docMeta.document_type, documentTitle])

  React.useEffect(() => {
    let cancelled = false
    void listMarkerOfekProjectsForImport().then((r) => {
      if (cancelled) return
      if (r.ok) {
        setProjectOptions(r.projects)
        return
      }
      console.warn("[ai-import] project list failed:", r.error)
      toast.error("לא ניתן לטעון רשימת פרויקטים — ניתן להקליד שם ידנית")
    })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!showPreview || items.length === 0) {
      setSupplierVerification("unknown")
      setItemCatalogStatus({})
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        const supplierName = (docMeta.supplier_name ?? "").trim()
        if (supplierName) {
          const { data: knownSupplier, error: supplierErr } = await supabase
            .from("entities")
            .select("id")
            .eq("type", "supplier")
            .eq("is_deleted", false)
            .ilike("name", supplierName)
            .maybeSingle()
          if (!cancelled) {
            if (!supplierErr && knownSupplier?.id) {
              setSupplierVerification("known")
            } else {
              setSupplierVerification("new")
            }
          }
        } else if (!cancelled) {
          setSupplierVerification("unknown")
        }

        const statusMap: Record<number, ItemCatalogStatus> = {}
        const makats = items
          .map((row) => String(row.makat ?? "").trim())
          .filter((x) => x && x !== "—")
        const normalizedNames = items
          .map((row) => displayNormalizedName(row))
          .filter((x) => x && x !== "—")

        const { data: itemsBySku } = makats.length
          ? await supabase
              .from("items_catalog")
              .select("id, sku, description")
              .in("sku", makats.slice(0, 500))
          : { data: [] as Array<{ id: string; sku: string; description: string | null }> }

        const { data: itemsByName } = normalizedNames.length
          ? await supabase
              .from("items_catalog")
              .select("id, sku, description")
              .in("description", normalizedNames.slice(0, 800))
          : { data: [] as Array<{ id: string; sku: string; description: string | null }> }

        const itemBySku = new Map<
          string,
          { id: string; sku: string; description: string | null }
        >()
        const itemByName = new Map<
          string,
          { id: string; sku: string; description: string | null }
        >()
        for (const row of (itemsBySku ?? []) as Array<{
          id: string
          sku: string
          description: string | null
        }>) {
          const k = String(row.sku ?? "").trim()
          if (k) itemBySku.set(k, row)
        }
        for (const row of (itemsByName ?? []) as Array<{
          id: string
          sku: string
          description: string | null
        }>) {
          const k = String(row.description ?? "").trim()
          if (k) itemByName.set(k, row)
        }

        let historyRows: Array<{ normalized_name: string | null; unit_price: number | null }> = []
        const histRes = await supabase
          .from("mo_supplier_invoice_import_lines")
          .select("normalized_name, unit_price")
          .limit(5000)
        if (!histRes.error && histRes.data) {
          historyRows = histRes.data as Array<{
            normalized_name: string | null
            unit_price: number | null
          }>
        }
        const lastPriceByName = new Map<string, number>()
        for (const h of historyRows) {
          const name = String(h.normalized_name ?? "").trim()
          if (!name || lastPriceByName.has(name)) continue
          const p = Number(h.unit_price ?? 0)
          if (Number.isFinite(p) && p > 0) lastPriceByName.set(name, p)
        }

        for (let i = 0; i < items.length; i++) {
          const row = items[i]!
          const mk = String(row.makat ?? "").trim()
          const norm = displayNormalizedName(row)
          const bySku = mk ? itemBySku.get(mk) : undefined
          const byName = norm ? itemByName.get(norm) : undefined
          const catalog = bySku || byName || null
          const internalSku = catalog?.sku ?? null
          let status: ItemCatalogStatus["status"] = catalog ? "match" : "new"

          const currentUnit = coerceUnitPrice(row)
          const lastUnit = norm ? lastPriceByName.get(norm) ?? null : null
          let trend: ItemCatalogStatus["trend"] = null
          if (lastUnit != null && lastUnit > 0) {
            const delta = (currentUnit - lastUnit) / lastUnit
            if (delta > 0.01) trend = "up"
            else if (delta < -0.01) trend = "down"
            else trend = "flat"
            if (catalog && (trend === "up" || trend === "down")) {
              status = "updated"
            }
          }

          statusMap[i] = {
            status,
            internalSku,
            trend,
            lastUnitPrice: lastUnit,
          }
        }

        if (!cancelled) setItemCatalogStatus(statusMap)
      } catch {
        if (!cancelled) {
          setSupplierVerification("unknown")
          setItemCatalogStatus({})
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [docMeta.supplier_name, items, showPreview])

  function resetPreviewState() {
    setItems([])
    setShowPreview(false)
    setDocMeta({})
    setProjectName("")
    setProfitCenterId("")
    setCurrency("ILS")
    setCategoryResolutions([])
    setConfirmMasterLines([])
    setCopilotOpen(false)
    setCopilotPayload(null)
    setSupplierVerification("unknown")
    setSupplierVerified(false)
    setItemCatalogStatus({})
    setSavedImportId(null)
    setSaveSummary(null)
  }

  function buildSaveLines(): SaveOcrImportLineInput[] {
    return items.map((row) => {
      const quantity = coerceQuantity(row)
      const unit_price = coerceUnitPrice(row)
      const total_line_price = coerceLineTotal(row, quantity, unit_price)
      const makat = displayMakat(row)
      const original_name =
        displayOriginalName(row) === "—" ? "" : displayOriginalName(row)
      const normalized_name =
        displayNormalizedName(row) === "—" ? "" : displayNormalizedName(row)
      return {
        makat: makat === "—" ? null : makat,
        original_name,
        normalized_name,
        quantity,
        unit_of_measure: displayUom(row),
        unit_price,
        total_line_price,
        category_name: displayCategory(row),
        additional_attributes: lineAttributes(row) ?? {},
      }
    })
  }

  async function executeSave(
    catList: CategoryLineResolution[],
    masterConfirm: number[],
    copilotCompletion = false
  ) {
    setIsSaving(true)
    try {
      const saveFn = copilotCompletion
        ? completeProcurementAiCopilotSave
        : saveSupplierInvoiceOcrImport
      const result = await saveFn({
        metadata: {
          document_type: docMeta.document_type ?? null,
          document_date: docMeta.document_date ?? null,
          supplier_name: docMeta.supplier_name ?? null,
        },
        document_title: documentTitle,
        profit_center_id: profitCenterId.trim() || null,
        project_name: projectName.trim() || null,
        direct_project_purchase: directProjectPurchase,
        currency: currency || "ILS",
        lines: buildSaveLines(),
        categoryLineResolutions: catList.length ? catList : undefined,
        confirmNewMasterForLineIndices: masterConfirm.length
          ? masterConfirm
          : undefined,
      })

      if (
        "status" in result &&
        result.status === "requires_human_resolution"
      ) {
        setCategoryResolutions(catList)
        setConfirmMasterLines(masterConfirm)
        setCopilotPayload(result)
        setCopilotOpen(true)
        return
      }

      if ("ok" in result && result.ok === false) {
        toast.error(result.error)
        return
      }

      if ("ok" in result && result.ok === true) {
        const n = result.needsAdminLineCount ?? 0
        if (n > 0) {
          toast.success(
            `המסמך נשמר. ${n} שורות מסומנות לסיווג אדמין (ללא יצירת מאסטר).`
          )
        } else {
          toast.success("החשבונית נקלטה ונשמרה בהצלחה במערכת!")
        }
        setSavedImportId(result.importId)
        setSupplierVerified(true)
        setSaveSummary({
          open: true,
          invoicesSaved: result.invoicesSaved ?? 1,
          newItemsAdded: result.newItemsAdded ?? 0,
          pricesUpdated: result.pricesUpdated ?? 0,
          importId: result.importId,
        })
        setError(null)
      }
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveToDatabase() {
    if (items.length === 0) {
      toast.error("אין פריטים לשמירה")
      return
    }
    if (!docMeta.supplier_name?.trim()) {
      toast.error("חסר שם ספק במטא-דאטה — לא ניתן לשמור קטלוג צללים")
      return
    }
    if (!profitCenterId.trim()) {
      toast.error("שיוך לפרויקט / מרכז רווח הוא שדה חובה")
      return
    }
    await executeSave(categoryResolutions, confirmMasterLines)
  }

  async function handleCreateRetroPo() {
    if (!isDeliveryNoteDoc) return
    if (items.length === 0) {
      toast.error("אין שורות ליצירת הזמנת רכש")
      return
    }
    if (!docMeta.supplier_name?.trim()) {
      toast.error("חסר שם ספק במסמך")
      return
    }
    if (!profitCenterId.trim()) {
      toast.error("יש לבחור מרכז רווח לפני יצירת הזמנה רטרואקטיבית")
      return
    }
    setRetroPoBusy(true)
    try {
      const res = await createRetroPurchaseOrderFromDeliveryScan({
        supplierName: docMeta.supplier_name.trim(),
        profitCenterId: profitCenterId.trim(),
        lines: buildSaveLines(),
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        `נוצרה הזמנת רכש רטרואקטיבית ${res.poNumber || res.poId.slice(0, 8)}`
      )
      if (res.newCatalogItemsCreated > 0) {
        toast.message(`נוספו ${res.newCatalogItemsCreated} פריטים חדשים לגיליון הפריטים`)
      }
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setRetroPoBusy(false)
    }
  }

  async function copilotUseGeneralCategory() {
    if (!copilotPayload) return
    const next = upsertCategoryResolution(categoryResolutions, {
      lineIndex: copilotPayload.lineIndex,
      categoryName: "שונות",
    })
    setCopilotOpen(false)
    await executeSave(next, confirmMasterLines, true)
  }

  async function copilotCreateCategory(name: string, prefix: string) {
    if (!copilotPayload) return
    const created = await createProcurementCategory({
      name,
      prefix,
    })
    if (!created.ok) {
      toast.error(created.error)
      return
    }
    const next = upsertCategoryResolution(categoryResolutions, {
      lineIndex: copilotPayload.lineIndex,
      categoryName: name.trim(),
    })
    setCopilotOpen(false)
    toast.success("הקטגוריה נוצרה")
    await executeSave(next, confirmMasterLines, true)
  }

  async function copilotConfirmNewMaster() {
    if (!copilotPayload) return
    const nextM = [
      ...new Set([...confirmMasterLines, copilotPayload.lineIndex]),
    ]
    setCopilotOpen(false)
    await executeSave(categoryResolutions, nextM, true)
  }

  async function copilotAssignGeneralAndCreateMaster() {
    if (!copilotPayload) return
    const next = upsertCategoryResolution(categoryResolutions, {
      lineIndex: copilotPayload.lineIndex,
      categoryName: "שונות",
    })
    const nextM = [
      ...new Set([...confirmMasterLines, copilotPayload.lineIndex]),
    ]
    setCopilotOpen(false)
    await executeSave(next, nextM, true)
  }

  async function runOcr(file: File) {
    setError(null)
    resetPreviewState()
    setParsing(true)
    try {
      const body = new FormData()
      body.set("file", file)
      const res = await fetch("/api/ocr-invoice", {
        method: "POST",
        body,
      })

      let json: unknown
      try {
        const text = await res.text()
        json = text ? JSON.parse(text) : null
      } catch {
        throw new Error(
          res.ok
            ? "תשובת השרת אינה JSON תקין"
            : `שגיאת שרת (${res.status}) — לא ניתן לקרוא את גוף התשובה`
        )
      }

      const payload = json as OcrSuccessPayload & { error?: string }

      if (!res.ok) {
        const apiErr =
          typeof payload?.error === "string" && payload.error.length > 0
            ? payload.error
            : `HTTP ${res.status}`
        throw new Error(apiErr)
      }
      if (!payload || typeof payload !== "object") {
        throw new Error("תשובת שרת לא תקינה")
      }
      if (typeof payload.error === "string" && payload.error.length > 0) {
        throw new Error(payload.error)
      }
      if (!Array.isArray(payload.items)) {
        throw new Error("תשובת שרת לא תקינה (חסר מערך פריטים)")
      }

      setItems(payload.items)
      const m = payload.metadata
      if (m && typeof m === "object") {
        setDocMeta({
          document_type:
            typeof m.document_type === "string" ? m.document_type : undefined,
          document_date:
            typeof m.document_date === "string" ? m.document_date : undefined,
          supplier_name:
            typeof m.supplier_name === "string" ? m.supplier_name : undefined,
        })
      } else {
        setDocMeta({})
      }
      setCurrency("ILS")
      setShowPreview(true)
    } catch (e) {
      const msg = formatError(e)
      resetPreviewState()
      setError(msg)
      toast.error(msg, { duration: 12_000 })
    } finally {
      setParsing(false)
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (f) void runOcr(f)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void runOcr(f)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 pb-12">
      <Link
        href="/marker-ofek/procurement"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לרכש
      </Link>

      <header className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-slate-950/90 via-slate-900/85 to-violet-950/35 p-6 shadow-lg md:p-8">
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-violet-500/35 bg-violet-500/15 text-violet-200">
              <ScanText className="size-6" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-violet-300/90">
                מרקר אופק
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                קליטת מסמך ספק — Shadow Catalog
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                חילוץ מטא-דאטה, קטגוריות ושורות. בשמירה נבנה אוטומטית קטלוג מאסטר
                ומיפוי מק״ט ספק.
              </p>
            </div>
          </div>
        </div>
        <div className="relative mt-4">
          <Link
            href="/marker-ofek/procurement/ai-import/pending-allocation"
            className="text-sm text-violet-200 underline-offset-4 hover:underline"
          >
            מעבר לתצוגת Pending Allocation
          </Link>
        </div>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="sr-only"
        onChange={onFileInput}
      />

      <section className="rounded-2xl border border-border/60 bg-card/90 shadow-sm">
        <div className="border-b border-border/60 px-4 py-4 sm:px-6">
          <h2 className="text-lg font-semibold">העלאת מסמך ספק</h2>
          <p className="text-sm text-muted-foreground">
            גררו לכאן קובץ או לחצו לבחירה מהמחשב.
          </p>
        </div>
        <div className="p-4 sm:p-6">
          <button
            type="button"
            disabled={parsing}
            aria-busy={parsing}
            aria-label={
              parsing
                ? "מנתחים קובץ, נא להמתין"
                : "העלאת קובץ PDF או תמונה לניתוח חשבונית"
            }
            onClick={() => inputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={cn(
              "flex min-h-[200px] w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
              dragActive
                ? "border-violet-500/70 bg-violet-500/10"
                : "border-border/70 bg-muted/20 hover:border-violet-500/40 hover:bg-muted/35",
              parsing && "pointer-events-none opacity-70"
            )}
          >
            {parsing ? (
              <>
                <Loader2
                  className="size-10 animate-spin text-violet-500"
                  aria-hidden
                />
                <span className="text-sm font-medium">טוענים ומנתחים…</span>
              </>
            ) : (
              <>
                <div className="flex size-14 items-center justify-center rounded-full border border-border/60 bg-background shadow-sm">
                  <Upload className="size-7 text-muted-foreground" aria-hidden />
                </div>
                <span className="flex items-center gap-2 text-sm font-medium">
                  <FileUp className="size-4" aria-hidden />
                  גרירה ושחרור — או לחיצה לבחירה
                </span>
                <span className="text-xs text-muted-foreground">
                  PDF, JPEG, PNG
                </span>
              </>
            )}
          </button>
        </div>
      </section>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>שגיאה בניתוח</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {showPreview ? (
        <section className="rounded-2xl border border-border/60 bg-card/90 shadow-sm">
          <div className="space-y-4 border-b border-border/60 px-4 py-4 sm:px-6">
            <div>
              <h2 className="text-lg font-semibold">תצוגה מקדימה</h2>
              <p className="mt-1 text-base font-medium text-foreground">
                {documentTitle}
              </p>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                <dt className="text-muted-foreground">סוג מסמך</dt>
                <dd className="mt-0.5 font-medium">
                  {docMeta.document_type?.trim() || "—"}
                </dd>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                <dt className="text-muted-foreground">תאריך מסמך</dt>
                <dd className="mt-0.5 font-medium font-mono">
                  {docMeta.document_date?.trim() || "—"}
                </dd>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                <dt className="text-muted-foreground">שם ספק</dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-2 font-medium">
                  <span>{docMeta.supplier_name?.trim() || "—"}</span>
                  {supplierVerified ? (
                    <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">
                      Supplier Verified ✅
                    </Badge>
                  ) : null}
                  {supplierVerification === "known" ? (
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                      ספק מוכר
                    </Badge>
                  ) : supplierVerification === "new" ? (
                    <Badge className="bg-orange-500 text-white hover:bg-orange-500">
                      ספק חדש - יוקם בשמירה
                    </Badge>
                  ) : null}
                </dd>
              </div>
            </dl>
            <div className="max-w-md space-y-2">
              <Label
                htmlFor="mo-ai-import-project"
                className="inline-flex flex-wrap items-center gap-2"
              >
                <span>שיוך לפרויקט</span>
                <DrillDownSetupBadge />
              </Label>
              <div className="grid gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={directProjectPurchase}
                    onChange={(e) => setDirectProjectPurchase(e.target.checked)}
                  />
                  רכישה ישירה לפרויקט (דילוג על התאמת PO)
                </label>
                <Select
                  value={profitCenterId || undefined}
                  onValueChange={(v) => {
                    const id = v ?? ""
                    setProfitCenterId(id)
                    const hit = projectOptions.find((p) => p.id === id)
                    setProjectName(hit?.name ?? "")
                  }}
                >
                  <SelectTrigger id="mo-ai-import-project" className="w-full">
                    <SelectValue placeholder="בחרו מרכז רווח / פרויקט (חובה לעדכון תקציב)" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {`${p.internal_project_code} — ${p.name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="שם פרויקט תצוגה (אופציונלי)"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  title={`${DRILL_DOWN_QUICK_SETUP_KEY} — הקמת פרויקט בלשונית חדשה`}
                  onKeyDown={(e) =>
                    handleDrillDownQuickSetupKeyDown(
                      e,
                      PROCUREMENT_DRILLDOWN_URLS.projectSetup
                    )
                  }
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto px-2 pb-4 pt-2 sm:px-4">
            <Table>
              <TableCaption className="sr-only">
                שורות פריטים שחולצו מהמסמך: מק״ט, קטגוריה, שמות, יחידת מידה, כמות
                ומחירים
              </TableCaption>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="whitespace-nowrap">מק״ט</TableHead>
                  <TableHead className="min-w-[120px]">קטגוריה</TableHead>
                  <TableHead className="min-w-[140px]">שם מקורי</TableHead>
                  <TableHead className="min-w-[140px]">זיהוי חכם</TableHead>
                  <TableHead className="whitespace-nowrap">
                    יח׳ מידה
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-end">
                    כמות
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-end">
                    מחיר ליחידה
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-end">
                    סה״כ שורה
                  </TableHead>
                  <TableHead className="whitespace-nowrap">סטטוס מק״ט פנימי</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      לא נמצאו שורות בחשבונית (מערך ריק מהשרת).
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((row, i) => {
                    const qty = coerceQuantity(row)
                    const unit = coerceUnitPrice(row)
                    const lineTotal = coerceLineTotal(row, qty, unit)
                    const mk = displayMakat(row)
                    const orig = displayOriginalName(row)
                    const norm = displayNormalizedName(row)
                    const cat = displayCategory(row)
                    const uom = displayUom(row)
                    const status = itemCatalogStatus[i]
                    const trend = status?.trend ?? null
                    return (
                      <TableRow key={`${mk}-${orig}-${i}`}>
                        <TableCell className="whitespace-nowrap font-mono text-sm">
                          {mk}
                        </TableCell>
                        <TableCell className="max-w-[10rem] text-sm leading-snug">
                          {cat}
                        </TableCell>
                        <TableCell className="max-w-[min(100%,18rem)] text-sm">
                          {orig}
                        </TableCell>
                        <TableCell className="max-w-[min(100%,18rem)] text-sm font-medium">
                          {norm}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {uom}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {qty}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {moneyFmt.format(unit)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {moneyFmt.format(lineTotal)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col gap-1">
                            {status?.status === "match" || status?.status === "updated" ? (
                              <div className="flex items-center gap-1.5">
                                {status.status === "updated" ? (
                                  <Badge className="bg-amber-600 text-white hover:bg-amber-600">
                                    עודכן
                                  </Badge>
                                ) : (
                                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                                    מותאם
                                  </Badge>
                                )}
                                <span className="font-mono text-xs">
                                  {status.internalSku || "—"}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Badge className="w-fit bg-blue-600 text-white hover:bg-blue-600">
                                  חדש
                                </Badge>
                                <span className="text-xs text-amber-700 dark:text-amber-400">
                                  דורש יצירה (F2)
                                </span>
                              </div>
                            )}
                            {trend ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                {trend === "up" ? (
                                  <ArrowUp className="size-3.5 text-red-600" aria-hidden />
                                ) : trend === "down" ? (
                                  <ArrowDown
                                    className="size-3.5 text-emerald-600"
                                    aria-hidden
                                  />
                                ) : (
                                  <span className="text-[10px]">•</span>
                                )}
                                {status?.lastUnitPrice != null
                                  ? `לעומת ${moneyFmt.format(status.lastUnitPrice)}`
                                  : "אין מחיר היסטורי"}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">
              שמירה יוצרת רשומת קליטה, מעדכנת קטלוג מאסטר וקטלוג ספק. עדכון עלויות
              פרויקט יתבצע רק אחרי שיוך מרכז רווח.
              </p>
              {savedImportId ? (
                <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  נשמר במסד הנתונים (Import ID: {savedImportId.slice(0, 8)}…)
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="gap-2"
              disabled={items.length === 0 || isSaving || parsing}
              onClick={() => void handleSaveToDatabase()}
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  שומרים…
                </>
              ) : (
                "שמור נתונים למערכת"
              )}
            </Button>
            {isDeliveryNoteDoc ? (
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={items.length === 0 || retroPoBusy || parsing || isSaving}
                onClick={() => void handleCreateRetroPo()}
              >
                {retroPoBusy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                צור הזמנת רכש רטרואקטיבית
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <Dialog
        open={Boolean(saveSummary?.open)}
        onOpenChange={(open) =>
          setSaveSummary((prev) => (prev ? { ...prev, open } : prev))
        }
      >
        <DialogContent dir="rtl" className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
              נשמר בהצלחה
            </DialogTitle>
            <DialogDescription>
              תהליך הקליטה הושלם ונשמר ב־Supabase.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] p-3 text-sm">
            <p>
              {saveSummary?.invoicesSaved ?? 0} חשבוניות נשמרו במסד הנתונים.
            </p>
            <p>
              {saveSummary?.newItemsAdded ?? 0} פריטים חדשים נוספו לקטלוג המאסטר.
            </p>
            <p>{saveSummary?.pricesUpdated ?? 0} מחירים עודכנו.</p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() =>
                setSaveSummary((prev) => (prev ? { ...prev, open: false } : prev))
              }
            >
              סגור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AiCopilotModal
        open={copilotOpen}
        onOpenChange={(open) => {
          setCopilotOpen(open)
          if (!open) setCopilotPayload(null)
        }}
        payload={copilotPayload}
        onUseGeneralCategory={() => void copilotUseGeneralCategory()}
        onConfirmCreateMaster={() => void copilotConfirmNewMaster()}
        onAssignToGeneral={() => void copilotAssignGeneralAndCreateMaster()}
        onCreateCategory={(name, prefix) =>
          void copilotCreateCategory(name, prefix)
        }
        isBusy={isSaving}
      />
    </div>
  )
}
