"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertTriangle, Plus, Printer, Receipt, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type SubmitHandler,
} from "react-hook-form"

import {
  DenseDetailPanel,
  DenseMasterDetailTemplate,
} from "@/components/layout/DenseMasterDetailTemplate"
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
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  formatBillingMonthHe,
  formatDocumentDateHe,
  PrintableSubcontractorBillingView,
} from "@/components/marker-ofek/finance/printable-subcontractor-billing-view"
import { computeBillingDeductions } from "@/lib/marker-ofek/client-billing-schema"
import {
  defaultSubcontractorBillingFormValues,
  generateMockFormalSerialNumber,
  hasOpenDefects,
  statusLabelHe,
  subcontractorBillingFormSchema,
  SUBCONTRACTOR_BILLING_MOCK_PROJECTS,
  SUBCONTRACTOR_BILLING_MOCK_SUBCONTRACTORS,
  type SubcontractorBillingFormInput,
  type SubcontractorBillingFormOutput,
  type SubcontractorBillingDocumentStatus,
} from "@/lib/marker-ofek/subcontractor-billing-schema"
import { MD_QUERY } from "@/lib/marker-ofek/master-detail-nav"
import { parseApiData } from "@/lib/utils/api-client"
import { cn } from "@/lib/utils"

const fieldClass =
  "h-8 border-slate-200 bg-card text-sm text-foreground shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15"
const labelClass = "text-xs font-semibold text-slate-600"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const offsetGuardResponseSchema = z.object({
  hasBlockingOffsets: z.boolean(),
  unoffsetPoNumbers: z.array(z.string()),
  unoffsetLineIds: z.array(z.string()),
  exposureAmount: z.coerce.number(),
})

interface OffsetGuardPayload {
  hasBlockingOffsets: boolean
  unoffsetPoNumbers: string[]
  unoffsetLineIds: string[]
  exposureAmount: number
}

const bulkLinkResponseSchema = z.object({
  linkedCount: z.coerce.number(),
})
interface BulkLinkPayload {
  linkedCount: number
}
const materialDeductionsResponseSchema = z.object({
  sourceDocuments: z.array(
    z.object({
      lineId: z.string(),
      poId: z.string(),
      poNumber: z.string(),
      poDate: z.string().nullable(),
      description: z.string(),
      amount: z.coerce.number(),
    })
  ),
  baseAmount: z.coerce.number(),
  procurementCommissionPct: z.coerce.number(),
  procurementCommissionAmount: z.coerce.number(),
  totalDeduction: z.coerce.number(),
  suggestedLine: z.object({
    taskDescription: z.string(),
    claimedAmount: z.coerce.number(),
    approvedAmount: z.coerce.number(),
    notes: z.string(),
  }),
})
interface MaterialDeductionsPayload {
  sourceDocuments: Array<{
    lineId: string
    poId: string
    poNumber: string
    poDate: string | null
    description: string
    amount: number
  }>
  baseAmount: number
  procurementCommissionPct: number
  procurementCommissionAmount: number
  totalDeduction: number
  suggestedLine: {
    taskDescription: string
    claimedAmount: number
    approvedAmount: number
    notes: string
  }
}

function parseMoney(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (v === "" || v == null) return 0
  const n = Number(String(v).replace(",", ".").trim())
  return Number.isFinite(n) ? n : 0
}

