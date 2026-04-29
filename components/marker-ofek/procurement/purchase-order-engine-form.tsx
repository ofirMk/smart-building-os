"use client"

import * as React from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  AlertTriangle,
  FileDown,
  MoreHorizontal,
  Paperclip,
  Plus,
  Save,
  Trash2,
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
  const [suppliers, setSuppliers] = React.useState<Array<{ id: string; name: string }>>([])
  const [projects, setProjects] = React.useState<Array<{ id: string; name: string }>>([])
  const [items, setItems] = React.useState<
    Array<{ id: string; itemNumber: string; description: string }>
  >([])
  const [lookupLoading, setLookupLoading] = React.useState(true)
  const [lookupError, setLookupError] = React.useState<string | null>(null)
  const [lookupAttempt, setLookupAttempt] = React.useState(0)

  React.useEffect(() => {
    const controller = new AbortController()
    setLookupLoading(true)
    setLookupError(null)
    void (async () => {
      try {
        const [nextSuppliers, nextProjects, nextItems] = await Promise.all([
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
        ])
        if (controller.signal.aborted) return
        setSuppliers(nextSuppliers)
        setProjects(nextProjects)
        setItems(nextItems)
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
              כרטיס א׳ — ספק ופרויקט
            </h2>
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
          </section>

          <section className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
            <h2 className="mb-3 border-b border-border pb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              כרטיס ב׳ — תובנות חיות (מוק)
            </h2>
            {projectInsights ? (
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

        {/* 3. Power grid — line items */}
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
                      className="border-b border-border/70 last:border-b-0"
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

        {/* 4. Control footer — totals + budget context */}
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
