"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangle, Camera, FileText, Receipt } from "lucide-react"
import { toast } from "sonner"
import { useForm, type SubmitHandler } from "react-hook-form"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  PORTAL_MOCK_SUBCONTRACTOR_NAME,
  PORTAL_OPEN_DEFECTS,
  PORTAL_RECENT_INVOICES,
  defaultPortalPaymentRequestValues,
  portalOpenDefectCount,
  portalPaymentRequestSchema,
  portalPendingApprovalInvoiceCount,
  type PortalOpenDefect,
  type PortalPaymentRequestInput,
  type PortalPaymentRequestOutput,
} from "@/lib/marker-ofek/portal-schema"
import { isQaSeverityCritical as isCritical } from "@/lib/marker-ofek/qa-defect-schema"
import { cn } from "@/lib/utils"

const fieldClass =
  "h-9 min-h-9 border-slate-200 bg-white text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15"
const labelClass = "text-[11px] font-semibold text-slate-600"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

function severityBadgeClass(severity: PortalOpenDefect["severity"]): string {
  if (isCritical(severity)) {
    return "border-red-400 bg-red-50 text-red-900 ring-1 ring-red-300/50"
  }
  if (severity === "בינוני") {
    return "border-amber-300 bg-amber-50 text-amber-900"
  }
  return "border-slate-200 bg-slate-50 text-slate-800"
}

