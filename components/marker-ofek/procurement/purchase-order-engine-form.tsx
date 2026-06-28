"use client"

import * as React from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  FileDown,
  FileText,
  Lock,
  MapPin,
  MoreHorizontal,
  Paperclip,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Warehouse,
} from "lucide-react"
import { toast } from "sonner"
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type SubmitHandler,
} from "react-hook-form"

import { FormStatusGuard, useFormStatusGuard } from "@/components/erp/shared/form-status-guard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { ContractListDto } from "@/app/api/procurement/contracts/route"
import type { ContractDetailDto, ContractBoqLineDto } from "@/app/api/procurement/contracts/[id]/route"
import { Progress } from "@/components/ui/progress"
import { apiGet } from "@/lib/utils/api-client"
import { cn } from "@/lib/utils"
import {
  MOCK_PROJECT_BUDGET_INSIGHTS,
  PO_ENGINE_VAT_RATE,
  PROJECT_BUDGET_LIMIT_NIS,
  defaultPurchaseOrderEngineValues,
  purchaseOrderEngineSchema,
  type PurchaseOrderEngineInput,
  type PurchaseOrderEngineOutput,
} from "@/lib/marker-ofek/po-engine-schema"

const fieldClass =
  "h-8 max-w-md border-input bg-card text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:border-ring/60 focus-visible:ring-ring/20 md:text-sm"
const labelClass = "text-xs font-semibold text-muted-foreground"
const cellPad = "px-2 py-1 align-middle"

const supplierLookupSchema = z.array(z.object({ id: z.string(), name: z.string() }))
const projectLookupSchema = z.array(z.object({ id: z.string(), name: z.string() }))
const itemLookupSchema = z.array(
  z.object({
    id: z.string(),
    itemNumber: z.string(),
    description: z.string(),
  })
)

// ── Phase 3 — Zod schemas for enrichment data ────────────────────────────────

const paymentTermsListSchema = z.array(
  z.object({
    code: z.string(),
    description: z.string(),
    isEom: z.boolean(),
    monthsToAdd: z.number(),
    daysToAdd: z.number(),
    installments: z.number(),
  })
)

const supplierDetailSchema = z.object({
  id: z.string(),
  paymentTerms: z.string().nullable().optional(),
  vatCode: z.string().nullable().optional(),
  withholdingPct: z.number().nullable().optional(),
  contacts: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        role: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        isPrimary: z.boolean().optional().default(false),
      })
    )
    .optional()
    .default([]),
}).passthrough()

type SupplierDetailLite = z.infer<typeof supplierDetailSchema>
type ContactLite = NonNullable<SupplierDetailLite["contacts"]>[number]
type PaymentTermDto = { code: string; description: string; isEom: boolean }

// ── Phase 3 — Static warehouse list (FK-free; erp_warehouses not yet live) ──

type WarehouseOption = {
  code: string
  labelHe: string
  shippingAddrHe: string
  shippingAddrEn: string
}

const STATIC_WAREHOUSES: WarehouseOption[] = [
  {
    code: "WH-MAIN",
    labelHe: "מחסן ראשי — ראשון לציון",
    shippingAddrHe: "מחסן ראשי\nרחוב התעשייה 1\nראשון לציון 7565220\nישראל",
    shippingAddrEn: "Main Warehouse\n1 HaTa'asiya St.\nRishon LeZion 7565220\nIsrael",
  },
  {
    code: "WH-NORTH",
    labelHe: "מחסן צפון — חיפה",
    shippingAddrHe: "מחסן צפון\nרחוב הנמל 5\nחיפה 3309103\nישראל",
    shippingAddrEn: "North Warehouse\n5 HaNamal St.\nHaifa 3309103\nIsrael",
  },
  {
    code: "WH-SOUTH",
    labelHe: "מחסן דרום — באר שבע",
    shippingAddrHe: "מחסן דרום\nרחוב הנגב 12\nבאר שבע 8470101\nישראל",
    shippingAddrEn: "South Warehouse\n12 HaNegev St.\nBe'er Sheva 8470101\nIsrael",
  },
  {
    code: "WH-SITE",
    labelHe: "מחסן אתר — פרויקט נוכחי",
    shippingAddrHe: "מחסן אתר — לפי פרויקט\nיש לעדכן כתובת ידנית",
    shippingAddrEn: "On-site Warehouse — per project\nPlease update address manually",
  },
]

function formatNis(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(n)
}

