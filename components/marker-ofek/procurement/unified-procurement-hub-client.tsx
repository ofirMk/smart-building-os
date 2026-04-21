"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  Coins,
  FileText,
  Gem,
  Loader2,
  Lock,
  Package,
  Plus,
  Radio,
  Save,
  Search,
  Sparkles,
  Trash2,
  Truck,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
  fetchProjectPoCommitmentAction,
  fetchPurchaseOrderForHubAction,
  issuePurchaseOrderAction,
  receiveGoodsAction,
  saveDraftPurchaseOrderAction,
  scanDeliveryNoteImageAction,
} from "@/lib/holden-erp/procurement-actions"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"
import type {
  ErpPaymentTermOption,
  MasterDataCurrencyRow,
  MasterDataSupplierPartRow,
  MasterDataSupplierV2Row,
  MasterDataUomRow,
} from "@/types/master-data"

const NONE = "__none__"

const glass =
  "rounded-2xl border border-white/[0.07] bg-card/[0.04] shadow-[0_12px_48px_-18px_rgba(0,0,0,0.5)] backdrop-blur-2xl ring-1 ring-white/[0.06]"

const glassFloat =
  "rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/75 to-slate-950/55 p-4 shadow-[0_8px_40px_-12px_rgba(16,185,129,0.45)] backdrop-blur-2xl ring-1 ring-emerald-500/15"

type ProjectOption = { id: string, name: string, internal_project_code: string }

type PoRow = {
  id: string
  po_number: string
  order_date: string
  status: string
  wh_status: string | null
  total_amount: number
  project_id: string | null
  supplier_name: string | null
}

type LineForm = {
  id: string
  partId: string
  uomId: string
  quantity: string
  unitPrice: string
  /** תיאור מאוחד ממאסטר אחרי בחירת מק״ט */
  descriptionAuto?: string
}

type ReceiptSummary = {
  id: string
  receipt_date: string
  financial_approval_status: string | null
  verification_notes: string | null
}