export function SubcontractorDashboard() {
  const photoByDefectRef = React.useRef<Record<string, HTMLInputElement | null>>(
    {}
  )

  const openCount = portalOpenDefectCount()
  const pendingInvoices = portalPendingApprovalInvoiceCount()

  const defaults = React.useMemo(() => defaultPortalPaymentRequestValues(), [])

  const form = useForm<
    PortalPaymentRequestInput,
    unknown,
    PortalPaymentRequestOutput
  >({
    resolver: zodResolver(portalPaymentRequestSchema),
    defaultValues: defaults,
    mode: "onChange",
  })

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form

  const onPaymentSubmit: SubmitHandler<PortalPaymentRequestOutput> = (data) => {
    toast.success(
      `הגשה נקלטה (דמה): ${ils.format(data.claimedAmount)} לחודש ${data.billingMonth}`
    )
    reset(defaultPortalPaymentRequestValues())
  }

  function onMarkFixedClick(defect: PortalOpenDefect) {
    const input = photoByDefectRef.current[defect.id]
    input?.click()
  }

  function onDefectPhotoChange(
    defect: PortalOpenDefect,
    ev: React.ChangeEvent<HTMLInputElement>
  ) {
    const n = ev.target.files?.length ?? 0
    if (n > 0) {
      toast.success(
        `נשלח עדכון לליקוי ${defect.id}: סימון כתוקן + ${n} תמונות (דמה — Phase 7.1)`
      )
    }
    ev.target.value = ""
  }

  return (
    <div
      dir="rtl"
      lang="he"
      className="flex min-h-0 w-full flex-1 flex-col gap-3 bg-white p-3 pb-8 text-slate-900 sm:gap-4 sm:p-4"
    >
      <header className="space-y-0.5 border-b border-slate-200 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Phase 7.1 · פורטל חיצוני
        </p>
        <h1 className="text-lg font-bold leading-tight tracking-tight sm:text-xl">
          מרקר אופק — אזור קבלנים אישי
        </h1>
        <p className="text-sm text-slate-600">
          ברוך הבא, {PORTAL_MOCK_SUBCONTRACTOR_NAME}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Card
          className={cn(
            "border shadow-sm",
            openCount > 0
              ? "border-red-300 bg-red-50/80"
              : "border-slate-200 bg-white"
          )}
        >
          <CardHeader className="space-y-0 p-3 pb-1">
            <CardTitle className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <AlertTriangle
                className={cn(
                  "size-3.5 shrink-0",
                  openCount > 0 ? "text-red-600" : "text-slate-400"
                )}
                aria-hidden
              />
              ליקויים פתוחים
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p
              className={cn(
                "text-2xl font-bold tabular-nums",
                openCount > 0 ? "text-red-700" : "text-slate-700"
              )}
            >
              {openCount}
            </p>
            <p className="text-[10px] text-slate-500">דחוף לטיפול</p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-0 p-3 pb-1">
            <CardTitle className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Receipt className="size-3.5 shrink-0 text-slate-500" aria-hidden />
              חשבונות ממתינים
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-2xl font-bold tabular-nums text-slate-800">
              {pendingInvoices}
            </p>
            <p className="text-[10px] text-slate-500">לאישור במשרד</p>
          </CardContent>
        </Card>
      </div>

      <section className="flex min-h-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">ליקויים לטיפול דחוף</h2>
          <span className="text-[10px] text-slate-500">מקושר ל־QA (3.2)</span>
        </div>

        <ul className="flex flex-col gap-2">
          {PORTAL_OPEN_DEFECTS.map((d) => (
            <li key={d.id}>
              <Card className="border border-slate-200 bg-white shadow-sm">
                <CardHeader className="space-y-1 p-3 pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {d.projectLabel}
                      </p>
                      <p className="text-[11px] text-slate-600">{d.location}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", severityBadgeClass(d.severity))}
                      >
                        {d.severity}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-slate-50 text-[10px] text-slate-700"
                      >
                        {d.status}
                      </Badge>
                    </div>
                  </div>
                  <CardDescription className="text-xs leading-snug text-slate-700">
                    {d.description}
                  </CardDescription>
                  <p className="text-[10px] text-slate-500">
                    נפתח: {d.openedAt} · {d.defectType}
                  </p>
                </CardHeader>
                <CardContent className="border-t border-slate-100 p-3 pt-2">
                  <input
                    ref={(el) => {
                      photoByDefectRef.current[d.id] = el
                    }}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    aria-label={`העלאת תמונה לליקוי ${d.id}`}
                    onChange={(ev) => onDefectPhotoChange(d, ev)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 w-full gap-1.5 text-xs sm:w-auto"
                    variant="secondary"
                    onClick={() => onMarkFixedClick(d)}
                  >
                    <Camera className="size-3.5" aria-hidden />
                    סמן כתוקן + העלה תמונה
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">הגשת חשבון חדש</h2>
          <span className="text-[10px] text-slate-500">מקושר ל־4.1</span>
        </div>

        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-0 p-3 pb-2">
            <CardTitle className="flex items-center gap-1.5 text-xs font-semibold">
              <FileText className="size-3.5 text-slate-500" aria-hidden />
              סכום נדרש לחודש
            </CardTitle>
            <CardDescription className="text-[11px]">
              הזינו את הסכום המבוקש לאישור; המשרד יעדכן בסטטוס כמו בטופס אישור
              חשבונות.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <form
              className="flex flex-col gap-3"
              onSubmit={handleSubmit(onPaymentSubmit)}
              noValidate
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="portal-billing-month" className={labelClass}>
                    חודש חיוב
                  </Label>
                  <Input
                    id="portal-billing-month"
                    type="month"
                    className={fieldClass}
                    {...register("billingMonth")}
                  />
                  {errors.billingMonth ? (
                    <p className="text-[11px] text-red-600">
                      {errors.billingMonth.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="portal-claimed" className={labelClass}>
                    סכום נדרש (₪)
                  </Label>
                  <Input
                    id="portal-claimed"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    placeholder="0"
                    className={cn(fieldClass, "font-currency-mono tabular-nums")}
                    {...register("claimedAmount", { valueAsNumber: true })}
                  />
                  {errors.claimedAmount ? (
                    <p className="text-[11px] text-red-600">
                      {errors.claimedAmount.message}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="portal-notes" className={labelClass}>
                  הערות (אופציונלי)
                </Label>
                <Textarea
                  id="portal-notes"
                  rows={2}
                  className="min-h-[4rem] resize-y border-slate-200 bg-white text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15"
                  placeholder="פירוט קצר לשורות עבודה…"
                  {...register("notes")}
                />
              </div>

              <Button
                type="submit"
                size="sm"
                className="h-9 w-full text-sm sm:w-auto"
                disabled={isSubmitting}
              >
                שלח בקשה לאישור
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border border-dashed border-slate-200 bg-slate-50/50">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-semibold text-slate-700">
              חשבונות אחרונים (תצוגה)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0">
            {PORTAL_RECENT_INVOICES.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 bg-white px-2 py-1.5 text-[11px]"
              >
                <div className="min-w-0">
                  <p className="font-mono font-semibold text-slate-900">
                    {inv.invoiceNumber}
                  </p>
                  <p className="text-slate-500">{inv.billingMonth}</p>
                </div>
                <div className="text-end">
                  <p className="font-currency-mono font-semibold tabular-nums text-slate-900">
                    {ils.format(inv.claimedAmount)}
                  </p>
                  <p
                    className={cn(
                      "text-[10px]",
                      inv.portalStatus === "ממתין לאישור"
                        ? "text-amber-700"
                        : inv.portalStatus === "אושר לתשלום"
                          ? "text-emerald-700"
                          : "text-red-700"
                    )}
                  >
                    {inv.portalStatus}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
