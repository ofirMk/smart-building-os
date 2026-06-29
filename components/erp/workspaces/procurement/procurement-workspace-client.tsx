"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { FileDown, Link2, Loader2, Mail, Plus, RefreshCcw, Save, Send } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import {
  ERP_DENSE_INPUT_CLASS,
  ERP_DENSE_LABEL_CLASS,
} from "@/components/layout/DenseMasterDetailTemplate"
import { EntityWorkspace } from "@/components/layout/EntityWorkspace"
import { Badge } from "@/components/ui/badge"
import {
  BentoSmartList,
  type BentoSmartListColumn,
  type Density,
  SmartListDensityToggle,
  SmartListExportActions,
  SmartListStatusPill,
} from "@/components/ui/bento-smart-list"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { apiFetch, parseApiData } from "@/lib/utils/api-client"
import { cn } from "@/lib/utils"
import { ApprovalTrackPanel } from "@/components/erp/procurement/approval-track-panel"
import { LandedCostWizardDialog } from "@/components/erp/procurement/landed-cost-wizard"
import { SupplierSearchCombobox } from "@/components/erp/procurement/supplier-search-combobox"
import type {
  ErpGoodsReceipt,
  ErpGoodsReceiptLine,
  ErpProcurementStatusEvent,
  ErpPurchaseOrder,
  ErpPurchaseOrderLine,
  ErpVendorInvoice,
  ErpVendorInvoiceLine,
} from "@/types/erp"
import { buildPurchaseOrderPdfBlob, poReportFileName } from "./po-report-pdf"

type ApiResponse<T> = { data: T; error?: string }
type ApiErrorPayload = { error?: string; code?: string; data?: unknown }
type WorkspaceMode = "orders" | "receipts" | "invoices"
type SupplierContact = { email: string | null; isPrimary: boolean }
type Supplier = { id: string; supplierNum: string; name: string }
type Project = { id: string; projectNumber: string; name: string }
const uuidSchema = z.string().uuid()
const effectivePriceResponseSchema = z.object({
  data: z.object({
    unitPrice: z.coerce.number(),
    source: z.string(),
    warningCode: z.string().nullable().optional(),
    warningMessage: z.string().nullable().optional(),
  }),
})
type ItemLookup = {
  id: string
  itemNumber: string
  description: string
  budgetSubChapter: string | null
  resourceId: string | null
}
type EffectivePriceResult = {
  unitPrice: number
  source: "BLANKET_ORDER" | "PRICE_LIST" | "FALLBACK"
  isAgreedPrice: boolean
  warningCode: string | null
  warningMessage: string | null
}

const poFormSchema = z.object({
  title: z.string().trim().min(2),
  status: z.enum([
    "DRAFT",
    "PENDING_APPROVAL",
    "PENDING_PRICE_APPROVAL",
    "APPROVED",
    "SENT_TO_SUPPLIER",
    "SENT",
    "PARTIALLY_RECEIVED",
    "FULLY_RECEIVED",
    "CLOSED",
    "CANCELLED",
  ]),
  issuedAt: z.string().optional(),
  notes: z.string().optional(),
})
// NB: The API-boundary schema at
// app/api/erp/procurement/purchase-orders/[id]/lines/route.ts enforces
// `z.coerce.number()` for every numeric field coming off the wire. Keeping
// the client-side form schema as `z.number()` preserves React Hook Form's
// `Resolver<TFieldValues>` inference (coercion flips the input type to
// `unknown`, which breaks `useForm<z.infer<typeof schema>>()`).
const poLineFormSchema = z.object({
  itemId: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  budgetSubChapter: z.string().trim().min(1),
  resourceId: z.string().trim().min(1),
  description: z.string().trim().min(2),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
})
const grFormSchema = z.object({
  status: z.enum(["DRAFT", "COMPLETED", "FINAL"]),
  receiptDate: z.string().optional(),
  notes: z.string().optional(),
})
const invoiceFormSchema = z.object({
  status: z.enum([
    "DRAFT",
    "NEW",
    "MATCHED",
    "HAS_VARIANCES",
    "APPROVED",
    "READY_FOR_PAYMENT",
    "FINAL",
    "CANCELLED",
  ]),
  invoiceDate: z.string().optional(),
  notes: z.string().optional(),
})
const emailFormSchema = z.object({
  to: z.string().trim().email(),
  subject: z.string().trim().min(2),
  message: z.string().trim().min(4),
})
const effectivePriceUiSchema = z.object({
  unitPrice: z.number(),
  source: z.enum(["BLANKET_ORDER", "PRICE_LIST", "FALLBACK"]),
  isAgreedPrice: z.boolean(),
  warningCode: z.string().nullable(),
  warningMessage: z.string().nullable(),
})
const poLinesDataSchema = z.array(
  z.object({
    id: uuidSchema,
    quantity: z.coerce.number(),
    unitPrice: z.coerce.number(),
    totalPrice: z.coerce.number(),
  })
)
const grLinesDataSchema = z.array(
  z.object({
    id: uuidSchema,
    quantity: z.coerce.number(),
    unitPrice: z.coerce.number(),
    totalPrice: z.coerce.number(),
  })
)
const invoiceLinesDataSchema = z.array(
  z.object({
    id: uuidSchema,
    quantity: z.coerce.number(),
    unitPrice: z.coerce.number(),
    totalPrice: z.coerce.number(),
  })
)
const procurementAuditDataSchema = z.array(
  z.object({
    id: uuidSchema,
    createdAt: z.string(),
    entityType: z.enum(["PURCHASE_ORDER", "GOODS_RECEIPT", "VENDOR_INVOICE"]),
    entityId: uuidSchema,
    toStatus: z.string(),
    actionName: z.string(),
    companyId: z.string(),
    fromStatus: z.string().nullable(),
  })
)
const linkedReceiptIdsSchema = z.array(uuidSchema)

type PoForm = z.infer<typeof poFormSchema>
type PoLineForm = z.infer<typeof poLineFormSchema>
type GrForm = z.infer<typeof grFormSchema>
type InvoiceForm = z.infer<typeof invoiceFormSchema>
type EmailForm = z.infer<typeof emailFormSchema>

