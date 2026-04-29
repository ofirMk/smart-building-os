"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus, Printer, Receipt, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type SubmitHandler,
} from "react-hook-form"

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
  DenseDetailPanel,
  DenseMasterDetailTemplate,
} from "@/components/layout/DenseMasterDetailTemplate"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  formatBillingMonthHe,
  formatDocumentDateHe,
} from "@/components/marker-ofek/finance/printable-subcontractor-billing-view"
import {
  PrintableClientBillingView,
  type PrintableClientBillingBoqLine,
} from "@/components/marker-ofek/finance/printable-client-billing-view"
import {
  CLIENT_BILLING_MOCK_PROJECTS,
  computeBillingDeductions,
  defaultClientBillingFormValues,
  generateMockClientFormalSerialNumber,
  getLineBillAmount,
  getLineTotalCumulativeQty,
  clientBillingStatusLabelHe,
  clientBillingFormSchema,
  type ClientBillingFormInput,
  type ClientBillingFormOutput,
} from "@/lib/marker-ofek/client-billing-schema"
import { MD_QUERY } from "@/lib/marker-ofek/master-detail-nav"
import { cn } from "@/lib/utils"

const fieldClass =
  "h-8 border-slate-200 bg-card text-sm text-foreground shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15"
const labelClass = "text-xs font-semibold text-slate-600"
const readOnlyQtyClass =
  "h-8 w-full min-w-[4.5rem] border-slate-200 bg-background text-sm font-currency-mono text-slate-800 tabular-nums"
const readOnlyDescClass =
  "h-8 border-slate-200 bg-background/80 text-sm text-foreground"
const calcMoneyClass =
  "inline-flex min-h-8 min-w-[6.5rem] items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 font-currency-mono text-sm font-semibold tabular-nums text-emerald-900"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function notifySuccess(title: string, description?: string) {
  toast.success(title, { description })
}

function notifyError(title: string, description?: string) {
  toast.error(title, { description })
}

function parseQty(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (v === "" || v == null) return 0
  const n = Number(String(v).replace(",", ".").trim())
  return Number.isFinite(n) ? n : 0
}

function parseMoney(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (v === "" || v == null) return 0
  const n = Number(String(v).replace(",", ".").trim())
  return Number.isFinite(n) ? n : 0
}

