"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  AlertTriangle,
  FileDown,
  MoreHorizontal,
  Paperclip,
  Plus,
  Save,
  Trash2,
} from "lucide-react"
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type SubmitHandler,
} from "react-hook-form"

import { Button } from "@/components/ui/button"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  MOCK_PO_CATALOG_ITEMS,
  MOCK_PO_PROJECTS,
  MOCK_PO_SUPPLIERS,
  MOCK_PROJECT_BUDGET_INSIGHTS,
  PO_ENGINE_VAT_RATE,
  PROJECT_BUDGET_LIMIT_NIS,
  defaultPurchaseOrderEngineValues,
  purchaseOrderEngineSchema,
  type PurchaseOrderEngineInput,
  type PurchaseOrderEngineOutput,
} from "@/lib/marker-ofek/po-engine-schema"
import { purchaseOrderEngineDefaultsFromMockPo } from "@/lib/marker-ofek/procurement-mock-dashboard-pos"

const fieldClass =
  "h-8 border-slate-200 bg-white text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15 md:text-sm"
const labelClass = "text-xs font-semibold text-slate-600"
const cellPad = "px-2 py-1 align-middle"

function formatNis(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(n)
}

export function PurchaseOrderEngineForm() {
  const searchParams = useSearchParams()
  const mockPo = searchParams.get("mockPo")?.trim() ?? ""

  const defaults = React.useMemo((): PurchaseOrderEngineInput => {
    const fromBoard = purchaseOrderEngineDefaultsFromMockPo(mockPo)
    return fromBoard ?? defaultPurchaseOrderEngineValues()
  }, [mockPo])

  const form = useForm<
    PurchaseOrderEngineInput,
    unknown,
    PurchaseOrderEngineOutput
  >({
    resolver: zodResolver(purchaseOrderEngineSchema),
    defaultValues: defaults,
    mode: "onBlur",
  })

  const { control, register, handleSubmit, formState, getValues, reset } = form

  React.useEffect(() => {
    reset(defaults)
  }, [defaults, reset])

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  })

  const watchedLines = useWatch({ control, name: "lines" })
  const watchedProjectId = useWatch({ control, name: "projectId" })

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

  const projectInsights = watchedProjectId
    ? MOCK_PROJECT_BUDGET_INSIGHTS[watchedProjectId] ?? null
    : null

  const onValid: SubmitHandler<PurchaseOrderEngineOutput> = (data) => {
    console.log("[PO Engine] validated purchase order:", data)
  }

  const onInvalid = () => {
    console.warn("[PO Engine] validation failed", formState.errors)
  }

  function saveDraft() {
    console.log("[PO Engine] save draft (no full validation):", getValues())
  }

  function exportPdf() {
    console.log("[PO Engine] export PDF (mock)")
  }

  function attachDocuments() {
    console.log("[PO Engine] attach documents (mock)")
  }

  return (
    <div
      dir="rtl"
      className="mx-auto w-full max-w-6xl pb-12 [color-scheme:light]"
    >
      <form
        onSubmit={handleSubmit(onValid, onInvalid)}
        className="space-y-4"
        noValidate
      >
        {/* 1. Action ribbon — SAP-style */}
        <div
          className={cn(
            "sticky top-0 z-30 -mx-1 border-b border-slate-200 bg-white/95 px-1 backdrop-blur-sm",
            "supports-[backdrop-filter]:bg-white/90"
          )}
        >
          <div className="flex flex-wrap items-end gap-3 py-2">
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-bold tracking-tight text-slate-900 md:text-lg">
                מרחב עבודה — הזמנת רכש
              </h1>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Phase 2.1 — Procurement Workspace · בקרת תקציב ומע״מ
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm"
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
                className="h-8 border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm"
                onClick={exportPdf}
              >
                <FileDown className="size-3.5" aria-hidden />
                יצוא ל-PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm"
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
              className="text-[11px] font-medium text-emerald-800 underline-offset-4 hover:underline"
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

        {/* 2. Smart header — dual cards */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <h2 className="mb-3 border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              כרטיס א׳ — ספק ופרויקט
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
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
                          "h-8 w-full border-slate-200 bg-white text-sm text-slate-900",
                          formState.errors.supplierId && "border-red-300"
                        )}
                        onBlur={field.onBlur}
                        ref={field.ref}
                        aria-invalid={!!formState.errors.supplierId}
                      >
                        <SelectValue placeholder="בחרו ספק" />
                      </SelectTrigger>
                      <SelectContent className="border border-slate-200 bg-white">
                        {MOCK_PO_SUPPLIERS.map((s) => (
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

              <div className="space-y-1.5">
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
                          "h-8 w-full border-slate-200 bg-white text-sm text-slate-900",
                          formState.errors.projectId && "border-red-300"
                        )}
                        aria-invalid={!!formState.errors.projectId}
                      >
                        <SelectValue placeholder="בחרו פרויקט" />
                      </SelectTrigger>
                      <SelectContent className="border border-slate-200 bg-white">
                        {MOCK_PO_PROJECTS.map((p) => (
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

              <div className="space-y-1.5">
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
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <h2 className="mb-3 border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              כרטיס ב׳ — תובנות חיות (מוק)
            </h2>
            {projectInsights ? (
              <dl className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <dt className="text-[11px] font-medium text-slate-500">
                    תקציב מאושר
                  </dt>
                  <dd className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                    {formatNis(projectInsights.approvedNis)}
                  </dd>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <dt className="text-[11px] font-medium text-slate-500">
                    נוצל עד כה
                  </dt>
                  <dd className="mt-1 text-sm font-bold tabular-nums text-slate-900">
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
              <p className="text-sm text-slate-500">
                בחרו פרויקט כדי להציג מדדי תקציב (דמו).
              </p>
            )}
          </section>
        </div>

        {/* 3. Power grid — line items */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">שורות הזמנה</h2>
              <p className="text-[11px] text-slate-500">
                רשת שורות — פריט, כמות, מחיר, הערות, סה״כ
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-slate-200 bg-white text-xs text-slate-800"
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

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  <th className={cn(cellPad, "min-w-[200px]")}>פריט</th>
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

                  return (
                    <tr
                      key={fieldRow.id}
                      className="border-b border-slate-100 last:border-b-0"
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
                                className="h-8 w-full border-slate-200 bg-white text-sm text-slate-900"
                                aria-invalid={
                                  !!formState.errors.lines?.[index]
                                    ?.catalogItemId
                                }
                              >
                                <SelectValue placeholder="בחרו פריט" />
                              </SelectTrigger>
                              <SelectContent className="border border-slate-200 bg-white">
                                {MOCK_PO_CATALOG_ITEMS.map((c) => (
                                  <SelectItem
                                    key={c.id}
                                    value={c.id}
                                    className="text-sm"
                                  >
                                    <span className="font-medium">{c.label}</span>
                                    <span className="mr-2 text-slate-500">
                                      ({c.sku})
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
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          className={cn(fieldClass, "w-full tabular-nums")}
                          {...register(`lines.${index}.unitPrice`, {
                            valueAsNumber: true,
                          })}
                        />
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
                            "w-full min-w-[140px] text-slate-800"
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
                          "tabular-nums text-sm font-semibold text-slate-900"
                        )}
                      >
                        {formatNis(rowTotal)}
                      </td>
                      <td className={cn(cellPad, "text-center")}>
                        <div className="flex items-center justify-center gap-0.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className={cn(
                                "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-slate-600 outline-none transition-colors",
                                "hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500/25"
                              )}
                              aria-label="תפריט פעולות שורה"
                            >
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="min-w-[14rem] border border-slate-200 bg-white text-sm text-slate-900 shadow-md"
                            >
                              <DropdownMenuItem
                                disabled
                                className="text-slate-500"
                              >
                                היסטוריית מחירים לפריט
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled
                                className="text-slate-500"
                              >
                                בדיקת מלאי
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-slate-200" />
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
                            className="size-8 text-slate-500 hover:bg-red-50 hover:text-red-700"
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

        {/* 4. Control footer — totals + budget context */}
        <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-800">סיכום כספי ובקרה</p>
              <p className="text-[11px] text-slate-500">
                תקרת אישור להזמנה (דמו):{" "}
                <span className="font-medium text-slate-700">
                  {formatNis(PROJECT_BUDGET_LIMIT_NIS)}
                </span>
                {overBudget ? (
                  <span className="mr-2 font-semibold text-amber-800">
                    — חריגה מול סה״כ כולל מע״מ
                  </span>
                ) : null}
              </p>
            </div>

            <div className="w-full max-w-sm space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
              <div className="flex justify-between gap-4 text-slate-600">
                <span>סכום ביניים (לפני מע״מ)</span>
                <span className="tabular-nums font-medium text-slate-900">
                  {formatNis(subtotal)}
                </span>
              </div>
              <div className="flex justify-between gap-4 text-slate-600">
                <span>מע״מ ({Math.round(PO_ENGINE_VAT_RATE * 100)}%)</span>
                <span className="tabular-nums font-medium text-slate-900">
                  {formatNis(vatAmount)}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-2">
                <div className="flex justify-between gap-4">
                  <span className="font-bold text-slate-900">סה״כ לתשלום</span>
                  <span
                    className={cn(
                      "text-lg font-bold tabular-nums tracking-tight",
                      overBudget ? "text-red-700" : "text-slate-900"
                    )}
                  >
                    {formatNis(grandTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <p className="text-center text-[11px] text-slate-500">
          שליחת &quot;שלח לאישור מנכ״ל&quot; מאמתת את הטופס ומדפיסה לקונסול (אין שמירת DB
          בשלב זה).
        </p>
      </form>
    </div>
  )
}