function parseNum(s: string): number {
  const n = parseFloat(String(s).replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function hubLifecycle(po: {
  status: string
  wh_status: string | null
}): "draft" | "sent" | "received" | "partial" {
  if (po.status === "draft") return "draft"
  if (po.wh_status === "closed" || po.status === "closed") return "received"
  if (po.wh_status === "partially_received" || po.status === "partial_receipt") {
    return "partial"
  }
  return "sent"
}

function fullyReceived(po: {
  status: string
  wh_status: string | null
}): boolean {
  return po.wh_status === "closed" || po.status === "closed"
}

function guessUomId(
  part: MasterDataSupplierPartRow,
  uoms: MasterDataUomRow[]
): string {
  const blob = [
    part.description_32_chars,
    part.description_48_chars,
    part.manufacturer,
    part.part_number_supplier,
  ]
    .join(" ")
    .toUpperCase()
  const sorted = [...uoms].sort((a, b) => b.code.length - a.code.length)
  for (const u of sorted) {
    const c = u.code.toUpperCase()
    if (c && blob.includes(c)) return u.id
  }
  const ea = uoms.find((u) => u.code === "EA")
  return ea?.id ?? uoms[0]?.id ?? ""
}

/** העדפת TON / KG / EA לפי טקסט מאסטר וקודי יחידה */
function resolveSmartUomFromPart(
  part: MasterDataSupplierPartRow,
  uoms: MasterDataUomRow[]
): string {
  const blob = [
    part.description_32_chars,
    part.description_48_chars,
    part.manufacturer,
    part.part_number_supplier,
  ]
    .join(" ")
  const upper = blob.toUpperCase()
  const findByCodes = (...codes: string[]) => {
    for (const code of codes) {
      const hit = uoms.find((u) => u.code.toUpperCase() === code.toUpperCase())
      if (hit) return hit.id
    }
    return ""
  }
  if (/\b(TON|טון|מ״ט)\b/i.test(blob) || /\bTON\b/.test(upper)) {
    const id =
      findByCodes("TON", "T", "MT") ||
      uoms.find((u) => u.code.toUpperCase().startsWith("TON"))?.id ||
      ""
    if (id) return id
  }
  if (/\b(KG|ק״ג|קג|KILO)\b/i.test(blob) || /\bKG\b/.test(upper)) {
    const id = findByCodes("KG", "KGM", "G")
    if (id) return id
  }
  if (/\b(EA|יחידה|יח׳|יחידות)\b/i.test(blob) || /\bEA\b/.test(upper)) {
    const id = findByCodes("EA", "U", "UNIT")
    if (id) return id
  }
  return guessUomId(part, uoms)
}

function buildPartDescriptionLine(part: MasterDataSupplierPartRow): string {
  return [
    part.manufacturer?.trim(),
    part.part_number_supplier?.trim(),
    (part.description_48_chars || part.description_32_chars || "").trim(),
  ]
    .filter(Boolean)
    .join(" · ")
}

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

type Props = {
  projects: ProjectOption[]
  suppliers: MasterDataSupplierV2Row[]
  parts: MasterDataSupplierPartRow[]
  uoms: MasterDataUomRow[]
  currencies: MasterDataCurrencyRow[]
  paymentTerms: ErpPaymentTermOption[]
  initialPurchaseOrders: PoRow[]
  loadErrors: string[]
}

export function UnifiedProcurementHubClient({
  projects,
  suppliers,
  parts,
  uoms,
  currencies,
  paymentTerms,
  initialPurchaseOrders,
  loadErrors,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [poList, setPoList] = React.useState(initialPurchaseOrders)
  const [poSearch, setPoSearch] = React.useState("")
  const [selectedPoId, setSelectedPoId] = React.useState<string | null>(null)
  const [loadingPo, setLoadingPo] = React.useState(false)

  const [projectId, setProjectId] = React.useState("")
  const [masterSupplierId, setMasterSupplierId] = React.useState("")
  const [supplierQuery, setSupplierQuery] = React.useState("")
  const [orderDate, setOrderDate] = React.useState(
    () => new Date().toISOString().slice(0, 10)
  )
  const [lines, setLines] = React.useState<LineForm[]>(() => [
    { id: "l1", partId: "", uomId: "", quantity: "", unitPrice: "" },
  ])
  const [partFilter, setPartFilter] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [issuing, setIssuing] = React.useState(false)
  const [receiving, setReceiving] = React.useState(false)
  const [receiptDate, setReceiptDate] = React.useState(
    () => new Date().toISOString().slice(0, 10)
  )
  const [warehouseLocation, setWarehouseLocation] = React.useState("מחסן ראשי")
  const [committed, setCommitted] = React.useState<number | null>(null)
  const [poReceipts, setPoReceipts] = React.useState<ReceiptSummary[]>([])
  const [deliveryNotePath, setDeliveryNotePath] = React.useState<string | null>(
    null
  )
  const [uploadingNote, setUploadingNote] = React.useState(false)
  const [geminiScanning, setGeminiScanning] = React.useState(false)
  const deliveryNoteInputRef = React.useRef<HTMLInputElement>(null)
  const [aiExtract, setAiExtract] = React.useState<{
    supplierName: string
    deliveryNoteNumber: string
    deliveryDate: string
    lineItems: Array<{ description: string, quantity: number }>
    quantitiesByLineId: Record<string, number>
    mismatchScore: number
    overOrderedLineIds: string[]
  } | null>(null)
  const [aiMismatch, setAiMismatch] = React.useState(false)

  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])

  const currencyById = React.useMemo(() => {
    const m = new Map<string, MasterDataCurrencyRow>()
    for (const c of currencies) m.set(c.id, c)
    return m
  }, [currencies])

  const termLabel = React.useCallback(
    (code: string | null | undefined) => {
      if (!code) return "—"
      return paymentTerms.find((t) => t.code === code)?.description ?? code
    },
    [paymentTerms]
  )

  const supplierById = React.useMemo(() => {
    const m = new Map<string, MasterDataSupplierV2Row>()
    for (const s of suppliers) m.set(s.id, s)
    return m
  }, [suppliers])

  const selectedSupplier = masterSupplierId
    ? supplierById.get(masterSupplierId)
    : undefined

  const filteredSuppliers = React.useMemo(() => {
    const q = supplierQuery.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.tax_id ?? "").toLowerCase().includes(q)
    )
  }, [suppliers, supplierQuery])

  const sortedParts = React.useMemo(() => {
    if (!masterSupplierId) return parts
    const a = parts.filter((p) => p.supplier_id === masterSupplierId)
    const b = parts.filter((p) => p.supplier_id !== masterSupplierId)
    return [...a, ...b]
  }, [parts, masterSupplierId])

  const filteredParts = React.useMemo(() => {
    const q = partFilter.trim().toLowerCase()
    if (!q) return sortedParts
    return sortedParts.filter((p) => {
      const blob = [
        p.part_number_supplier,
        p.manufacturer,
        p.supplier_name_text,
        p.description_32_chars,
        p.description_48_chars,
      ]
        .join(" ")
        .toLowerCase()
      return blob.includes(q)
    })
  }, [sortedParts, partFilter])

  const filteredPoList = React.useMemo(() => {
    const q = poSearch.trim().toLowerCase()
    if (!q) return poList
    return poList.filter(
      (p) =>
        p.po_number.toLowerCase().includes(q) ||
        (p.supplier_name ?? "").toLowerCase().includes(q)
    )
  }, [poList, poSearch])

  const grandTotal = React.useMemo(() => {
    let s = 0
    for (const row of lines) {
      s += roundMoney(parseNum(row.quantity) * parseNum(row.unitPrice))
    }
    return roundMoney(s)
  }, [lines])

  const liveCommitmentIls = React.useMemo(() => {
    if (!projectId.trim() || committed == null) return null
    return roundMoney(committed + grandTotal)
  }, [projectId, committed, grandTotal])

  React.useEffect(() => {
    const pid = projectId.trim()
    if (!pid) {
      setCommitted(null)
      return
    }
    let cancelled = false
    void (async () => {
      const ex = selectedPoId
      const res = await fetchProjectPoCommitmentAction({
        projectId: pid,
        excludePoId: ex,
      })
      if (cancelled) return
      if (res.ok) setCommitted(res.committedIls)
      else setCommitted(null)
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, selectedPoId])

  const resetBlank = React.useCallback(() => {
    setSelectedPoId(null)
    setProjectId("")
    setMasterSupplierId("")
    setSupplierQuery("")
    setOrderDate(new Date().toISOString().slice(0, 10))
    setLines([
      {
        id: crypto.randomUUID(),
        partId: "",
        uomId: "",
        quantity: "",
        unitPrice: "",
        descriptionAuto: undefined,
      },
    ])
    setPartFilter("")
    router.replace("/marker-ofek/procurement")
  }, [router])

  const loadPo = React.useCallback(async (id: string) => {
    if (!id) return
    setLoadingPo(true)
    const res = await fetchPurchaseOrderForHubAction(id)
    setLoadingPo(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setSelectedPoId(id)
    setProjectId(res.po.project_id ?? "")
    setMasterSupplierId(res.masterSupplierId ?? "")
    setOrderDate(res.po.order_date?.slice(0, 10) ?? "")
    if (res.lines.length === 0) {
      setLines([
        {
          id: crypto.randomUUID(),
          partId: "",
          uomId: "",
          quantity: "",
          unitPrice: "",
          descriptionAuto: undefined,
        },
      ])
    } else {
      setLines(
        res.lines.map((l) => {
          const p = parts.find((x) => x.id === l.part_id)
          return {
            id: l.id,
            partId: l.part_id,
            uomId: l.uom_id,
            quantity: String(l.quantity),
            unitPrice: String(l.unit_price),
            descriptionAuto: p ? buildPartDescriptionLine(p) : undefined,
          }
        })
      )
    }
    const { data: wrs } = await supabase
      .from("warehouse_receipts")
      .select("id, receipt_date, financial_approval_status, verification_notes")
      .eq("po_id", id)
      .order("receipt_date", { ascending: false })
    setPoReceipts(
      (wrs ?? []).map(
        (w: {
          id: string
          receipt_date: string
          financial_approval_status: string | null
          verification_notes: string | null
        }) => ({
          id: String(w.id),
          receipt_date: String(w.receipt_date ?? ""),
          financial_approval_status: w.financial_approval_status,
          verification_notes: w.verification_notes,
        })
      )
    )
    setDeliveryNotePath(null)
    setAiExtract(null)
    setAiMismatch(false)
  }, [supabase, parts])

  const poParam = searchParams.get("po")
  const newParam = searchParams.get("new")

  React.useEffect(() => {
    setPoList(initialPurchaseOrders)
  }, [initialPurchaseOrders])

  React.useEffect(() => {
    if (poParam) {
      void loadPo(poParam)
      return
    }
    if (newParam === "1") {
      resetBlank()
    }
  }, [poParam, newParam, loadPo, resetBlank])

  function setLine(id: string, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        partId: "",
        uomId: "",
        quantity: "",
        unitPrice: "",
        descriptionAuto: undefined,
      },
    ])
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)))
  }

  async function onSaveDraft() {
    if (!projectId || !masterSupplierId) {
      toast.error("פרויקט וספק נדרשים")
      return
    }
    const payload = lines
      .map((row) => ({
        partId: row.partId.trim(),
        uomId: row.uomId.trim(),
        quantity: parseNum(row.quantity),
        unitPrice: roundMoney(parseNum(row.unitPrice)),
      }))
      .filter((row) => row.partId && row.uomId && row.quantity > 0)
    setSaving(true)
    const res = await saveDraftPurchaseOrderAction({
      poId: selectedPoId,
      projectId,
      masterSupplierId,
      orderDate,
      lines: payload,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("טיוטה נשמרה")
    setSelectedPoId(res.id)
    router.replace("/marker-ofek/procurement?po=" + encodeURIComponent(res.id))
    router.refresh()
    setPoList((prev) => {
      const exists = prev.some((p) => p.id === res.id)
      if (exists) return prev
      return [
        {
          id: res.id,
          po_number: res.poNumber,
          order_date: orderDate,
          status: "draft",
          wh_status: null,
          total_amount: grandTotal,
          project_id: projectId,
          supplier_name: selectedSupplier?.name ?? null,
        },
        ...prev,
      ]
    })
  }

  async function onIssue() {
    if (!selectedPoId) {
      toast.error("שמרו טיוטה לפני הנפקה")
      return
    }
    setIssuing(true)
    const res = await issuePurchaseOrderAction(selectedPoId)
    setIssuing(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("הזמנה הונפקה")
    router.refresh()
    void loadPo(selectedPoId)
    setPoList((prev) =>
      prev.map((p) =>
        p.id === selectedPoId
          ? { ...p, status: "sent", wh_status: "open" }
          : p
      )
    )
  }

  const currentPoMeta = React.useMemo(() => {
    if (!selectedPoId) return null
    return poList.find((p) => p.id === selectedPoId) ?? null
  }, [poList, selectedPoId])

  const lifecycle = currentPoMeta
    ? hubLifecycle(currentPoMeta)
    : "draft"

  const editingLocked = lifecycle !== "draft"

  const showReceive =
    Boolean(currentPoMeta) &&
    currentPoMeta!.status !== "draft" &&
    !fullyReceived(currentPoMeta!)

  async function onUploadDeliveryNote(file: File) {
    if (!selectedPoId) return
    let uploadedPath: string | null = null
    setUploadingNote(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const uid = sessionData?.session?.user?.id
      if (!uid) {
        toast.error("נא להתחבר כדי להעלות צילום")
        return
      }
      const safeName = file.name.replace(/[^\w.\-]/g, "_")
      const path = `${uid}/${crypto.randomUUID()}-${safeName}`
      const { error: upErr } = await supabase.storage
        .from("delivery-notes")
        .upload(path, file, { upsert: false })
      if (upErr) {
        toast.error(upErr.message)
        return
      }
      uploadedPath = path
      setDeliveryNotePath(path)
    } finally {
      setUploadingNote(false)
    }
    if (!uploadedPath) return

    setGeminiScanning(true)
    try {
      const scanned = await scanDeliveryNoteImageAction({
        poId: selectedPoId,
        storagePath: uploadedPath,
        fileName: file.name,
        mimeType: file.type || undefined,
      })
      if (!scanned.ok) {
        toast.error(scanned.error)
        return
      }
      setAiExtract({
        supplierName: scanned.supplierName,
        deliveryNoteNumber: scanned.deliveryNoteNumber,
        deliveryDate: scanned.deliveryDate,
        lineItems: scanned.lineItems,
        quantitiesByLineId: scanned.quantitiesByLineId,
        mismatchScore: scanned.mismatchScore,
        overOrderedLineIds: scanned.overOrderedLineIds,
      })
      if (scanned.missingHighValuePartLabels.length > 0) {
        toast.warning(
          `מנהל פרויקט: פריטי ערך גבוה (מאסטר) חסרים בסריקה — ${scanned.missingHighValuePartLabels.join(" · ")}`,
          { duration: 18000 }
        )
      }
      toast.success("ניתוח Gemini הושלם")
    } finally {
      setGeminiScanning(false)
    }
  }

  async function onReceiveAll() {
    if (!selectedPoId) return
    const resDetail = await fetchPurchaseOrderForHubAction(selectedPoId)
    if (!resDetail.ok) {
      toast.error(resDetail.error)
      return
    }
    const linesIn = resDetail.lines
    const { data: receipts } = await supabase
      .from("warehouse_receipts")
      .select("id")
      .eq("po_id", selectedPoId)
    const rids = (receipts ?? []).map((r: { id: string }) => String(r.id))
    const received = new Map<string, number>()
    if (rids.length > 0) {
      const { data: wlines } = await supabase
        .from("warehouse_receipt_lines")
        .select("purchase_order_line_id, quantity_received")
        .in("receipt_id", rids)
      for (const row of wlines ?? []) {
        const lid = String(
          (row as { purchase_order_line_id: string }).purchase_order_line_id
        )
        const q = Number((row as { quantity_received: number }).quantity_received) || 0
        received.set(lid, (received.get(lid) ?? 0) + q)
      }
    }
    const payload = linesIn
      .map((l) => {
        const got = received.get(l.id) ?? 0
        const rem = Math.max(0, l.quantity - got)
        return {
          purchaseOrderLineId: l.id,
          quantityReceived: rem,
        }
      })
      .filter((x) => x.quantityReceived > 0)
    if (payload.length === 0) {
      toast.error("אין יתרה לקבלה")
      return
    }
    let mismatch = false
    for (const p of payload) {
      const ai = aiExtract?.quantitiesByLineId[p.purchaseOrderLineId]
      if (ai != null && Math.abs(ai - p.quantityReceived) > 1e-6) {
        mismatch = true
        break
      }
    }
    setAiMismatch(mismatch)

    setReceiving(true)
    const res = await receiveGoodsAction({
      poId: selectedPoId,
      receiptDate,
      warehouseLocation,
      lines: payload,
      deliveryNoteImageUrl: deliveryNotePath,
      verificationNotes: mismatch ? "סריקת AI אינה תואמת את הכמויות שהוזנו" : null,
    })
    setReceiving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    if (res.duplicate) {
      toast.message("קבלה כבר נרשמה בעבר (מפתח ייחודיות)")
    } else {
      toast.success("סחורה נקלטה")
    }
    router.refresh()
    void loadPo(selectedPoId)
  }

  const cur = selectedSupplier?.currency_id
    ? currencyById.get(selectedSupplier.currency_id)
    : undefined

  return (
    <div dir="rtl" className="min-h-[calc(100vh-6rem)] bg-[#070b12] text-slate-100">
      <div className="border-b border-white/5 bg-card/[0.02] px-4 py-3 backdrop-blur-md md:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/30 to-blue-600/30 ring-1 ring-white/10">
              <Sparkles className="size-5 text-emerald-300" aria-hidden />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight md:text-xl">
                מרכז רכש אחוד
              </h1>
              <p className="text-xs text-slate-400">
                טיוטה → הנפקת PO → קבלה (GRV) → מסלול מס״ב — זרימה אחת
              </p>
            </div>
          </div>
          <Link
            href="/marker-ofek/master-data?tab=parts"
            className="text-xs text-emerald-300/90 underline-offset-4 hover:underline"
          >
            נתוני מאסטר
          </Link>
        </div>
      </div>

      {loadErrors.length > 0 ? (
        <div className="mx-auto max-w-[1600px] px-4 py-2 text-sm text-red-400 md:px-8">
          {loadErrors.join(" · ")}
        </div>
      ) : null}

      <div
        className="mx-auto flex max-w-[1600px] flex-1 flex-col gap-0 lg:flex-row"
        dir="ltr"
      >
        <main
          className="order-1 flex min-h-[calc(100vh-8rem)] min-w-0 flex-1 flex-col gap-6 p-4 md:p-8"
          dir="rtl"
        >
          {loadingPo ? (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="size-5 animate-spin" />
              טוען…
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <StageChip
              label="טיוטה"
              on={!currentPoMeta || currentPoMeta.status === "draft"}
            />
            <ChevronLeft className="size-4 text-slate-600" aria-hidden />
            <StageChip
              label="PO"
              on={
                Boolean(currentPoMeta) &&
                currentPoMeta!.status !== "draft" &&
                !fullyReceived(currentPoMeta!)
              }
            />
            <ChevronLeft className="size-4 text-slate-600" aria-hidden />
            <StageChip
              label="GRV"
              on={Boolean(
                currentPoMeta &&
                  currentPoMeta.status !== "draft" &&
                  poReceipts.length > 0
              )}
            />
            <ChevronLeft className="size-4 text-slate-600" aria-hidden />
            <StageChip
              label="מס״ב"
              on={Boolean(
                currentPoMeta &&
                  fullyReceived(currentPoMeta) &&
                  poReceipts.length > 0
              )}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
            <div className="space-y-6">
              <section className={cn(glass, "p-5")}>
                <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-300">
                  <Building2 className="size-4 text-emerald-400" aria-hidden />
                  פרויקט וספק
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-slate-400">פרויקט</Label>
                    <Select
                      value={projectId || NONE}
                      onValueChange={(v) =>
                        setProjectId(v == null || v === NONE ? "" : String(v))
                      }
                      disabled={editingLocked}
                    >
                      <SelectTrigger className="h-11 rounded-xl border-white/10 bg-card/5">
                        <SelectValue placeholder="בחרו" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>—</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.internal_project_code ? `${p.internal_project_code} · ` : ""}
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400">תאריך</Label>
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                      <Input
                        type="date"
                        value={orderDate}
                        onChange={(e) => setOrderDate(e.target.value)}
                        disabled={editingLocked}
                        className="h-11 rounded-xl border-white/10 bg-card/5 pe-10"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <Label className="text-slate-400">חיפוש ספק (מאסטר)</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      value={supplierQuery}
                      onChange={(e) => setSupplierQuery(e.target.value)}
                      placeholder="שם / ח.פ…"
                      disabled={editingLocked}
                      className="h-10 rounded-xl border-white/10 bg-card/5 ps-9"
                    />
                  </div>
                  <Select
                    value={masterSupplierId || NONE}
                    onValueChange={(v) =>
                      setMasterSupplierId(v == null || v === NONE ? "" : String(v))
                    }
                        disabled={editingLocked}
                  >
                    <SelectTrigger className="h-11 rounded-xl border-white/10 bg-card/5">
                      <SelectValue placeholder="בחרו ספק" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value={NONE}>—</SelectItem>
                      {filteredSuppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>

              {selectedSupplier ? (
                <div className={glassFloat}>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-100">
                    <Gem className="size-4" aria-hidden />
                    תמונת ספק
                  </div>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-400">מטבע</span>
                      <span className="font-medium">
                        {cur?.code ?? "—"}{" "}
                        {cur?.symbol ? `(${cur.symbol})` : ""}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-400">תנאי תשלום</span>
                      <span className="text-end text-xs leading-snug">
                        {termLabel(selectedSupplier.payment_term_code)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-400">ח.פ / ע.מ</span>
                      <span className="font-mono text-xs">
                        {selectedSupplier.tax_id ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-white/10 pt-2">
                      <span className="text-slate-400">יתרה</span>
                      <span className="tabular-nums font-semibold text-white">
                        {ils.format(selectedSupplier.balance ?? 0)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              <section
                className={cn(
                  glass,
                  "border-2 border-amber-500/40 bg-gradient-to-br from-amber-950/25 via-slate-950/40 to-slate-950/60 p-5 shadow-[inset_0_1px_0_0_rgba(251,191,36,0.12)]"
                )}
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-100/90">
                    <Package className="size-4 text-amber-400" aria-hidden />
                    טבלת מקט״י (מאסטר)
                  </div>
                  <Input
                    value={partFilter}
                    onChange={(e) => setPartFilter(e.target.value)}
                    placeholder="חיפוש מקט״י…"
                        disabled={editingLocked}
                    className="h-9 max-w-xs rounded-lg border-white/10 bg-card/5 text-xs"
                  />
                </div>
                <div className="space-y-4">
                  {lines.map((row, idx) => {
                    const part = row.partId
                      ? parts.find((p) => p.id === row.partId)
                      : undefined
                    const lt = roundMoney(
                      parseNum(row.quantity) * parseNum(row.unitPrice)
                    )
                    const uomCode = row.uomId
                      ? uoms.find((u) => u.id === row.uomId)?.code ?? ""
                      : ""
                    return (
                      <div
                        key={row.id}
                        className="rounded-xl border border-white/[0.08] bg-card/[0.03] p-4 backdrop-blur-sm"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] text-slate-500">
                            שורה {idx + 1}
                          </span>
                          {!editingLocked ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 text-slate-500 hover:text-red-400"
                              onClick={() => removeLine(row.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          ) : null}
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <Label className="text-[11px] text-slate-500">מקט״י</Label>
                            <Select
                              value={row.partId || NONE}
                              disabled={editingLocked}
                              onValueChange={(v) => {
                                const next = v == null || v === NONE ? "" : String(v)
                                const p = parts.find((x) => x.id === next)
                                const uGuess = p
                                  ? resolveSmartUomFromPart(p, uoms)
                                  : ""
                                const descLine = p ? buildPartDescriptionLine(p) : ""
                                setLine(row.id, {
                                  partId: next,
                                  uomId: uGuess || row.uomId,
                                  descriptionAuto: descLine || undefined,
                                })
                                if (p) {
                                  toast.message(descLine || "מקט״י נבחר", {
                                    duration: 2200,
                                  })
                                }
                              }}
                            >
                              <SelectTrigger className="mt-1 h-11 rounded-xl border-white/10 bg-card/5">
                                <SelectValue placeholder="בחרו" />
                              </SelectTrigger>
                              <SelectContent className="max-h-64">
                                <SelectItem value={NONE}>—</SelectItem>
                                {filteredParts.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.part_number_supplier || "—"} ·{" "}
                                    {(p.description_32_chars || p.description_48_chars || "").slice(0, 40)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-xs text-amber-50/95">
                            <p>
                              <span className="text-amber-200/80">יצרן · </span>
                              {part?.manufacturer?.trim() || "—"}
                            </p>
                            <p className="leading-snug">
                              <span className="text-amber-200/80">תיאור · </span>
                              {(row.descriptionAuto ||
                                part?.description_48_chars ||
                                part?.description_32_chars ||
                                "—"
                              ).trim()}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-4">
                          <div>
                            <Label className="text-[11px] text-slate-500">
                              יחידה (UOM)
                            </Label>
                            <Select
                              value={row.uomId || NONE}
                              disabled={editingLocked}
                              onValueChange={(v) =>
                                setLine(row.id, {
                                  uomId: v == null || v === NONE ? "" : String(v),
                                })
                              }
                            >
                              <SelectTrigger className="mt-1 h-10 rounded-xl border-white/10 bg-card/5 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>—</SelectItem>
                                {uoms.map((u) => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.code} — {u.description_he}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {uomCode ? (
                              <p className="mt-1 text-[10px] text-emerald-400/80">
                                נבחר: {uomCode}
                              </p>
                            ) : null}
                          </div>
                          <div>
                            <Label className="text-[11px] text-slate-500">כמות</Label>
                            <Input
                              value={row.quantity}
                              disabled={editingLocked}
                              onChange={(e) =>
                                setLine(row.id, { quantity: e.target.value })
                              }
                              className="mt-1 h-10 rounded-xl border-white/10 bg-card/5"
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] text-slate-500">מחיר יחידה</Label>
                            <Input
                              value={row.unitPrice}
                              disabled={editingLocked}
                              onChange={(e) =>
                                setLine(row.id, { unitPrice: e.target.value })
                              }
                              className="mt-1 h-10 rounded-xl border-white/10 bg-card/5"
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] text-slate-500">סכום</Label>
                            <div className="mt-1 flex h-10 items-center rounded-xl bg-card/5 px-3 text-sm tabular-nums">
                              {ils.format(lt)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {!editingLocked ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 w-full rounded-xl border-dashed border-emerald-500/40 bg-emerald-500/5 text-emerald-200 hover:bg-emerald-500/10"
                    onClick={addLine}
                  >
                    <Plus className="ms-1 size-4" />
                    שורה
                  </Button>
                ) : null}
              </section>
            </div>

            <div className="space-y-4">
              <div className={cn(glass, "p-5")}>
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
                  <Coins className="size-4 text-amber-400" />
                  השפעה תקציבית בזמן אמת
                </div>
                <p className="text-2xl font-bold tabular-nums text-white">
                  {liveCommitmentIls != null
                    ? ils.format(liveCommitmentIls)
                    : "—"}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  מחויב קיים בפרויקט + טיוטה נוכחית — לפני הנפקת PO
                </p>
                <div className="mt-3 flex justify-between border-t border-white/5 pt-2 text-xs text-slate-400">
                  <span>מחויב קיים</span>
                  <span className="tabular-nums">
                    {committed != null ? ils.format(committed) : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-slate-300">
                  <span>טיוטה במסך</span>
                  <span className="tabular-nums font-medium text-emerald-300">
                    {ils.format(grandTotal)}
                  </span>
                </div>
              </div>

              <div className={cn(glass, "p-5")}>
                <div className="mb-2 text-xs font-medium text-slate-400">סה״כ</div>
                <p className="text-3xl font-semibold tabular-nums tracking-tight text-white">
                  {ils.format(grandTotal)}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-white/5 pt-6">
            {!editingLocked ? (
              <Button
                type="button"
                disabled={saving}
                onClick={() => void onSaveDraft()}
                className="h-14 min-w-[180px] rounded-2xl bg-gradient-to-l from-emerald-600 to-emerald-500 px-8 text-base font-semibold text-white shadow-[0_0_32px_-4px_rgba(16,185,129,0.7)] hover:from-emerald-500 hover:to-emerald-400"
              >
                {saving ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
                <span className="ms-2">שמור טיוטה</span>
              </Button>
            ) : null}
            {lifecycle === "draft" && selectedPoId ? (
              <Button
                type="button"
                disabled={issuing}
                onClick={() => void onIssue()}
                className="h-14 min-w-[180px] rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-500 px-8 text-base font-semibold text-white shadow-[0_0_40px_-4px_rgba(5,150,105,0.85)] hover:from-emerald-500 hover:to-teal-400"
              >
                {issuing ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Radio className="size-5" />
                )}
                <span className="ms-2">הנפק הזמנה</span>
              </Button>
            ) : null}

            {showReceive && selectedPoId ? (
              <div className="w-full space-y-4 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/30 to-slate-950/40 p-5 shadow-[0_12px_40px_-12px_rgba(16,185,129,0.25)] backdrop-blur-xl">
                <div>
                  <p className="text-sm font-semibold text-emerald-100">
                    קבלת סחורה · Receive Goods
                  </p>
                  <p className="text-[11px] text-slate-500">
                    הזמנה בנשלח — רישום כמויות קבלה (מפתח ייחודיות למניעת כפילות)
                  </p>
                </div>
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="grid flex-1 gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs text-slate-500">תאריך קבלה</Label>
                      <Input
                        type="date"
                        value={receiptDate}
                        onChange={(e) => setReceiptDate(e.target.value)}
                        className="mt-1 h-10 rounded-xl border-white/10 bg-card/5"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">מחסן</Label>
                      <Input
                        value={warehouseLocation}
                        onChange={(e) => setWarehouseLocation(e.target.value)}
                        className="mt-1 h-10 rounded-xl border-white/10 bg-card/5"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    disabled={receiving}
                    onClick={() => void onReceiveAll()}
                    className="h-14 min-w-[220px] rounded-2xl bg-gradient-to-l from-emerald-500 via-emerald-400 to-teal-500 px-8 text-base font-semibold text-white shadow-[0_0_40px_-4px_rgba(16,185,129,0.8)]"
                  >
                    {receiving ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <Truck className="size-5" />
                    )}
                    <span className="ms-2">קבל סחורה</span>
                  </Button>
                </div>
                <div
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    aiMismatch
                      ? "border-red-500/60 bg-red-500/10"
                      : "border-white/10 bg-black/20"
                  )}
                >
                  <Label className="text-xs text-amber-200/90">
                    צילום/העלאת תעודת משלוח
                  </Label>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Input
                      ref={deliveryNoteInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={uploadingNote || geminiScanning || receiving}
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void onUploadDeliveryNote(f)
                        e.target.value = ""
                      }}
                    />
                    <Button
                      type="button"
                      disabled={uploadingNote || geminiScanning || receiving}
                      onClick={() => deliveryNoteInputRef.current?.click()}
                      className={cn(
                        "h-10 rounded-xl border border-blue-500/35 bg-gradient-to-l from-emerald-600/80 to-blue-700/70 px-4 text-sm font-medium text-white shadow-[0_0_24px_-6px_rgba(59,130,246,0.5)] hover:from-emerald-500/90 hover:to-blue-600/80",
                        geminiScanning && "animate-pulse"
                      )}
                    >
                      {geminiScanning ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                      <span className="ms-2">
                        {geminiScanning
                          ? "Gemini Scanning…"
                          : "סריקת תעודה (Gemini)"}
                      </span>
                    </Button>
                    <span className="text-[11px] text-slate-500">
                      צילום תעודת משלוח — ניתוח Gemini Vision
                    </span>
                    {uploadingNote ? (
                      <Loader2 className="size-4 animate-spin text-emerald-400" />
                    ) : null}
                    {deliveryNotePath ? (
                      <span className="text-[11px] text-emerald-300/90">הקובץ הועלה</span>
                    ) : null}
                  </div>
                  {geminiScanning ? (
                    <div
                      className="mt-4 flex items-center gap-3 rounded-xl border border-blue-500/30 bg-gradient-to-r from-emerald-500/10 via-blue-500/10 to-indigo-500/10 px-4 py-3 backdrop-blur-xl animate-pulse"
                      role="status"
                      aria-live="polite"
                    >
                      <Sparkles className="size-5 shrink-0 text-blue-300" aria-hidden />
                      <div>
                        <p className="text-sm font-medium text-blue-100">
                          Gemini Scanning…
                        </p>
                        <p className="text-[11px] text-slate-400">
                          מנתח תעודת משלוח (Gemini 1.5 Flash) והשוואה להזמנה
                        </p>
                      </div>
                      <Loader2 className="ms-auto size-5 shrink-0 animate-spin text-emerald-300" />
                    </div>
                  ) : null}
                  {aiExtract ? (
                    <div className="mt-4 space-y-3 rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/50 via-slate-950/40 to-blue-950/45 p-4 shadow-[inset_0_1px_0_0_rgba(16,185,129,0.12)] ring-1 ring-blue-500/15 backdrop-blur-xl">
                      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 pb-2">
                        <Gem className="size-4 text-emerald-400" aria-hidden />
                        <span className="bg-gradient-to-l from-emerald-200 to-blue-200 bg-clip-text text-sm font-semibold text-transparent">
                          תוצאות Gemini Vision
                        </span>
                        <span className="ms-auto rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-100">
                          התאמה: {(100 * (1 - aiExtract.mismatchScore)).toFixed(0)}%
                        </span>
                      </div>
                      <dl className="grid gap-1 text-[11px] text-slate-400 sm:grid-cols-2">
                        <div>
                          <dt className="text-slate-500">ספק בתעודה</dt>
                          <dd className="font-medium text-slate-100">
                            {aiExtract.supplierName || "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">מס׳ תעודה</dt>
                          <dd className="font-mono text-slate-100">
                            {aiExtract.deliveryNoteNumber || "—"}
                          </dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-slate-500">תאריך</dt>
                          <dd className="text-slate-200">
                            {aiExtract.deliveryDate || "—"}
                          </dd>
                        </div>
                      </dl>
                      {lines.length > 0 && editingLocked ? (
                        <div className="overflow-x-auto rounded-lg border border-white/5">
                          <table className="w-full min-w-[320px] text-start text-[11px]">
                            <thead>
                              <tr className="border-b border-white/10 bg-black/30 text-slate-400">
                                <th className="px-2 py-2 font-medium">פריט</th>
                                <th className="px-2 py-2 font-medium tabular-nums">
                                  הוזמן
                                </th>
                                <th className="px-2 py-2 font-medium tabular-nums">
                                  AI
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {lines.map((row) => {
                                const ordered = parseNum(row.quantity)
                                const aiQ =
                                  aiExtract.quantitiesByLineId[row.id] ?? null
                                const overOrdered =
                                  aiExtract.overOrderedLineIds.includes(row.id)
                                return (
                                  <tr
                                    key={row.id}
                                    className={cn(
                                      "border-b border-white/5 last:border-0",
                                      overOrdered
                                        ? "border-destructive/50 bg-destructive/15 text-destructive-foreground ring-1 ring-destructive/35"
                                        : "bg-transparent"
                                    )}
                                  >
                                    <td className="max-w-[200px] px-2 py-2 align-top text-slate-200">
                                      <span className="line-clamp-2">
                                        {row.descriptionAuto ?? "—"}
                                      </span>
                                      {overOrdered ? (
                                        <span className="mt-1 block text-[10px] font-semibold text-destructive">
                                          חריגה מהזמנת רכש!
                                        </span>
                                      ) : null}
                                    </td>
                                    <td className="px-2 py-2 tabular-nums text-slate-300">
                                      {ordered}
                                    </td>
                                    <td className="px-2 py-2 tabular-nums text-emerald-200/90">
                                      {aiQ != null ? aiQ : "—"}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                      <p className="text-[10px] leading-relaxed text-slate-500">
                        השוו כמויות Gemini לשורות ההזמנה — חריגה מעל הכמות המוזמנת
                        מודגשת באדום
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {selectedPoId && poReceipts.length > 0 ? (
              <div className="rounded-2xl border border-white/10 bg-card/[0.02] p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  קבלות למסמך
                </p>
                <ul className="space-y-2">
                  {poReceipts.map((r) => {
                    const pending =
                      (r.financial_approval_status ?? "pending") === "pending"
                    const shortNote =
                      (r.verification_notes ?? "").includes("משלוח חסר")
                    return (
                      <li
                        key={r.id}
                        className={cn(
                          "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                          shortNote
                            ? "border-amber-500/40 bg-amber-500/10"
                            : "border-white/5 bg-black/30"
                        )}
                      >
                        <span className="font-mono text-xs text-slate-300">
                          {r.id.slice(0, 8)} · {r.receipt_date}
                        </span>
                        {pending ? (
                          <span className="flex items-center gap-1 text-amber-300/90">
                            <Lock className="size-3.5" aria-hidden />
                            <span className="text-[11px]">ממתין לאישור פיננסי</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-emerald-300/90">אושר</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}

            {currentPoMeta && fullyReceived(currentPoMeta) ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-sm text-slate-400">
                  <FileText className="size-4" aria-hidden />
                  ההזמנה נסגרה בקבלה — ניתן להמשיך למסלול תשלום
                </p>
                <Button
                  type="button"
                  variant="outline"
                  nativeButton={false}
                  className="h-11 rounded-xl border-blue-500/40 bg-blue-500/10 text-blue-100 hover:bg-blue-500/20"
                  render={
                    <Link href="/marker-ofek/finance/payments/masav">
                      מסלול מס״ב (תשלומים)
                    </Link>
                  }
                />
              </div>
            ) : null}
          </div>
        </main>

        <aside
          className={cn(
            "order-2 flex w-full flex-col border-white/5 lg:w-[320px] lg:min-h-[calc(100vh-8rem)] lg:border-l-0 lg:border-r lg:border-white/10",
            "bg-[#060912]/90"
          )}
          dir="rtl"
        >
          <div className="sticky top-0 z-10 space-y-3 border-b border-white/5 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide text-slate-500">
                הזמנות
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-lg text-emerald-400 hover:bg-card/5 hover:text-emerald-300"
                onClick={() => {
                  resetBlank()
                  router.replace("/marker-ofek/procurement?new=1")
                }}
              >
                <Plus className="size-4" />
                חדש
              </Button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={poSearch}
                onChange={(e) => setPoSearch(e.target.value)}
                placeholder="חיפוש מס׳ הזמנה / ספק…"
                className="h-10 rounded-xl border-white/10 bg-card/5 ps-9 text-sm"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {filteredPoList.map((p) => {
              const life = hubLifecycle(p)
              const active = selectedPoId === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    void loadPo(p.id)
                    router.replace("/marker-ofek/procurement?po=" + encodeURIComponent(p.id))
                  }}
                  className={cn(
                    "mb-2 w-full rounded-xl px-3 py-2.5 text-start transition-colors",
                    active
                      ? "bg-emerald-500/15 ring-1 ring-emerald-500/40"
                      : "hover:bg-card/5"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium text-white">
                      {p.po_number}
                    </span>
                    <LifecycleBadge stage={life} />
                  </div>
                  <p className="truncate text-[11px] text-slate-400">
                    {p.supplier_name ?? "—"} · {p.order_date}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-slate-300">
                    {ils.format(p.total_amount)}
                  </p>
                </button>
              )
            })}
            {filteredPoList.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">
                אין הזמנות להצגה
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  )
}

function LifecycleBadge({
  stage,
}: {
  stage: "draft" | "sent" | "received" | "partial"
}) {
  const map = {
    draft: { label: "טיוטה", className: "bg-slate-600/40 text-slate-200" },
    sent: { label: "נשלח", className: "bg-blue-600/40 text-blue-100" },
    partial: {
      label: "חלקי",
      className: "bg-amber-600/35 text-amber-100",
    },
    received: {
      label: "התקבל",
      className: "bg-emerald-600/40 text-emerald-100",
    },
  }
  const m = map[stage]
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
        m.className
      )}
    >
      {m.label}
    </span>
  )
}

function StageChip({ label, on }: { label: string, on: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
        on
          ? "bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-500/50"
          : "bg-card/5 text-slate-500"
      )}
    >
      {label}
    </span>
  )
}