function money(value: number): string {
  return Number(value || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS" })
}

function statusBadge(status: string): string {
  if (status === "FINAL" || status === "SENT" || status === "CLOSED") return "border-emerald-200 bg-emerald-50 text-emerald-800"
  if (status === "CANCELLED") return "border-slate-300 bg-slate-100 text-slate-700"
  if (status === "APPROVED") return "border-blue-200 bg-blue-50 text-blue-800"
  return "border-amber-200 bg-amber-50 text-amber-800"
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(input, init)
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload
    const error = new Error(payload.error ?? "API request failed") as Error & {
      status?: number
      code?: string
      data?: unknown
    }
    error.status = response.status
    error.code = payload.code
    error.data = payload.data
    throw error
  }
  return parseApiData(response, {
    schema: z.any(),
    signal: init?.signal ?? undefined,
  }) as T
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  let binary = ""
  const bytes = new Uint8Array(buffer)
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function ProcurementWorkspaceClient() {
  const [mode, setMode] = React.useState<WorkspaceMode>("orders")
  const [loading, setLoading] = React.useState(true)
  const [working, setWorking] = React.useState(false)
  const [orders, setOrders] = React.useState<ErpPurchaseOrder[]>([])
  const [receipts, setReceipts] = React.useState<ErpGoodsReceipt[]>([])
  const [invoices, setInvoices] = React.useState<ErpVendorInvoice[]>([])
  const [poLines, setPoLines] = React.useState<ErpPurchaseOrderLine[]>([])
  const [grLines, setGrLines] = React.useState<ErpGoodsReceiptLine[]>([])
  const [invoiceLines, setInvoiceLines] = React.useState<ErpVendorInvoiceLine[]>([])
  const [linkedReceiptIds, setLinkedReceiptIds] = React.useState<string[]>([])
  const [auditLog, setAuditLog] = React.useState<ErpProcurementStatusEvent[]>([])
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([])
  const [projects, setProjects] = React.useState<Project[]>([])
  const [items, setItems] = React.useState<ItemLookup[]>([])
  const [selectedOrderId, setSelectedOrderId] = React.useState<string>("")
  const [selectedReceiptId, setSelectedReceiptId] = React.useState<string>("")
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState<string>("")
  const [emailModalOpen, setEmailModalOpen] = React.useState(false)
  const [resolvingPoPrice, setResolvingPoPrice] = React.useState(false)
  const [poLinePriceMeta, setPoLinePriceMeta] = React.useState<EffectivePriceResult | null>(null)
  const [priceOverrideModalOpen, setPriceOverrideModalOpen] = React.useState(false)
  const [pendingPriceOverrideValues, setPendingPriceOverrideValues] = React.useState<PoLineForm | null>(null)
  const lastPriceWarningRef = React.useRef<string | null>(null)
  const [ordersDensity, setOrdersDensity] = React.useState<Density>("compact")
  const [exportingRowId, setExportingRowId] = React.useState<string | null>(null)
  const [newPoDialogOpen, setNewPoDialogOpen] = React.useState(false)
  const [newPoSupplierId, setNewPoSupplierId] = React.useState("")
  const [newPoProjectId, setNewPoProjectId] = React.useState("")

  const selectedOrder = React.useMemo(
    () => orders.find((row) => row.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  )
  const selectedReceipt = React.useMemo(
    () => receipts.find((row) => row.id === selectedReceiptId) ?? null,
    [receipts, selectedReceiptId]
  )
  const selectedInvoice = React.useMemo(
    () => invoices.find((row) => row.id === selectedInvoiceId) ?? null,
    [invoices, selectedInvoiceId]
  )

  const poForm = useForm<PoForm>({
    resolver: zodResolver(poFormSchema),
    defaultValues: { title: "", status: "DRAFT", issuedAt: "", notes: "" },
  })
  const poLineForm = useForm<PoLineForm>({
    resolver: zodResolver(poLineFormSchema),
    defaultValues: { itemId: undefined, projectId: "", budgetSubChapter: "", resourceId: "", description: "", quantity: 1, unitPrice: 0 },
  })
  const grForm = useForm<GrForm>({
    resolver: zodResolver(grFormSchema),
    defaultValues: { status: "DRAFT", receiptDate: "", notes: "" },
  })
  const invoiceForm = useForm<InvoiceForm>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: { status: "DRAFT", invoiceDate: "", notes: "" },
  })
  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: { to: "", subject: "", message: "" },
  })

  const loadWorkspace = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const [ordersRes, receiptsRes, invoicesRes, suppliersRes, projectsRes, itemsRes] = await Promise.all([
        requestJson<ApiResponse<ErpPurchaseOrder[]>>("/api/erp/procurement/purchase-orders", { signal }),
        requestJson<ApiResponse<ErpGoodsReceipt[]>>("/api/erp/procurement/goods-receipts", { signal }),
        requestJson<ApiResponse<ErpVendorInvoice[]>>("/api/erp/procurement/vendor-invoices", { signal }),
        requestJson<ApiResponse<Supplier[]>>("/api/erp/master-data/suppliers", { signal }),
        requestJson<ApiResponse<Project[]>>("/api/erp/projects", { signal }),
        requestJson<ApiResponse<ItemLookup[]>>("/api/erp/master-data/items", { signal }),
      ])
      if (signal?.aborted) return
      setOrders(ordersRes.data ?? [])
      setReceipts(receiptsRes.data ?? [])
      setInvoices(invoicesRes.data ?? [])
      setSuppliers(suppliersRes.data ?? [])
      setProjects(projectsRes.data ?? [])
      setItems(itemsRes.data ?? [])
      if (!selectedOrderId && (ordersRes.data?.length ?? 0) > 0) setSelectedOrderId(ordersRes.data[0]!.id)
      if (!selectedReceiptId && (receiptsRes.data?.length ?? 0) > 0) setSelectedReceiptId(receiptsRes.data[0]!.id)
      if (!selectedInvoiceId && (invoicesRes.data?.length ?? 0) > 0) setSelectedInvoiceId(invoicesRes.data[0]!.id)
    } catch (error) {
      if (signal?.aborted) return
      toast.error(error instanceof Error ? error.message : "טעינת נתונים נכשלה")
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [selectedInvoiceId, selectedOrderId, selectedReceiptId])

  React.useEffect(() => {
    const controller = new AbortController()
    void loadWorkspace(controller.signal)
    return () => controller.abort()
  }, [loadWorkspace])

  React.useEffect(() => {
    if (!selectedOrder) {
      setPoLines([])
      setAuditLog([])
      return
    }
    const controller = new AbortController()
    poForm.reset({
      title: selectedOrder.title,
      status: selectedOrder.status,
      issuedAt: selectedOrder.issuedAt ?? "",
      notes: selectedOrder.notes ?? "",
    })
    setPoLines([])
    setAuditLog([])
    void Promise.all([
      requestJson<ApiResponse<unknown>>(`/api/erp/procurement/purchase-orders/${selectedOrder.id}/lines`, {
        signal: controller.signal,
      }),
      requestJson<ApiResponse<unknown>>(
        `/api/erp/procurement/status-events?entityType=PURCHASE_ORDER&entityId=${selectedOrder.id}`,
        { signal: controller.signal }
      ),
    ])
      .then(([lineResult, auditResult]) => {
        if (controller.signal.aborted) return
        const parsedLines = poLinesDataSchema.safeParse(lineResult.data)
        setPoLines(parsedLines.success ? (lineResult.data as ErpPurchaseOrderLine[]) : [])
        const parsedAudit = procurementAuditDataSchema.safeParse(auditResult.data)
        setAuditLog(parsedAudit.success ? (auditResult.data as ErpProcurementStatusEvent[]) : [])
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setPoLines([])
        setAuditLog([])
      })
    return () => controller.abort()
  }, [poForm, selectedOrder])

  const watchedPoLineItemId = poLineForm.watch("itemId")
  const watchedPoLineQuantity = poLineForm.watch("quantity")

  React.useEffect(() => {
    if (!watchedPoLineItemId || !selectedOrder) {
      setPoLinePriceMeta(null)
      return
    }

    const selectedItem = items.find((item) => item.id === watchedPoLineItemId) ?? null
    if (selectedItem) {
      if (!poLineForm.getValues("description")?.trim()) {
        poLineForm.setValue("description", selectedItem.description ?? "", { shouldValidate: true })
      }
      if (!poLineForm.getValues("budgetSubChapter")?.trim() && selectedItem.budgetSubChapter) {
        poLineForm.setValue("budgetSubChapter", selectedItem.budgetSubChapter, { shouldValidate: true })
      }
      if (!poLineForm.getValues("resourceId")?.trim() && selectedItem.resourceId) {
        poLineForm.setValue("resourceId", selectedItem.resourceId, { shouldValidate: true })
      }
    }

    const quantity = Number(watchedPoLineQuantity ?? 0)
    if (!Number.isFinite(quantity) || quantity < 0) return

    const controller = new AbortController()
    setResolvingPoPrice(true)
    const timeoutId = window.setTimeout(() => {
      void requestJson<ApiResponse<unknown>>("/api/erp/pricing/effective-price", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          itemId: watchedPoLineItemId,
          supplierId: selectedOrder.supplierId,
          quantity,
          date: selectedOrder.issuedAt ?? new Date().toISOString().slice(0, 10),
        }),
      })
        .then((result) => {
          const parsedPrice = effectivePriceUiSchema.safeParse(result.data)
          if (!parsedPrice.success) return
          const price = parsedPrice.data
          poLineForm.setValue("unitPrice", Number(price.unitPrice ?? 0), {
            shouldDirty: true,
            shouldValidate: true,
          })
          setPoLinePriceMeta(price)
          if (price.warningCode && price.warningMessage) {
            const warningKey = `${price.warningCode}:${watchedPoLineItemId}:${quantity}`
            if (lastPriceWarningRef.current !== warningKey) {
              toast(price.warningMessage)
              lastPriceWarningRef.current = warningKey
            }
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) setResolvingPoPrice(false)
        })
    }, 280)

    return () => {
      controller.abort()
      setResolvingPoPrice(false)
      window.clearTimeout(timeoutId)
    }
  }, [items, poLineForm, selectedOrder, watchedPoLineItemId, watchedPoLineQuantity])

  React.useEffect(() => {
    if (!selectedReceipt) {
      setGrLines([])
      setAuditLog([])
      return
    }
    const controller = new AbortController()
    grForm.reset({
      status: selectedReceipt.status,
      receiptDate: selectedReceipt.receiptDate ?? "",
      notes: selectedReceipt.notes ?? "",
    })
    setGrLines([])
    setAuditLog([])
    void Promise.all([
      requestJson<ApiResponse<unknown>>(`/api/erp/procurement/goods-receipts/${selectedReceipt.id}/lines`, {
        signal: controller.signal,
      }),
      requestJson<ApiResponse<unknown>>(
        `/api/erp/procurement/status-events?entityType=GOODS_RECEIPT&entityId=${selectedReceipt.id}`,
        { signal: controller.signal }
      ),
    ])
      .then(([lineResult, auditResult]) => {
        if (controller.signal.aborted) return
        const parsedLines = grLinesDataSchema.safeParse(lineResult.data)
        setGrLines(parsedLines.success ? (lineResult.data as ErpGoodsReceiptLine[]) : [])
        const parsedAudit = procurementAuditDataSchema.safeParse(auditResult.data)
        setAuditLog(parsedAudit.success ? (auditResult.data as ErpProcurementStatusEvent[]) : [])
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setGrLines([])
        setAuditLog([])
      })
    return () => controller.abort()
  }, [grForm, selectedReceipt])

  React.useEffect(() => {
    if (!selectedInvoice) {
      setInvoiceLines([])
      setLinkedReceiptIds([])
      setAuditLog([])
      return
    }
    const controller = new AbortController()
    invoiceForm.reset({
      status: selectedInvoice.status,
      invoiceDate: selectedInvoice.invoiceDate ?? "",
      notes: selectedInvoice.notes ?? "",
    })
    setInvoiceLines([])
    setLinkedReceiptIds([])
    setAuditLog([])
    void Promise.all([
      requestJson<ApiResponse<unknown>>(`/api/erp/procurement/vendor-invoices/${selectedInvoice.id}/lines`, {
        signal: controller.signal,
      }),
      requestJson<ApiResponse<unknown>>(
        `/api/erp/procurement/vendor-invoices/${selectedInvoice.id}/link-receipts`,
        { signal: controller.signal }
      ),
      requestJson<ApiResponse<unknown>>(
        `/api/erp/procurement/status-events?entityType=VENDOR_INVOICE&entityId=${selectedInvoice.id}`,
        { signal: controller.signal }
      ),
    ])
      .then(([lineResult, linkedResult, auditResult]) => {
        if (controller.signal.aborted) return
        const parsedLines = invoiceLinesDataSchema.safeParse(lineResult.data)
        setInvoiceLines(parsedLines.success ? (lineResult.data as ErpVendorInvoiceLine[]) : [])
        const parsedLinked = linkedReceiptIdsSchema.safeParse(linkedResult.data)
        setLinkedReceiptIds(parsedLinked.success ? parsedLinked.data : [])
        const parsedAudit = procurementAuditDataSchema.safeParse(auditResult.data)
        setAuditLog(parsedAudit.success ? (auditResult.data as ErpProcurementStatusEvent[]) : [])
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setInvoiceLines([])
        setLinkedReceiptIds([])
        setAuditLog([])
      })
    return () => controller.abort()
  }, [invoiceForm, selectedInvoice])

  async function saveOrder(values: PoForm) {
    if (!selectedOrder) return
    setWorking(true)
    try {
      await requestJson(`/api/erp/procurement/purchase-orders/${selectedOrder.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: values.title,
          status: values.status,
          issuedAt: values.issuedAt || null,
          notes: values.notes || null,
        }),
      })
      toast.success("הזמנה נשמרה")
      await loadWorkspace()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירה נכשלה")
    } finally {
      setWorking(false)
    }
  }

  async function addOrderLine(values: PoLineForm) {
    if (!selectedOrder) return
    if (
      poLinePriceMeta &&
      poLinePriceMeta.unitPrice > 0 &&
      Number(values.unitPrice) > Number(poLinePriceMeta.unitPrice)
    ) {
      setPendingPriceOverrideValues(values)
      setPriceOverrideModalOpen(true)
      return
    }
    setWorking(true)
    try {
      const created = await requestJson<{ warning?: { message?: string | null } }>(
        `/api/erp/procurement/purchase-orders/${selectedOrder.id}/lines`,
        {
        method: "POST",
        body: JSON.stringify(values),
        }
      )
      toast.success("שורת הזמנה נוספה")
      if (created.warning?.message) {
        toast.warning(created.warning.message)
      }
      poLineForm.reset({
        ...values,
        itemId: undefined,
        description: "",
        quantity: 1,
      })
      setPoLinePriceMeta(null)
      await loadWorkspace()
    } catch (error) {
      const apiError = error as Error & { code?: string }
      if (apiError.code === "PRICE_OVERRIDE_REQUIRED") {
        setPendingPriceOverrideValues(values)
        setPriceOverrideModalOpen(true)
        toast.error("חריגת מחיר ממחירון")
        return
      }
      toast.error(error instanceof Error ? error.message : "הוספת שורה נכשלה")
    } finally {
      setWorking(false)
    }
  }

  async function requestManagerPriceOverride() {
    if (!selectedOrder || !pendingPriceOverrideValues) return
    setWorking(true)
    try {
      const created = await requestJson<{ warning?: { message?: string | null } }>(
        `/api/erp/procurement/purchase-orders/${selectedOrder.id}/lines`,
        {
        method: "POST",
        body: JSON.stringify({
          ...pendingPriceOverrideValues,
          requestManagerApproval: true,
        }),
        }
      )
      toast.success("שורת הזמנה נוספה")
      if (created.warning?.message) {
        toast.warning(created.warning.message)
      }
      setPriceOverrideModalOpen(false)
      setPendingPriceOverrideValues(null)
      await loadWorkspace()
    } catch (error) {
      const apiError = error as Error & { code?: string }
      if (apiError.code === "PRICE_OVERRIDE_REQUIRED") {
        toast.success("בקשת אישור מנהל נשלחה")
        setPriceOverrideModalOpen(false)
        setPendingPriceOverrideValues(null)
        await loadWorkspace()
        return
      }
      toast.error(error instanceof Error ? error.message : "בקשת אישור מנהל נכשלה")
    } finally {
      setWorking(false)
    }
  }

  async function autofillPoUnitPrice() {
    if (!selectedOrder) return
    const resourceId = poLineForm.getValues("resourceId").trim()
    const quantity = Number(poLineForm.getValues("quantity") ?? 0)
    const parsedItem = uuidSchema.safeParse(resourceId)
    if (!parsedItem.success || quantity < 0) return

    setResolvingPoPrice(true)
    try {
      const raw = await requestJson<unknown>("/api/erp/pricing/effective-price", {
        method: "POST",
        body: JSON.stringify({
          itemId: parsedItem.data,
          supplierId: selectedOrder.supplierId,
          quantity,
          date: new Date().toISOString().slice(0, 10),
        }),
      })
      const parsed = effectivePriceResponseSchema.safeParse(raw)
      if (!parsed.success) {
        console.error("Effective price payload validation failed", parsed.error)
        throw new Error("נתוני מחיר אינם תקינים")
      }
      poLineForm.setValue("unitPrice", parsed.data.data.unitPrice, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      })
      if (parsed.data.data.warningMessage) {
        toast.message(parsed.data.data.warningMessage)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שליפת מחיר נכשלה")
    } finally {
      setResolvingPoPrice(false)
    }
  }

  async function saveReceipt(values: GrForm) {
    if (!selectedReceipt) return
    setWorking(true)
    try {
      await requestJson(`/api/erp/procurement/goods-receipts/${selectedReceipt.id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: values.status,
          receiptDate: values.receiptDate || null,
          notes: values.notes || null,
        }),
      })
      toast.success("תעודת קליטה נשמרה")
      await loadWorkspace()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירה נכשלה")
    } finally {
      setWorking(false)
    }
  }

  async function saveInvoice(values: InvoiceForm) {
    if (!selectedInvoice) return
    setWorking(true)
    try {
      await requestJson(`/api/erp/procurement/vendor-invoices/${selectedInvoice.id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: values.status,
          invoiceDate: values.invoiceDate || null,
          notes: values.notes || null,
        }),
      })
      toast.success("חשבונית נשמרה")
      await loadWorkspace()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירה נכשלה")
    } finally {
      setWorking(false)
    }
  }

  async function saveInvoiceLinkedReceipts() {
    if (!selectedInvoice) return
    setWorking(true)
    try {
      await requestJson(`/api/erp/procurement/vendor-invoices/${selectedInvoice.id}/link-receipts`, {
        method: "PUT",
        body: JSON.stringify({ goodsReceiptIds: linkedReceiptIds }),
      })
      toast.success("קישור תעודות קליטה נשמר")
      await loadWorkspace()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירת קישור נכשלה")
    } finally {
      setWorking(false)
    }
  }

  async function createEntityDraft() {
    setWorking(true)
    try {
      if (mode === "orders") {
        if (!projects[0] || !suppliers[0]) {
          throw new Error("Create at least one project and one supplier first")
        }
        await requestJson("/api/erp/procurement/purchase-orders", {
          method: "POST",
          body: JSON.stringify({
            projectId: projects[0].id,
            supplierId: suppliers[0].id,
            poNumber: `PO-${Date.now().toString().slice(-6)}`,
            title: "New Purchase Order",
          }),
        })
      } else if (mode === "receipts") {
        if (!orders[0]) throw new Error("Create a purchase order first")
        await requestJson("/api/erp/procurement/goods-receipts", {
          method: "POST",
          body: JSON.stringify({
            purchaseOrderId: orders[0].id,
            grNumber: `GR-${Date.now().toString().slice(-6)}`,
            receiptDate: new Date().toISOString().slice(0, 10),
            notes: "Draft goods receipt",
          }),
        })
      } else {
        if (!suppliers[0]) throw new Error("Create a supplier first")
        await requestJson("/api/erp/procurement/vendor-invoices", {
          method: "POST",
          body: JSON.stringify({
            supplierId: suppliers[0].id,
            invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
            invoiceDate: new Date().toISOString().slice(0, 10),
            notes: "Draft vendor invoice",
          }),
        })
      }
      await loadWorkspace()
      toast.success("טיוטה חדשה נוצרה")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "יצירת טיוטה נכשלה")
    } finally {
      setWorking(false)
    }
  }

  async function createGoodsReceiptFromPo() {
    if (!selectedOrder) return
    setWorking(true)
    try {
      const grNumber = `GR-${selectedOrder.poNumber}-${Date.now().toString().slice(-4)}`
      await requestJson(`/api/erp/procurement/goods-receipts`, {
        method: "POST",
        body: JSON.stringify({
          purchaseOrderId: selectedOrder.id,
          grNumber,
          receiptDate: new Date().toISOString().slice(0, 10),
          notes: `Generated from PO ${selectedOrder.poNumber}`,
        }),
      })
      toast.success("נוצרה תעודת קליטה חדשה")
      await loadWorkspace()
      setMode("receipts")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "יצירת תעודת קליטה נכשלה")
    } finally {
      setWorking(false)
    }
  }

  async function exportPoPdf() {
    if (!selectedOrder) return
    try {
      const blob = buildPurchaseOrderPdfBlob(selectedOrder, poLines)
      const href = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = href
      link.download = poReportFileName(selectedOrder)
      link.click()
      URL.revokeObjectURL(href)
      toast.success("קובץ PDF הופק")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "הפקת PDF נכשלה")
    }
  }

  async function exportOrderRowPdf(order: ErpPurchaseOrder) {
    setExportingRowId(order.id)
    try {
      const lines = await requestJson<ApiResponse<ErpPurchaseOrderLine[]>>(
        `/api/erp/procurement/purchase-orders/${order.id}/lines`
      ).catch(() => ({ data: [] as ErpPurchaseOrderLine[] }))
      const blob = buildPurchaseOrderPdfBlob(order, lines.data ?? [])
      const href = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = href
      link.download = poReportFileName(order)
      link.click()
      URL.revokeObjectURL(href)
      toast.success(`PO ${order.poNumber} · PDF הופק`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "הפקת PDF נכשלה")
    } finally {
      setExportingRowId(null)
    }
  }

  async function sendOrderRowViaWhatsApp(order: ErpPurchaseOrder) {
    setExportingRowId(order.id)
    try {
      const supplier = suppliers.find((row) => row.id === order.supplierId)
      const supplierLabel = supplier?.name ?? order.supplierId
      const text =
        `Purchase Order ${order.poNumber} · ${order.title}\n` +
        `Supplier: ${supplierLabel}\n` +
        `Total: ${money(order.totalAmount)}\n` +
        `Status: ${order.status}`
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
      if (typeof window !== "undefined") {
        window.open(whatsappUrl, "_blank", "noopener,noreferrer")
      }
      toast.success(`PO ${order.poNumber} · נפתח WhatsApp`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שליחת WhatsApp נכשלה")
    } finally {
      setExportingRowId(null)
    }
  }

  function purchaseOrderPillTone(
    status: ErpPurchaseOrder["status"]
  ): "success" | "info" | "warning" | "danger" | "neutral" {
    if (status === "APPROVED" || status === "SENT" || status === "CLOSED") return "success"
    if (status === "PENDING_PRICE_APPROVAL") return "warning"
    if (status === "CANCELLED") return "danger"
    if (status === "DRAFT") return "info"
    return "neutral"
  }

  const ordersListColumns: BentoSmartListColumn<ErpPurchaseOrder>[] = React.useMemo(
    () => [
      {
        key: "po",
        title: "PO",
        render: (order) => <span className="font-mono text-xs">{order.poNumber}</span>,
      },
      {
        key: "title",
        title: "Title",
        render: (order) => <span className="text-xs">{order.title}</span>,
      },
      {
        key: "status",
        title: "Status",
        render: (order) => (
          <SmartListStatusPill tone={purchaseOrderPillTone(order.status)}>
            {order.status}
          </SmartListStatusPill>
        ),
      },
      {
        key: "total",
        title: "Total",
        render: (order) => <span className="font-mono text-xs">{money(order.totalAmount)}</span>,
      },
    ],
    []
  )

  async function openSendToSupplier() {
    if (!selectedOrder) return
    const contacts = await requestJson<ApiResponse<SupplierContact[]>>(
      `/api/erp/master-data/suppliers/${selectedOrder.supplierId}/contacts`
    ).catch(() => ({ data: [] as SupplierContact[] }))
    const primary = contacts.data.find((row) => row.isPrimary && row.email) ?? contacts.data.find((row) => !!row.email)
    emailForm.reset({
      to: primary?.email ?? "",
      subject: `Purchase Order ${selectedOrder.poNumber}`,
      message: `Hello,\n\nPlease find attached Purchase Order ${selectedOrder.poNumber}.\n\nRegards,\nSmart Building OS`,
    })
    setEmailModalOpen(true)
  }

  async function sendPoToSupplier(values: EmailForm) {
    if (!selectedOrder) return
    setWorking(true)
    try {
      const blob = buildPurchaseOrderPdfBlob(selectedOrder, poLines)
      const pdfBase64 = await blobToBase64(blob)
      await requestJson(`/api/erp/procurement/purchase-orders/${selectedOrder.id}/send-email`, {
        method: "POST",
        body: JSON.stringify({
          to: values.to,
          subject: values.subject,
          message: values.message,
          fileName: poReportFileName(selectedOrder),
          pdfBase64,
        }),
      })
      toast.success("הזמנה נשלחה לספק")
      setEmailModalOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שליחת הזמנה נכשלה")
    } finally {
      setWorking(false)
    }
  }

  const masterTable =
    mode === "orders" ? (
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-card px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Purchase Orders · {orders.length}
          </p>
          <SmartListDensityToggle density={ordersDensity} onChange={setOrdersDensity} />
        </div>
        <div className="max-h-[64vh] overflow-auto">
          <BentoSmartList<ErpPurchaseOrder>
            items={orders}
            rowKey={(order) => order.id}
            columns={ordersListColumns}
            density={ordersDensity}
            selectedRowKey={selectedOrderId || null}
            onRowClick={(order) => setSelectedOrderId(order.id)}
            emptyState={loading ? "טוען הזמנות..." : "אין הזמנות רכש"}
            rowActions={(order) => (
              <SmartListExportActions
                onPdf={() => exportOrderRowPdf(order)}
                onExcel={() => sendOrderRowViaWhatsApp(order)}
                working={exportingRowId === order.id}
              />
            )}
          />
        </div>
      </div>
    ) : (
    <div className="max-h-[64vh] overflow-auto rounded-2xl border border-slate-200 bg-card">
      <Table>
        <TableHeader>
          <TableRow className="sticky top-0 bg-card">
            {mode === "receipts" ? (
              <>
                <TableHead className="text-right">GR</TableHead>
                <TableHead className="text-right">PO</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </>
            ) : (
              <>
                <TableHead className="text-right">Invoice</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Price Variance</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-sm text-slate-500">
                טוען...
              </TableCell>
            </TableRow>
          ) : mode === "receipts" ? (
            receipts.map((row) => (
              <TableRow key={row.id} className="cursor-pointer hover:bg-muted" onClick={() => setSelectedReceiptId(row.id)}>
                <TableCell className="font-mono text-xs">{row.grNumber}</TableCell>
                <TableCell className="font-mono text-xs">{orders.find((x) => x.id === row.purchaseOrderId)?.poNumber ?? row.purchaseOrderId}</TableCell>
                <TableCell><Badge variant="outline" className={cn("text-[10px]", statusBadge(row.status))}>{row.status}</Badge></TableCell>
                <TableCell>{row.receiptDate ?? "—"}</TableCell>
              </TableRow>
            ))
          ) : (
            invoices.map((row) => (
              <TableRow key={row.id} className="cursor-pointer hover:bg-muted" onClick={() => setSelectedInvoiceId(row.id)}>
                <TableCell className="font-mono text-xs">{row.invoiceNumber}</TableCell>
                <TableCell><Badge variant="outline" className={cn("text-[10px]", statusBadge(row.status))}>{row.status}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{money(row.totalAmount)}</TableCell>
                <TableCell className={cn("font-mono text-xs", row.priceVarianceAmount === 0 ? "text-emerald-700" : "text-amber-700")}>{money(row.priceVarianceAmount)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )

  const orderSupplierLabel = selectedOrder
    ? suppliers.find((supplier) => supplier.id === selectedOrder.supplierId)?.name ?? selectedOrder.supplierId
    : ""
  const orderProjectLabel = selectedOrder
    ? projects.find((project) => project.id === selectedOrder.projectId)?.name ?? selectedOrder.projectId
    : ""

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background" dir="rtl">
      <EntityWorkspace
        title="Procurement Command Center"
        description="מסך פקודות מלא לרכש: הזמנות, תעודות קליטה וחשבוניות ספק."
        className="bg-background"
        headerActions={
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={() => {
              if (mode === "orders") {
                setNewPoSupplierId(suppliers[0]?.id ?? "")
                setNewPoProjectId(projects[0]?.id ?? "")
                setNewPoDialogOpen(true)
              } else {
                void createEntityDraft()
              }
            }} disabled={working}>
              <Plus className="ms-1 size-3.5" />
              חדש
            </Button>
            <Button size="sm" variant="outline" onClick={() => void loadWorkspace()}>
              <RefreshCcw className="ms-1 size-3.5" />
              רענון
            </Button>
            <Select value={mode} onValueChange={(value) => setMode(value as WorkspaceMode)}>
              <SelectTrigger className="h-8 min-w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="orders">Orders Workspace</SelectItem>
                <SelectItem value="receipts">Receipts Workspace</SelectItem>
                <SelectItem value="invoices">Invoices Workspace</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        sidebar={masterTable}
        main={
          <>
          <Tabs defaultValue="general" className="space-y-2">
            <TabsList className="h-9 rounded-xl bg-card" variant="line">
              <TabsTrigger value="general">General Info</TabsTrigger>
              <TabsTrigger value="lines">Lines Detail</TabsTrigger>
              <TabsTrigger value="links">Linked Documents</TabsTrigger>
              {mode === "orders" && <TabsTrigger value="approvals">אישורים</TabsTrigger>}
              <TabsTrigger value="audit">Audit Log</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="rounded-2xl border border-slate-200 bg-card p-3">
              {mode === "orders" && selectedOrder ? (
                <Form {...poForm}>
                  <form className="grid grid-cols-1 gap-3 md:grid-cols-4" onSubmit={poForm.handleSubmit(saveOrder)}>
                    <div className="rounded-xl border border-slate-200 bg-card px-2 py-1 text-xs">
                      <p className="text-[11px] text-slate-500">Supplier</p>
                      <p>{orderSupplierLabel}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-card px-2 py-1 text-xs">
                      <p className="text-[11px] text-slate-500">Project</p>
                      <p>{orderProjectLabel}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-card px-2 py-1 text-xs">
                      <p className="text-[11px] text-slate-500">Total</p>
                      <p className="font-mono">{money(selectedOrder.totalAmount)}</p>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => void exportPoPdf()}>
                        <FileDown className="ms-1 size-3.5" />
                        PDF
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void openSendToSupplier()}>
                        <Mail className="ms-1 size-3.5" />
                        Send to Supplier
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void createGoodsReceiptFromPo()}>
                        <Send className="ms-1 size-3.5" />
                        Create Goods Receipt
                      </Button>
                    </div>
                    <FormField control={poForm.control} name="title" render={({ field }) => (
                      <FormItem className="md:col-span-2"><FormLabel className={ERP_DENSE_LABEL_CLASS}>Title</FormLabel><FormControl><Input {...field} className={ERP_DENSE_INPUT_CLASS} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={poForm.control} name="status" render={({ field }) => (
                      <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger className={ERP_DENSE_INPUT_CLASS}><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="DRAFT">DRAFT</SelectItem><SelectItem value="PENDING_PRICE_APPROVAL">PENDING_PRICE_APPROVAL</SelectItem><SelectItem value="APPROVED">APPROVED</SelectItem><SelectItem value="SENT">SENT</SelectItem><SelectItem value="CLOSED">CLOSED</SelectItem><SelectItem value="CANCELLED">CANCELLED</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                    )} />
                    <FormField control={poForm.control} name="issuedAt" render={({ field }) => (
                      <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Issued At</FormLabel><FormControl><Input {...field} type="date" className={ERP_DENSE_INPUT_CLASS} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={poForm.control} name="notes" render={({ field }) => (
                      <FormItem className="md:col-span-4"><FormLabel className={ERP_DENSE_LABEL_CLASS}>Notes</FormLabel><FormControl><Textarea {...field} className="min-h-20 text-sm" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="md:col-span-4 flex justify-end"><Button type="submit" size="sm" disabled={working}>{working ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} שמירה</Button></div>
                  </form>
                </Form>
              ) : mode === "receipts" && selectedReceipt ? (
                <Form {...grForm}>
                  <form className="grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={grForm.handleSubmit(saveReceipt)}>
                    <FormField control={grForm.control} name="status" render={({ field }) => (
                      <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger className={ERP_DENSE_INPUT_CLASS}><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="DRAFT">DRAFT</SelectItem><SelectItem value="FINAL">FINAL</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                    )} />
                    <FormField control={grForm.control} name="receiptDate" render={({ field }) => (
                      <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Receipt Date</FormLabel><FormControl><Input {...field} type="date" className={ERP_DENSE_INPUT_CLASS} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={grForm.control} name="notes" render={({ field }) => (
                      <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Notes</FormLabel><FormControl><Input {...field} className={ERP_DENSE_INPUT_CLASS} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="md:col-span-3 flex justify-end gap-2">
                      <LandedCostWizardDialog
                        grId={selectedReceipt.id}
                        grNumber={selectedReceipt.grNumber}
                        trigger={<Button size="sm" variant="outline" type="button">עלויות נחיתה</Button>}
                      />
                      <Button type="submit" size="sm" disabled={working}>{working ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} שמירה</Button>
                    </div>
                  </form>
                </Form>
              ) : mode === "invoices" && selectedInvoice ? (
                <Form {...invoiceForm}>
                  <form className="grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={invoiceForm.handleSubmit(saveInvoice)}>
                    <div className="rounded-xl border border-slate-200 bg-card px-2 py-1 text-xs">
                      <p className="text-[11px] text-slate-500">Price Variance</p>
                      <p className={cn("font-mono", selectedInvoice.priceVarianceAmount === 0 ? "text-emerald-700" : "text-amber-700")}>{money(selectedInvoice.priceVarianceAmount)}</p>
                    </div>
                    <FormField control={invoiceForm.control} name="status" render={({ field }) => (
                      <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger className={ERP_DENSE_INPUT_CLASS}><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="DRAFT">DRAFT</SelectItem><SelectItem value="FINAL">FINAL</SelectItem><SelectItem value="CANCELLED">CANCELLED</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                    )} />
                    <FormField control={invoiceForm.control} name="invoiceDate" render={({ field }) => (
                      <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Invoice Date</FormLabel><FormControl><Input {...field} type="date" className={ERP_DENSE_INPUT_CLASS} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={invoiceForm.control} name="notes" render={({ field }) => (
                      <FormItem className="md:col-span-3"><FormLabel className={ERP_DENSE_LABEL_CLASS}>Notes</FormLabel><FormControl><Textarea {...field} className="min-h-20 text-sm" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="md:col-span-3 flex justify-end"><Button type="submit" size="sm" disabled={working}>{working ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} שמירה</Button></div>
                  </form>
                </Form>
              ) : (
                <p className="text-sm text-slate-500">בחר רשומה מהטבלה הראשית.</p>
              )}
            </TabsContent>

            <TabsContent value="lines" className="rounded-2xl border border-slate-200 bg-card p-3">
              {mode === "orders" && selectedOrder ? (
                <>
                  <Form {...poLineForm}>
                    <form className="grid gap-2 rounded-xl border border-slate-200 bg-card p-2 lg:grid-cols-[1fr_1fr_1fr_1fr_2fr_110px_140px_auto]" onSubmit={poLineForm.handleSubmit(addOrderLine)}>
                      <FormField control={poLineForm.control} name="itemId" render={({ field }) => (
                        <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Item</FormLabel><Select value={field.value || undefined} onValueChange={field.onChange}><FormControl><SelectTrigger className={ERP_DENSE_INPUT_CLASS}><SelectValue placeholder="בחר פריט" /></SelectTrigger></FormControl><SelectContent>{items.map((item) => <SelectItem key={item.id} value={item.id}>{item.itemNumber} · {item.description}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                      )} />
                      <FormField control={poLineForm.control} name="projectId" render={({ field }) => (
                        <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Project</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger className={ERP_DENSE_INPUT_CLASS}><SelectValue placeholder="בחר פרויקט" /></SelectTrigger></FormControl><SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.projectNumber} · {project.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                      )} />
                      <FormField control={poLineForm.control} name="budgetSubChapter" render={({ field }) => (
                        <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Budget Sub Chapter</FormLabel><FormControl><Input {...field} className={ERP_DENSE_INPUT_CLASS} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={poLineForm.control} name="resourceId" render={({ field }) => (
                        <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Resource ID (Item ID)</FormLabel><FormControl><Input {...field} className={ERP_DENSE_INPUT_CLASS} onBlur={() => void autofillPoUnitPrice()} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={poLineForm.control} name="description" render={({ field }) => (
                        <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Description</FormLabel><FormControl><Input {...field} className={ERP_DENSE_INPUT_CLASS} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={poLineForm.control} name="quantity" render={({ field }) => (
                        <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Qty</FormLabel><FormControl><Input type="number" step="0.001" value={field.value} className={ERP_DENSE_INPUT_CLASS} onChange={(event) => field.onChange(event.target.value === "" ? 0 : Number(event.target.value))} onBlur={() => void autofillPoUnitPrice()} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={poLineForm.control} name="unitPrice" render={({ field }) => (
                        <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Unit Price</FormLabel><FormControl><div className="flex items-center gap-1"><Input type="number" step="0.01" value={field.value} className={ERP_DENSE_INPUT_CLASS} onChange={(event) => field.onChange(event.target.value === "" ? 0 : Number(event.target.value))} />{poLinePriceMeta?.isAgreedPrice ? <span title={poLinePriceMeta.source === "BLANKET_ORDER" ? "Agreed price from blanket order" : "Agreed price from vendor price list"} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700"><Link2 className="size-3.5" /></span> : null}</div></FormControl><FormMessage /></FormItem>
                      )} />
                      <div className="flex items-end">
                        <Button type="button" size="sm" variant="outline" disabled={resolvingPoPrice || working} onClick={() => void autofillPoUnitPrice()}>
                          {resolvingPoPrice ? <Loader2 className="ms-1 size-3.5 animate-spin" /> : null}
                          מחיר אוטומטי
                        </Button>
                        <Button type="submit" size="sm" className="ms-2" disabled={working}><Plus className="ms-1 size-3.5" />הוסף</Button>
                      </div>
                    </form>
                  </Form>
                  <div className="mt-2 max-h-[42vh] overflow-auto rounded-xl border border-slate-200 bg-card">
                    <Table>
                      <TableHeader><TableRow><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Resource</TableHead><TableHead className="text-right">Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                      <TableBody>{poLines.map((line) => <TableRow key={line.id}><TableCell>{line.budgetSubChapter}</TableCell><TableCell>{line.resourceId}</TableCell><TableCell>{line.description}</TableCell><TableCell>{line.quantity}</TableCell><TableCell>{money(line.unitPrice)}</TableCell><TableCell>{money(line.totalPrice)}</TableCell></TableRow>)}</TableBody>
                    </Table>
                  </div>
                </>
              ) : mode === "receipts" ? (
                <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-200 bg-card">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Resource</TableHead><TableHead className="text-right">Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>{grLines.map((line) => <TableRow key={line.id}><TableCell>{line.budgetSubChapter}</TableCell><TableCell>{line.resourceId}</TableCell><TableCell>{line.description}</TableCell><TableCell>{line.quantity}</TableCell><TableCell>{money(line.unitPrice)}</TableCell><TableCell>{money(line.totalPrice)}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </div>
              ) : (
                <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-200 bg-card">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Resource</TableHead><TableHead className="text-right">Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>{invoiceLines.map((line) => <TableRow key={line.id}><TableCell>{line.budgetSubChapter}</TableCell><TableCell>{line.resourceId}</TableCell><TableCell>{line.description}</TableCell><TableCell>{line.quantity}</TableCell><TableCell>{money(line.unitPrice)}</TableCell><TableCell>{money(line.totalPrice)}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="links" className="rounded-2xl border border-slate-200 bg-card p-3">
              {mode === "orders" && selectedOrder ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600">Goods Receipts linked to PO {selectedOrder.poNumber}</p>
                  <div className="rounded-xl border border-slate-200 bg-card p-2 text-sm">
                    {receipts.filter((receipt) => receipt.purchaseOrderId === selectedOrder.id).map((receipt) => (
                      <div key={receipt.id} className="py-1">{receipt.grNumber} · {receipt.status}</div>
                    ))}
                    {receipts.filter((receipt) => receipt.purchaseOrderId === selectedOrder.id).length === 0 ? "אין מסמכים מקושרים" : null}
                  </div>
                </div>
              ) : mode === "invoices" && selectedInvoice ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600">Summary Invoice: link multiple FINAL receipts</p>
                  <div className="rounded-xl border border-slate-200 bg-card p-2">
                    {receipts.map((receipt) => (
                      <label key={receipt.id} className="flex items-center gap-2 py-1 text-sm">
                        <input
                          type="checkbox"
                          checked={linkedReceiptIds.includes(receipt.id)}
                          disabled={receipt.status !== "FINAL"}
                          onChange={(event) =>
                            setLinkedReceiptIds((prev) =>
                              event.target.checked ? [...prev, receipt.id] : prev.filter((id) => id !== receipt.id)
                            )
                          }
                        />
                        <span>{receipt.grNumber} · {receipt.status}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-end"><Button size="sm" onClick={() => void saveInvoiceLinkedReceipts()} disabled={working || linkedReceiptIds.length === 0}>שמור קישורים</Button></div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Linked documents are displayed per selected workspace entity.</p>
              )}
            </TabsContent>

            <TabsContent value="audit" className="rounded-2xl border border-slate-200 bg-card p-3">
              <div className="max-h-[44vh] overflow-auto rounded-xl border border-slate-200 bg-card">
                <Table>
                  <TableHeader><TableRow><TableHead className="text-right">At</TableHead><TableHead className="text-right">From</TableHead><TableHead className="text-right">To</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>{auditLog.length === 0 ? <TableRow><TableCell colSpan={4} className="h-16 text-center text-sm text-slate-500">אין היסטוריית BPM</TableCell></TableRow> : auditLog.map((event) => <TableRow key={event.id}><TableCell>{new Date(event.createdAt).toLocaleString("he-IL")}</TableCell><TableCell>{event.fromStatus ?? "—"}</TableCell><TableCell>{event.toStatus}</TableCell><TableCell>{event.actionName}</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Phase 14 — Approval Track */}
            {mode === "orders" && (
              <TabsContent value="approvals" className="rounded-2xl border border-slate-200 bg-card p-4">
                {selectedOrder ? (
                  <ApprovalTrackPanel poId={selectedOrder.id} />
                ) : (
                  <p className="text-sm text-slate-500">בחר הזמנה לצפייה בתהליך האישור.</p>
                )}
              </TabsContent>
            )}
          </Tabs>

          {/* Phase 14 — New PO Dialog with Supplier Combobox (P1 #8) */}
          <Dialog open={newPoDialogOpen} onOpenChange={setNewPoDialogOpen}>
            <DialogContent dir="rtl" className="max-w-md">
              <DialogHeader>
                <DialogTitle>הזמנת רכש חדשה</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-1">
                <div className="space-y-1">
                  <label className="text-sm font-medium">ספק *</label>
                  <SupplierSearchCombobox
                    value={newPoSupplierId}
                    onChange={(id) => setNewPoSupplierId(id)}
                    placeholder="חפש ספק..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">פרויקט *</label>
                  <Select value={newPoProjectId} onValueChange={(v) => setNewPoProjectId(v ?? "")}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="בחר פרויקט" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.projectNumber} · {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewPoDialogOpen(false)}>ביטול</Button>
                <Button
                  disabled={!newPoSupplierId || !newPoProjectId || working}
                  onClick={async () => {
                    if (!newPoSupplierId || !newPoProjectId) return
                    setWorking(true)
                    try {
                      await requestJson("/api/erp/procurement/purchase-orders", {
                        method: "POST",
                        body: JSON.stringify({
                          projectId: newPoProjectId,
                          supplierId: newPoSupplierId,
                          poNumber: `PO-${Date.now().toString().slice(-6)}`,
                          title: "New Purchase Order",
                        }),
                      })
                      setNewPoDialogOpen(false)
                      await loadWorkspace()
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "שגיאה ביצירת הזמנה")
                    } finally {
                      setWorking(false)
                    }
                  }}
                >
                  {working ? <Loader2 className="size-4 animate-spin" /> : null}
                  צור הזמנה
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
        }
      />

      <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader><DialogTitle>שליחה לספק</DialogTitle></DialogHeader>
          <Form {...emailForm}>
            <form className="grid gap-3" onSubmit={emailForm.handleSubmit(sendPoToSupplier)}>
              <FormField control={emailForm.control} name="to" render={({ field }) => <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>אל</FormLabel><FormControl><Input {...field} className={ERP_DENSE_INPUT_CLASS} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={emailForm.control} name="subject" render={({ field }) => <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>נושא</FormLabel><FormControl><Input {...field} className={ERP_DENSE_INPUT_CLASS} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={emailForm.control} name="message" render={({ field }) => <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>הודעה</FormLabel><FormControl><Textarea {...field} className="min-h-32 text-sm" /></FormControl><FormMessage /></FormItem>} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEmailModalOpen(false)}>ביטול</Button>
                <Button type="submit" disabled={working}><Mail className="me-1 size-4" />שליחה</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={priceOverrideModalOpen} onOpenChange={setPriceOverrideModalOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>חריגת מחיר ממחירון מאושר</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            המחיר שהוזן גבוה מהמחיר המאושר. ניתן לבקש אישור מנהל או לחזור למחיר המחירון.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (poLinePriceMeta?.unitPrice !== undefined) {
                  poLineForm.setValue("unitPrice", Number(poLinePriceMeta.unitPrice), {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                setPriceOverrideModalOpen(false)
                setPendingPriceOverrideValues(null)
              }}
            >
              חזור למחיר מחירון
            </Button>
            <Button type="button" onClick={() => void requestManagerPriceOverride()} disabled={working}>
              בקש אישור מנהל
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

