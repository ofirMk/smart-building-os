"use client"

import * as React from "react"
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Edit3,
  FileSpreadsheet,
  FileText,
  Link2,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  TriangleAlert,
  WandSparkles,
} from "lucide-react"
import { toast } from "sonner"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, type Resolver } from "react-hook-form"
import { z } from "zod"

import {
  ERP_DENSE_INPUT_CLASS,
  ERP_DENSE_LABEL_CLASS,
} from "@/components/layout/DenseMasterDetailTemplate"
import { MasterDetailWorkspace } from "@/components/layout/MasterDetailWorkspace"
import {
  PriceViolationModal,
  type PriceViolationContext,
} from "@/components/erp/price-violation-modal"
import {
  buildClientProgressBillPdfBlob,
  clientProgressBillPdfFilename,
} from "@/components/erp/workspaces/client-contracts/client-progress-bill-pdf"
import {
  ClientContractLineEditor,
  type LineEditorSubmitPayload,
} from "@/components/erp/client-contracts/client-contract-line-editor"
import { Badge } from "@/components/ui/badge"
import { BentoMetricCard } from "@/components/ui/bento-metric-card"
import { BentoSmartList, SmartListStatusPill } from "@/components/ui/bento-smart-list"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { COMPANY_COOKIE_KEY, type CompanyContextId, resolveCompanyContext } from "@/lib/company-context"
import { ChangeOrderSchema } from "@/lib/erp/change-order-schema"
import {
  useBillingSimulation,
  type LinkedSubcontractorEntry,
} from "@/lib/hooks/use-billing-simulation-net-margin"
import { useProgressBillData } from "@/lib/hooks/use-progress-bill-data"
import { apiFetch, apiPost, parseApiData } from "@/lib/utils/api-client"
import { cn } from "@/lib/utils"
import type {
  ErpChangeOrder,
  ErpClientContract,
  ErpClientContractLine,
  ErpClientProgressBill,
  ErpClientProgressBillLine,
} from "@/types/erp"

type ApiResponse<T> = { data: T; totals?: unknown; error?: string }
type ChangeOrderFormValues = z.infer<typeof changeOrderSchema>
type SupplierLookup = { id: string; supplierNum: string; name: string }
type ItemLookup = { id: string; itemNumber: string; description: string }
type ProgressBillOffset = {
  id: string
  sourceType: string
  sourceId: string
  sourceNumber: string | null
  sourceDate: string | null
  baseAmount: number
  commissionPct: number
  commissionAmount: number
  offsetAmount: number
  approvedOffsetAmount: number | null
}

const masterSchema = z.object({
  clientName: z.string().trim().min(2),
  title: z.string().trim().min(2),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED", "CANCELLED"]),
  indexationPct: z.coerce.number().min(0),
  retentionPct: z.coerce.number().min(0).max(100),
  advancePaymentAmount: z.coerce.number().min(0),
  advanceRepaymentPct: z.coerce.number().min(0).max(100),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

const changeOrderSchema = ChangeOrderSchema.extend({
  requestManagerApproval: z.boolean().optional(),
})

const changeOrderDetailEnvelopeSchema = z.object({
  data: z.object({
    id: z.string(),
    contractLineId: z.string().nullable().optional(),
    contract_line_id: z.string().nullable().optional(),
    changeOrderNumber: z.string().optional(),
    change_order_number: z.string().optional(),
    changeType: z.enum(["NEW_LINE", "QTY_CHANGE", "PRICE_CHANGE"]).optional(),
    change_type: z.enum(["NEW_LINE", "QTY_CHANGE", "PRICE_CHANGE"]).optional(),
    newLineDescription: z.string().nullable().optional(),
    new_line_description: z.string().nullable().optional(),
    qtyDelta: z.number().nullable().optional(),
    qty_delta: z.number().nullable().optional(),
    newUnitPrice: z.number().nullable().optional(),
    new_unit_price: z.number().nullable().optional(),
    priceItemId: z.string().nullable().optional(),
    price_item_id: z.string().nullable().optional(),
    priceSupplierId: z.string().nullable().optional(),
    price_supplier_id: z.string().nullable().optional(),
    isExtraWork: z.boolean().optional(),
    is_extra_work: z.boolean().optional(),
    isAdditionalWork: z.boolean().optional(),
    is_additional_work: z.boolean().optional(),
    notes: z.string().nullable().optional(),
    status: z.enum(["DRAFT", "PENDING_PRICE_APPROVAL", "ACTIVE", "APPROVED", "REJECTED"]),
    managerApprovalRequired: z.boolean().optional(),
    manager_approval_required: z.boolean().optional(),
    managerApprovalReason: z.string().nullable().optional(),
    manager_approval_reason: z.string().nullable().optional(),
    effectivePriceSnapshot: z.number().nullable().optional(),
    effective_price_snapshot: z.number().nullable().optional(),
    isLocked: z.boolean().optional(),
    is_locked: z.boolean().optional(),
  }).transform((row): ErpChangeOrder => ({
    id: row.id,
    companyId: "",
    clientContractId: "",
    contractLineId: row.contractLineId ?? row.contract_line_id ?? null,
    priceItemId: row.priceItemId ?? row.price_item_id ?? null,
    priceSupplierId: row.priceSupplierId ?? row.price_supplier_id ?? null,
    supplierId: row.priceSupplierId ?? row.price_supplier_id ?? null,
    changeOrderNumber: row.changeOrderNumber ?? row.change_order_number ?? "",
    changeType: row.changeType ?? row.change_type ?? "NEW_LINE",
    newLineDescription: row.newLineDescription ?? row.new_line_description ?? null,
    qtyDelta: row.qtyDelta ?? row.qty_delta ?? null,
    newUnitPrice: row.newUnitPrice ?? row.new_unit_price ?? null,
    status: row.status,
    notes: row.notes ?? null,
    isExtraWork: row.isExtraWork ?? row.is_extra_work ?? false,
    isAdditionalWork: row.isAdditionalWork ?? row.is_additional_work ?? false,
    managerApprovalRequired:
      row.managerApprovalRequired ?? row.manager_approval_required ?? false,
    managerApprovalReason:
      row.managerApprovalReason ?? row.manager_approval_reason ?? null,
    effectivePriceSnapshot:
      row.effectivePriceSnapshot ?? row.effective_price_snapshot ?? null,
    isLocked: row.isLocked ?? row.is_locked ?? false,
  })).superRefine((value, ctx) => {
    if ((value.changeType === "QTY_CHANGE" || value.changeType === "PRICE_CHANGE") && !value.contractLineId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Source line is required", path: ["contractLineId"] })
    }
  }),
})
const progressBillOffsetsEnvelopeSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().uuid(),
      sourceType: z.string(),
      sourceId: z.string().uuid(),
      sourceNumber: z.string().nullable(),
      sourceDate: z.string().nullable(),
      baseAmount: z.coerce.number(),
      commissionPct: z.coerce.number(),
      commissionAmount: z.coerce.number(),
      offsetAmount: z.coerce.number(),
      approvedOffsetAmount: z.coerce.number().nullable(),
    })
  ),
})
const progressBillOffsetsSchema = progressBillOffsetsEnvelopeSchema.shape.data