export function PurchaseOrderEngineForm({ mockPo: _mockPo = "" }: { mockPo?: string }) {
  const defaults = React.useMemo((): PurchaseOrderEngineInput => defaultPurchaseOrderEngineValues(), [])

  const form = useForm<
    PurchaseOrderEngineInput,
    unknown,
    PurchaseOrderEngineOutput
  >({
    resolver: zodResolver(purchaseOrderEngineSchema),
    defaultValues: defaults,
    mode: "onBlur",
  })

  const { control, register, handleSubmit, formState, getValues, reset, setValue } = form

  React.useEffect(() => {
    reset(defaults)
  }, [defaults, reset])

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  })

  const watchedLines = useWatch({ control, name: "lines" })
  const watchedProjectId = useWatch({ control, name: "projectId" })
  const watchedSupplierId = useWatch({ control, name: "supplierId" })
  const watchedWarehouseCode = useWatch({ control, name: "receivingWarehouseCode" })
  const watchedContractId = useWatch({ control, name: "contractId" })

  const [suppliers, setSuppliers] = React.useState<Array<{ id: string; name: string }>>([])
  const [projects, setProjects] = React.useState<Array<{ id: string; name: string }>>([])
  const [items, setItems] = React.useState<
    Array<{ id: string; itemNumber: string; description: string }>
  >([])
  const [paymentTermsList, setPaymentTermsList] = React.useState<PaymentTermDto[]>([])
  const [supplierContacts, setSupplierContacts] = React.useState<ContactLite[]>([])
  const [autoFilledFields, setAutoFilledFields] = React.useState<ReadonlySet<string>>(new Set())
  const [contactOpen, setContactOpen] = React.useState(false)
  const [lookupLoading, setLookupLoading] = React.useState(true)
  const [lookupError, setLookupError] = React.useState<string | null>(null)
  const [lookupAttempt, setLookupAttempt] = React.useState(0)

  // ── Phase 8 — Contract state ──────────────────────────────────────────────
  const [contracts, setContracts] = React.useState<ContractListDto[]>([])
  const [contractOpen, setContractOpen] = React.useState(false)
  const [activeContract, setActiveContract] = React.useState<{
    detail: ContractDetailDto
    lines: ContractBoqLineDto[]
  } | null>(null)
  const [contractLoading, setContractLoading] = React.useState(false)

  // ── Initial lookup: suppliers + projects + items + payment terms ──────────
  React.useEffect(() => {
    const controller = new AbortController()
    setLookupLoading(true)
    setLookupError(null)
    void (async () => {
      try {
        const [nextSuppliers, nextProjects, nextItems, nextPaymentTerms] = await Promise.all([
          apiGet<Array<{ id: string; name: string }>>("/api/erp/master-data/suppliers?supplierKind=supplier", {
            schema: supplierLookupSchema,
            signal: controller.signal,
          }),
          apiGet<Array<{ id: string; name: string }>>("/api/projects?status=ACTIVE", {
            schema: projectLookupSchema,
            signal: controller.signal,
          }),
          apiGet<Array<{ id: string; itemNumber: string; description: string }>>("/api/erp/master-data/items", {
            schema: itemLookupSchema,
            signal: controller.signal,
          }),
          apiGet<PaymentTermDto[]>("/api/master-data/payment-terms", {
            schema: paymentTermsListSchema,
            signal: controller.signal,
          }),
        ])
        if (controller.signal.aborted) return
        setSuppliers(nextSuppliers)
        setProjects(nextProjects)
        setItems(nextItems)
        setPaymentTermsList(nextPaymentTerms)

        // Phase 8 — load active contracts in parallel
        try {
          const contractsData = await apiGet<{ data: ContractListDto[] }>(
            "/api/procurement/contracts?status=ACTIVE",
            { signal: controller.signal, schema: z.unknown() as z.ZodType<{ data: ContractListDto[] }> },
          )
          if (!controller.signal.aborted) {
            setContracts(contractsData.data ?? [])
          }
        } catch {
          // Contracts are optional — silently skip if endpoint unavailable
        }
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof Error && error.name === "AbortError") return
        setLookupError(error instanceof Error ? error.message : "טעינת נתוני ייחוס נכשלה")
      } finally {
        if (!controller.signal.aborted) setLookupLoading(false)
      }
    })()
    return () => controller.abort()
  }, [lookupAttempt])

  // ── Phase 8 — Contract selection effect ──────────────────────────────────
  // When contractId changes: fetch full contract detail + BoQ lines,
  // then auto-fill supplierId and paymentTermsCode from the contract.
  const lastContractIdRef = React.useRef<string>("")

  React.useEffect(() => {
    const cid = watchedContractId ?? ""
    if (!cid || cid === lastContractIdRef.current) {
      if (!cid) {
        lastContractIdRef.current = ""
        setActiveContract(null)
      }
      return
    }
    lastContractIdRef.current = cid
    setContractLoading(true)

    const controller = new AbortController()
    void (async () => {
      try {
        const res = await apiGet<{ data: { contract: ContractDetailDto; lines: ContractBoqLineDto[] } }>(
          `/api/procurement/contracts/${encodeURIComponent(cid)}`,
          { signal: controller.signal, schema: z.unknown() as z.ZodType<{ data: { contract: ContractDetailDto; lines: ContractBoqLineDto[] } }> },
        )
        if (controller.signal.aborted) return
        const { contract, lines } = res.data
        setActiveContract({ detail: contract, lines })

        // Auto-fill supplier from contract
        if (contract.supplierId && !watchedSupplierId) {
          setValue("supplierId", contract.supplierId, { shouldDirty: false, shouldValidate: false })
        }

        // Auto-fill payment terms from contract
        if (contract.paymentTerms && !watchedSupplierId) {
          const normalized = contract.paymentTerms.trim().toLowerCase()
          const matched = paymentTermsList.find(
            (t) => t.description.toLowerCase() === normalized || t.code.toLowerCase() === normalized,
          )
          if (matched) {
            setValue("paymentTermsCode", matched.code, { shouldDirty: false, shouldValidate: false })
          }
        }

        // Mark as release order
        setValue("isReleaseOrder", true, { shouldDirty: false, shouldValidate: false })
      } catch {
        // Contract detail unavailable — keep form editable
        setActiveContract(null)
      } finally {
        setContractLoading(false)
      }
    })()
    return () => controller.abort()
  }, [watchedContractId, watchedSupplierId, paymentTermsList, setValue])

  // ── Supplier auto-fill effect (Phase 3) ───────────────────────────────────
  // Fires whenever supplierId changes. Fetches supplier detail + contacts,
  // then auto-fills paymentTermsCode / vatCode / withholdingPct / contactId.
  // Uses a ref to avoid re-running for the same supplierId.
  const lastAutoFilledSupplierRef = React.useRef<string>("")

  React.useEffect(() => {
    if (!watchedSupplierId || watchedSupplierId === lastAutoFilledSupplierRef.current) return
    lastAutoFilledSupplierRef.current = watchedSupplierId

    const controller = new AbortController()
    void (async () => {
      try {
        const detail = await apiGet<SupplierDetailLite>(
          `/api/master-data/suppliers/${encodeURIComponent(watchedSupplierId)}?include=contacts`,
          { schema: supplierDetailSchema, signal: controller.signal }
        )
        if (controller.signal.aborted) return

        const filled = new Set<string>()

        // Payment terms: try to match supplier free-text to a code by description
        if (detail.paymentTerms) {
          const normalized = detail.paymentTerms.trim().toLowerCase()
          const matched = paymentTermsList.find(
            (t) => t.description.toLowerCase() === normalized
          )
          if (matched) {
            setValue("paymentTermsCode", matched.code, { shouldDirty: false, shouldValidate: false })
            filled.add("paymentTermsCode")
          }
        }

        // VAT code
        if (detail.vatCode) {
          setValue("vatCode", detail.vatCode, { shouldDirty: false, shouldValidate: false })
          filled.add("vatCode")
        }

        // Withholding %
        if (detail.withholdingPct != null) {
          setValue("withholdingPct", detail.withholdingPct, { shouldDirty: false, shouldValidate: false })
          filled.add("withholdingPct")
        }

        // Primary contact
        const primaryContact =
          detail.contacts?.find((c) => c.isPrimary) ?? detail.contacts?.[0] ?? null
        if (primaryContact) {
          setValue("contactId", primaryContact.id, { shouldDirty: false, shouldValidate: false })
          filled.add("contactId")
        }

        setSupplierContacts(detail.contacts ?? [])
        setAutoFilledFields(filled)
      } catch {
        // Supplier detail not available — silently skip auto-fill
        setSupplierContacts([])
      }
    })()
    return () => controller.abort()
  }, [watchedSupplierId, paymentTermsList, setValue])

  // When supplier is cleared, reset auto-filled financial fields
  React.useEffect(() => {
    if (watchedSupplierId) return
    lastAutoFilledSupplierRef.current = ""
    setSupplierContacts([])
    setAutoFilledFields(new Set())
  }, [watchedSupplierId])

  // ── Warehouse auto-fill effect (Phase 3) ─────────────────────────────────
  React.useEffect(() => {
    if (!watchedWarehouseCode) return
    const wh = STATIC_WAREHOUSES.find((w) => w.code === watchedWarehouseCode)
    if (!wh) return
    setValue("shippingAddrHe", wh.shippingAddrHe, { shouldDirty: false, shouldValidate: false })
    setValue("shippingAddrEn", wh.shippingAddrEn, { shouldDirty: false, shouldValidate: false })
  }, [watchedWarehouseCode, setValue])

  const subtotal = React.useMemo(() => {
    if (!watchedLines?.length) return 0
    return watchedLines.reduce((sum, row) => {
      const q = Number(row?.quantity ?? 0)
      const p = Number(row?.unitPrice ?? 0)
      if (!Number.isFinite(q) || !Number.isFinite(p)) return sum
      return sum + q * p
    }, 0)
  }, [watchedLines])

  const vatAmount = React.useMemo(
    () => Math.round(subtotal * PO_ENGINE_VAT_RATE * 100) / 100,
    [subtotal]
  )

  const grandTotal = React.useMemo(
    () => Math.round((subtotal + vatAmount) * 100) / 100,
    [subtotal, vatAmount]
  )

  const overBudget = grandTotal > PROJECT_BUDGET_LIMIT_NIS
  const guard = useFormStatusGuard({
    isStale: lookupLoading || Boolean(lookupError),
    hasHighVariance: overBudget,
    staleMessage: lookupError ?? "נתוני פרויקט/ספק/פריטים עדיין נטענים.",
    highVarianceMessage: "זוהתה חריגת תקציב גבוהה. שליחה נחסמה עד לטיפול בחריגה.",
  })

  const projectInsights = watchedProjectId
    ? MOCK_PROJECT_BUDGET_INSIGHTS[watchedProjectId] ?? null
    : null

  const onValid: SubmitHandler<PurchaseOrderEngineOutput> = (data) => {
    if (!guard.assertReady()) return
    const lineCount = data.lines.length
    toast.success(`ההזמנה אומתה (${lineCount} שורות)`)
  }

  const onInvalid = () => {
    console.warn("[PO Engine] validation failed", formState.errors)
  }

  function saveDraft() {
    if (!guard.assertReady()) return
    const values = getValues()
    toast.success(`טיוטה נשמרה (${values.lines.length} שורות)`)
  }

  function exportPdf() {
    toast.message("יצוא PDF יתחבר ביישום מלא")
  }

  function attachDocuments() {
    toast.message("צירוף מסמכים יתחבר ביישום מלא")
  }

  return (
    <div
      dir="rtl"
      className="min-w-0 w-full max-w-full pb-12 [color-scheme:light]"
    >
      <form
        onSubmit={handleSubmit(onValid, onInvalid)}
        className="space-y-4"
        noValidate
      >
        {/* 1. Action ribbon — SAP-style */}
        <div
          className={cn(
            "sticky top-0 z-30 -mx-1 border-b border-border bg-card/95 px-1 backdrop-blur-sm",
            "supports-[backdrop-filter]:bg-card/90"
          )}
        >
          <div className="flex flex-wrap items-end gap-3 py-2">
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-bold tracking-tight text-foreground md:text-lg">
                מרחב עבודה — הזמנת רכש
              </h1>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Phase 2.1 — Procurement Workspace · בקרת תקציב ומע״מ
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-input bg-card px-3 text-xs font-medium text-foreground shadow-sm"
                onClick={saveDraft}
              >
                <Save className="size-3.5" aria-hidden />
                שמירה טיוטה
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-8 bg-emerald-700 px-4 text-xs font-semibold text-white shadow-sm hover:bg-emerald-600"
              >
                שלח לאישור מנכ״ל
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-input bg-card px-3 text-xs font-medium text-foreground shadow-sm"
                onClick={exportPdf}
              >
                <FileDown className="size-3.5" aria-hidden />
                יצוא ל-PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-input bg-card px-3 text-xs font-medium text-foreground shadow-sm"
                onClick={attachDocuments}
              >
                <Paperclip className="size-3.5" aria-hidden />
                צירוף מסמכים
              </Button>
            </div>
          </div>
          <div className="pb-2">
            <Link
              href="/marker-ofek/procurement/purchase-orders/from-boq"
              className="text-[11px] font-medium text-primary underline-offset-4 hover:underline"
            >
              מסלול מתקדם — הזמנה ממכרז (BoQ)
            </Link>
          </div>
        </div>

        {overBudget ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
          >
            <AlertTriangle
              className="mt-0.5 size-5 shrink-0 text-amber-700"
              aria-hidden
            />
            <p className="font-semibold leading-snug">
              חריגת תקציב - ההזמנה תועבר למטריצת אישורים (דורש אישור מנכ״ל)
            </p>
          </div>
        ) : null}
        <FormStatusGuard
          isStale={lookupLoading || Boolean(lookupError)}
          hasHighVariance={overBudget}
          staleMessage={lookupError ?? undefined}
          highVarianceMessage="חריגת תקציב גבוהה - המשך נחסם עד לאישור חריגה."
        />
        {lookupError ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span>טעינת נתוני ייחוס נכשלה. ניתן לנסות טעינה מחדש.</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 border-amber-300 bg-card text-amber-900"
              onClick={() => setLookupAttempt((prev) => prev + 1)}
            >
              נסה שוב
            </Button>
          </div>
        ) : null}

        {/* 2. Smart header — dual cards */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
            <h2 className="mb-3 border-b border-border pb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              כרטיס א׳ — ספק, פרויקט ואיש קשר
            </h2>

            {/* Phase 8 — Framework contract selector (above supplier) */}
            <div className="mb-4 space-y-1.5">
              <Label className={labelClass}>
                <FileText className="me-1 inline-block size-3" aria-hidden />
                חוזה מסגרת (אופציונלי)
              </Label>
              <Controller
                control={control}
                name="contractId"
                render={({ field }) => (
                  <ContractCombobox
                    value={field.value ?? ""}
                    onChange={(val) => {
                      field.onChange(val)
                      if (!val) {
                        // Clear contract state when deselected
                        setActiveContract(null)
                        lastContractIdRef.current = ""
                        setValue("isReleaseOrder", false, { shouldDirty: false })
                      }
                    }}
                    contracts={contracts}
                    loading={contractLoading}
                    open={contractOpen}
                    setOpen={setContractOpen}
                  />
                )}
              />
              {activeContract && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  ✓ חוזה נבחר — הספק ותנאי התשלום הוגדרו אוטומטית. ניתן להחיל מחירי חוזה על שורות ההזמנה.
                </p>
              )}
              {!contracts.length && !lookupLoading && (
                <p className="text-[11px] text-muted-foreground">
                  אין חוזי מסגרת פעילים עבור חברה זו.
                </p>
              )}
            </div>

            <div className="grid justify-items-start gap-4 sm:grid-cols-3">
              <div className="w-full max-w-md space-y-1.5">
                <Label className={labelClass}>ספק</Label>
                <Controller
                  control={control}
                  name="supplierId"
                  render={({ field }) => (
                    <Select
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger
                        size="sm"
                        className={cn(
                          "h-8 w-full border-border bg-card text-sm text-foreground",
                          formState.errors.supplierId && "border-red-300"
                        )}
                        onBlur={field.onBlur}
                        ref={field.ref}
                        aria-invalid={!!formState.errors.supplierId}
                      >
                        <SelectValue placeholder="בחרו ספק" />
                      </SelectTrigger>
                      <SelectContent className="border border-border bg-card">
                        {(suppliers.length > 0 ? suppliers : []).map((s) => (
                          <SelectItem key={s.id} value={s.id} className="text-sm">
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {formState.errors.supplierId ? (
                  <p className="text-[11px] text-red-600" role="alert">
                    {formState.errors.supplierId.message}
                  </p>
                ) : null}
              </div>

              <div className="w-full max-w-md space-y-1.5">
                <Label className={labelClass}>פרויקט</Label>
                <Controller
                  control={control}
                  name="projectId"
                  render={({ field }) => (
                    <Select
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger
                        size="sm"
                        className={cn(
                          "h-8 w-full border-border bg-card text-sm text-foreground",
                          formState.errors.projectId && "border-red-300"
                        )}
                        aria-invalid={!!formState.errors.projectId}
                      >
                        <SelectValue placeholder="בחרו פרויקט" />
                      </SelectTrigger>
                      <SelectContent className="border border-border bg-card">
                        {(projects.length > 0 ? projects : []).map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-sm">
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {formState.errors.projectId ? (
                  <p className="text-[11px] text-red-600" role="alert">
                    {formState.errors.projectId.message}
                  </p>
                ) : null}
              </div>

              <div className="w-full max-w-md space-y-1.5">
                <Label htmlFor="po-expected-delivery" className={labelClass}>
                  תאריך אספקה נדרש
                </Label>
                <Input
                  id="po-expected-delivery"
                  type="date"
                  className={cn(fieldClass, "w-full")}
                  aria-invalid={!!formState.errors.expectedDelivery}
                  {...register("expectedDelivery")}
                />
                {formState.errors.expectedDelivery ? (
                  <p className="text-[11px] text-red-600" role="alert">
                    {formState.errors.expectedDelivery.message}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Contact picker — pre-filtered by selected supplier (Phase 3.3) */}
            <div className="mt-4 border-t border-border/50 pt-4">
              <div className="w-full space-y-1.5">
                <Label className={labelClass}>
                  <span>איש קשר</span>
                  {autoFilledFields.has("contactId") ? (
                    <AutoFillBadge />
                  ) : null}
                </Label>
                <Controller
                  control={control}
                  name="contactId"
                  render={({ field }) => (
                    <ContactCombobox
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      contacts={supplierContacts}
                      disabled={!watchedSupplierId || supplierContacts.length === 0}
                      open={contactOpen}
                      setOpen={setContactOpen}
                    />
                  )}
                />
                {!watchedSupplierId ? (
                  <p className="text-[11px] text-muted-foreground">
                    בחרו ספק תחילה — אנשי הקשר ייטענו אוטומטית
                  </p>
                ) : supplierContacts.length === 0 && watchedSupplierId ? (
                  <p className="text-[11px] text-muted-foreground">
                    לא נמצאו אנשי קשר עבור ספק זה — ניתן להוסיף בכרטיס הספק
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
            <h2 className="mb-3 border-b border-border pb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              כרטיס ב׳ — {activeContract ? "יתרת חוזה מסגרת" : "תובנות חיות (מוק)"}
            </h2>
            {activeContract ? (
              <ContractBalanceCard contract={activeContract.detail} poNetTotal={subtotal} />
            ) : projectInsights ? (
              <dl className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border/70 bg-background/80 px-3 py-2">
                  <dt className="text-[11px] font-medium text-muted-foreground">
                    תקציב מאושר
                  </dt>
                  <dd className="mt-1 text-sm font-bold tabular-nums text-foreground">
                    {formatNis(projectInsights.approvedNis)}
                  </dd>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/80 px-3 py-2">
                  <dt className="text-[11px] font-medium text-muted-foreground">
                    נוצל עד כה
                  </dt>
                  <dd className="mt-1 text-sm font-bold tabular-nums text-foreground">
                    {formatNis(projectInsights.usedNis)}
                  </dd>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2">
                  <dt className="text-[11px] font-medium text-emerald-800">
                    יתרה פנויה
                  </dt>
                  <dd className="mt-1 text-sm font-bold tabular-nums text-emerald-900">
                    {formatNis(projectInsights.remainingNis)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                בחרו פרויקט כדי להציג מדדי תקציב (דמו).
              </p>
            )}
          </section>
        </div>

        {/* 3. Phase 3 — Financial terms card (C) */}
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
          <h2 className="mb-3 border-b border-border pb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            כרטיס ג׳ — תנאים פיננסיים
            {autoFilledFields.size > 0 ? (
              <span className="mr-2 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                <Sparkles className="size-3" aria-hidden />
                הושלמו אוטומטית מנתוני הספק
              </span>
            ) : null}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Payment Terms */}
            <div className="space-y-1.5">
              <Label className={labelClass}>
                תנאי תשלום
                {autoFilledFields.has("paymentTermsCode") ? <AutoFillBadge /> : null}
              </Label>
              <Controller
                control={control}
                name="paymentTermsCode"
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger
                      size="sm"
                      className="h-8 w-full border-border bg-card text-sm text-foreground"
                    >
                      <SelectValue placeholder="בחרו תנאי תשלום" />
                    </SelectTrigger>
                    <SelectContent className="border border-border bg-card">
                      {paymentTermsList.map((t) => (
                        <SelectItem key={t.code} value={t.code} className="text-sm">
                          <span className="font-mono text-xs text-muted-foreground">{t.code}</span>
                          <span className="mr-1.5">{t.description}</span>
                          {t.isEom ? (
                            <span className="text-[10px] text-sky-600">(שוטף)</span>
                          ) : null}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                ירושה מהספק אם ריק
              </p>
            </div>

            {/* VAT Code */}
            <div className="space-y-1.5">
              <Label htmlFor="po-vat-code" className={labelClass}>
                קוד מע״מ
                {autoFilledFields.has("vatCode") ? <AutoFillBadge /> : null}
              </Label>
              <Input
                id="po-vat-code"
                className={cn(fieldClass, "w-full")}
                placeholder="002"
                {...register("vatCode")}
              />
              <p className="text-[11px] text-muted-foreground">
                002 = מע״מ מלא · 001 = פטור
              </p>
            </div>

            {/* Withholding % */}
            <div className="space-y-1.5">
              <Label htmlFor="po-withholding-pct" className={labelClass}>
                ניכוי במקור (%)
                {autoFilledFields.has("withholdingPct") ? <AutoFillBadge /> : null}
              </Label>
              <Input
                id="po-withholding-pct"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.001"
                className={cn(fieldClass, "w-full tabular-nums")}
                placeholder="0"
                {...register("withholdingPct", { valueAsNumber: true })}
              />
              <p className="text-[11px] text-muted-foreground">
                אחוז ניכוי במקור לפי אישור ספק (0–100)
              </p>
            </div>
          </div>
        </section>

        {/* 4. Phase 3 — Receiving warehouse + shipping address (D) */}
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
          <h2 className="mb-3 border-b border-border pb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <Warehouse className="me-1.5 inline-block size-3.5" aria-hidden />
            כרטיס ד׳ — מחסן מקבל וכתובת משלוח
          </h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Warehouse picker */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className={labelClass}>מחסן מקבל</Label>
                <Controller
                  control={control}
                  name="receivingWarehouseCode"
                  render={({ field }) => (
                    <Select
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-8 w-full border-border bg-card text-sm text-foreground"
                      >
                        <SelectValue placeholder="בחרו מחסן מקבל" />
                      </SelectTrigger>
                      <SelectContent className="border border-border bg-card">
                        {STATIC_WAREHOUSES.map((wh) => (
                          <SelectItem key={wh.code} value={wh.code} className="text-sm">
                            <MapPin className="me-1.5 inline-block size-3 text-muted-foreground" aria-hidden />
                            {wh.labelHe}
                            <span className="mr-2 font-mono text-[10px] text-muted-foreground">
                              ({wh.code})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-[11px] text-muted-foreground">
                  בחירת מחסן תמלא אוטומטית את כתובת המשלוח להלן
                </p>
              </div>
            </div>

            {/* Shipping address — bilingual tabs */}
            <div className="space-y-1.5">
              <Label className={labelClass}>
                <MapPin className="me-1 inline-block size-3" aria-hidden />
                כתובת למשלוח
                {watchedWarehouseCode ? (
                  <Badge
                    variant="outline"
                    className="me-2 inline-flex items-center gap-0.5 border-emerald-400/30 bg-emerald-50 px-1.5 py-0 text-[10px] font-normal text-emerald-700"
                  >
                    <Sparkles className="size-2.5" aria-hidden />
                    מולאה אוטומטית
                  </Badge>
                ) : null}
              </Label>
              <Tabs defaultValue="he" dir="rtl">
                <TabsList className="h-7 gap-0.5 bg-muted/60">
                  <TabsTrigger value="he" className="h-6 px-3 text-[11px]">
                    עברית
                  </TabsTrigger>
                  <TabsTrigger value="en" className="h-6 px-3 text-[11px]">
                    English
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="he" className="mt-2">
                  <Textarea
                    rows={4}
                    dir="rtl"
                    className="w-full resize-none border-input bg-card text-sm text-foreground placeholder:text-muted-foreground"
                    placeholder={"שם חברה\nרחוב + מס'\nעיר מיקוד\nישראל"}
                    {...register("shippingAddrHe")}
                  />
                </TabsContent>
                <TabsContent value="en" className="mt-2">
                  <Textarea
                    rows={4}
                    dir="ltr"
                    className="w-full resize-none border-input bg-card text-left text-sm text-foreground placeholder:text-muted-foreground"
                    placeholder={"Company Name\nStreet + No.\nCity ZIP\nIsrael"}
                    {...register("shippingAddrEn")}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </section>

        {/* 5. Power grid — line items */}
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <div>
              <h2 className="text-sm font-bold text-foreground">שורות הזמנה</h2>
              <p className="text-[11px] text-muted-foreground">
                רשת שורות — פריט, כמות, מחיר, הערות, סה״כ
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-border bg-card text-xs text-foreground"
              onClick={() =>
                append({
                  catalogItemId: "",
                  quantity: 1,
                  unitPrice: 0,
                  lineNotes: "",
                })
              }
            >
              <Plus className="size-3.5" aria-hidden />
              הוספת שורה
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className={cn(cellPad, "min-w-[200px]")}>פריט</th>
                  {activeContract && (
                    <th className={cn(cellPad, "min-w-[160px]")}>
                      <span className="flex items-center gap-1">
                        <Lock className="size-3 text-amber-500" aria-hidden />
                        שורת חוזה
                      </span>
                    </th>
                  )}
                  <th className={cn(cellPad, "w-24")}>כמות</th>
                  <th className={cn(cellPad, "w-28")}>מחיר יחידה</th>
                  <th className={cn(cellPad, "min-w-[160px]")}>
                    הערות לשורה
                  </th>
                  <th className={cn(cellPad, "w-32")}>סה״כ שורה</th>
                  <th className={cn(cellPad, "w-24 text-center")}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((fieldRow, index) => {
                  const row = watchedLines?.[index]
                  const q = Number(row?.quantity ?? 0)
                  const p = Number(row?.unitPrice ?? 0)
                  const rowTotal =
                    Number.isFinite(q) && Number.isFinite(p) ? q * p : 0

                  // Phase 8 — contract price lock logic
                  const contractLineId = row?.contractLineId ?? ""
                  const linkedContractLine = contractLineId
                    ? activeContract?.lines.find((l) => l.id === contractLineId) ?? null
                    : null
                  const isPriceLocked = linkedContractLine !== null
                  const contractPrice = linkedContractLine?.effectiveUnitPrice ?? null
                  const hasPriceDeviation =
                    isPriceLocked && contractPrice !== null && Math.abs(p - contractPrice) > 0.01

                  return (
                    <tr
                      key={fieldRow.id}
                      className={cn(
                        "border-b border-border/70 last:border-b-0",
                        isPriceLocked && "bg-amber-50/30 dark:bg-amber-950/10",
                      )}
                    >
                      <td className={cellPad}>
                        <Controller
                          control={control}
                          name={`lines.${index}.catalogItemId`}
                          render={({ field }) => (
                            <Select
                              value={field.value || undefined}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger
                                size="sm"
                                className="h-8 w-full border-border bg-card text-sm text-foreground"
                                aria-invalid={
                                  !!formState.errors.lines?.[index]
                                    ?.catalogItemId
                                }
                              >
                                <SelectValue placeholder="בחרו פריט" />
                              </SelectTrigger>
                              <SelectContent className="border border-border bg-card">
                                {(items.length > 0 ? items : []).map((c) => (
                                  <SelectItem
                                    key={c.id}
                                    value={c.id}
                                    className="text-sm"
                                  >
                                    <span className="font-medium">{c.description}</span>
                                    <span className="mr-2 text-muted-foreground">
                                      ({c.itemNumber})
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        {formState.errors.lines?.[index]?.catalogItemId ? (
                          <p className="mt-0.5 text-[11px] text-red-600" role="alert">
                            {
                              formState.errors.lines[index]?.catalogItemId
                                ?.message
                            }
                          </p>
                        ) : null}
                      </td>

                      {/* Phase 8 — Contract line selector (only visible when a contract is active) */}
                      {activeContract && (
                        <td className={cellPad}>
                          <Controller
                            control={control}
                            name={`lines.${index}.contractLineId`}
                            render={({ field }) => (
                              <Select
                                value={field.value || undefined}
                                onValueChange={(val) => {
                                  field.onChange(val)
                                  // Auto-fill unit price from contract line
                                  const cl = activeContract.lines.find((l) => l.id === val)
                                  if (cl) {
                                    setValue(
                                      `lines.${index}.unitPrice`,
                                      cl.effectiveUnitPrice,
                                      { shouldDirty: true, shouldValidate: false },
                                    )
                                  }
                                }}
                              >
                                <SelectTrigger
                                  size="sm"
                                  className={cn(
                                    "h-8 w-full border-border bg-card text-xs text-foreground",
                                    isPriceLocked && "border-amber-400/60",
                                  )}
                                >
                                  <SelectValue placeholder="שורת חוזה…" />
                                </SelectTrigger>
                                <SelectContent className="border border-border bg-card">
                                  {activeContract.lines.map((cl) => (
                                    <SelectItem key={cl.id} value={cl.id} className="text-xs">
                                      <span className="font-mono text-[10px] text-muted-foreground">
                                        {cl.lineNo}.
                                      </span>
                                      <span className="mr-1 font-medium">{cl.description}</span>
                                      <span className="mr-1 text-[10px] text-amber-700">
                                        ₪{cl.effectiveUnitPrice}/{cl.uom}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          {isPriceLocked && (
                            <span className="mt-1 flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                              <Lock className="size-2.5" aria-hidden />
                              מחיר חוזה נעול: ₪{contractPrice}
                            </span>
                          )}
                        </td>
                      )}

                      <td className={cellPad}>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          className={cn(fieldClass, "w-full tabular-nums")}
                          {...register(`lines.${index}.quantity`, {
                            valueAsNumber: true,
                          })}
                        />
                        {formState.errors.lines?.[index]?.quantity ? (
                          <p className="mt-0.5 text-[11px] text-red-600" role="alert">
                            {formState.errors.lines[index]?.quantity?.message}
                          </p>
                        ) : null}
                      </td>
                      <td className={cellPad}>
                        <div className="relative">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            className={cn(
                              fieldClass,
                              "w-full tabular-nums",
                              isPriceLocked && !hasPriceDeviation && "border-amber-400/60 bg-amber-50/40",
                              hasPriceDeviation && "border-rose-400",
                            )}
                            {...register(`lines.${index}.unitPrice`, {
                              valueAsNumber: true,
                            })}
                          />
                          {isPriceLocked && !hasPriceDeviation && (
                            <Lock
                              className="pointer-events-none absolute end-2 top-1/2 size-3 -translate-y-1/2 text-amber-500"
                              aria-hidden
                            />
                          )}
                        </div>
                        {/* Contract Price Locked badge */}
                        {isPriceLocked && (
                          <span className={cn(
                            "mt-0.5 flex items-center gap-1 text-[10px] font-medium",
                            hasPriceDeviation ? "text-rose-600" : "text-amber-700 dark:text-amber-400",
                          )}>
                            <Lock className="size-2.5" aria-hidden />
                            {hasPriceDeviation
                              ? `חריגה ממחיר חוזה (₪${contractPrice})`
                              : "מחיר חוזה נעול"}
                          </span>
                        )}
                        {/* Price override reason — required when deviating from contract price */}
                        {hasPriceDeviation && (
                          <Input
                            className={cn(fieldClass, "mt-1 w-full text-[11px] border-rose-300")}
                            placeholder="סיבת חריגה ממחיר חוזה (חובה)…"
                            {...register(`lines.${index}.priceOverrideReason`)}
                          />
                        )}
                        {formState.errors.lines?.[index]?.unitPrice ? (
                          <p className="mt-0.5 text-[11px] text-red-600" role="alert">
                            {formState.errors.lines[index]?.unitPrice?.message}
                          </p>
                        ) : null}
                      </td>
                      <td className={cellPad}>
                        <Input
                          className={cn(
                            fieldClass,
                            "w-full min-w-[140px] text-foreground"
                          )}
                          placeholder="מפרט / אסמכתא"
                          {...register(`lines.${index}.lineNotes`)}
                        />
                        {formState.errors.lines?.[index]?.lineNotes ? (
                          <p className="mt-0.5 text-[11px] text-red-600" role="alert">
                            {formState.errors.lines[index]?.lineNotes?.message}
                          </p>
                        ) : null}
                      </td>
                      <td
                        className={cn(
                          cellPad,
                          "tabular-nums text-sm font-semibold text-foreground"
                        )}
                      >
                        {formatNis(rowTotal)}
                      </td>
                      <td className={cn(cellPad, "text-center")}>
                        <div className="flex items-center justify-center gap-0.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className={cn(
                                "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent outline-none transition-colors",
                                "text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30"
                              )}
                              aria-label="תפריט פעולות שורה"
                            >
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="min-w-[14rem] border border-border bg-card text-sm text-foreground shadow-md"
                            >
                              <DropdownMenuItem
                                disabled
                                className="text-muted-foreground"
                              >
                                היסטוריית מחירים לפריט
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled
                                className="text-muted-foreground"
                              >
                                בדיקת מלאי
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-border" />
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={fields.length <= 1}
                                onClick={() => remove(index)}
                              >
                                מחק שורה
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            disabled={fields.length <= 1}
                            onClick={() => remove(index)}
                            aria-label="מחיקת שורה"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {formState.errors.lines &&
          typeof formState.errors.lines === "object" &&
          "message" in formState.errors.lines ? (
            <p className="mt-2 text-[11px] text-red-600" role="alert">
              {(formState.errors.lines as { message?: string }).message}
            </p>
          ) : null}
        </section>

        {/* 6. Control footer — totals + budget context */}
        <section className="rounded-xl border border-border bg-background/50 p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-foreground">סיכום כספי ובקרה</p>
              <p className="text-[11px] text-muted-foreground">
                תקרת אישור להזמנה (דמו):{" "}
                <span className="font-medium text-foreground">
                  {formatNis(PROJECT_BUDGET_LIMIT_NIS)}
                </span>
                {overBudget ? (
                  <span className="mr-2 font-semibold text-amber-800">
                    — חריגה מול סה״כ כולל מע״מ
                  </span>
                ) : null}
              </p>
            </div>

            <div className="w-full max-w-sm space-y-2 rounded-lg border border-border bg-card p-4 text-sm shadow-sm">
              <div className="flex justify-between gap-4 text-muted-foreground">
                <span>סכום ביניים (לפני מע״מ)</span>
                <span className="tabular-nums font-medium text-foreground">
                  {formatNis(subtotal)}
                </span>
              </div>
              <div className="flex justify-between gap-4 text-muted-foreground">
                <span>מע״מ ({Math.round(PO_ENGINE_VAT_RATE * 100)}%)</span>
                <span className="tabular-nums font-medium text-foreground">
                  {formatNis(vatAmount)}
                </span>
              </div>
              <div className="border-t border-border pt-2">
                <div className="flex justify-between gap-4">
                  <span className="font-bold text-foreground">סה״כ לתשלום</span>
                  <span
                    className={cn(
                      "text-lg font-bold tabular-nums tracking-tight",
                      overBudget ? "text-red-700" : "text-foreground"
                    )}
                  >
                    {formatNis(grandTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <p className="text-center text-[11px] text-muted-foreground">
          שליחת &quot;שלח לאישור מנכ״ל&quot; מאמתת את הטופס ומדפיסה לקונסול (אין שמירת DB
          בשלב זה).
        </p>
      </form>
    </div>
  )
}

// ── Phase 8 helper components ─────────────────────────────────────────────────

/** Combobox for selecting a framework contract. */
function ContractCombobox({
  value,
  onChange,
  contracts,
  loading,
  open,
  setOpen,
}: {
  value: string
  onChange: (id: string) => void
  contracts: ContractListDto[]
  loading: boolean
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const selected = contracts.find((c) => c.id === value)

  function displayLabel(c: ContractListDto) {
    const remaining = formatNis(c.remainingAmount)
    return `${c.contractNumber} — ${c.supplierName} · יתרה: ${remaining}`
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={loading}
          className={cn(
            "h-8 w-full justify-between border-border bg-card text-sm font-normal",
            !selected && "text-muted-foreground",
          )}
        >
          {loading ? (
            <span className="text-muted-foreground">טוען חוזים…</span>
          ) : selected ? (
            displayLabel(selected)
          ) : (
            "בחרו חוזה מסגרת (אופציונלי)…"
          )}
          <ChevronsUpDown className="ms-2 size-3.5 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[520px] border border-border bg-card p-0 shadow-md" align="start">
        <Command>
          <CommandInput placeholder="חפשו לפי מספר חוזה או ספק…" className="text-sm" dir="rtl" />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
              לא נמצאו חוזים פעילים
            </CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange("")
                    setOpen(false)
                  }}
                  className="text-xs text-muted-foreground"
                >
                  ✕ נקה בחירה
                </CommandItem>
              )}
              {contracts.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.contractNumber} ${c.supplierName}`}
                  onSelect={() => {
                    onChange(c.id)
                    setOpen(false)
                  }}
                  className="flex items-start gap-3 py-2"
                >
                  <Check
                    className={cn(
                      "mt-0.5 size-3.5 shrink-0",
                      value === c.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {c.contractNumber}
                      <span className="mr-2 text-xs text-muted-foreground">{c.supplierName}</span>
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>סה״כ: ₪{c.totalAmount.toLocaleString("he-IL")}</span>
                      <span
                        className={cn(
                          "font-medium",
                          c.utilizationPct >= 90
                            ? "text-rose-600"
                            : c.utilizationPct >= 70
                              ? "text-amber-600"
                              : "text-emerald-600",
                        )}
                      >
                        יתרה: ₪{c.remainingAmount.toLocaleString("he-IL")} ({100 - Math.round(c.utilizationPct)}%)
                      </span>
                    </div>
                    <div className="mt-1 h-1 w-full rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-1 rounded-full transition-all",
                          c.utilizationPct >= 90
                            ? "bg-rose-500"
                            : c.utilizationPct >= 70
                              ? "bg-amber-500"
                              : "bg-emerald-500",
                        )}
                        style={{ width: `${Math.min(100, c.utilizationPct)}%` }}
                      />
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Contract balance progress card shown in Card B when a contract is selected. */
function ContractBalanceCard({
  contract,
  poNetTotal,
}: {
  contract: ContractDetailDto
  poNetTotal: number
}) {
  const projectedReleased = contract.releasedAmount + poNetTotal
  const projectedPct = contract.totalAmount > 0
    ? Math.min(100, (projectedReleased / contract.totalAmount) * 100)
    : 0
  const wouldExceed = projectedReleased > contract.totalAmount
  const overrun = wouldExceed ? round2(projectedReleased - contract.totalAmount) : 0

  function round2(n: number) {
    return Math.round(n * 100) / 100
  }

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border/70 bg-background/80 px-3 py-2">
          <dt className="text-[11px] font-medium text-muted-foreground">ערך חוזה כולל</dt>
          <dd className="mt-1 text-sm font-bold tabular-nums text-foreground">
            {formatNis(contract.totalAmount)}
          </dd>
        </div>
        <div className="rounded-lg border border-border/70 bg-background/80 px-3 py-2">
          <dt className="text-[11px] font-medium text-muted-foreground">שוחרר עד כה</dt>
          <dd className="mt-1 text-sm font-bold tabular-nums text-foreground">
            {formatNis(contract.releasedAmount)}
          </dd>
        </div>
        <div
          className={cn(
            "rounded-lg border px-3 py-2",
            wouldExceed
              ? "border-rose-200 bg-rose-50/50"
              : contract.utilizationPct >= 80
                ? "border-amber-200 bg-amber-50/50"
                : "border-emerald-100 bg-emerald-50/50",
          )}
        >
          <dt
            className={cn(
              "text-[11px] font-medium",
              wouldExceed ? "text-rose-700" : contract.utilizationPct >= 80 ? "text-amber-700" : "text-emerald-800",
            )}
          >
            יתרה פנויה
          </dt>
          <dd
            className={cn(
              "mt-1 text-sm font-bold tabular-nums",
              wouldExceed ? "text-rose-900" : contract.utilizationPct >= 80 ? "text-amber-900" : "text-emerald-900",
            )}
          >
            {formatNis(contract.remainingAmount)}
          </dd>
        </div>
      </dl>

      {/* Balance progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>ניצול חוזה (כולל הזמנה נוכחית)</span>
          <span className="font-medium">{Math.round(projectedPct)}%</span>
        </div>
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
          {/* Already released */}
          <div
            className={cn(
              "absolute inset-y-0 start-0 rounded-full transition-all",
              contract.utilizationPct >= 90 ? "bg-rose-500" :
              contract.utilizationPct >= 70 ? "bg-amber-500" : "bg-emerald-500",
            )}
            style={{ width: `${Math.min(100, contract.utilizationPct)}%` }}
          />
          {/* This PO's contribution (projected overlay) */}
          {poNetTotal > 0 && (
            <div
              className="absolute inset-y-0 rounded-full bg-sky-400/70 transition-all"
              style={{
                insetInlineStart: `${Math.min(100, contract.utilizationPct)}%`,
                width: `${Math.min(100 - contract.utilizationPct, projectedPct - contract.utilizationPct)}%`,
              }}
            />
          )}
        </div>
        {wouldExceed && (
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-rose-700">
            <AlertTriangle className="size-3 shrink-0" aria-hidden />
            חריגת מסגרת: הזמנה זו תגרום לחריגה של {formatNis(overrun)} מעל ערך החוזה. הזמנה תישמר — יש לתיאום מול מנהל הרכש.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Phase 3 helper components ─────────────────────────────────────────────────

/** Small badge that signals the field was auto-filled from supplier master data. */
function AutoFillBadge() {
  return (
    <Badge
      variant="outline"
      className="me-2 inline-flex items-center gap-0.5 border-emerald-400/30 bg-emerald-50 px-1 py-0 text-[9px] font-normal text-emerald-700"
    >
      <Sparkles className="size-2.5" aria-hidden />
      מולא אוטומטית
    </Badge>
  )
}

/** Combobox for supplier contacts — pre-filtered by selected supplier. */
function ContactCombobox({
  value,
  onChange,
  contacts,
  disabled,
  open,
  setOpen,
}: {
  value: string
  onChange: (id: string) => void
  contacts: ContactLite[]
  disabled: boolean
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const selected = contacts.find((c) => c.id === value)
  const displayLabel = selected
    ? `${selected.name}${selected.role ? ` · ${selected.role}` : ""}`
    : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-8 w-full justify-between border-border bg-card text-sm font-normal",
            !displayLabel && "text-muted-foreground"
          )}
        >
          {displayLabel ?? "בחרו איש קשר…"}
          <ChevronsUpDown className="ms-2 size-3.5 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[340px] border border-border bg-card p-0 shadow-md"
        align="start"
        dir="rtl"
      >
        <Command>
          <CommandInput
            placeholder="חיפוש שם או תפקיד…"
            className="h-8 text-sm"
          />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              לא נמצא איש קשר
            </CommandEmpty>
            <CommandGroup>
              {contacts.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.role ?? ""}`}
                  onSelect={() => {
                    onChange(c.id)
                    setOpen(false)
                  }}
                  className="flex items-start gap-2 text-sm"
                >
                  <Check
                    className={cn(
                      "mt-0.5 size-3.5 shrink-0 text-emerald-600",
                      value === c.id ? "opacity-100" : "opacity-0"
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{c.name}</span>
                      {c.isPrimary ? (
                        <Badge
                          variant="outline"
                          className="border-sky-300/40 bg-sky-50 px-1 py-0 text-[9px] text-sky-700"
                        >
                          ראשי
                        </Badge>
                      ) : null}
                    </div>
                    {c.role ? (
                      <p className="text-[11px] text-muted-foreground">{c.role}</p>
                    ) : null}
                    {c.email ? (
                      <p className="truncate text-[11px] text-muted-foreground">{c.email}</p>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