export function ClientBillingWorkspace() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const lineFocus = Number.parseInt(
    searchParams.get(MD_QUERY.line) ?? "",
    10
  )

  const defaults = React.useMemo(() => defaultClientBillingFormValues(), [])

  const form = useForm<ClientBillingFormInput, unknown, ClientBillingFormOutput>(
    {
      resolver: zodResolver(clientBillingFormSchema),
      defaultValues: defaults,
      mode: "onChange",
    }
  )

  const {
    control,
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = form

  const { fields } = useFieldArray({ control, name: "lines" })
  const {
    fields: changeOrderFields,
    append: appendChangeOrder,
    remove: removeChangeOrder,
  } = useFieldArray({ control, name: "changeOrders" })

  const watchedLines = useWatch({ control, name: "lines" })
  const projectId = useWatch({ control, name: "projectId" })
  const billingMonthW = useWatch({ control, name: "billingMonth" })
  const applicationNumberW = useWatch({ control, name: "applicationNumber" })
  const retentionPercent = useWatch({ control, name: "retentionPercent" })
  const insurancePercent = useWatch({ control, name: "insurancePercent" })
  const indexationAmount = useWatch({ control, name: "indexationAmount" })
  const watchedChangeOrders = useWatch({ control, name: "changeOrders" })
  const documentStatus = useWatch({ control, name: "documentStatus" })
  const formalSerialW = useWatch({ control, name: "formalSerial" })

  const locked = documentStatus === "final"

  const pushClientLineUrl = React.useCallback(
    (lineIndex: number) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set(MD_QUERY.line, String(lineIndex))
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  React.useEffect(() => {
    if (
      !Number.isFinite(lineFocus) ||
      lineFocus < 0 ||
      lineFocus >= fields.length
    ) {
      return
    }
    requestAnimationFrame(() => {
      document
        .getElementById(`cb-bill-line-${lineFocus}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }, [lineFocus, fields.length])

  const periodTotal = React.useMemo(() => {
    const rows = watchedLines ?? []
    let s = 0
    for (const row of rows) {
      const cur = parseQty(row?.currentPeriodQty)
      const price = parseQty(row?.unitPrice)
      s += getLineBillAmount({ currentPeriodQty: cur, unitPrice: price })
    }
    return s
  }, [watchedLines])

  const deductions = React.useMemo(() => {
    const co = (watchedChangeOrders ?? []).map((c) => ({
      approvedAmount: parseMoney(c?.approvedAmount),
    }))
    return computeBillingDeductions({
      baseApprovedAmount: periodTotal,
      retentionPercent: parseMoney(retentionPercent),
      insurancePercent: parseMoney(insurancePercent),
      indexationAmount: parseMoney(indexationAmount),
      changeOrders: co,
    })
  }, [
    periodTotal,
    retentionPercent,
    insurancePercent,
    indexationAmount,
    watchedChangeOrders,
  ])

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

  const projectLabel = React.useMemo(
    () =>
      CLIENT_BILLING_MOCK_PROJECTS.find((p) => p.id === projectId)?.label ?? "",
    [projectId]
  )

  const onSaveDraft = React.useCallback(() => {
    if (locked) return
    const lineCount = getValues().lines.length
    notifySuccess("שמירת טיוטה הושלמה", `נשמרו ${lineCount} שורות חיוב.`)
  }, [locked, getValues])

  const onPrint = React.useCallback(() => {
    window.print()
  }, [])

  const onIssueFinal: SubmitHandler<ClientBillingFormOutput> = React.useCallback(
    () => {
      if (locked) return
      if (fields.length === 0) {
        notifyError("לא ניתן להפיק חשבון סופי", "נדרשת לפחות שורת חיוב אחת.")
        return
      }
      const serial = generateMockClientFormalSerialNumber()
      setValue("documentStatus", "final", { shouldValidate: true })
      setValue("formalSerial", serial, { shouldValidate: true })
      notifySuccess("הפקת חשבון סופי הושלמה", `הוקצה מספר רשמי ${serial}.`)
    },
    [locked, setValue, getValues, fields.length]
  )

  const appendChangeOrderRow = React.useCallback(() => {
    if (locked) return
    appendChangeOrder({ description: "", approvedAmount: 0 })
  }, [locked, appendChangeOrder])

  const boqPrintLines = React.useMemo((): PrintableClientBillingBoqLine[] => {
    const rows = watchedLines ?? []
    return rows.map((row) => {
      const prev = parseQty(row?.previousCumulativeQty)
      const cur = parseQty(row?.currentPeriodQty)
      const price = parseQty(row?.unitPrice)
      const cum = getLineTotalCumulativeQty({
        previousCumulativeQty: prev,
        currentPeriodQty: cur,
      })
      const lineAmt = getLineBillAmount({
        currentPeriodQty: cur,
        unitPrice: price,
      })
      return {
        itemDescription: row?.itemDescription ?? "",
        currentPeriodQty: cur,
        unitPrice: price,
        lineTotalAmount: lineAmt,
        totalCumulativeQty: cum,
      }
    })
  }, [watchedLines])

  return (
    <>
      <form
        className="print:hidden flex min-h-0 min-w-0 flex-1 flex-col bg-card [color-scheme:light]"
        onSubmit={handleSubmit(onIssueFinal)}
      >
        <DenseMasterDetailTemplate
          dir="rtl"
          className="min-h-0 flex-1 text-foreground"
          eyebrow="Marker Ofek · כספים"
          title="הגשת חשבון יזם (מצטבר)"
          description="בקשת תשלום מצטברת מול יזם — BOQ, ניכויים והוראות שינוי (דמה)."
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
                {clientBillingStatusLabelHe(documentStatus ?? "draft")}
                {locked && formalSerialW ? ` · ${formalSerialW}` : null}
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
                disabled={locked || fields.length === 0}
                className="h-8 bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                הפק חשבון סופי
              </Button>
            </>
          }
          master={
            <div className="rounded-lg border border-slate-200 bg-card p-3 shadow-sm">
            <div className="flex flex-wrap gap-4">
              <div className="flex min-w-[220px] flex-1 flex-col gap-1">
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
                        disabled={locked}
                      >
                        <SelectValue placeholder="בחרו פרויקט" />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        {CLIENT_BILLING_MOCK_PROJECTS.map((p) => (
                          <SelectItem
                            key={p.id}
                            value={p.id}
                            className="text-start"
                          >
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.projectId ? (
                  <p className="text-[11px] text-red-600">
                    {errors.projectId.message}
                  </p>
                ) : null}
              </div>

              <div className="flex min-w-[150px] flex-col gap-1">
                <Label htmlFor="cb-billing-month" className={labelClass}>
                  חודש חיוב
                </Label>
                <Input
                  id="cb-billing-month"
                  type="month"
                  disabled={locked}
                  className={cn(
                    fieldClass,
                    errors.billingMonth && "border-red-300 ring-1 ring-red-200"
                  )}
                  {...register("billingMonth")}
                />
                {errors.billingMonth ? (
                  <p className="text-[11px] text-red-600">
                    {errors.billingMonth.message}
                  </p>
                ) : null}
              </div>

              <div className="flex min-w-[120px] flex-col gap-1">
                <Label htmlFor="cb-app-no" className={labelClass}>
                  מספר חשבון (בקשה)
                </Label>
                <Input
                  id="cb-app-no"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  disabled={locked}
                  className={cn(
                    fieldClass,
                    "w-28 font-currency-mono tabular-nums",
                    errors.applicationNumber &&
                      "border-red-300 ring-1 ring-red-200"
                  )}
                  {...register("applicationNumber", {
                    valueAsNumber: true,
                  })}
                />
                {errors.applicationNumber ? (
                  <p className="text-[11px] text-red-600">
                    {errors.applicationNumber.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex w-full flex-wrap gap-4 border-t border-slate-100 pt-3">
              <div className="flex min-w-[100px] flex-col gap-1">
                <Label htmlFor="cb-retention-pct" className={labelClass}>
                  עיכבון (%)
                </Label>
                <Input
                  id="cb-retention-pct"
                  inputMode="decimal"
                  disabled={locked}
                  className={cn(
                    fieldClass,
                    "w-24",
                    errors.retentionPercent && "border-red-300 ring-1 ring-red-200"
                  )}
                  {...register("retentionPercent", {
                    setValueAs: (v) => parseMoney(v),
                  })}
                />
              </div>
              <div className="flex min-w-[100px] flex-col gap-1">
                <Label htmlFor="cb-insurance-pct" className={labelClass}>
                  ביטוח (%)
                </Label>
                <Input
                  id="cb-insurance-pct"
                  inputMode="decimal"
                  step="0.01"
                  disabled={locked}
                  className={cn(
                    fieldClass,
                    "w-24",
                    errors.insurancePercent &&
                      "border-red-300 ring-1 ring-red-200"
                  )}
                  {...register("insurancePercent", {
                    setValueAs: (v) => parseMoney(v),
                  })}
                />
              </div>
              <div className="flex min-w-[140px] flex-1 flex-col gap-1">
                <Label htmlFor="cb-indexation" className={labelClass}>
                  התייקרויות (₪)
                </Label>
                <Input
                  id="cb-indexation"
                  inputMode="decimal"
                  disabled={locked}
                  className={cn(
                    fieldClass,
                    "max-w-[12rem] font-currency-mono tabular-nums",
                    errors.indexationAmount &&
                      "border-red-300 ring-1 ring-red-200"
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
        {/* Grid */}
        <div className="relative min-h-0 flex-1 overflow-auto px-0 pb-2 pt-1 md:px-2">
          <div className="rounded-md border border-slate-200 bg-card md:rounded-lg">
            <Table dir="rtl" className="relative">
              <TableHeader>
                <TableRow className="border-slate-200 hover:bg-transparent">
                  <TableHead className="min-w-[200px] py-2 text-start text-xs font-semibold text-slate-700">
                    סעיף / תיאור
                  </TableHead>
                  <TableHead className="w-[90px] py-2 text-start text-xs font-semibold text-slate-700">
                    כמות חוזית
                  </TableHead>
                  <TableHead className="w-[100px] py-2 text-start text-xs font-semibold text-slate-700">
                    מחיר יחידה
                  </TableHead>
                  <TableHead className="w-[110px] py-2 text-start text-xs font-semibold text-slate-700">
                    כמות מצטברת קודמת
                  </TableHead>
                  <TableHead className="w-[120px] py-2 text-start text-xs font-semibold text-slate-700">
                    כמות לחיוב החודש
                  </TableHead>
                  <TableHead className="min-w-[120px] py-2 text-start text-xs font-semibold text-emerald-900">
                    סה״כ מצטבר (חישוב)
                  </TableHead>
                  <TableHead className="min-w-[130px] py-2 text-start text-xs font-semibold text-emerald-900">
                    סה״כ לתשלום סעיף
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.length === 0 ? (
                  <TableRow className="border-slate-100">
                    <TableCell
                      colSpan={7}
                      className="px-3 py-6 text-center text-xs text-slate-500"
                    >
                      אין שורות BOQ לחיוב. יש לטעון או להוסיף נתוני חיוב לפני הפקה.
                    </TableCell>
                  </TableRow>
                ) : null}
                {fields.map((field, index) => {
                  const row = watchedLines?.[index]
                  const prev = parseQty(row?.previousCumulativeQty)
                  const cur = parseQty(row?.currentPeriodQty)
                  const price = parseQty(row?.unitPrice)
                  const cum = getLineTotalCumulativeQty({
                    previousCumulativeQty: prev,
                    currentPeriodQty: cur,
                  })
                  const lineAmt = getLineBillAmount({
                    currentPeriodQty: cur,
                    unitPrice: price,
                  })

                  return (
                    <TableRow
                      key={field.id}
                      id={`cb-bill-line-${index}`}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "border-slate-100 hover:bg-background/80",
                        lineFocus === index &&
                          "bg-sky-50/90 ring-2 ring-inset ring-sky-500/35"
                      )}
                      onClick={() => pushClientLineUrl(index)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          pushClientLineUrl(index)
                        }
                      }}
                    >
                      <TableCell
                        className="px-2 py-1.5 align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Input
                          readOnly
                          tabIndex={-1}
                          disabled={locked}
                          className={readOnlyDescClass}
                          {...register(`lines.${index}.itemDescription`)}
                        />
                      </TableCell>
                      <TableCell
                        className="px-2 py-1.5 align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Input
                          readOnly
                          tabIndex={-1}
                          disabled={locked}
                          className={readOnlyQtyClass}
                          {...register(`lines.${index}.contractQty`, {
                            valueAsNumber: true,
                          })}
                        />
                      </TableCell>
                      <TableCell
                        className="px-2 py-1.5 align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Input
                          readOnly
                          tabIndex={-1}
                          disabled={locked}
                          className={readOnlyQtyClass}
                          {...register(`lines.${index}.unitPrice`, {
                            valueAsNumber: true,
                          })}
                        />
                      </TableCell>
                      <TableCell
                        className="px-2 py-1.5 align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Input
                          readOnly
                          tabIndex={-1}
                          disabled={locked}
                          className={readOnlyQtyClass}
                          {...register(`lines.${index}.previousCumulativeQty`, {
                            valueAsNumber: true,
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
                            "h-8 w-24 font-currency-mono tabular-nums",
                            errors.lines?.[index]?.currentPeriodQty &&
                              "border-red-300 ring-1 ring-red-200"
                          )}
                          aria-label={`כמות לחיוב החודש — שורה ${index + 1}`}
                          {...register(`lines.${index}.currentPeriodQty`, {
                            setValueAs: (v) => parseQty(v),
                          })}
                        />
                      </TableCell>
                      <TableCell className="px-2 py-1.5 align-middle">
                        <span
                          className={cn(
                            readOnlyQtyClass,
                            "inline-flex w-full items-center justify-start border bg-card"
                          )}
                        >
                          {cum.toLocaleString("he-IL", {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 align-middle">
                        <span className={calcMoneyClass}>
                          {ils.format(lineAmt)}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter
                className={cn(
                  "sticky bottom-0 z-10 border-t-2 border-emerald-200 bg-emerald-50/95 shadow-[0_-4px_12px_-2px_rgba(15,23,42,0.08)] backdrop-blur-sm"
                )}
              >
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={6}
                    className="py-2.5 text-start text-xs font-bold text-slate-800"
                  >
                    סה״כ לחיוב בתקופה (בסיס BOQ)
                  </TableCell>
                  <TableCell className="py-2.5 text-start">
                    <span className="inline-flex min-h-9 min-w-[7rem] items-center rounded-md border-2 border-emerald-300 bg-card px-3 font-currency-mono text-base font-bold tabular-nums text-emerald-950 shadow-sm">
                      {ils.format(periodTotal)}
                    </span>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {errors.lines && typeof errors.lines.message === "string" ? (
            <p className="mt-2 px-3 text-[11px] text-red-600 md:px-0">
              {errors.lines.message}
            </p>
          ) : null}

          {/* Phase 8.4 — ניכויים, התייקרויות והוראות שינוי */}
          <div className="mt-4 rounded-lg border border-slate-200 bg-background/90 px-3 py-3 shadow-inner">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-slate-800">
                  ניכויים והוספות
                </p>
                <p className="text-[11px] text-slate-500">
                  עיכבון וביטוח מחושבים אוטומטית מסכום בסיס בשורות — ללא חישוב
                  ידני.
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
                      תיאור הוראת שינוי
                    </TableHead>
                    <TableHead className="w-[30%] py-1.5 text-start text-[11px] font-semibold text-slate-700">
                      סכום מאושר
                    </TableHead>
                    <TableHead className="w-[15%] py-1.5 text-center text-[11px] font-semibold text-slate-700">
                      {""}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changeOrderFields.length === 0 ? (
                    <TableRow className="border-slate-100">
                      <TableCell
                        colSpan={3}
                        className="px-2 py-4 text-center text-[11px] text-slate-500"
                      >
                        אין הוראות שינוי בחשבון זה.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {changeOrderFields.map((coField, coIndex) => (
                    <TableRow
                      key={coField.id}
                      className="border-slate-100 hover:bg-background/80"
                    >
                      <TableCell className="px-2 py-1 align-middle">
                        <Input
                          disabled={locked}
                          className={cn(
                            fieldClass,
                            "h-7 w-full text-sm",
                            errors.changeOrders?.[coIndex]?.description &&
                              "border-red-300 ring-1 ring-red-200"
                          )}
                          placeholder="תיאור"
                          {...register(`changeOrders.${coIndex}.description`)}
                        />
                      </TableCell>
                      <TableCell className="px-2 py-1 align-middle">
                        <Input
                          inputMode="decimal"
                          disabled={locked}
                          className={cn(
                            fieldClass,
                            "h-7 w-full min-w-[6.5rem] font-currency-mono text-sm tabular-nums",
                            errors.changeOrders?.[coIndex]?.approvedAmount &&
                              "border-red-300 ring-1 ring-red-200"
                          )}
                          {...register(`changeOrders.${coIndex}.approvedAmount`, {
                            setValueAs: (v) => parseMoney(v),
                          })}
                        />
                      </TableCell>
                      <TableCell className="px-1 py-1 align-middle">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 border-slate-200 bg-card"
                          disabled={locked}
                          onClick={() => removeChangeOrder(coIndex)}
                          aria-label="מחק הוראת שינוי"
                        >
                          <Trash2 className="size-3.5 opacity-80" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-3 grid gap-1.5 border-t border-slate-200/80 pt-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 text-slate-700">
                <span className="text-xs font-medium">
                  סה״כ לחיוב בתקופה (בסיס BOQ)
                </span>
                <span className="font-currency-mono text-sm font-semibold tabular-nums text-foreground">
                  {ils.format(periodTotal)}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-slate-700">
                <span className="text-xs font-medium">סה״כ הוראות שינוי</span>
                <span className="font-currency-mono text-sm font-semibold tabular-nums text-foreground">
                  {ils.format(deductions.changeOrdersApprovedSum)}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-slate-700">
                <span className="text-xs font-medium">התייקרויות</span>
                <span className="font-currency-mono text-sm font-semibold tabular-nums text-foreground">
                  {ils.format(parseMoney(indexationAmount))}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">
                  ניכוי עיכבון ({parseMoney(retentionPercent)}%)
                </span>
                <span className="font-currency-mono text-sm font-bold tabular-nums text-red-600">
                  −{ils.format(deductions.retentionDeduction)}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">
                  ניכוי ביטוח ({parseMoney(insurancePercent)}%)
                </span>
                <span className="font-currency-mono text-sm font-bold tabular-nums text-red-600">
                  −{ils.format(deductions.insuranceDeduction)}
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-md border-2 border-emerald-600/40 bg-emerald-50/80 px-3 py-3 text-center shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900/90">
                סכום לחיוב סופי (יזם)
              </p>
              <p className="mt-1 font-currency-mono text-3xl font-black tabular-nums tracking-tight text-emerald-950 md:text-4xl">
                {ils.format(deductions.finalAmountToPay)}
              </p>
            </div>
          </div>
        </div>
            </DenseDetailPanel>
          }
        />
      </form>

      <PrintableClientBillingView
        companyName='מרקר אופק יזמות בע"מ'
        companyTaxId="516987654"
        formalSerial={formalSerialW?.trim() ? formalSerialW : null}
        documentDateLabel={formatDocumentDateHe(new Date())}
        status={documentStatus ?? "draft"}
        projectName={projectLabel}
        billingMonthLabel={
          billingMonthW ? formatBillingMonthHe(billingMonthW) : ""
        }
        applicationNumber={
          typeof applicationNumberW === "number" &&
          Number.isFinite(applicationNumberW)
            ? applicationNumberW
            : 0
        }
        totalPeriodBillAmount={periodTotal}
        boqLines={boqPrintLines}
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
        ]}
        finalAmountToBill={deductions.finalAmountToPay}
      />
    </>
  )
}