const contractsSchema = z.array(
  z.object({
    id: z.string(),
    projectId: z.string(),
    supplierId: z.string().nullable(),
    contractNumber: z.string(),
    clientName: z.string(),
    title: z.string(),
    status: z.enum(["DRAFT", "ACTIVE", "CLOSED", "CANCELLED"]),
    indexationPct: z.coerce.number(),
    retentionPct: z.coerce.number(),
    advancePaymentAmount: z.coerce.number(),
    advanceRepaymentPct: z.coerce.number(),
    totalAmount: z.coerce.number(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
  })
)
const linesSchema = z.array(
  z.object({
    id: z.string(),
    lineNumber: z.coerce.number(),
    description: z.string(),
    quantity: z.coerce.number(),
    unitPrice: z.coerce.number(),
    totalPrice: z.coerce.number(),
    expectedUnitCost: z.coerce.number().nullable(),
    expectedTotalCost: z.coerce.number(),
    profitabilityPct: z.coerce.number(),
    lastApprovedPct: z.coerce.number(),
    lastApprovedQty: z.coerce.number(),
    lastApprovedAmount: z.coerce.number(),
    itemId: z.string().nullable(),
    supplierId: z.string().nullable(),
    priceOverrideStatus: z.enum(["NONE", "REQUESTED", "APPROVED"]),
  })
)
const billsSchema = z.array(
  z.object({
    id: z.string(),
    billNumber: z.string(),
    status: z.enum(["DRAFT", "SUBMITTED", "PARTIALLY_APPROVED", "APPROVED"]),
    submittedTotalAmount: z.coerce.number(),
    approvedTotalAmount: z.coerce.number(),
    indexedApprovedAmount: z.coerce.number(),
    retentionDeductedAmount: z.coerce.number(),
    advanceRepaymentAmount: z.coerce.number(),
    netApprovedPayable: z.coerce.number(),
  })
)
const changeOrdersSchema = z.array(z.any())
const suppliersSchema = z.array(
  z.object({ id: z.string(), supplierNum: z.string(), name: z.string() })
)
const itemsSchema = z.array(
  z.object({ id: z.string(), itemNumber: z.string(), description: z.string() })
)
const lineEditorSubmitSchema = z.object({
  description: z.string().trim().min(1),
  quantity: z.coerce.number().min(0),
  unitPrice: z.coerce.number().min(0),
  supplierId: z.string().uuid().nullable(),
  itemId: z.string().uuid().nullable(),
  requestManagerApproval: z.boolean(),
})
const currentPercentSchema = z.coerce.number().min(0).max(100)

const generateBillContextSchema = z.object({
  contractId: z.string().uuid(),
  billId: z.string().uuid(),
  contractNumber: z.string().min(1),
  billNumber: z.string().min(1),
})
const simulationCommitSchema = z.object({
  success: z.boolean(),
  updatedRows: z.coerce.number(),
})
const netMarginSafetyThreshold = 0
const defaultSubcontractorRetentionPct = 5
const defaultVatPct = 17

function money(value: number): string {
  return Number(value || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS" })
}

function oneDecimal(value: number): string {
  return z.coerce.number().catch(0).parse(value).toFixed(1)
}

function moneyOneDecimal(value: number): string {
  return z.coerce.number().catch(0).parse(value).toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

function changeOrderTypeLabel(type: ErpChangeOrder["changeType"]): string {
  if (type === "NEW_LINE") return "New Line"
  if (type === "QTY_CHANGE") return "Qty Change"
  return "Price Change"
}

function changeOrderTypeClass(type: ErpChangeOrder["changeType"]): string {
  if (type === "NEW_LINE") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
  if (type === "QTY_CHANGE") return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
  return "border-primary/35 bg-primary/10 text-primary"
}

function getActiveCompanyIdFromCookie(): CompanyContextId | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COMPANY_COOKIE_KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`)
  )
  return resolveCompanyContext(match?.[1]?.trim())
}

async function requestJson<T>(
  input: string,
  init?: RequestInit,
  schema?: z.ZodType<T>
): Promise<T> {
  const activeCompanyId = getActiveCompanyIdFromCookie()
  const headers = new Headers(init?.headers ?? {})
  if (!headers.has("content-type") && init?.body) headers.set("content-type", "application/json")
  if (activeCompanyId) {
    headers.set("x-company-id", activeCompanyId)
    headers.set("x-active-company-id", activeCompanyId)
  }
  if (schema) {
    const response = await apiFetch(input, { ...init, headers })
    return parseApiData(response, {
      schema,
      signal: init?.signal ?? undefined,
    })
  }
  const response = await fetch(input, { ...init, headers, credentials: "same-origin", cache: "no-store" })
  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(errorPayload.error ?? "API request failed")
  }
  return (await response.json().catch(() => ({}))) as T
}

export function ClientContractsWorkspaceClient({
  initialContractId = "",
}: {
  initialContractId?: string
} = {}) {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [generatingBillBundle, setGeneratingBillBundle] = React.useState(false)
  const [contracts, setContracts] = React.useState<ErpClientContract[]>([])
  const [selectedContractId, setSelectedContractId] = React.useState<string>("")
  const [lines, setLines] = React.useState<ErpClientContractLine[]>([])
  const [changeOrders, setChangeOrders] = React.useState<ErpChangeOrder[]>([])
  const [bills, setBills] = React.useState<ErpClientProgressBill[]>([])
  const [selectedBillId, setSelectedBillId] = React.useState<string>("")
  const [changeOrderDialogOpen, setChangeOrderDialogOpen] = React.useState(false)
  const [editingChangeOrderId, setEditingChangeOrderId] = React.useState<string | null>(null)
  const [loadingChangeOrderDetails, setLoadingChangeOrderDetails] = React.useState(false)
  const [isEditingChangeOrderReadOnly, setIsEditingChangeOrderReadOnly] = React.useState(false)
  const [changeOrderPriceOverrideOpen, setChangeOrderPriceOverrideOpen] = React.useState(false)
  const [pendingChangeOrderValues, setPendingChangeOrderValues] =
    React.useState<ChangeOrderFormValues | null>(null)
  const [linePickerOpen, setLinePickerOpen] = React.useState(false)
  const [suppliers, setSuppliers] = React.useState<SupplierLookup[]>([])
  const [items, setItems] = React.useState<ItemLookup[]>([])
  const [billOffsets, setBillOffsets] = React.useState<ProgressBillOffset[]>([])
  const [loadingBillOffsets, setLoadingBillOffsets] = React.useState(false)
  const [billOffsetsError, setBillOffsetsError] = React.useState<string | null>(null)
  const [lineOverrideOpen, setLineOverrideOpen] = React.useState(false)
  const [lineOverrideContext, setLineOverrideContext] =
    React.useState<PriceViolationContext | null>(null)
  const [lineOverrideWorking, setLineOverrideWorking] = React.useState(false)
  const [lineEditorOpen, setLineEditorOpen] = React.useState(false)
  const [lineEditorTarget, setLineEditorTarget] =
    React.useState<ErpClientContractLine | null>(null)
  const [lineEditorWorking, setLineEditorWorking] = React.useState(false)
  const [progressInputByLineId, setProgressInputByLineId] = React.useState<Record<string, string>>({})
  const changeOrderDetailsAbortRef = React.useRef<AbortController | null>(null)
  const billBundleAbortRef = React.useRef<AbortController | null>(null)
  const supplierNameById = React.useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
    [suppliers]
  )

  const selectedContract = React.useMemo(
    () => contracts.find((contract) => contract.id === selectedContractId) ?? null,
    [contracts, selectedContractId]
  )
  const selectedBill = React.useMemo(
    () => bills.find((bill) => bill.id === selectedBillId) ?? null,
    [bills, selectedBillId]
  )
  const {
    data: progressBillData,
    loading: loadingBillData,
    error: progressBillError,
    setData: setProgressBillData,
    reload: reloadProgressBillData,
  } = useProgressBillData({
    contractId: selectedContract?.id ?? "",
    billId: selectedBillId,
  })
  const billLines = progressBillData?.lines ?? []
  const selectedBillView = progressBillData?.bill ?? selectedBill
  const [progressLineWorkingId, setProgressLineWorkingId] = React.useState<string | null>(null)
  const billLineByContractLineId = React.useMemo(
    () => new Map(billLines.map((line) => [line.contractLineId, line])),
    [billLines]
  )
  const stats = React.useMemo(() => {
    const totalRevenue = lines.reduce((sum, line) => sum + Number(line.totalPrice ?? 0), 0)
    const totalCost = lines.reduce((sum, line) => sum + Number(line.expectedTotalCost ?? 0), 0)
    const expectedMarginPct = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0
    return {
      totalRevenue,
      totalCost,
      expectedMarginPct,
    }
  }, [lines])
  const billingDashboard = React.useMemo(() => {
    const resolveLinePercent = (line: ErpClientContractLine): number => {
      const percentText = progressInputByLineId[line.id]
      const parsed = percentText === undefined ? Number.NaN : Number(percentText)
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.min(100, parsed))
      }
      const current = billLineByContractLineId.get(line.id)
      if (current && Number.isFinite(current.submittedPercent)) {
        return Number(current.submittedPercent)
      }
      if (line.totalPrice > 0 && current) {
        return Number((((current.submittedAmount ?? 0) / line.totalPrice) * 100).toFixed(2))
      }
      return 0
    }
    const totalContractValue = lines.reduce((sum, line) => sum + Number(line.totalPrice ?? 0), 0)
    const totalRealized = lines.reduce((sum, line) => {
      const normalizedPercent = resolveLinePercent(line)
      return sum + Number(line.totalPrice ?? 0) * (normalizedPercent / 100)
    }, 0)
    const totalRealizedCost = lines.reduce((sum, line) => {
      const normalizedPercent = resolveLinePercent(line)
      return sum + Number(line.expectedTotalCost ?? 0) * (normalizedPercent / 100)
    }, 0)
    const netProfit = totalRealized - totalRealizedCost
    const estimatedProfitabilityPct =
      totalRealized > 0 ? (netProfit / totalRealized) * 100 : 0
    const completionPct = totalContractValue > 0 ? (totalRealized / totalContractValue) * 100 : 0
    const normalizedMarginScore = Math.max(0, Math.min(100, (estimatedProfitabilityPct + 20) * 2))
    const healthScore = Math.max(
      0,
      Math.min(100, Math.round(completionPct * 0.35 + normalizedMarginScore * 0.65))
    )
    return {
      healthScore,
      totalContractValue,
      totalRealized,
      netProfit,
      estimatedProfitabilityPct,
    }
  }, [billLineByContractLineId, lines, progressInputByLineId])
  const [sandboxMode, setSandboxMode] = React.useState(false)
  const [committingSimulation, setCommittingSimulation] = React.useState(false)
  const calculateSimulationProjection = React.useCallback(
    (overrides: Record<string, number>, signal: AbortSignal) => {
      if (signal.aborted) {
        return {
          projectedBillTotal: 0,
          netCashInflow: 0,
          marginImpact: 0,
        }
      }
      const retentionPct = z.coerce.number().catch(0).parse(selectedContract?.retentionPct ?? 0)
      const indexationPct = z.coerce.number().catch(0).parse(selectedContract?.indexationPct ?? 0)
      let projectedBillTotal = 0
      let projectedBillCost = 0
      let baselineBillTotal = 0
      let baselineBillCost = 0

      for (const line of lines) {
        if (signal.aborted) break
        const baselinePct = z.coerce.number().catch(0).parse(line.lastApprovedPct ?? 0)
        const current = billLineByContractLineId.get(line.id)
        const fallbackTotalPct = Number.isFinite(Number(current?.submittedPercent))
          ? z.coerce.number().catch(0).parse(current?.submittedPercent ?? 0) + baselinePct
          : baselinePct
        const simulatedTotalPct = z.coerce
          .number()
          .catch(fallbackTotalPct)
          .parse(overrides[line.id] ?? fallbackTotalPct)
        const normalizedSimulatedPct = Math.max(
          baselinePct,
          Math.min(100, simulatedTotalPct)
        )
        const normalizedBaselinePct = Math.max(
          baselinePct,
          Math.min(100, fallbackTotalPct)
        )

        const simulatedCurrentPct = Math.max(0, normalizedSimulatedPct - baselinePct)
        const baselineCurrentPct = Math.max(0, normalizedBaselinePct - baselinePct)
        const lineTotalPrice = z.coerce.number().catch(0).parse(line.totalPrice ?? 0)
        const lineTotalCost = z.coerce.number().catch(0).parse(line.expectedTotalCost ?? 0)

        projectedBillTotal += (lineTotalPrice * simulatedCurrentPct) / 100
        projectedBillCost += (lineTotalCost * simulatedCurrentPct) / 100
        baselineBillTotal += (lineTotalPrice * baselineCurrentPct) / 100
        baselineBillCost += (lineTotalCost * baselineCurrentPct) / 100
      }

      const netCashInflow =
        projectedBillTotal * (1 - retentionPct / 100) * (1 + indexationPct / 100)
      const projectedBillProfit = projectedBillTotal - projectedBillCost
      const baselineBillProfit = baselineBillTotal - baselineBillCost
      const marginImpact = projectedBillProfit - baselineBillProfit

      return {
        projectedBillTotal: Number(projectedBillTotal.toFixed(1)),
        netCashInflow: Number(netCashInflow.toFixed(1)),
        marginImpact: Number(marginImpact.toFixed(1)),
      }
    },
    [billLineByContractLineId, lines, selectedContract]
  )
  const {
    simulationByLineId,
    updateSimulationPercent,
    clearSimulation,
    hasSimulationChanges,
    projection: simulationProjection,
    linkedSubcontractorByClientLineId,
    payoutBreakdownByClientLineId,
    expectedSubcontractorPayout,
    netMarginProfit,
    freeCashLiquidity,
    marginRiskByLineId,
    loadingLinkedSubcontractors,
  } = useBillingSimulation({
    isEnabled: sandboxMode,
    calculateProjection: calculateSimulationProjection,
    projectId: selectedContract?.projectId,
    lines: lines.map((line) => ({
      id: line.id,
      boqRef: line.boqRef ?? null,
      itemId: line.itemId ?? null,
      lastApprovedPct: z.coerce.number().catch(0).parse(line.lastApprovedPct ?? 0),
      unitPrice: z.coerce.number().catch(0).parse(line.unitPrice ?? 0),
    })),
    clientRetentionPct: z.coerce.number().catch(0).parse(selectedContract?.retentionPct ?? 0),
    subcontractorRetentionPct: defaultSubcontractorRetentionPct,
    vatPct: defaultVatPct,
  })

  const masterForm = useForm<z.infer<typeof masterSchema>>({
    resolver: zodResolver(masterSchema) as Resolver<z.infer<typeof masterSchema>>,
    defaultValues: {
      clientName: "",
      title: "",
      status: "DRAFT",
      indexationPct: 0,
      retentionPct: 0,
      advancePaymentAmount: 0,
      advanceRepaymentPct: 0,
      startDate: "",
      endDate: "",
    },
  })
  const changeOrderForm = useForm<ChangeOrderFormValues>({
    resolver: zodResolver(changeOrderSchema) as Resolver<ChangeOrderFormValues>,
    defaultValues: {
      changeOrderNumber: "",
      changeType: "NEW_LINE",
      contractLineId: "",
      priceItemId: null,
      priceSupplierId: null,
      newLineDescription: "",
      qtyDelta: 0,
      newUnitPrice: 0,
      requestManagerApproval: false,
      isExtraWork: false,
      isAdditionalWork: false,
      notes: "",
      inheritanceRules: {
        retentionPct: 0,
        discountPct: 0,
        indexationPct: 0,
      },
    },
  })

  const loadWorkspace = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const [contractsRes, suppliersRes, itemsRes] = await Promise.all([
        requestJson("/api/erp/client-contracts", { signal }, contractsSchema).then(
          (rows) => rows as unknown as ErpClientContract[]
        ),
        requestJson<SupplierLookup[]>("/api/erp/master-data/suppliers", { signal }, suppliersSchema),
        requestJson<ItemLookup[]>("/api/erp/master-data/items", { signal }, itemsSchema),
      ])
      const rows = contractsRes ?? []
      setContracts(rows)
      setSuppliers(suppliersRes ?? [])
      setItems(itemsRes ?? [])
      if (rows.length > 0) {
        const preferredContractId = selectedContractId || initialContractId
        const preferredContract = preferredContractId
          ? rows.find((contract) => contract.id === preferredContractId)
          : null
        if (preferredContract) {
          setSelectedContractId(preferredContract.id)
        } else if (!selectedContractId) {
          setSelectedContractId(rows[0].id)
        }
      }
    } catch (error) {
      if (signal?.aborted) return
      toast.error(error instanceof Error ? error.message : "טעינת חוזי לקוח נכשלה")
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [initialContractId, selectedContractId])

  React.useEffect(() => {
    const controller = new AbortController()
    void loadWorkspace(controller.signal)
    return () => controller.abort()
  }, [loadWorkspace])

  React.useEffect(() => {
    return () => {
      changeOrderDetailsAbortRef.current?.abort()
      billBundleAbortRef.current?.abort()
    }
  }, [])

  React.useEffect(() => {
    if (!selectedContract) {
      setLines([])
      setChangeOrders([])
      setBills([])
      setSelectedBillId("")
      return
    }
    const controller = new AbortController()
    masterForm.reset({
      clientName: selectedContract.clientName,
      title: selectedContract.title,
      status: selectedContract.status,
      indexationPct: selectedContract.indexationPct,
      retentionPct: selectedContract.retentionPct,
      advancePaymentAmount: selectedContract.advancePaymentAmount,
      advanceRepaymentPct: selectedContract.advanceRepaymentPct,
      startDate: selectedContract.startDate ?? "",
      endDate: selectedContract.endDate ?? "",
    })
    setLines([])
    setChangeOrders([])
    setBills([])
    void Promise.all([
      requestJson(`/api/erp/client-contracts/${selectedContract.id}/lines`, { signal: controller.signal }, linesSchema).then(
        (rows) => rows as unknown as ErpClientContractLine[]
      ),
      requestJson(
        `/api/erp/client-contracts/${selectedContract.id}/change-orders`,
        { signal: controller.signal },
        changeOrdersSchema
      ).then((rows) => rows as unknown as ErpChangeOrder[]),
      requestJson(
        `/api/erp/client-contracts/${selectedContract.id}/progress-bills`,
        { signal: controller.signal },
        billsSchema
      ).then((rows) => rows as unknown as ErpClientProgressBill[]),
    ])
      .then(([linesRes, changeOrdersRes, billsRes]) => {
        if (controller.signal.aborted) return
        setLines(linesRes ?? [])
        setChangeOrders(changeOrdersRes ?? [])
        const list = billsRes ?? []
        setBills(list)
        if (list.length === 0) {
          setSelectedBillId("")
          return
        }
        const currentExists = list.some((bill) => bill.id === selectedBillId)
        if (!currentExists) setSelectedBillId(list[0]!.id)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setLines([])
        setChangeOrders([])
        setBills([])
        setSelectedBillId("")
      })
    return () => controller.abort()
  }, [masterForm, selectedBillId, selectedContract])

  React.useEffect(() => {
    if (!selectedContract || !selectedBillId) {
      setProgressInputByLineId({})
      setBillOffsets([])
      setBillOffsetsError(null)
      setLoadingBillOffsets(false)
      return
    }
    const controller = new AbortController()
    setBillOffsets([])
    setBillOffsetsError(null)
    setLoadingBillOffsets(true)
    void requestJson<ProgressBillOffset[]>(
      `/api/erp/client-contracts/${selectedContract.id}/progress-bills/${selectedBillId}/offsets`,
      { signal: controller.signal },
      progressBillOffsetsSchema as z.ZodType<ProgressBillOffset[]>
    )
      .then((result) => {
        if (controller.signal.aborted) return
        setBillOffsets(result ?? [])
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setBillOffsets([])
        setBillOffsetsError(error instanceof Error ? error.message : "טעינת קיזוזים נכשלה")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingBillOffsets(false)
      })
    return () => controller.abort()
  }, [selectedBillId, selectedContract])

  React.useEffect(() => {
    clearSimulation()
    setSandboxMode(false)
  }, [clearSimulation, selectedBillId, selectedContractId, setSandboxMode])

  function triggerBlobDownload(blob: Blob, fileName: string) {
    const href = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = href
    link.download = fileName
    link.click()
    URL.revokeObjectURL(href)
  }

  async function fetchBlobWithServerError(input: string, signal: AbortSignal): Promise<Blob> {
    const response = await apiFetch(input, { method: "GET", signal })
    if (!response.ok) {
      await parseApiData(response, {
        schema: z.any(),
        signal,
      })
    }
    return response.blob()
  }

  async function generateBillBundle() {
    if (!selectedContract || !selectedBill) return
    const parsed = generateBillContextSchema.safeParse({
      contractId: selectedContract.id,
      billId: selectedBill.id,
      contractNumber: selectedContract.contractNumber,
      billNumber: selectedBill.billNumber,
    })
    if (!parsed.success) {
      toast.error("נתוני החשבון אינם תקינים ליצוא")
      return
    }

    const lineRows = lines.map((line) => {
      const currentPct = lineProgressPercent(line)
      return {
        lineNumber: line.lineNumber,
        description: line.description,
        contractAmount: Number(line.totalPrice ?? 0),
        currentPercent: currentPct,
        currentAmount: Number(((Number(line.totalPrice ?? 0) * currentPct) / 100).toFixed(2)),
      }
    })

    billBundleAbortRef.current?.abort()
    const controller = new AbortController()
    billBundleAbortRef.current = controller
    setGeneratingBillBundle(true)
    try {
      const excelPromise = fetchBlobWithServerError(
        `/api/erp/client-contracts/${parsed.data.contractId}/progress-bills/${parsed.data.billId}/export-excel`,
        controller.signal
      )
      const pdfPromise = buildClientProgressBillPdfBlob({
        contract: selectedContract,
        bill: selectedBill,
        lines: lineRows,
      })
      const [excelBlob, pdfBlob] = await Promise.all([excelPromise, pdfPromise])
      if (controller.signal.aborted) return
      triggerBlobDownload(
        excelBlob,
        `client-progress-bill-${parsed.data.contractNumber}-${parsed.data.billNumber}.xlsx`
      )
      triggerBlobDownload(pdfBlob, clientProgressBillPdfFilename(selectedContract, selectedBill))
      toast.success("הפקת חשבון הושלמה (PDF + Excel)")
    } catch (error) {
      if (controller.signal.aborted) return
      toast.error(error instanceof Error ? error.message : "הפקת החשבון נכשלה")
    } finally {
      if (!controller.signal.aborted) setGeneratingBillBundle(false)
    }
  }

  async function exportBillExcelOnly() {
    if (!selectedContract || !selectedBill) return
    const controller = new AbortController()
    try {
      const excelBlob = await fetchBlobWithServerError(
        `/api/erp/client-contracts/${selectedContract.id}/progress-bills/${selectedBill.id}/export-excel`,
        controller.signal
      )
      triggerBlobDownload(
        excelBlob,
        `client-progress-bill-${selectedContract.contractNumber}-${selectedBill.billNumber}.xlsx`
      )
      toast.success("Excel הופק בהצלחה")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ייצוא Excel נכשל")
    } finally {
      controller.abort()
    }
  }

  async function exportBillPdfOnly() {
    if (!selectedContract || !selectedBill) return
    try {
      const lineRows = lines.map((line) => {
        const currentPct = lineProgressPercent(line)
        return {
          lineNumber: line.lineNumber,
          description: line.description,
          contractAmount: Number(line.totalPrice ?? 0),
          currentPercent: currentPct,
          currentAmount: Number(((Number(line.totalPrice ?? 0) * currentPct) / 100).toFixed(2)),
        }
      })
      const pdfBlob = await buildClientProgressBillPdfBlob({
        contract: selectedContract,
        bill: selectedBill,
        lines: lineRows,
      })
      triggerBlobDownload(pdfBlob, clientProgressBillPdfFilename(selectedContract, selectedBill))
      toast.success("PDF הופק בהצלחה")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ייצוא PDF נכשל")
    }
  }

  async function createContractDraft() {
    setSaving(true)
    try {
      const projects = await requestJson<ApiResponse<{ id: string }[]>>("/api/erp/projects")
      const projectId = projects.data?.[0]?.id
      if (!projectId) throw new Error("Create a project first")
      await requestJson("/api/erp/client-contracts", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          contractNumber: `CC-${Date.now().toString().slice(-6)}`,
          clientName: "New Client",
          title: "New Client Contract",
        }),
      })
      await loadWorkspace()
      toast.success("חוזה לקוח חדש נוצר")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "יצירת חוזה נכשלה")
    } finally {
      setSaving(false)
    }
  }

  async function saveMaster(values: z.infer<typeof masterSchema>) {
    if (!selectedContract) return
    setSaving(true)
    try {
      await requestJson(`/api/erp/client-contracts/${selectedContract.id}`, {
        method: "PUT",
        body: JSON.stringify({
          clientName: values.clientName,
          title: values.title,
          status: values.status,
          indexationPct: values.indexationPct,
          retentionPct: values.retentionPct,
          advancePaymentAmount: values.advancePaymentAmount,
          advanceRepaymentPct: values.advanceRepaymentPct,
          startDate: values.startDate || null,
          endDate: values.endDate || null,
        }),
      })
      toast.success("תנאי חוזה נשמרו")
      await loadWorkspace()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירה נכשלה")
    } finally {
      setSaving(false)
    }
  }

  async function reloadChangeOrders(contractId: string) {
    const updated = await requestJson<ApiResponse<ErpChangeOrder[]>>(
      `/api/erp/client-contracts/${contractId}/change-orders`
    )
    setChangeOrders(updated.data ?? [])
  }

  function openNewChangeOrderDialog() {
    setEditingChangeOrderId(null)
    setIsEditingChangeOrderReadOnly(false)
    changeOrderForm.reset({
      changeOrderNumber: `CO-${Date.now().toString().slice(-6)}`,
      changeType: "NEW_LINE",
      contractLineId: "",
      priceItemId: null,
      priceSupplierId: null,
      newLineDescription: "",
      qtyDelta: 0,
      newUnitPrice: 0,
      requestManagerApproval: false,
      isExtraWork: false,
      isAdditionalWork: false,
      notes: "",
      inheritanceRules: {
        retentionPct: selectedContract?.retentionPct ?? 0,
        discountPct: selectedContract?.advanceRepaymentPct ?? 0,
        indexationPct: selectedContract?.indexationPct ?? 0,
      },
    })
    setChangeOrderDialogOpen(true)
  }

  async function openEditChangeOrderDialog(changeOrder: ErpChangeOrder) {
    if (!selectedContract) return
    changeOrderDetailsAbortRef.current?.abort()
    const controller = new AbortController()
    changeOrderDetailsAbortRef.current = controller
    setLoadingChangeOrderDetails(true)
    try {
      const raw = await requestJson<ApiResponse<unknown>>(
        `/api/erp/client-contracts/${selectedContract.id}/change-orders/${changeOrder.id}`,
        { signal: controller.signal }
      )
      if (controller.signal.aborted) return
      const parsed = changeOrderDetailEnvelopeSchema.safeParse(raw)
      if (!parsed.success) {
        console.error("Change order schema validation failed:", parsed.error)
        throw new Error("נתוני הוראת השינוי אינם בפורמט תקין")
      }

      const loadedChangeOrder = parsed.data.data
      setEditingChangeOrderId(loadedChangeOrder.id)
      setIsEditingChangeOrderReadOnly(
        loadedChangeOrder.status === "APPROVED" || loadedChangeOrder.isLocked
      )
      changeOrderForm.reset({
        changeOrderNumber: loadedChangeOrder.changeOrderNumber,
        changeType: loadedChangeOrder.changeType,
        contractLineId: loadedChangeOrder.contractLineId ?? "",
        priceItemId: loadedChangeOrder.priceItemId ?? null,
        priceSupplierId: loadedChangeOrder.priceSupplierId ?? null,
        newLineDescription: loadedChangeOrder.newLineDescription ?? "",
        qtyDelta: loadedChangeOrder.qtyDelta ?? 0,
        newUnitPrice: loadedChangeOrder.newUnitPrice ?? 0,
        requestManagerApproval: false,
        isExtraWork: loadedChangeOrder.isExtraWork,
        isAdditionalWork: loadedChangeOrder.isAdditionalWork,
        notes: loadedChangeOrder.notes ?? "",
        inheritanceRules: {
          retentionPct: selectedContract.retentionPct,
          discountPct: selectedContract.advanceRepaymentPct,
          indexationPct: selectedContract.indexationPct,
        },
      })
      setChangeOrderDialogOpen(true)
    } catch (error) {
      if (controller.signal.aborted) return
      toast.error(error instanceof Error ? error.message : "טעינת הוראת שינוי נכשלה")
    } finally {
      if (!controller.signal.aborted) {
        setLoadingChangeOrderDetails(false)
      }
    }
  }

  async function saveChangeOrder(values: ChangeOrderFormValues) {
    if (!selectedContract) return
    if (isEditingChangeOrderReadOnly) {
      toast.error("הוראת שינוי מאושרת נעולה לעריכה")
      return
    }
    const expectedRetention = selectedContract.retentionPct
    const expectedDiscount = selectedContract.advanceRepaymentPct
    const expectedIndexation = selectedContract.indexationPct
    const retainsDefaults =
      Math.abs(values.inheritanceRules.retentionPct - expectedRetention) <= 0.0001 &&
      Math.abs(values.inheritanceRules.discountPct - expectedDiscount) <= 0.0001 &&
      Math.abs(values.inheritanceRules.indexationPct - expectedIndexation) <= 0.0001
    if (!retainsDefaults) {
      toast.error("כללי ירושה חייבים להתאים לברירות המחדל של חוזה האב")
      return
    }
    if (
      values.changeType === "PRICE_CHANGE" &&
      values.contractLineId &&
      values.newUnitPrice !== undefined
    ) {
      const sourceLine = lines.find((line) => line.id === values.contractLineId) ?? null
      if (sourceLine && sourceLine.unitPrice > 0 && Number(values.newUnitPrice) > Number(sourceLine.unitPrice)) {
        setPendingChangeOrderValues(values)
        setChangeOrderPriceOverrideOpen(true)
        return
      }
    }
    setSaving(true)
    try {
      const sourceLine = values.contractLineId
        ? lines.find((line) => line.id === values.contractLineId) ?? null
        : null
      const payload = {
        changeOrderNumber: values.changeOrderNumber,
        changeType: values.changeType,
        contractLineId: values.contractLineId || null,
        priceItemId: values.priceItemId ?? sourceLine?.itemId ?? null,
        priceSupplierId: values.priceSupplierId ?? sourceLine?.supplierId ?? null,
        newLineDescription: values.newLineDescription || null,
        qtyDelta: values.changeType === "QTY_CHANGE" ? values.qtyDelta ?? 0 : null,
        newUnitPrice: values.changeType === "PRICE_CHANGE" ? values.newUnitPrice ?? 0 : null,
        isExtraWork: values.isExtraWork,
        isAdditionalWork: values.isAdditionalWork,
        notes: values.notes || null,
        inheritanceRules: values.inheritanceRules,
      }
      if (editingChangeOrderId) {
        await requestJson(
          `/api/erp/client-contracts/${selectedContract.id}/change-orders/${editingChangeOrderId}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        )
        toast.success("פקודת שינוי עודכנה")
      } else {
        await requestJson(`/api/erp/client-contracts/${selectedContract.id}/change-orders`, {
          method: "POST",
          body: JSON.stringify(payload),
        })
        toast.success("פקודת שינוי נוספה")
      }
      await reloadChangeOrders(selectedContract.id)
      setChangeOrderDialogOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירת פקודת שינוי נכשלה")
    } finally {
      setSaving(false)
    }
  }

  async function requestManagerChangeOrderOverride() {
    if (!selectedContract || !pendingChangeOrderValues) return
    setSaving(true)
    try {
      const sourceLine = pendingChangeOrderValues.contractLineId
        ? lines.find((line) => line.id === pendingChangeOrderValues.contractLineId) ?? null
        : null
      const payload = {
        changeOrderNumber: pendingChangeOrderValues.changeOrderNumber,
        changeType: pendingChangeOrderValues.changeType,
        contractLineId: pendingChangeOrderValues.contractLineId || null,
        priceItemId: pendingChangeOrderValues.priceItemId ?? sourceLine?.itemId ?? null,
        priceSupplierId: pendingChangeOrderValues.priceSupplierId ?? sourceLine?.supplierId ?? null,
        newLineDescription: pendingChangeOrderValues.newLineDescription || null,
        qtyDelta:
          pendingChangeOrderValues.changeType === "QTY_CHANGE"
            ? pendingChangeOrderValues.qtyDelta ?? 0
            : null,
        newUnitPrice:
          pendingChangeOrderValues.changeType === "PRICE_CHANGE"
            ? pendingChangeOrderValues.newUnitPrice ?? 0
            : null,
        isExtraWork: pendingChangeOrderValues.isExtraWork,
        isAdditionalWork: pendingChangeOrderValues.isAdditionalWork,
        notes: pendingChangeOrderValues.notes || null,
        inheritanceRules: pendingChangeOrderValues.inheritanceRules,
        requestManagerApproval: true,
      }
      if (editingChangeOrderId) {
        await requestJson(
          `/api/erp/client-contracts/${selectedContract.id}/change-orders/${editingChangeOrderId}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        )
      } else {
        await requestJson(`/api/erp/client-contracts/${selectedContract.id}/change-orders`, {
          method: "POST",
          body: JSON.stringify(payload),
        })
      }
      toast.success("בקשת אישור מנהל נשלחה")
      setChangeOrderPriceOverrideOpen(false)
      setPendingChangeOrderValues(null)
      setChangeOrderDialogOpen(false)
      await reloadChangeOrders(selectedContract.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : "בקשת אישור מנהל נכשלה"
      if (message.includes("חריגת מחיר")) {
        toast.success("בקשת אישור מנהל נשלחה")
        setChangeOrderPriceOverrideOpen(false)
        setPendingChangeOrderValues(null)
        setChangeOrderDialogOpen(false)
        await reloadChangeOrders(selectedContract.id)
        return
      }
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function approveChangeOrder(changeOrder: ErpChangeOrder) {
    if (!selectedContract) return
    setSaving(true)
    try {
      await requestJson(
        `/api/erp/client-contracts/${selectedContract.id}/change-orders/${changeOrder.id}/approve`,
        { method: "POST", body: JSON.stringify({}) }
      )
      await reloadChangeOrders(selectedContract.id)
      const updatedBills = await refreshProgressBills(selectedContract.id).catch(() => [])
      await Promise.all(
        updatedBills.map((bill) =>
          requestJson(
            `/api/erp/client-contracts/${selectedContract.id}/progress-bills/${bill.id}/calculate`,
            { method: "POST", body: JSON.stringify({}) }
          ).catch(() => null)
        )
      )
      await refreshProgressBills(selectedContract.id).catch(() => [])
      const snapshot = await reloadProgressBillData().catch(() => null)
      if (snapshot?.bill) {
        setBills((prev) =>
          prev.map((bill) => (bill.id === snapshot.bill.id ? snapshot.bill : bill))
        )
      }
      toast.success("פקודת שינוי אושרה")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "אישור פקודת שינוי נכשל")
    } finally {
      setSaving(false)
    }
  }

  async function authorizeChangeOrderPriceOverride(changeOrder: ErpChangeOrder) {
    if (!selectedContract) return
    setSaving(true)
    try {
      await requestJson("/api/erp/pricing/authorize-override", {
        method: "POST",
        body: JSON.stringify({
          entityType: "CHANGE_ORDER",
          entityId: changeOrder.id,
          nextStatus: "ACTIVE",
        }),
      })
      await reloadChangeOrders(selectedContract.id)
      toast.success("חריגת מחיר אושרה על ידי מנהל")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "אישור חריגת מחיר נכשל")
    } finally {
      setSaving(false)
    }
  }

  async function deleteChangeOrder(changeOrder: ErpChangeOrder) {
    if (!selectedContract) return
    setSaving(true)
    try {
      await requestJson(
        `/api/erp/client-contracts/${selectedContract.id}/change-orders/${changeOrder.id}`,
        { method: "DELETE", body: JSON.stringify({}) }
      )
      await reloadChangeOrders(selectedContract.id)
      toast.success("פקודת שינוי נמחקה")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "מחיקת פקודת שינוי נכשלה")
    } finally {
      setSaving(false)
    }
  }

  async function createProgressBillDraft() {
    if (!selectedContract) return
    setSaving(true)
    try {
      await requestJson(`/api/erp/client-contracts/${selectedContract.id}/progress-bills`, {
        method: "POST",
        body: JSON.stringify({
          billNumber: `PB-${Date.now().toString().slice(-6)}`,
          status: "DRAFT",
        }),
      })
      const updated = await requestJson<ApiResponse<ErpClientProgressBill[]>>(
        `/api/erp/client-contracts/${selectedContract.id}/progress-bills`
      )
      setBills(updated.data ?? [])
      if ((updated.data ?? []).length > 0) setSelectedBillId(updated.data![0]!.id)
      toast.success("חשבון התקדמות חדש נוצר")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "יצירת חשבון נכשלה")
    } finally {
      setSaving(false)
    }
  }

  async function refreshProgressBills(contractId: string): Promise<ErpClientProgressBill[]> {
    const updated = await requestJson<ApiResponse<ErpClientProgressBill[]>>(
      `/api/erp/client-contracts/${contractId}/progress-bills`
    )
    const list = updated.data ?? []
    setBills(list)
    return list
  }

  async function copyApprovedFromSubmitted() {
    if (!selectedContract || !selectedBill) return
    setSaving(true)
    try {
      await requestJson(
        `/api/erp/client-contracts/${selectedContract.id}/progress-bills/${selectedBill.id}/sync-approved`,
        { method: "POST", body: JSON.stringify({ mode: "CURRENT_SUBMITTED" }) }
      )
      const [snapshot, refreshedBills] = await Promise.all([
        reloadProgressBillData().catch(() => null),
        refreshProgressBills(selectedContract.id).catch(() => bills),
      ])
      if (snapshot?.bill) {
        setBills((prev) =>
          prev.map((bill) => (bill.id === snapshot.bill.id ? snapshot.bill : bill))
        )
      } else if (refreshedBills.length > 0) {
        const exists = refreshedBills.some((bill) => bill.id === selectedBill.id)
        if (!exists) {
          setSelectedBillId(refreshedBills[0]!.id)
        }
      }
      toast.success("Approved הועתקו משדות Submitted")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "סנכרון נכשל")
    } finally {
      setSaving(false)
    }
  }

  function updateBillLineLocal(
    lineId: string,
    field:
      | "submittedQuantity"
      | "submittedAmount"
      | "submittedPercent"
      | "approvedQuantity"
      | "approvedAmount"
      | "approvedPercent",
    value: number
  ) {
    setProgressBillData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        lines: prev.lines.map((line) =>
          line.id === lineId ? { ...line, [field]: value } : line
        ),
      }
    })
  }

  async function updateBillLine(
    lineId: string,
    field:
      | "submittedQuantity"
      | "submittedAmount"
      | "submittedPercent"
      | "approvedQuantity"
      | "approvedAmount"
      | "approvedPercent",
    value: number
  ) {
    if (!selectedContract || !selectedBill) return
    const target = billLines.find((line) => line.id === lineId)
    if (!target) return
    const previousValue = target[field]
    updateBillLineLocal(lineId, field, value)

    try {
      await requestJson(`/api/erp/client-contracts/${selectedContract.id}/progress-bills/${selectedBill.id}/lines`, {
        method: "POST",
        body: JSON.stringify({
          contractLineId: target.contractLineId,
          submittedQuantity: field === "submittedQuantity" ? value : target.submittedQuantity,
          submittedAmount: field === "submittedAmount" ? value : target.submittedAmount,
          submittedPercent: field === "submittedPercent" ? value : target.submittedPercent,
          approvedQuantity: field === "approvedQuantity" ? value : target.approvedQuantity,
          approvedAmount: field === "approvedAmount" ? value : target.approvedAmount,
          approvedPercent: field === "approvedPercent" ? value : target.approvedPercent,
          approvedManualOverride:
            field === "approvedQuantity" || field === "approvedAmount" || field === "approvedPercent",
        }),
      })

      // Server recalculates retention / advance / indexing from approved values on each line mutation.
      const snapshot = await reloadProgressBillData().catch(() => null)
      if (snapshot?.bill) {
        setBills((prev) =>
          prev.map((bill) => (bill.id === snapshot.bill.id ? snapshot.bill : bill))
        )
      }
    } catch (error) {
      updateBillLineLocal(lineId, field, Number(previousValue ?? 0))
      toast.error(error instanceof Error ? error.message : "עדכון שורת חשבון נכשל")
    }
  }

  function lineProgressPercent(line: ErpClientContractLine): number {
    const current = billLineByContractLineId.get(line.id)
    if (!current) return 0
    if (Number.isFinite(current.submittedPercent)) return Number(current.submittedPercent)
    if (line.totalPrice > 0) {
      return Number((((current.submittedAmount ?? 0) / line.totalPrice) * 100).toFixed(2))
    }
    return 0
  }

  function lineTotalCumulativePercent(line: ErpClientContractLine): number {
    const baseline = z.coerce.number().catch(0).parse(line.lastApprovedPct ?? 0)
    if (sandboxMode) {
      const simulated = simulationByLineId[line.id]
      if (typeof simulated === "number" && Number.isFinite(simulated)) {
        return Math.max(baseline, Math.min(100, simulated))
      }
    }
    const currentPeriod = lineProgressPercent(line)
    return Math.max(0, Math.min(100, baseline + currentPeriod))
  }

  async function saveLineProgressPercent(line: ErpClientContractLine, totalCumulativePercentRaw: number) {
    if (!selectedContract || !selectedBill) return
    const baselinePct = z.coerce.number().catch(0).parse(line.lastApprovedPct ?? 0)
    const totalCumulativePct = Math.max(
      baselinePct,
      Math.min(100, z.coerce.number().catch(0).parse(totalCumulativePercentRaw))
    )
    const currentPeriodPct = Math.max(
      0,
      Math.min(100, Number((totalCumulativePct - baselinePct).toFixed(4)))
    )
    const submittedAmount = Number(((line.totalPrice * currentPeriodPct) / 100).toFixed(2))
    const submittedQuantity = Number(((line.quantity * currentPeriodPct) / 100).toFixed(3))
    const current = billLineByContractLineId.get(line.id) ?? null

    if (sandboxMode) {
      updateSimulationPercent(line.id, totalCumulativePct)
      return
    }

    setProgressLineWorkingId(line.id)
    try {
      await requestJson(
        `/api/erp/client-contracts/${selectedContract.id}/progress-bills/${selectedBill.id}/lines`,
        {
          method: "POST",
          body: JSON.stringify({
            contractLineId: line.id,
            submittedQuantity,
            submittedAmount,
            submittedPercent: currentPeriodPct,
            approvedQuantity: current?.approvedQuantity ?? null,
            approvedAmount: current?.approvedAmount ?? null,
            approvedPercent: current?.approvedPercent ?? null,
            approvedManualOverride: current?.approvedManualOverride ?? false,
          }),
        },
        z.any()
      )
      const snapshot = await reloadProgressBillData().catch(() => null)
      if (snapshot?.bill) {
        setBills((prev) => prev.map((bill) => (bill.id === snapshot.bill.id ? snapshot.bill : bill)))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירת אחוז התקדמות נכשלה")
    } finally {
      setProgressLineWorkingId(null)
    }
  }

  async function commitSimulation() {
    if (!selectedContract || !sandboxMode || !hasSimulationChanges) return
    const payload = Object.entries(simulationByLineId)
      .map(([lineId, percent]) => {
        const line = lines.find((row) => row.id === lineId)
        if (!line) return null
        const totalPct = Math.max(
          z.coerce.number().catch(0).parse(line.lastApprovedPct ?? 0),
          Math.min(100, z.coerce.number().catch(0).parse(percent))
        )
        const qty = Number(((z.coerce.number().catch(0).parse(line.quantity) * totalPct) / 100).toFixed(3))
        const amount = Number(
          ((z.coerce.number().catch(0).parse(line.totalPrice) * totalPct) / 100).toFixed(2)
        )
        return {
          id: line.id,
          pct: Number(totalPct.toFixed(4)),
          qty,
          amount,
        }
      })
      .filter((row): row is { id: string; pct: number; qty: number; amount: number } => row !== null)

    if (payload.length === 0) {
      toast.error("אין שורות סימולציה תקינות לשמירה")
      return
    }

    setCommittingSimulation(true)
    const controller = new AbortController()
    try {
      const committed = await apiPost<{ success: boolean; updatedRows: number }>(
        `/api/erp/client-contracts/${selectedContract.id}/sync-execution`,
        { lastApprovedProgress: payload },
        {
          schema: simulationCommitSchema,
          signal: controller.signal,
        }
      )
      if (controller.signal.aborted) return
      setLines((current) =>
        current.map((line) => {
          const updated = payload.find((row) => row.id === line.id)
          if (!updated) return line
          return {
            ...line,
            lastApprovedPct: updated.pct,
            lastApprovedQty: updated.qty,
            lastApprovedAmount: updated.amount,
          }
        })
      )
      clearSimulation()
      setSandboxMode(false)
      toast.success(`Simulation committed (${committed.updatedRows} rows)`)
    } catch (error) {
      if (controller.signal.aborted) return
      toast.error(error instanceof Error ? error.message : "Commit simulation failed")
    } finally {
      if (!controller.signal.aborted) setCommittingSimulation(false)
      controller.abort()
    }
  }

  async function recalculateSelectedBillTotals() {
    if (!selectedContract || !selectedBill) return
    setSaving(true)
    try {
      await requestJson(
        `/api/erp/client-contracts/${selectedContract.id}/progress-bills/${selectedBill.id}/calculate`,
        { method: "POST", body: JSON.stringify({}) }
      )
      const snapshot = await reloadProgressBillData().catch(() => null)
      if (snapshot?.bill) {
        setBills((prev) =>
          prev.map((bill) => (bill.id === snapshot.bill.id ? snapshot.bill : bill))
        )
      }
      toast.success("בוצע חישוב מחדש לסכומים מאושרים")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "חישוב מחדש נכשל")
    } finally {
      setSaving(false)
    }
  }

  const watchedChangeType = changeOrderForm.watch("changeType")
  const watchedSourceLineId = changeOrderForm.watch("contractLineId")
  const selectedSourceLine =
    lines.find((line) => line.id === watchedSourceLineId) ?? null
  const changeOrderFormReadOnly = saving || loadingChangeOrderDetails || isEditingChangeOrderReadOnly

  function openLineEditor(line: ErpClientContractLine) {
    setLineEditorTarget(line)
    setLineEditorOpen(true)
  }

  async function submitLineEditor(payload: LineEditorSubmitPayload) {
    if (!selectedContract || !lineEditorTarget) return
    const parsedPayload = lineEditorSubmitSchema.safeParse(payload)
    if (!parsedPayload.success) {
      toast.error(parsedPayload.error.issues[0]?.message ?? "נתוני שורת BOQ אינם תקינים")
      return
    }
    setLineEditorWorking(true)
    try {
      const response = await apiFetch(
        `/api/erp/client-contracts/${selectedContract.id}/lines/${lineEditorTarget.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            description: parsedPayload.data.description,
            quantity: parsedPayload.data.quantity,
            unitPrice: parsedPayload.data.unitPrice,
            supplierId: parsedPayload.data.supplierId,
            itemId: parsedPayload.data.itemId,
            requestManagerApproval: parsedPayload.data.requestManagerApproval,
          }),
        }
      )
      const raw = (await response.clone().json().catch(() => ({}))) as {
        error?: string
        code?: string
        data?: unknown
      }
      if (response.status === 409 && raw.code === "PRICE_OVERRIDE_REQUIRED") {
        toast.success("בקשת אישור מנהל נשלחה עקב חריגת רווחיות")
        const refreshed = await requestJson<ApiResponse<ErpClientContractLine[]>>(
          `/api/erp/client-contracts/${selectedContract.id}/lines`
        )
        setLines(refreshed.data ?? [])
        setLineEditorOpen(false)
        setLineEditorTarget(null)
        return
      }
      if (!response.ok) {
        throw new Error(raw.error ?? "שמירת שורה נכשלה")
      }
      await parseApiData(response, z.any())
      const refreshed = await requestJson<ApiResponse<ErpClientContractLine[]>>(
        `/api/erp/client-contracts/${selectedContract.id}/lines`
      )
      setLines(refreshed.data ?? [])
      toast.success("שורת BOQ נשמרה")
      setLineEditorOpen(false)
      setLineEditorTarget(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירת שורה נכשלה")
    } finally {
      setLineEditorWorking(false)
    }
  }

  function openLineOverrideDialog(line: ErpClientContractLine) {
    if (!selectedContract) return
    setLineOverrideContext({
      entity: "CLIENT_CONTRACT_LINE",
      entityId: line.id,
      lineId: line.id,
      projectId: selectedContract.projectId,
      enteredPrice: line.unitPrice,
      effectivePrice: line.expectedUnitCost ?? 0,
      effectiveSource: "EFFECTIVE_PRICE_ENGINE",
      direction: "BELOW_COST",
      contractNumber: selectedContract.contractNumber,
    })
    setLineOverrideOpen(true)
  }

  async function authorizeLineOverride(context: PriceViolationContext) {
    if (!selectedContract) return
    setLineOverrideWorking(true)
    try {
      await requestJson("/api/erp/pricing/authorize-override", {
        method: "POST",
        body: JSON.stringify({
          entity: context.entity,
          entityId: context.entityId,
          lineId: context.lineId ?? null,
          projectId: context.projectId ?? null,
          enteredPrice: context.enteredPrice,
          effectivePrice: context.effectivePrice,
          effectiveSource: context.effectiveSource ?? "EFFECTIVE_PRICE_ENGINE",
        }),
      })
      const refreshed = await requestJson<ApiResponse<ErpClientContractLine[]>>(
        `/api/erp/client-contracts/${selectedContract.id}/lines`
      )
      setLines(refreshed.data ?? [])
      toast.success("חריגת מחיר אושרה על ידי מנהל")
      setLineOverrideOpen(false)
      setLineOverrideContext(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "אישור חריגה נכשל")
    } finally {
      setLineOverrideWorking(false)
    }
  }

  async function requestLineManagerApproval(context: PriceViolationContext) {
    if (!selectedContract) return
    setLineOverrideWorking(true)
    try {
      await requestJson(
        `/api/erp/client-contracts/${selectedContract.id}/lines/${context.lineId ?? context.entityId}`,
        {
          method: "PUT",
          body: JSON.stringify({ requestManagerApproval: true }),
        }
      )
      toast.success("בקשת אישור מנהל נשלחה")
    } catch (error) {
      const message = error instanceof Error ? error.message : "בקשת אישור מנהל נכשלה"
      if (message.includes("חריגת")) {
        toast.success("בקשת אישור מנהל נשלחה")
      } else {
        toast.error(message)
      }
    } finally {
      setLineOverrideWorking(false)
      setLineOverrideOpen(false)
      setLineOverrideContext(null)
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#F8FAFC]" dir="rtl">
      <MasterDetailWorkspace
        title="Client Contracts Workspace"
        description="ניהול חוזי לקוח, פקודות שינוי וחשבונות התקדמות (Submitted מול Approved)."
        locale="he"
        masterLabel={{
          key: "client_contract_master",
          en: "Contract Intelligence",
          he: "מודיעין חוזה",
        }}
        detailLabel={{
          key: "client_contract_detail",
          en: "Contract Operations",
          he: "תפעול חוזה",
        }}
        className="bg-[#F8FAFC]"
        headerActions={
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant={sandboxMode ? "default" : "outline"}
              className={
                sandboxMode
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "border-amber-300 text-amber-700 hover:bg-amber-50"
              }
              onClick={() => {
                setSandboxMode(!sandboxMode)
                if (sandboxMode) clearSimulation()
              }}
              disabled={!selectedBill}
            >
              Sandbox Mode {sandboxMode ? "ON" : "OFF"}
            </Button>
            {sandboxMode ? (
              <Button
                size="sm"
                className="bg-slate-900 text-white hover:bg-slate-800"
                disabled={!hasSimulationChanges || committingSimulation}
                onClick={() => void commitSimulation()}
              >
                {committingSimulation ? (
                  <Loader2 className="ms-1 size-3.5 animate-spin" />
                ) : (
                  <Check className="ms-1 size-3.5" />
                )}
                Commit Simulation
              </Button>
            ) : null}
            <Button size="sm" onClick={() => void createContractDraft()} disabled={saving}>
              <Plus className="ms-1 size-3.5" />
              חוזה חדש
            </Button>
            <Button size="sm" variant="outline" onClick={() => void loadWorkspace()}>
              <RefreshCcw className="ms-1 size-3.5" />
              רענון
            </Button>
          </div>
        }
        master={
          <div className="space-y-2">
            <div className="grid gap-2">
              <BentoMetricCard
                label="Net Margin (Profit)"
                value={sandboxMode ? netMarginProfit : 0}
                suffix="₪"
                subLabel={`Subcontractor Impact: ${moneyOneDecimal(sandboxMode ? expectedSubcontractorPayout : 0)}`}
                className={
                  sandboxMode
                    ? netMarginProfit > netMarginSafetyThreshold
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-rose-200 bg-rose-50"
                    : undefined
                }
                valueClassName={
                  sandboxMode
                    ? netMarginProfit > netMarginSafetyThreshold
                      ? "text-emerald-500"
                      : "text-rose-500"
                    : undefined
                }
              />
              <BentoMetricCard
                label="Free Cash (Liquidity)"
                value={sandboxMode ? freeCashLiquidity : 0}
                suffix="₪"
                subLabel={`Client/Sub retention + VAT (${oneDecimal(defaultVatPct)}% VAT)`}
                className={
                  sandboxMode
                    ? freeCashLiquidity >= 0
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-rose-200 bg-rose-50"
                    : undefined
                }
                valueClassName={
                  sandboxMode
                    ? freeCashLiquidity >= 0
                      ? "text-emerald-500"
                      : "text-rose-500"
                    : undefined
                }
              />
              <BentoMetricCard label="Health Score" value={billingDashboard.healthScore} suffix="%" />
              <BentoMetricCard
                label="Cumulative Progress"
                value={
                  billingDashboard.totalContractValue > 0
                    ? (billingDashboard.totalRealized / billingDashboard.totalContractValue) * 100
                    : 0
                }
                suffix="%"
              />
              <BentoMetricCard
                label="Revenue Gap"
                value={billingDashboard.totalContractValue - billingDashboard.totalRealized}
                suffix="₪"
              />
            </div>
            {loadingLinkedSubcontractors ? (
              <p className="text-[11px] text-slate-500">מחשב קישורי חוזי קבלני משנה...</p>
            ) : null}

            <div className="max-h-[58vh] overflow-auto">
              <BentoSmartList
                items={contracts}
                density="compact"
                rowKey={(contract) => contract.id}
                selectedRowKey={selectedContractId}
                onRowClick={(contract) => setSelectedContractId(contract.id)}
                emptyState={loading ? "טוען..." : "אין חוזים להצגה."}
                columns={[
                  {
                    key: "contractNumber",
                    title: "Contract",
                    render: (contract) => (
                      <span className="font-mono text-[11px]">{contract.contractNumber}</span>
                    ),
                  },
                  {
                    key: "clientName",
                    title: "Client",
                    render: (contract) => <span>{contract.clientName}</span>,
                  },
                  {
                    key: "status",
                    title: "Status",
                    render: (contract) => (
                      <SmartListStatusPill
                        tone={
                          contract.status === "ACTIVE"
                            ? "success"
                            : contract.status === "DRAFT"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {contract.status}
                      </SmartListStatusPill>
                    ),
                  },
                  {
                    key: "total",
                    title: "Total",
                    render: (contract) => <span className="font-mono">{money(contract.totalAmount)}</span>,
                  },
                ]}
              />
            </div>
          </div>
        }
        detail={
          <Tabs defaultValue="boq-progress" className="space-y-2">
            <TabsList className="h-9 rounded-xl bg-card" variant="line">
              <TabsTrigger value="boq-progress">BOQ Progress Editor</TabsTrigger>
              <TabsTrigger value="master">Contract Master</TabsTrigger>
              <TabsTrigger value="boq">BOQ & Change Orders</TabsTrigger>
              <TabsTrigger value="progress">Progress Billing (Submitted)</TabsTrigger>
              <TabsTrigger value="approved">Billing Approval (Approved)</TabsTrigger>
              <TabsTrigger value="offsets">Linked Offsets</TabsTrigger>
              <TabsTrigger value="summary">Summary View</TabsTrigger>
            </TabsList>

            <TabsContent value="boq-progress" className="rounded-2xl border border-slate-200 bg-card p-3 space-y-2">
              {!selectedContract ? (
                <p className="text-sm text-slate-500">בחרו חוזה לקוח מהרשימה.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-card px-3 py-2">
                    <div className="text-sm font-medium">BOQ Progress Entry (% complete)</div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedBillId}
                        onValueChange={(value) => {
                          if (!value) return
                          setSelectedBillId(value)
                        }}
                      >
                        <SelectTrigger className="h-8 w-[260px]">
                          <SelectValue placeholder="בחר חשבון התקדמות" />
                        </SelectTrigger>
                        <SelectContent>
                          {bills.map((bill) => (
                            <SelectItem key={bill.id} value={bill.id}>
                              {bill.billNumber} · {bill.status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={() => void createProgressBillDraft()} disabled={saving}>
                        <Plus className="ms-1 size-3.5" />
                        חשבון חדש
                      </Button>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "max-h-[56vh] overflow-auto",
                      sandboxMode ? "ring-2 ring-amber-500/50 rounded-xl" : ""
                    )}
                  >
                    <BentoSmartList
                      items={lines}
                      density="compact"
                      rowKey={(line) => line.id}
                      emptyState="אין שורות BOQ בחוזה."
                      columns={[
                        {
                          key: "line",
                          title: "Line",
                          render: (line) => <span className="font-mono text-[11px]">#{line.lineNumber}</span>,
                        },
                        {
                          key: "description",
                          title: "Description",
                          render: (line) => {
                            const linkedEntries = payoutBreakdownByClientLineId[line.id] ?? []
                            const hasLinkedSubcontractor = linkedEntries.length > 0
                            const hasMarginRisk = Boolean(marginRiskByLineId[line.id])
                            return (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs">{line.description}</span>
                                {hasMarginRisk ? (
                                  <Badge variant="destructive" className="h-5 rounded-full px-1.5 text-[10px]">
                                    Margin Risk
                                  </Badge>
                                ) : null}
                                {hasLinkedSubcontractor ? (
                                  sandboxMode ? (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button
                                          type="button"
                                          className="rounded-full p-0.5 text-emerald-600 hover:bg-emerald-100"
                                          aria-label="הצג פירוט תשלום קבלני משנה"
                                        >
                                          <Link2 className="size-3.5" />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent align="start" className="w-80 space-y-2 p-2">
                                        <div className="border-b border-slate-100 pb-1">
                                          <p className="text-xs font-semibold text-slate-800">
                                            Payout Breakdown
                                          </p>
                                          <p className="text-[11px] text-slate-500">
                                            תשלומי קבלני משנה משוערים מהחשבון המדומה
                                          </p>
                                        </div>
                                        <div className="max-h-48 space-y-1 overflow-auto">
                                          {linkedEntries.map((entry: LinkedSubcontractorEntry) => (
                                            <div
                                              key={`${entry.contractId}-${entry.lineId}`}
                                              className="rounded-lg border border-slate-100 bg-background px-2 py-1"
                                            >
                                              <p className="text-[11px] font-medium text-slate-700">
                                                {supplierNameById.get(entry.supplierId) ??
                                                  entry.contractNumber}
                                              </p>
                                              <p className="text-[11px] text-slate-500">
                                                {entry.description}
                                              </p>
                                              <p className="font-mono text-[11px] text-slate-700">
                                                {moneyOneDecimal(entry.payoutAmount)}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  ) : (
                                    <span
                                      className="rounded-full p-0.5 text-emerald-600"
                                      title="Linked subcontractor contract"
                                    >
                                      <Link2 className="size-3.5" />
                                    </span>
                                  )
                                ) : null}
                              </div>
                            )
                          },
                        },
                        {
                          key: "contractAmount",
                          title: "Contract Amount",
                          render: (line) => <span className="font-mono">{money(line.totalPrice)}</span>,
                        },
                        {
                          key: "currentPercent",
                          title: "Current %",
                          render: (line) => {
                            const workingLine = progressLineWorkingId === line.id
                            const progressPercent = lineTotalCumulativePercent(line)
                            const currentPercentText =
                              progressInputByLineId[line.id] ?? progressPercent.toFixed(1)
                            return (
                              <div className="flex items-center gap-1.5">
                                <Input
                                  type="number"
                                  step="0.1"
                                  min={0}
                                  max={100}
                                  value={currentPercentText}
                                  className={cn(ERP_DENSE_INPUT_CLASS, "h-7 w-24")}
                                  disabled={workingLine || !selectedBillId}
                                  onChange={(event) => {
                                    setProgressInputByLineId((prev) => ({
                                      ...prev,
                                      [line.id]: event.target.value,
                                    }))
                                  }}
                                  onBlur={(event) => {
                                    const parsedPercent = currentPercentSchema.safeParse(event.currentTarget.value)
                                    if (!parsedPercent.success) {
                                      toast.error("Current % חייב להיות בין 0 ל-100")
                                      setProgressInputByLineId((prev) => {
                                        const next = { ...prev }
                                        delete next[line.id]
                                        return next
                                      })
                                      return
                                    }
                                    setProgressInputByLineId((prev) => {
                                      const next = { ...prev }
                                      delete next[line.id]
                                      return next
                                    })
                                    void saveLineProgressPercent(line, parsedPercent.data)
                                  }}
                                />
                                {workingLine ? (
                                  <Loader2 className="size-3.5 animate-spin text-slate-500" />
                                ) : null}
                              </div>
                            )
                          },
                        },
                        {
                          key: "submittedAmount",
                          title: "Submitted Amount",
                          render: (line) => {
                            const billLine = billLineByContractLineId.get(line.id)
                            const progressPercent = lineTotalCumulativePercent(line)
                            const submittedAmount =
                              billLine?.submittedAmount ??
                              Number(
                                (
                                  (line.totalPrice *
                                    Math.max(
                                      0,
                                      Math.min(
                                        100,
                                        progressPercent -
                                          z.coerce.number().catch(0).parse(line.lastApprovedPct ?? 0)
                                      )
                                    )) /
                                  100
                                ).toFixed(2)
                              )
                            return <span className="font-mono">{money(submittedAmount)}</span>
                          },
                        },
                      ]}
                      rowActions={() => (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-slate-700"
                            disabled={!selectedBill || generatingBillBundle}
                            onClick={(event) => {
                              event.stopPropagation()
                              void exportBillPdfOnly()
                            }}
                          >
                            <FileText className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-slate-700"
                            disabled={!selectedBill || generatingBillBundle}
                            onClick={(event) => {
                              event.stopPropagation()
                              void exportBillExcelOnly()
                            }}
                          >
                            <FileSpreadsheet className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    />
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="master" className="rounded-2xl border border-slate-200 bg-card p-3">
              {!selectedContract ? (
                <p className="text-sm text-slate-500">בחרו חוזה לקוח מהרשימה.</p>
              ) : (
                <Form {...masterForm}>
                  <form onSubmit={masterForm.handleSubmit(saveMaster)} className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <FormField control={masterForm.control} name="clientName" render={({ field }) => (
                      <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Client Name</FormLabel><FormControl><Input {...field} className={ERP_DENSE_INPUT_CLASS} /></FormControl></FormItem>
                    )} />
                    <FormField control={masterForm.control} name="title" render={({ field }) => (
                      <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Title</FormLabel><FormControl><Input {...field} className={ERP_DENSE_INPUT_CLASS} /></FormControl></FormItem>
                    )} />
                    <FormField control={masterForm.control} name="status" render={({ field }) => (
                      <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger className={ERP_DENSE_INPUT_CLASS}><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="DRAFT">DRAFT</SelectItem><SelectItem value="ACTIVE">ACTIVE</SelectItem><SelectItem value="CLOSED">CLOSED</SelectItem><SelectItem value="CANCELLED">CANCELLED</SelectItem></SelectContent></Select></FormItem>
                    )} />
                    <div className="rounded-xl border border-slate-200 bg-card p-2 text-xs">
                      <p className="text-[11px] text-slate-500">Contract Total</p>
                      <p className="font-mono">{money(selectedContract.totalAmount)}</p>
                    </div>
                    <FormField control={masterForm.control} name="indexationPct" render={({ field }) => (
                      <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Indexation %</FormLabel><FormControl><Input type="number" step="0.01" value={field.value} className={ERP_DENSE_INPUT_CLASS} onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} /></FormControl></FormItem>
                    )} />
                    <FormField control={masterForm.control} name="retentionPct" render={({ field }) => (
                      <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Retention %</FormLabel><FormControl><Input type="number" step="0.01" value={field.value} className={ERP_DENSE_INPUT_CLASS} onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} /></FormControl></FormItem>
                    )} />
                    <FormField control={masterForm.control} name="advancePaymentAmount" render={({ field }) => (
                      <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Advance Payment</FormLabel><FormControl><Input type="number" step="0.01" value={field.value} className={ERP_DENSE_INPUT_CLASS} onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} /></FormControl></FormItem>
                    )} />
                    <FormField control={masterForm.control} name="advanceRepaymentPct" render={({ field }) => (
                      <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Advance Repayment %</FormLabel><FormControl><Input type="number" step="0.01" value={field.value} className={ERP_DENSE_INPUT_CLASS} onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} /></FormControl></FormItem>
                    )} />
                    <div className="md:col-span-4 flex justify-end">
                      <Button size="sm" type="submit" disabled={saving}>
                        {saving ? <Loader2 className="ms-1 size-4 animate-spin" /> : <Save className="ms-1 size-4" />}
                        שמירה
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </TabsContent>

            <TabsContent value="boq" className="rounded-2xl border border-slate-200 bg-card p-3 space-y-3">
              {!selectedContract ? (
                <p className="text-sm text-slate-500">בחרו חוזה לקוח מהרשימה.</p>
              ) : (
                <>
                  <div className="grid gap-3 xl:grid-cols-10">
                    <div className="rounded-xl border border-slate-200 bg-card xl:col-span-7">
                      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                        <span>Interactive BOQ · Current Billing Progress</span>
                        <span className="text-[10px] text-slate-500">
                          Current Period = Total Cumulative - Last Approved
                        </span>
                      </div>
                      <div
                        className={cn(
                          "max-h-[52vh] overflow-auto",
                          sandboxMode ? "ring-2 ring-amber-500/50 rounded-xl" : ""
                        )}
                      >
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-right">Line</TableHead>
                              <TableHead className="text-right">Description</TableHead>
                              <TableHead className="text-right">Total Contract</TableHead>
                              <TableHead className="text-right">Est. Cost</TableHead>
                              <TableHead className="text-right">Prev. Cumulative %</TableHead>
                              <TableHead className="text-right">Total Cumulative %</TableHead>
                              <TableHead className="text-right">Current Period %</TableHead>
                              <TableHead className="text-right">Amount for Payment</TableHead>
                              <TableHead className="text-right">Profit %</TableHead>
                              <TableHead className="text-right">Edit</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {lines.map((line) => {
                              const isViolation = line.priceOverrideStatus === "REQUESTED"
                              const hasMarginRisk = Boolean(marginRiskByLineId[line.id])
                              const hasCost =
                                typeof line.expectedUnitCost === "number" && line.expectedUnitCost > 0
                              const baselinePct = z.coerce.number().catch(0).parse(line.lastApprovedPct ?? 0)
                              const computedPercent = lineTotalCumulativePercent(line)
                              const draftValue = progressInputByLineId[line.id]
                              const currentPercentText =
                                draftValue ?? (Number.isFinite(computedPercent) ? computedPercent.toFixed(2) : "0.00")
                              const currentPeriodPercent = Math.max(
                                0,
                                Math.min(
                                  100,
                                  Number(
                                    (
                                      z.coerce.number().catch(0).parse(currentPercentText || 0) - baselinePct
                                    ).toFixed(4)
                                  )
                                )
                              )
                              const currentAmount = Number(
                                ((Number(line.totalPrice ?? 0) * currentPeriodPercent) / 100).toFixed(2)
                              )
                              return (
                                <TableRow
                                  key={line.id}
                                  className={isViolation ? "bg-rose-50/60 hover:bg-rose-50" : undefined}
                                >
                                  <TableCell className="font-mono text-xs">{line.lineNumber}</TableCell>
                                  <TableCell className="text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <span>{line.description}</span>
                                      {hasMarginRisk ? (
                                        <Badge
                                          variant="outline"
                                          className="h-5 border-rose-300 bg-rose-50 px-1.5 text-[10px] text-rose-700"
                                        >
                                          <TriangleAlert className="size-3" />
                                          Margin Risk
                                        </Badge>
                                      ) : null}
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">{money(line.totalPrice)}</TableCell>
                                  <TableCell className="font-mono text-xs">
                                    {hasCost ? money(line.expectedTotalCost ?? 0) : "—"}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">{baselinePct.toFixed(2)}%</TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      step="0.1"
                                      min={baselinePct}
                                      max={100}
                                      className={ERP_DENSE_INPUT_CLASS}
                                      value={currentPercentText}
                                      disabled={!selectedBill || progressLineWorkingId === line.id}
                                      onChange={(event) => {
                                        setProgressInputByLineId((prev) => ({
                                          ...prev,
                                          [line.id]: event.target.value,
                                        }))
                                      }}
                                      onBlur={(event) => {
                                        const parsedPercent = currentPercentSchema.safeParse(event.target.value)
                                        if (!parsedPercent.success) {
                                          toast.error("Total Cumulative % חייב להיות בין 0 ל-100")
                                          setProgressInputByLineId((prev) => {
                                            const next = { ...prev }
                                            delete next[line.id]
                                            return next
                                          })
                                          return
                                        }
                                        setProgressInputByLineId((prev) => {
                                          const next = { ...prev }
                                          delete next[line.id]
                                          return next
                                        })
                                        void saveLineProgressPercent(line, parsedPercent.data)
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">{currentPeriodPercent.toFixed(2)}%</TableCell>
                                  <TableCell className="font-mono text-xs">{money(currentAmount)}</TableCell>
                                  <TableCell
                                    className={
                                      (line.profitabilityPct ?? 0) >= 0
                                        ? "font-mono text-xs text-emerald-700"
                                        : "font-mono text-xs text-rose-700"
                                    }
                                  >
                                    {hasCost ? `${(line.profitabilityPct ?? 0).toFixed(2)}%` : "—"}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7"
                                      disabled={saving}
                                      onClick={() => openLineEditor(line)}
                                    >
                                      <Edit3 className="size-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                    <div className="space-y-2 xl:col-span-3 xl:sticky xl:top-3 xl:self-start">
                      {sandboxMode ? (
                        <>
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <p className="text-[11px] text-slate-600">Projected Bill Total</p>
                            <p className="font-mono text-xl font-semibold text-amber-700">
                              {moneyOneDecimal(simulationProjection.projectedBillTotal)}
                            </p>
                          </div>
                          <div className="rounded-xl border border-primary/35 bg-primary/10 p-3">
                            <p className="text-[11px] text-slate-600">Net Cash Inflow</p>
                            <p className="font-mono text-xl font-semibold text-primary">
                              {moneyOneDecimal(simulationProjection.netCashInflow)}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              אחרי עיכבון והצמדה של החוזה.
                            </p>
                          </div>
                          <div
                            className={
                              simulationProjection.marginImpact >= 0
                                ? "rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                                : "rounded-xl border border-rose-200 bg-rose-50 p-3"
                            }
                          >
                            <p className="text-[11px] text-slate-600">Margin Impact</p>
                            <p
                              className={
                                simulationProjection.marginImpact >= 0
                                  ? "font-mono text-xl font-semibold text-emerald-700"
                                  : "font-mono text-xl font-semibold text-rose-700"
                              }
                            >
                              {moneyOneDecimal(simulationProjection.marginImpact)}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              שינוי צפוי ברווחיות הכוללת עקב החשבון המדומה.
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="rounded-xl border border-slate-200 bg-card p-3">
                            <p className="text-[11px] text-slate-500">Project Health Score</p>
                            <p className="font-mono text-2xl font-semibold text-foreground">
                              {oneDecimal(billingDashboard.healthScore)}
                              <span className="ms-1 text-sm font-normal text-slate-500">/ 100</span>
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              מבוסס על ביצוע בפועל + רווחיות משוערת בזמן אמת.
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-card p-3">
                            <p className="text-[11px] text-slate-500">Total Contract Value</p>
                            <p className="font-mono text-base font-semibold">
                              {moneyOneDecimal(billingDashboard.totalContractValue)}
                            </p>
                            <p className="mt-2 text-[11px] text-slate-500">Total Realized</p>
                            <p className="font-mono text-base font-semibold text-emerald-700">
                              {moneyOneDecimal(billingDashboard.totalRealized)}
                            </p>
                          </div>
                          <div
                            className={
                              billingDashboard.netProfit >= 0
                                ? "rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                                : "rounded-xl border border-rose-200 bg-rose-50 p-3"
                            }
                          >
                            <p className="text-[11px] text-slate-500">Net Profit (Live)</p>
                            <p
                              className={
                                billingDashboard.netProfit >= 0
                                  ? "font-mono text-xl font-semibold text-emerald-700"
                                  : "font-mono text-xl font-semibold text-rose-700"
                              }
                            >
                              {moneyOneDecimal(billingDashboard.netProfit)}
                            </p>
                          </div>
                          <div
                            className={
                              billingDashboard.estimatedProfitabilityPct >= 15
                                ? "rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                                : billingDashboard.estimatedProfitabilityPct >= 5
                                  ? "rounded-xl border border-amber-200 bg-amber-50 p-3"
                                  : "rounded-xl border border-rose-200 bg-rose-50 p-3"
                            }
                          >
                            <p className="text-[11px] text-slate-500">Margin % (Live)</p>
                            <p
                              className={
                                billingDashboard.estimatedProfitabilityPct >= 15
                                  ? "font-mono text-xl font-semibold text-emerald-700"
                                  : billingDashboard.estimatedProfitabilityPct >= 5
                                    ? "font-mono text-xl font-semibold text-amber-700"
                                    : "font-mono text-xl font-semibold text-rose-700"
                              }
                            >
                              {oneDecimal(billingDashboard.estimatedProfitabilityPct)}%
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              מתעדכן לפי Current % והעלות הצפויה של כל שורת BOQ.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-card">
                    <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                      <div className="text-xs font-medium text-slate-700">Change Orders Management</div>
                      <Button size="sm" onClick={openNewChangeOrderDialog} disabled={saving}>
                        <Plus className="ms-1 size-3.5" />
                        Add Change Order
                      </Button>
                    </div>
                    <div className="max-h-[40vh] overflow-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead className="text-right">CO #</TableHead><TableHead className="text-right">Type</TableHead><TableHead className="text-right">Category</TableHead><TableHead className="text-right">Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {changeOrders.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="h-16 text-center text-sm text-slate-500">אין פקודות שינוי</TableCell></TableRow>
                          ) : (
                            changeOrders.map((co) => (
                              <TableRow key={co.id}>
                                <TableCell>{co.changeOrderNumber}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={changeOrderTypeClass(co.changeType)}>
                                    {changeOrderTypeLabel(co.changeType)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs">
                                  <div className="flex flex-wrap gap-1">
                                    {co.isExtraWork ? <Badge variant="outline" className="text-[10px]">חריג</Badge> : null}
                                    {co.isAdditionalWork ? <Badge variant="outline" className="text-[10px]">עבודות נוספות</Badge> : null}
                                    {!co.isExtraWork && !co.isAdditionalWork ? "—" : null}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={co.status === "APPROVED" ? "border-emerald-200 bg-emerald-50 text-emerald-800 text-[10px]" : "text-[10px]"}>
                                    {co.status}
                                  </Badge>
                                  {co.isLocked ? <TriangleAlert className="ms-1 inline size-3.5 text-amber-600" /> : null}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button size="sm" variant="ghost" className="h-7" disabled={co.status === "APPROVED" || co.isLocked || saving} onClick={() => openEditChangeOrderDialog(co)}>
                                      <Edit3 className="size-4" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-emerald-700" disabled={co.status === "APPROVED" || co.isLocked || saving} onClick={() => void approveChangeOrder(co)}>
                                      <CheckCircle2 className="size-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-primary"
                                      disabled={co.priceOverrideStatus !== "REQUESTED" || saving}
                                      onClick={() => void authorizeChangeOrderPriceOverride(co)}
                                    >
                                      <WandSparkles className="size-4" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-destructive" disabled={co.isLocked || saving} onClick={() => void deleteChangeOrder(co)}>
                                      <Trash2 className="size-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="progress" className="rounded-2xl border border-slate-200 bg-card p-3 space-y-2">
              {!selectedContract ? (
                <p className="text-sm text-slate-500">בחרו חוזה לקוח מהרשימה.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedBillId}
                        onValueChange={(value) => {
                          if (!value) return
                          setSelectedBillId(value)
                        }}
                      >
                        <SelectTrigger className="h-8 w-[280px]"><SelectValue placeholder="בחר חשבון התקדמות" /></SelectTrigger>
                        <SelectContent>{bills.map((bill) => <SelectItem key={bill.id} value={bill.id}>{bill.billNumber} · {bill.status}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" onClick={() => void createProgressBillDraft()} disabled={saving}>
                        <Plus className="ms-1 size-3.5" />
                        חשבון חדש
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={generatingBillBundle || !selectedContract || !selectedBill}
                      onClick={() => void generateBillBundle()}
                    >
                      {generatingBillBundle ? (
                        <Loader2 className="ms-1 size-3.5 animate-spin" />
                      ) : (
                        <>
                          <FileText className="ms-1 size-3.5" />
                          <FileSpreadsheet className="ms-1 size-3.5" />
                        </>
                      )}
                      Generate Bill (PDF + Excel)
                    </Button>
                  </div>
                  <div className="max-h-[44vh] overflow-auto rounded-xl border border-slate-200 bg-card">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">Line</TableHead>
                          <TableHead className="text-right">Submitted Qty</TableHead>
                          <TableHead className="text-right">Submitted Amount</TableHead>
                          <TableHead className="text-right">Submitted %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingBillData ? (
                          <TableRow>
                            <TableCell colSpan={4} className="h-16 text-center text-sm text-slate-500">
                              טוען שורות חשבון...
                            </TableCell>
                          </TableRow>
                        ) : null}
                        {billLines.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell className="font-mono text-xs">{line.contractLineId.slice(0, 8)}</TableCell>
                            <TableCell><Input type="number" step="0.001" className={ERP_DENSE_INPUT_CLASS} value={line.submittedQuantity} onChange={(e) => void updateBillLine(line.id, "submittedQuantity", e.target.value === "" ? 0 : Number(e.target.value))} /></TableCell>
                            <TableCell><Input type="number" step="0.01" className={ERP_DENSE_INPUT_CLASS} value={line.submittedAmount} onChange={(e) => void updateBillLine(line.id, "submittedAmount", e.target.value === "" ? 0 : Number(e.target.value))} /></TableCell>
                            <TableCell><Input type="number" step="0.01" className={ERP_DENSE_INPUT_CLASS} value={line.submittedPercent} onChange={(e) => void updateBillLine(line.id, "submittedPercent", e.target.value === "" ? 0 : Number(e.target.value))} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="approved" className="rounded-2xl border border-slate-200 bg-card p-3 space-y-2">
              {!selectedBill ? (
                <p className="text-sm text-slate-500">בחרו חשבון התקדמות להצגת Approved Amounts.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => void copyApprovedFromSubmitted()} disabled={saving}>
                        <WandSparkles className="ms-1 size-3.5" />
                        Copy from Submitted
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void recalculateSelectedBillTotals()} disabled={saving}>
                        <RefreshCcw className="ms-1 size-3.5" />
                        Recalculate Totals
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border border-slate-200 bg-card px-2 py-1">Indexed Approved: {money(selectedBillView?.indexedApprovedAmount ?? 0)}</div>
                      <div className="rounded-lg border border-slate-200 bg-card px-2 py-1">Retention: {money(selectedBillView?.retentionDeductedAmount ?? 0)}</div>
                      <div className="rounded-lg border border-slate-200 bg-card px-2 py-1">Advance Repayment: {money(selectedBillView?.advanceRepaymentAmount ?? 0)}</div>
                      <div className="rounded-lg border border-slate-200 bg-card px-2 py-1 font-semibold">Net Payable: {money(selectedBillView?.netApprovedPayable ?? 0)}</div>
                    </div>
                  </div>
                  {progressBillError ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {progressBillError}
                    </p>
                  ) : null}
                  <div className="max-h-[44vh] overflow-auto rounded-xl border border-slate-200 bg-card">
                    <Table>
                      <TableHeader><TableRow><TableHead className="text-right">Line</TableHead><TableHead className="text-right">Approved Qty</TableHead><TableHead className="text-right">Approved Amount</TableHead><TableHead className="text-right">Approved %</TableHead><TableHead className="text-right">Price/Qty Variance</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {loadingBillData ? (
                          <TableRow>
                            <TableCell colSpan={5} className="h-16 text-center text-sm text-slate-500">
                              טוען שורות מאושרות...
                            </TableCell>
                          </TableRow>
                        ) : null}
                        {billLines.map((line) => {
                          const variance = (line.approvedAmount ?? 0) - line.submittedAmount
                          const hasVariance = Math.abs(variance) > 0.009
                          return (
                          <TableRow key={line.id} className={hasVariance ? "bg-rose-50/70" : undefined}>
                            <TableCell className="font-mono text-xs">{line.contractLineId.slice(0, 8)}</TableCell>
                            <TableCell><Input type="number" step="0.001" className={ERP_DENSE_INPUT_CLASS} value={line.approvedQuantity ?? 0} onChange={(e) => updateBillLineLocal(line.id, "approvedQuantity", e.target.value === "" ? 0 : Number(e.target.value))} onBlur={(e) => void updateBillLine(line.id, "approvedQuantity", e.target.value === "" ? 0 : Number(e.target.value))} /></TableCell>
                            <TableCell><Input type="number" step="0.01" className={ERP_DENSE_INPUT_CLASS} value={line.approvedAmount ?? 0} onChange={(e) => updateBillLineLocal(line.id, "approvedAmount", e.target.value === "" ? 0 : Number(e.target.value))} onBlur={(e) => void updateBillLine(line.id, "approvedAmount", e.target.value === "" ? 0 : Number(e.target.value))} /></TableCell>
                            <TableCell><Input type="number" step="0.01" className={ERP_DENSE_INPUT_CLASS} value={line.approvedPercent ?? 0} onChange={(e) => updateBillLineLocal(line.id, "approvedPercent", e.target.value === "" ? 0 : Number(e.target.value))} onBlur={(e) => void updateBillLine(line.id, "approvedPercent", e.target.value === "" ? 0 : Number(e.target.value))} /></TableCell>
                            <TableCell className={hasVariance ? "font-medium text-rose-700" : "text-emerald-700"}>
                              {money(variance)}
                            </TableCell>
                          </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="offsets" className="rounded-2xl border border-slate-200 bg-card p-3 space-y-2">
              {!selectedBill ? (
                <p className="text-sm text-slate-500">בחרו חשבון להצגת קיזוזים מקושרים.</p>
              ) : (
                <>
                  {billOffsetsError ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {billOffsetsError}
                    </p>
                  ) : null}
                  <div className="max-h-[44vh] overflow-auto rounded-xl border border-slate-200 bg-card">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">Source</TableHead>
                          <TableHead className="text-right">Doc #</TableHead>
                          <TableHead className="text-right">Date</TableHead>
                          <TableHead className="text-right">Base</TableHead>
                          <TableHead className="text-right">Commission %</TableHead>
                          <TableHead className="text-right">Commission</TableHead>
                          <TableHead className="text-right">Offset</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingBillOffsets ? (
                          <TableRow>
                            <TableCell colSpan={7} className="h-16 text-center text-sm text-slate-500">
                              טוען קיזוזים...
                            </TableCell>
                          </TableRow>
                        ) : billOffsets.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="h-16 text-center text-sm text-slate-500">
                              אין קיזוזים מקושרים לחשבון זה.
                            </TableCell>
                          </TableRow>
                        ) : (
                          billOffsets.map((offset) => (
                            <TableRow key={offset.id}>
                              <TableCell>{offset.sourceType}</TableCell>
                              <TableCell>{offset.sourceNumber ?? offset.sourceId.slice(0, 8)}</TableCell>
                              <TableCell>{offset.sourceDate ?? "—"}</TableCell>
                              <TableCell className="font-mono">{money(offset.baseAmount)}</TableCell>
                              <TableCell className="font-mono">{offset.commissionPct.toFixed(2)}%</TableCell>
                              <TableCell className="font-mono">{money(offset.commissionAmount)}</TableCell>
                              <TableCell className="font-mono font-semibold text-amber-700">
                                {money(offset.offsetAmount)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="summary" className="rounded-2xl border border-slate-200 bg-card p-3">
              {!selectedBill ? (
                <p className="text-sm text-slate-500">בחרו חשבון להצגת Summary.</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-card p-3 text-sm">
                    <p className="text-[11px] text-slate-500">Submitted Total</p>
                    <p className="font-mono font-semibold">{money(selectedBillView?.submittedTotalAmount ?? 0)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-card p-3 text-sm">
                    <p className="text-[11px] text-slate-500">Approved Total</p>
                    <p className="font-mono font-semibold">{money(selectedBillView?.approvedTotalAmount ?? 0)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-card p-3 text-sm">
                    <p className="text-[11px] text-slate-500">Net to Pay</p>
                    <p className="font-mono font-semibold text-emerald-700">{money(selectedBillView?.netApprovedPayable ?? 0)}</p>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        }
      />

      <Dialog open={changeOrderDialogOpen} onOpenChange={setChangeOrderDialogOpen}>
        <DialogContent dir="rtl" className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editingChangeOrderId ? "Edit Change Order" : "Add Change Order"}</DialogTitle>
          </DialogHeader>
          {loadingChangeOrderDetails ? (
            <p className="rounded-lg border border-slate-200 bg-background px-3 py-2 text-xs text-slate-600">
              טוען פרטי הוראת שינוי...
            </p>
          ) : null}
          {isEditingChangeOrderReadOnly ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              הוראת שינוי מאושרת נעולה לעריכה (Read-only).
            </p>
          ) : null}
          <Form {...changeOrderForm}>
            <form className="grid grid-cols-1 gap-3 md:grid-cols-4" onSubmit={changeOrderForm.handleSubmit(saveChangeOrder)}>
              <FormField control={changeOrderForm.control} name="changeOrderNumber" render={({ field }) => (
                <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Change Order #</FormLabel><FormControl><Input {...field} disabled={changeOrderFormReadOnly} className={ERP_DENSE_INPUT_CLASS} /></FormControl></FormItem>
              )} />
              <FormField control={changeOrderForm.control} name="changeType" render={({ field }) => (
                <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Change Type</FormLabel><Select value={field.value} onValueChange={field.onChange} disabled={changeOrderFormReadOnly}><FormControl><SelectTrigger className={ERP_DENSE_INPUT_CLASS}><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="NEW_LINE">New Line</SelectItem><SelectItem value="QTY_CHANGE">Qty Change</SelectItem><SelectItem value="PRICE_CHANGE">Price Change</SelectItem></SelectContent></Select></FormItem>
              )} />

              {(watchedChangeType === "QTY_CHANGE" || watchedChangeType === "PRICE_CHANGE") ? (
                <FormField control={changeOrderForm.control} name="contractLineId" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel className={ERP_DENSE_LABEL_CLASS}>Source Line Picker</FormLabel>
                    <Popover open={linePickerOpen} onOpenChange={setLinePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" className="h-8 justify-between px-2 text-sm" disabled={changeOrderFormReadOnly}>
                          <span className="truncate">
                            {selectedSourceLine
                              ? `#${selectedSourceLine.lineNumber} · ${selectedSourceLine.description}`
                              : "בחר שורת BOQ מקורית"}
                          </span>
                          <ChevronDown className="size-3.5 text-slate-500" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[520px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="חיפוש לפי תיאור או מספר שורה..." />
                          <CommandList>
                            <CommandEmpty>לא נמצאו שורות</CommandEmpty>
                            <CommandGroup>
                              {lines.map((line) => (
                                <CommandItem
                                  key={line.id}
                                  value={`${line.lineNumber} ${line.description}`}
                                  onSelect={() => {
                                    field.onChange(line.id)
                                    setLinePickerOpen(false)
                                  }}
                                >
                                  <Check className={field.value === line.id ? "size-4 opacity-100" : "size-4 opacity-0"} />
                                  <span className="truncate">#{line.lineNumber} · {line.description}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </FormItem>
                )} />
              ) : null}

              {watchedChangeType === "NEW_LINE" ? (
                <FormField control={changeOrderForm.control} name="newLineDescription" render={({ field }) => (
                  <FormItem className="md:col-span-4"><FormLabel className={ERP_DENSE_LABEL_CLASS}>New Line Description</FormLabel><FormControl><Input {...field} value={field.value ?? ""} disabled={changeOrderFormReadOnly} className={ERP_DENSE_INPUT_CLASS} /></FormControl></FormItem>
                )} />
              ) : null}

              {watchedChangeType === "QTY_CHANGE" ? (
                <FormField control={changeOrderForm.control} name="qtyDelta" render={({ field }) => (
                  <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Quantity Delta</FormLabel><FormControl><Input type="number" step="0.001" value={field.value ?? 0} disabled={changeOrderFormReadOnly} className={ERP_DENSE_INPUT_CLASS} onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} /></FormControl></FormItem>
                )} />
              ) : null}

              {watchedChangeType === "PRICE_CHANGE" ? (
                <FormField control={changeOrderForm.control} name="newUnitPrice" render={({ field }) => (
                  <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Unit Price Delta</FormLabel><FormControl><Input type="number" step="0.01" value={field.value ?? 0} disabled={changeOrderFormReadOnly} className={ERP_DENSE_INPUT_CLASS} onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} /></FormControl></FormItem>
                )} />
              ) : null}
              {watchedChangeType === "PRICE_CHANGE" ? (
                <FormField
                  control={changeOrderForm.control}
                  name="priceSupplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={ERP_DENSE_LABEL_CLASS}>Supplier (Price Context)</FormLabel>
                      <Select
                        value={field.value ?? "none"}
                        onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                        disabled={changeOrderFormReadOnly}
                      >
                        <FormControl>
                          <SelectTrigger className={ERP_DENSE_INPUT_CLASS}>
                            <SelectValue placeholder="בחר ספק" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">ללא</SelectItem>
                          {suppliers.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.supplierNum} · {supplier.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              ) : null}
              {watchedChangeType === "PRICE_CHANGE" ? (
                <FormField
                  control={changeOrderForm.control}
                  name="priceItemId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={ERP_DENSE_LABEL_CLASS}>Item (Price Context)</FormLabel>
                      <Select
                        value={field.value ?? "none"}
                        onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                        disabled={changeOrderFormReadOnly}
                      >
                        <FormControl>
                          <SelectTrigger className={ERP_DENSE_INPUT_CLASS}>
                            <SelectValue placeholder="בחר פריט" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">ללא</SelectItem>
                          {items.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.itemNumber} · {item.description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              ) : null}

              <FormField control={changeOrderForm.control} name="isExtraWork" render={({ field }) => (
                <FormItem className="rounded-xl border border-slate-200 bg-card p-3"><FormLabel className="text-xs">Extra Work (חריג)</FormLabel><FormControl><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={field.value} disabled={changeOrderFormReadOnly} onChange={(e) => field.onChange(e.target.checked)} />סמן כחריג</label></FormControl></FormItem>
              )} />
              <FormField control={changeOrderForm.control} name="isAdditionalWork" render={({ field }) => (
                <FormItem className="rounded-xl border border-slate-200 bg-card p-3"><FormLabel className="text-xs">Additional Works (עבודות נוספות)</FormLabel><FormControl><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={field.value} disabled={changeOrderFormReadOnly} onChange={(e) => field.onChange(e.target.checked)} />סמן כעבודות נוספות</label></FormControl></FormItem>
              )} />

              <FormField control={changeOrderForm.control} name="notes" render={({ field }) => (
                <FormItem className="md:col-span-2"><FormLabel className={ERP_DENSE_LABEL_CLASS}>Notes</FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} disabled={changeOrderFormReadOnly} className="min-h-20 text-sm" /></FormControl></FormItem>
              )} />

              <FormField
                control={changeOrderForm.control}
                name="inheritanceRules.retentionPct"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={ERP_DENSE_LABEL_CLASS}>Retention % (Inherited)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" value={field.value} disabled className={ERP_DENSE_INPUT_CLASS} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={changeOrderForm.control}
                name="inheritanceRules.discountPct"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={ERP_DENSE_LABEL_CLASS}>Discount % (Inherited)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" value={field.value} disabled className={ERP_DENSE_INPUT_CLASS} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={changeOrderForm.control}
                name="inheritanceRules.indexationPct"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={ERP_DENSE_LABEL_CLASS}>Indexation % (Inherited)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" value={field.value} disabled className={ERP_DENSE_INPUT_CLASS} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter className="md:col-span-4">
                <Button type="button" variant="outline" onClick={() => setChangeOrderDialogOpen(false)}>ביטול</Button>
                <Button type="submit" disabled={changeOrderFormReadOnly}>{saving ? <Loader2 className="ms-1 size-4 animate-spin" /> : <Save className="ms-1 size-4" />}שמירה</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <Dialog open={changeOrderPriceOverrideOpen} onOpenChange={setChangeOrderPriceOverrideOpen}>
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
                const sourceLine = lines.find((line) => line.id === pendingChangeOrderValues?.contractLineId)
                if (sourceLine) {
                  changeOrderForm.setValue("newUnitPrice", Number(sourceLine.unitPrice), {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                setChangeOrderPriceOverrideOpen(false)
                setPendingChangeOrderValues(null)
              }}
            >
              חזור למחיר מחירון
            </Button>
            <Button type="button" onClick={() => void requestManagerChangeOrderOverride()} disabled={saving}>
              בקש אישור מנהל
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PriceViolationModal
        open={lineOverrideOpen}
        onOpenChange={(next) => {
          setLineOverrideOpen(next)
          if (!next) setLineOverrideContext(null)
        }}
        context={lineOverrideContext}
        working={lineOverrideWorking}
        canAuthorize
        onRequestManagerApproval={requestLineManagerApproval}
        onAuthorizeOverride={authorizeLineOverride}
      />
      <ClientContractLineEditor
        open={lineEditorOpen}
        onOpenChange={(next) => {
          setLineEditorOpen(next)
          if (!next) setLineEditorTarget(null)
        }}
        line={lineEditorTarget}
        suppliers={suppliers}
        items={items}
        defaultSupplierId={selectedContract?.supplierId ?? null}
        working={lineEditorWorking}
        onSubmit={submitLineEditor}
      />
    </div>
  )
}