export function SubcontractorBillingWorkspace() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const lineFocus = Number.parseInt(
    searchParams.get(MD_QUERY.line) ?? "",
    10
  )

  const defaults = React.useMemo(() => defaultSubcontractorBillingFormValues(), [])

  const [documentStatus, setDocumentStatus] =
    React.useState<SubcontractorBillingDocumentStatus>("draft")
  const [formalSerial, setFormalSerial] = React.useState<string | null>(null)
  const [offsetGuard, setOffsetGuard] = React.useState<
    OffsetGuardPayload | null
  >(null)
  const [checkingOffsetGuard, setCheckingOffsetGuard] = React.useState(false)
  const [linkingOffsets, setLinkingOffsets] = React.useState(false)
  const [activeDetailTab, setActiveDetailTab] = React.useState<"billing" | "material">("billing")
  const [loadingMaterialDeductions, setLoadingMaterialDeductions] = React.useState(false)
  const [materialDeductionsError, setMaterialDeductionsError] = React.useState<string | null>(null)
  const [materialDeductions, setMaterialDeductions] =
    React.useState<MaterialDeductionsPayload | null>(null)

  const form = useForm<
    SubcontractorBillingFormInput,
    unknown,
    SubcontractorBillingFormOutput
  >({
    resolver: zodResolver(subcontractorBillingFormSchema),
    defaultValues: defaults,
    mode: "onChange",
  })

  const {
    control,
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = form

  const {
    fields: lineFields,
    append: appendLine,
    remove: removeLine,
  } = useFieldArray({ control, name: "lines" })
  const {
    fields: changeOrderFields,
    append: appendChangeOrder,
    remove: removeChangeOrder,
  } = useFieldArray({ control, name: "changeOrders" })

  const watchedLines = useWatch({ control, name: "lines" })
  const projectId = useWatch({ control, name: "projectId" })
  const subcontractorId = useWatch({ control, name: "subcontractorId" })
  const invoiceNumberW = useWatch({ control, name: "invoiceNumber" })
  const billingMonthW = useWatch({ control, name: "billingMonth" })
  const retentionPercent = useWatch({ control, name: "retentionPercent" })
  const insurancePercent = useWatch({ control, name: "insurancePercent" })
  const indexationAmount = useWatch({ control, name: "indexationAmount" })
  const watchedChangeOrders = useWatch({ control, name: "changeOrders" })

  const pushBillingLineUrl = React.useCallback(
    (lineIndex: number) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set(MD_QUERY.line, String(lineIndex))
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  React.useEffect(() => {
    if (!Number.isFinite(lineFocus) || lineFocus < 0) return
    requestAnimationFrame(() => {
      document
        .getElementById(`sc-bill-line-${lineFocus}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }, [lineFocus, lineFields.length])

  const locked = documentStatus === "final"

  const totalClaimed = React.useMemo(() => {
    let s = 0
    for (const row of watchedLines ?? []) {
      s += parseMoney(row?.claimedAmount)
    }
    return s
  }, [watchedLines])

  const totalApproved = React.useMemo(() => {
    let s = 0
    for (const row of watchedLines ?? []) {
      s += parseMoney(row?.approvedAmount)
    }
    return s
  }, [watchedLines])

  const deductions = React.useMemo(() => {
    const co = (watchedChangeOrders ?? []).map((c) => ({
      approvedAmount: parseMoney(c?.approvedAmount),
    }))
    return computeBillingDeductions({
      baseApprovedAmount: totalApproved,
      retentionPercent: parseMoney(retentionPercent),
      insurancePercent: parseMoney(insurancePercent),
      indexationAmount: parseMoney(indexationAmount),
      changeOrders: co,
    })
  }, [
    totalApproved,
    retentionPercent,
    insurancePercent,
    indexationAmount,
    watchedChangeOrders,
  ])
  const materialDeductionAmount = materialDeductions?.totalDeduction ?? 0
  const finalAmountToPayWithMaterialDeduction = Math.round(
    (deductions.finalAmountToPay - materialDeductionAmount) * 100
  ) / 100

  const projectLabel = React.useMemo(
    () =>
      SUBCONTRACTOR_BILLING_MOCK_PROJECTS.find((p) => p.id === projectId)
        ?.label ?? "",
    [projectId]
  )

  const subcontractorName = React.useMemo(
    () =>
      SUBCONTRACTOR_BILLING_MOCK_SUBCONTRACTORS.find(
        (s) => s.id === subcontractorId
      )?.name ?? "",
    [subcontractorId]
  )

  const printChangeOrderRows = React.useMemo(() => {
    const rows = (watchedChangeOrders ?? []).map((c) => ({
      description: (c?.description ?? "").trim() || "—",
      amount: parseMoney(c?.approvedAmount),
    }))
    const idx = parseMoney(indexationAmount)
    if (idx !== 0) {
      rows.push({ description: "התייקרויות", amount: idx })
    }
    return rows
  }, [watchedChangeOrders, indexationAmount])

  const onPrint = React.useCallback(() => {
    window.print()
  }, [])

  const onSaveDraft = React.useCallback(() => {
    if (locked) return
    console.log("[Subcontractor Billing] שמור טיוטה:", getValues())
    toast.success("טיוטה נשמרה (מקומית)")
  }, [locked, getValues])

  const onApproveFinal: SubmitHandler<SubcontractorBillingFormOutput> =
    React.useCallback(async () => {
      if (locked) return
      if (!projectId || !subcontractorId) {
        toast.error("נדרש לבחור פרויקט וקבלן משנה לפני אישור חשבון")
        return
      }

      setCheckingOffsetGuard(true)
      try {
        const deductionsResponse = await fetch("/api/erp/subcontractor-bills/material-deductions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            subcontractorId,
          }),
        })
        const deductionData = (await parseApiData(
          deductionsResponse,
          materialDeductionsResponseSchema
        )) as MaterialDeductionsPayload
        setMaterialDeductions(deductionData)

        if (deductionData.sourceDocuments.length > 0) {
          const linkResponse = await fetch("/api/erp/subcontractor-bills/offset-guard/bulk-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId,
              subcontractorId,
              subcontractorBillId: null,
            }),
          })
          await parseApiData(linkResponse, bulkLinkResponseSchema)
        }

        const response = await fetch("/api/erp/subcontractor-bills/offset-guard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            subcontractorId,
          }),
        })

        const guardData = (await parseApiData(
          response,
          offsetGuardResponseSchema
        )) as OffsetGuardPayload
        setOffsetGuard(guardData.hasBlockingOffsets ? guardData : null)
        if (guardData.hasBlockingOffsets) {
          toast.error("האישור נחסם: קיימות שורות רכש ללא קיזוז")
          return
        }

        const serial = generateMockFormalSerialNumber()
        setDocumentStatus("final")
        setFormalSerial(serial)
        console.log("[Subcontractor Billing] אשר לתשלום — payload:", getValues())
        toast.success(`המסמך סופי — מספר רשמי: ${serial}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Offset Guard נכשל"
        toast.error(message)
      } finally {
        setCheckingOffsetGuard(false)
      }
    }, [locked, getValues, projectId, subcontractorId])

  const appendChangeOrderRow = React.useCallback(() => {
    if (locked) return
    appendChangeOrder({ description: "", approvedAmount: 0 })
  }, [locked, appendChangeOrder])

  const appendBillingLine = React.useCallback(() => {
    if (locked) return
    appendLine({
      taskDescription: "",
      claimedAmount: 0,
      approvedAmount: 0,
      notes: "",
    })
  }, [locked, appendLine])

  const removeBillingLineAt = React.useCallback(
    (index: number) => {
      if (locked) return
      if (lineFields.length <= 1) return
      removeLine(index)
    },
    [locked, lineFields.length, removeLine]
  )

  const removeChangeOrderAt = React.useCallback(
    (index: number) => {
      if (locked) return
      removeChangeOrder(index)
    },
    [locked, removeChangeOrder]
  )

  const defectWarning = React.useMemo(
    () => (subcontractorId ? hasOpenDefects(subcontractorId) : false),
    [subcontractorId]
  )

  React.useEffect(() => {
    let isCurrentRequest = true
    const controller = new AbortController()

    if (!projectId || !subcontractorId || locked) {
      setOffsetGuard(null)
      setCheckingOffsetGuard(false)
      return () => {
        isCurrentRequest = false
        controller.abort()
      }
    }

    const loadOffsetGuard = async () => {
      setCheckingOffsetGuard(true)
      try {
        const response = await fetch("/api/erp/subcontractor-bills/offset-guard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            subcontractorId,
          }),
          signal: controller.signal,
        })

        const data = (await parseApiData(
          response,
          offsetGuardResponseSchema,
          controller.signal
        )) as OffsetGuardPayload
        if (isCurrentRequest) {
          setOffsetGuard(data.hasBlockingOffsets ? data : null)
        }
      } catch (error) {
        if (controller.signal.aborted) return
        if (isCurrentRequest) {
          setOffsetGuard(null)
          console.error("[Offset Guard] load failed", error)
        }
      } finally {
        if (isCurrentRequest) setCheckingOffsetGuard(false)
      }
    }

    void loadOffsetGuard()
    return () => {
      isCurrentRequest = false
      controller.abort()
    }
  }, [projectId, subcontractorId, locked])

  React.useEffect(() => {
    const controller = new AbortController()
    if (!projectId || !subcontractorId || locked) {
      setLoadingMaterialDeductions(false)
      setMaterialDeductions(null)
      setMaterialDeductionsError(null)
      return () => controller.abort()
    }

    const loadMaterialDeductions = async () => {
      setLoadingMaterialDeductions(true)
      setMaterialDeductionsError(null)
      setMaterialDeductions(null)
      try {
        const response = await fetch("/api/erp/subcontractor-bills/material-deductions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            subcontractorId,
          }),
          signal: controller.signal,
        })
        const data = (await parseApiData(
          response,
          materialDeductionsResponseSchema,
          controller.signal
        )) as MaterialDeductionsPayload
        if (controller.signal.aborted) return
        setMaterialDeductions(data)
      } catch (error) {
        if (controller.signal.aborted) return
        setMaterialDeductions(null)
        setMaterialDeductionsError(
          error instanceof Error ? error.message : "טעינת קיזוזי חומרים נכשלה"
        )
      } finally {
        if (!controller.signal.aborted) setLoadingMaterialDeductions(false)
      }
    }

    void loadMaterialDeductions()
    return () => controller.abort()
  }, [locked, projectId, subcontractorId])

  const bulkLinkOffsets = React.useCallback(async () => {
    if (!projectId || !subcontractorId) return
    setLinkingOffsets(true)
    try {
      const response = await fetch(
        "/api/erp/subcontractor-bills/offset-guard/bulk-link",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            subcontractorId,
            subcontractorBillId: null,
          }),
        }
      )
      const result = (await parseApiData(response, bulkLinkResponseSchema)) as BulkLinkPayload
      toast.success(`בוצע קישור קבוצתי ל-${result.linkedCount} שורות רכש`)
      setOffsetGuard(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk Link נכשל")
    } finally {
      setLinkingOffsets(false)
    }
  }, [projectId, subcontractorId])

  return (
    <>
      <form
        className="print:hidden flex min-h-0 min-w-0 flex-1 flex-col bg-card [color-scheme:light]"
        onSubmit={handleSubmit(onApproveFinal)}
      >
        <DenseMasterDetailTemplate
          dir="rtl"
          className="min-h-0 flex-1 text-foreground"
          eyebrow="Marker Ofek · כספים"
          title="אישור חשבון קבלן משנה"
          description="אישור תשלום חלקי — Claimed / Approved, ניכויים והוראות שינוי (דמה)."
          leading={<Receipt className="size-5 text-slate-700" aria-hidden />}
          backLink={{
            href: "/marker-ofek/finance",
            label: "חזרה לכספים וחשבונות",
          }}
          headerActions={
            <>
              <span
                className={cn(
                  "shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold",
                  locked
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-background text-slate-700"
                )}
              >
                {statusLabelHe(documentStatus)}
                {locked && formalSerial ? ` · ${formalSerial}` : null}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-slate-200 bg-card text-sm text-slate-800"
                onClick={onPrint}
              >
                <Printer className="size-3.5 opacity-90" aria-hidden />
                הדפס / ייצא ל-PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-slate-200 bg-card text-sm text-slate-800"
                disabled={locked}
                onClick={onSaveDraft}
              >
                שמור טיוטה
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={locked || checkingOffsetGuard || linkingOffsets}
                className="h-8 bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {checkingOffsetGuard ? "בודק Offset Guard..." : "אשר חשבון לתשלום"}
              </Button>
            </>
          }
          master={
            <div className="rounded-lg border border-slate-200 bg-card p-3 shadow-sm">
              {defectWarning ? (
                <div
                  className="mb-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                  role="status"
                >
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-amber-600"
                    aria-hidden
                  />
                  <p>
                    <span className="font-semibold">ליקויים פתוחים ב־QA</span>{" "}
                    עבור קבלן זה — דמה Phase 3.2.
                  </p>
                </div>
              ) : null}
              {offsetGuard?.hasBlockingOffsets ? (
                <div
                  className="mb-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-3 text-rose-900 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                  role="alert"
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                        <AlertTriangle className="size-4" />
                      </span>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">
                          Offset Guard · BPM Lock
                        </span>
                        <span className="text-sm font-semibold text-rose-950">
                          האישור נחסם: נמצאו שורות רכש ללא קיזוז
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 bg-rose-600 text-white hover:bg-rose-700"
                      disabled={linkingOffsets || checkingOffsetGuard || locked}
                      onClick={() => void bulkLinkOffsets()}
                    >
                      {linkingOffsets ? "מקשר..." : "Link All Pending Offsets"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-6 gap-2 text-xs">
                    <div className="col-span-3 rounded-xl border border-rose-200 bg-card p-2">
                      <p className="text-[10px] uppercase tracking-wider text-rose-700">חשיפה כוללת</p>
                      <p className="font-mono text-sm font-semibold text-rose-950">
                        {ils.format(offsetGuard.exposureAmount)}
                      </p>
                    </div>
                    <div className="col-span-3 rounded-xl border border-rose-200 bg-card p-2">
                      <p className="text-[10px] uppercase tracking-wider text-rose-700">שורות חשופות</p>
                      <p className="font-mono text-sm font-semibold text-rose-950">
                        {offsetGuard.unoffsetLineIds.length}
                      </p>
                    </div>
                    <div className="col-span-6 rounded-xl border border-rose-200 bg-card p-2">
                      <p className="text-[10px] uppercase tracking-wider text-rose-700">
                        PO לא מקוזזים
                      </p>
                      <p className="truncate font-mono text-[11px] text-rose-900">
                        {offsetGuard.unoffsetPoNumbers.join(", ") || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-4">
                <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                  <span className={labelClass}>פרויקט</span>
                  <Controller
                    control={control}
                    name="projectId"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={locked}
                      >
                        <SelectTrigger
                          className={cn(
                            fieldClass,
                            "w-full",
                            errors.projectId && "border-red-300 ring-1 ring-red-200"
                          )}
                        >
                          <SelectValue placeholder="בחרו פרויקט" />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                          {SUBCONTRACTOR_BILLING_MOCK_PROJECTS.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                  <span className={labelClass}>קבלן משנה</span>
                  <Controller
                    control={control}
                    name="subcontractorId"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={locked}
                      >
                        <SelectTrigger
                          className={cn(
                            fieldClass,
                            "w-full",
                            errors.subcontractorId &&
                              "border-red-300 ring-1 ring-red-200"
                          )}
                        >
                          <SelectValue placeholder="בחרו קבלן" />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                          {SUBCONTRACTOR_BILLING_MOCK_SUBCONTRACTORS.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="flex min-w-[140px] flex-col gap-1">
                  <Label htmlFor="sc-invoice" className={labelClass}>
                    מספר חשבון
                  </Label>
                  <Input
                    id="sc-invoice"
                    disabled={locked}
                    className={cn(
                      fieldClass,
                      errors.invoiceNumber && "border-red-300 ring-1 ring-red-200"
                    )}
                    {...register("invoiceNumber")}
                  />
                </div>
                <div className="flex min-w-[150px] flex-col gap-1">
                  <Label htmlFor="sc-month" className={labelClass}>
                    חודש חיוב
                  </Label>
                  <Input
                    id="sc-month"
                    type="month"
                    disabled={locked}
                    className={cn(
                      fieldClass,
                      errors.billingMonth && "border-red-300 ring-1 ring-red-200"
                    )}
                    {...register("billingMonth")}
                  />
                </div>
              </div>

              <div className="mt-3 flex w-full flex-wrap gap-4 border-t border-slate-100 pt-3">
                <div className="flex min-w-[100px] flex-col gap-1">
                  <Label htmlFor="sc-ret" className={labelClass}>
                    עיכבון (%)
                  </Label>
                  <Input
                    id="sc-ret"
                    inputMode="decimal"
                    disabled={locked}
                    className={cn(fieldClass, "w-24")}
                    {...register("retentionPercent", {
                      setValueAs: (v) => parseMoney(v),
                    })}
                  />
                </div>
                <div className="flex min-w-[100px] flex-col gap-1">
                  <Label htmlFor="sc-ins" className={labelClass}>
                    ביטוח (%)
                  </Label>
                  <Input
                    id="sc-ins"
                    inputMode="decimal"
                    step="0.01"
                    disabled={locked}
                    className={cn(fieldClass, "w-24")}
                    {...register("insurancePercent", {
                      setValueAs: (v) => parseMoney(v),
                    })}
                  />
                </div>
                <div className="flex min-w-[140px] flex-1 flex-col gap-1">
                  <Label htmlFor="sc-idx" className={labelClass}>
                    התייקרויות (₪)
                  </Label>
                  <Input
                    id="sc-idx"
                    inputMode="decimal"
                    disabled={locked}
                    className={cn(
                      fieldClass,
                      "max-w-[12rem] font-currency-mono tabular-nums"
                    )}
                    {...register("indexationAmount", {
                      setValueAs: (v) => parseMoney(v),
                    })}
                  />
                </div>
              </div>
            </div>
          }
          detail={
            <DenseDetailPanel className="min-h-0 flex-1 overflow-auto border-slate-200 bg-card p-1.5 shadow-sm">
              <div className="relative min-h-0 flex-1 overflow-auto px-0 pb-2 pt-1 md:px-2">
                <Tabs
                  value={activeDetailTab}
                  onValueChange={(value) => setActiveDetailTab(value as "billing" | "material")}
                  className="space-y-2"
                >
                  <TabsList className="h-8 rounded-lg bg-slate-100 p-1">
                    <TabsTrigger value="billing" className="text-xs">שורות חיוב</TabsTrigger>
                    <TabsTrigger value="material" className="text-xs">Material Deductions</TabsTrigger>
                  </TabsList>
                  <TabsContent value="billing" className="space-y-2">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-800">שורות חיוב</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 border-slate-200 bg-card text-sm"
                    disabled={locked}
                    onClick={appendBillingLine}
                  >
                    <Plus className="size-4" aria-hidden />
                    הוסף שורה
                  </Button>
                </div>

                <div className="rounded-md border border-slate-200 bg-card md:rounded-lg">
                  <Table dir="rtl" className="relative">
                    <TableHeader>
                      <TableRow className="border-slate-200 hover:bg-transparent">
                        <TableHead className="min-w-[180px] py-2 text-start text-xs font-semibold text-slate-700">
                          תיאור משימה
                        </TableHead>
                        <TableHead className="w-[110px] py-2 text-start text-xs font-semibold text-slate-700">
                          סכום נדרש
                        </TableHead>
                        <TableHead className="w-[110px] py-2 text-start text-xs font-semibold text-slate-700">
                          סכום מאושר
                        </TableHead>
                        <TableHead className="min-w-[140px] py-2 text-start text-xs font-semibold text-slate-700">
                          הערות
                        </TableHead>
                        <TableHead className="w-12 py-2" aria-hidden />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineFields.map((lf, index) => (
                        <TableRow
                          key={lf.id}
                          id={`sc-bill-line-${index}`}
                          role="button"
                          tabIndex={0}
                          className={cn(
                            "border-slate-100 hover:bg-background/80",
                            lineFocus === index &&
                              "bg-emerald-50/80 ring-2 ring-inset ring-emerald-500/40"
                          )}
                          onClick={() => pushBillingLineUrl(index)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              pushBillingLineUrl(index)
                            }
                          }}
                        >
                          <TableCell
                            className="px-2 py-1.5 align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Input
                              disabled={locked}
                              className={cn(
                                fieldClass,
                                errors.lines?.[index]?.taskDescription &&
                                  "border-red-300 ring-1 ring-red-200"
                              )}
                              {...register(`lines.${index}.taskDescription`)}
                            />
                          </TableCell>
                          <TableCell
                            className="px-2 py-1.5 align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Input
                              inputMode="decimal"
                              disabled={locked}
                              className={cn(
                                fieldClass,
                                "font-currency-mono tabular-nums",
                                errors.lines?.[index]?.claimedAmount &&
                                  "border-red-300 ring-1 ring-red-200"
                              )}
                              {...register(`lines.${index}.claimedAmount`, {
                                setValueAs: (v) => parseMoney(v),
                              })}
                            />
                          </TableCell>
                          <TableCell
                            className="px-2 py-1.5 align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Input
                              inputMode="decimal"
                              disabled={locked}
                              className={cn(
                                fieldClass,
                                "font-currency-mono tabular-nums",
                                errors.lines?.[index]?.approvedAmount &&
                                  "border-red-300 ring-1 ring-red-200"
                              )}
                              {...register(`lines.${index}.approvedAmount`, {
                                setValueAs: (v) => parseMoney(v),
                              })}
                            />
                          </TableCell>
                          <TableCell
                            className="px-2 py-1.5 align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Input
                              disabled={locked}
                              className={fieldClass}
                              {...register(`lines.${index}.notes`)}
                            />
                          </TableCell>
                          <TableCell
                            className="px-1 py-1 align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 border-slate-200 bg-card"
                              disabled={locked || lineFields.length <= 1}
                              onClick={() => removeBillingLineAt(index)}
                              aria-label="מחק שורה"
                            >
                              <Trash2
                                className="size-3.5 opacity-80"
                                aria-hidden
                              />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className="sticky bottom-0 z-10 border-t-2 border-emerald-200 bg-emerald-50/95">
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={2}
                          className="py-2 text-start text-xs font-bold text-slate-800"
                        >
                          סה״כ נדרש / מאושר
                        </TableCell>
                        <TableCell className="py-2 text-start" colSpan={3}>
                          <div className="flex flex-wrap gap-4 text-sm">
                            <span className="font-currency-mono tabular-nums">
                              נדרש: {ils.format(totalClaimed)}
                            </span>
                            <span className="font-currency-mono font-bold tabular-nums text-emerald-900">
                              מאושר: {ils.format(totalApproved)}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                <div className="mt-4 rounded-lg border border-slate-200 bg-background/90 px-3 py-3 shadow-inner">
                  <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        ניכויים והוראות שינוי
                      </p>
                      <p className="text-[11px] text-slate-500">
                        חישוב אוטומטי מסכום מאושר בשורות.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 border-slate-200 bg-card text-sm"
                      disabled={locked}
                      onClick={appendChangeOrderRow}
                    >
                      <Plus className="size-4" aria-hidden />
                      הוסף הוראת שינוי
                    </Button>
                  </div>

                  <div className="overflow-x-auto rounded-md border border-slate-200 bg-card">
                    <Table dir="rtl">
                      <TableHeader>
                        <TableRow className="border-slate-200 hover:bg-transparent">
                          <TableHead className="w-[55%] py-1.5 text-start text-[11px] font-semibold text-slate-700">
                            תיאור
                          </TableHead>
                          <TableHead className="w-[30%] py-1.5 text-start text-[11px] font-semibold text-slate-700">
                            סכום מאושר
                          </TableHead>
                          <TableHead className="w-[15%] py-1.5" aria-hidden />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {changeOrderFields.map((coField, coIndex) => (
                          <TableRow
                            key={coField.id}
                            className="border-slate-100 hover:bg-background/80"
                          >
                            <TableCell className="px-2 py-1 align-middle">
                              <Input
                                disabled={locked}
                                className={cn(fieldClass, "h-7 w-full text-sm")}
                                {...register(
                                  `changeOrders.${coIndex}.description`
                                )}
                              />
                            </TableCell>
                            <TableCell className="px-2 py-1 align-middle">
                              <Input
                                inputMode="decimal"
                                disabled={locked}
                                className={cn(
                                  fieldClass,
                                  "h-7 w-full min-w-[6.5rem] font-currency-mono text-sm tabular-nums"
                                )}
                                {...register(
                                  `changeOrders.${coIndex}.approvedAmount`,
                                  { setValueAs: (v) => parseMoney(v) }
                                )}
                              />
                            </TableCell>
                            <TableCell className="px-1 py-1 align-middle">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 border-slate-200 bg-card"
                                disabled={locked}
                                onClick={() => removeChangeOrderAt(coIndex)}
                                aria-label="מחק הוראת שינוי"
                              >
                                <Trash2
                                  className="size-3.5 opacity-80"
                                  aria-hidden
                                />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-3 space-y-1.5 border-t border-slate-200/80 pt-3 text-sm">
                    <div className="flex justify-between text-slate-700">
                      <span className="text-xs font-medium">ניכוי עיכבון</span>
                      <span className="font-currency-mono font-bold text-red-600">
                        −{ils.format(deductions.retentionDeduction)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-700">
                      <span className="text-xs font-medium">ניכוי ביטוח</span>
                      <span className="font-currency-mono font-bold text-red-600">
                        −{ils.format(deductions.insuranceDeduction)}
                      </span>
                    </div>
                    <div className="rounded-md border-2 border-emerald-600/40 bg-emerald-50/80 px-3 py-2 text-center">
                      <p className="text-[11px] font-semibold text-emerald-900">
                        סכום לתשלום (נטו)
                      </p>
                      <p className="mt-1 font-currency-mono text-2xl font-black tabular-nums text-emerald-950">
                        {ils.format(finalAmountToPayWithMaterialDeduction)}
                      </p>
                    </div>
                  </div>
                </div>
                  </TabsContent>
                  <TabsContent value="material" className="space-y-2">
                    {materialDeductionsError ? (
                      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {materialDeductionsError}
                      </p>
                    ) : null}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg border border-slate-200 bg-background p-2">
                        <p className="text-[10px] text-slate-500">Base Material Deduction</p>
                        <p className="font-mono font-semibold">{ils.format(materialDeductions?.baseAmount ?? 0)}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-background p-2">
                        <p className="text-[10px] text-slate-500">Procurement Commission %</p>
                        <p className="font-mono font-semibold">
                          {(materialDeductions?.procurementCommissionPct ?? 0).toFixed(2)}%
                        </p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                        <p className="text-[10px] text-emerald-700">Total Deduction</p>
                        <p className="font-mono text-sm font-semibold text-emerald-900">
                          {ils.format(materialDeductions?.totalDeduction ?? 0)}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-card">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-start text-xs">PO #</TableHead>
                            <TableHead className="text-start text-xs">Date</TableHead>
                            <TableHead className="text-start text-xs">Description</TableHead>
                            <TableHead className="text-start text-xs">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loadingMaterialDeductions ? (
                            <TableRow>
                              <TableCell colSpan={4} className="h-14 text-center text-xs text-slate-500">
                                טוען קיזוזי חומרים...
                              </TableCell>
                            </TableRow>
                          ) : (materialDeductions?.sourceDocuments.length ?? 0) === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="h-14 text-center text-xs text-slate-500">
                                אין שורות רכש פתוחות לקיזוז.
                              </TableCell>
                            </TableRow>
                          ) : (
                            materialDeductions?.sourceDocuments.map((doc) => (
                              <TableRow key={doc.lineId}>
                                <TableCell className="font-mono text-xs">{doc.poNumber || "—"}</TableCell>
                                <TableCell className="text-xs">
                                  {doc.poDate ? formatDocumentDateHe(new Date(doc.poDate)) : "—"}
                                </TableCell>
                                <TableCell className="text-xs">{doc.description || "—"}</TableCell>
                                <TableCell className="font-mono text-xs">{ils.format(doc.amount)}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </DenseDetailPanel>
          }
        />
      </form>

      <PrintableSubcontractorBillingView
        companyName='לייטמן מערכות חשמל בע"מ'
        companyTaxId="514638055"
        formalSerial={formalSerial}
        documentDateLabel={formatDocumentDateHe(new Date())}
        status={documentStatus}
        projectName={projectLabel}
        subcontractorName={subcontractorName}
        invoiceNumber={(invoiceNumberW ?? "").trim() || "—"}
        billingMonthLabel={
          billingMonthW ? formatBillingMonthHe(billingMonthW) : ""
        }
        lines={(watchedLines ?? []).map((row) => ({
          taskDescription: row?.taskDescription ?? "",
          claimedAmount: parseMoney(row?.claimedAmount),
          approvedAmount: parseMoney(row?.approvedAmount),
          notes: row?.notes ?? "",
        }))}
        totalClaimed={totalClaimed}
        totalApproved={totalApproved}
        changeOrderRows={printChangeOrderRows}
        deductionRows={[
          {
            description: `ניכוי עיכבון (${parseMoney(retentionPercent)}%)`,
            amount: -deductions.retentionDeduction,
          },
          {
            description: `ניכוי ביטוח (${parseMoney(insurancePercent)}%)`,
            amount: -deductions.insuranceDeduction,
          },
          {
            description: `קיזוז חומרי גלם + עמלת רכש (${(materialDeductions?.procurementCommissionPct ?? 0).toFixed(2)}%)`,
            amount: -materialDeductionAmount,
          },
        ]}
      />
    </>
  )
}
