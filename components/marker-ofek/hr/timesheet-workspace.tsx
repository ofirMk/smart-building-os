"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { ClipboardList, FileDown, UserCheck } from "lucide-react"
import { toast } from "sonner"
import { useFieldArray, useForm, useWatch, type SubmitHandler } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  computeMonthlyTotalHours,
  defaultMonthlyTimesheetFormValues,
  monthlyHoursAlertLevel,
  monthlyTimesheetFormSchema,
  type MonthlyHoursAlertLevel,
  type MonthlyTimesheetFormInput,
  type MonthlyTimesheetFormOutput,
} from "@/lib/marker-ofek/hr-schema"
import { MD_QUERY } from "@/lib/marker-ofek/master-detail-nav"
import { cn } from "@/lib/utils"

const fieldClass =
  "h-8 w-20 border-slate-200 bg-white text-sm tabular-nums text-slate-900 shadow-sm [color-scheme:light] focus-visible:border-sky-500/40 focus-visible:ring-sky-500/15"

const statusLabel: Record<string, string> = {
  pending: "ממתין לאישור",
  approved: "אושר",
}

function notifySuccess(title: string, description?: string) {
  toast.success(title, { description })
}

function notifyError(title: string, description?: string) {
  toast.error(title, { description })
}

function rowAlertClass(level: MonthlyHoursAlertLevel): string {
  if (level === "red") {
    return "bg-red-50/90 border-red-200"
  }
  if (level === "amber") {
    return "bg-amber-50/90 border-amber-200"
  }
  return "border-transparent"
}

function parseHours(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (v === "" || v == null) return 0
  const n = Number(String(v).replace(",", ".").trim())
  return Number.isFinite(n) ? n : 0
}

function buildPayrollCsv(data: MonthlyTimesheetFormOutput): string {
  const lines = [
    ["חודש", "שם_עובד", "שעות_רגילות", "שעות_נוספות", "סך_שעות", "סטטוס"].join(
      ","
    ),
    ...data.workers.map((w) => {
      const total = computeMonthlyTotalHours(w.regularHours, w.overtimeHours)
      return [
        data.month,
        `"${w.workerName.replace(/"/g, '""')}"`,
        String(w.regularHours),
        String(w.overtimeHours),
        String(total),
        w.status,
      ].join(",")
    }),
  ]
  return "\uFEFF" + lines.join("\r\n")
}

export function TimesheetWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedWorkerId = searchParams.get(MD_QUERY.worker)?.trim() ?? ""

  const defaults = React.useMemo(() => defaultMonthlyTimesheetFormValues(), [])

  const form = useForm<
    MonthlyTimesheetFormInput,
    unknown,
    MonthlyTimesheetFormOutput
  >({
    resolver: zodResolver(monthlyTimesheetFormSchema),
    defaultValues: defaults,
    mode: "onChange",
  })

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = form

  const { fields } = useFieldArray({ control, name: "workers" })

  const workersWatch = useWatch({ control, name: "workers" })
  const hasWorkers = fields.length > 0

  const onSubmit: SubmitHandler<MonthlyTimesheetFormOutput> = (data) => {
    if (data.workers.length === 0) {
      notifyError("לא ניתן לשמור גיליון ריק", "יש להזין לפחות עובד אחד.")
      return
    }
    notifySuccess("שמירת גיליון הושלמה", `עודכנו ${data.workers.length} עובדים.`)
  }

  function approveAll() {
    const w = getValues("workers")
    if (w.length === 0) {
      notifyError("אין עובדים לאישור", "הוסיפו או טענו רשומות שעות תחילה.")
      return
    }
    w.forEach((_, i) => {
      setValue(`workers.${i}.status`, "approved", { shouldDirty: true })
    })
    notifySuccess("אישור שעות הושלם", "כל העובדים סומנו כמאושרים.")
  }

  function approveWorker(index: number) {
    const worker = getValues(`workers.${index}`)
    if (!worker) {
      notifyError("רשומת עובד לא נמצאה")
      return
    }
    setValue(`workers.${index}.status`, "approved", { shouldDirty: true })
    notifySuccess("אישור עובד הושלם", `${worker.workerName} סומן כמאושר.`)
  }

  function exportCsv() {
    const data = getValues()
    const parsed = monthlyTimesheetFormSchema.safeParse(data)
    if (!parsed.success) {
      notifyError("ייצוא נכשל", "נא לתקן שגיאות בטופס לפני ייצוא.")
      return
    }
    const blob = new Blob([buildPayrollCsv(parsed.data)], {
      type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `payroll-timesheet-${parsed.data.month}.csv`
    a.click()
    URL.revokeObjectURL(url)
    notifySuccess("ייצוא CSV הושלם", `נוצר קובץ שכר עבור ${parsed.data.month}.`)
  }

  return (
    <div
      dir="rtl"
      lang="he"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 bg-white p-3 text-slate-900 md:gap-4 md:p-4 [color-scheme:light]"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
            <ClipboardList className="size-4 text-slate-700" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-slate-900 md:text-lg">
              אישור שעות עבודה ושכר
            </h1>
            <p className="text-[11px] text-slate-500">
              סיכום חודשי מנוכחות GPS (Phase 7.2) · אישור לשכר
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-slate-200 bg-white text-xs text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={approveAll}
            disabled={!hasWorkers}
          >
            <UserCheck className="size-3.5 shrink-0" aria-hidden />
            אשר כל השעות
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 bg-sky-600 text-xs text-white shadow-sm hover:bg-sky-700"
            onClick={exportCsv}
            disabled={!hasWorkers}
          >
            <FileDown className="size-3.5 shrink-0" aria-hidden />
            ייצא קובץ שכר להנה״ח (CSV)
          </Button>
        </div>
      </div>

      <section
        className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 shadow-sm"
        aria-label="הקשר חודש"
      >
        <div className="grid gap-2 sm:max-w-xs">
          <Label
            htmlFor="timesheet-month"
            className="text-xs font-semibold text-slate-600"
          >
            חודש (yyyy-mm)
          </Label>
          <Input
            id="timesheet-month"
            type="month"
            className="h-8 border-slate-200 bg-white text-sm shadow-sm [color-scheme:light]"
            {...register("month")}
          />
          {errors.month ? (
            <p className="text-xs text-red-600">{errors.month.message}</p>
          ) : null}
        </div>
      </section>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex min-h-0 flex-1 flex-col gap-2"
      >
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
          <Table dir="rtl" className="text-sm">
            <TableHeader>
              <TableRow className="h-8 border-slate-200 hover:bg-transparent">
                <TableHead className="h-8 min-w-[8rem] px-2 py-0 text-xs font-semibold text-slate-700">
                  שם עובד
                </TableHead>
                <TableHead className="h-8 px-2 py-0 text-xs font-semibold text-slate-700">
                  שעות רגילות
                </TableHead>
                <TableHead className="h-8 px-2 py-0 text-xs font-semibold text-slate-700">
                  שעות נוספות
                </TableHead>
                <TableHead className="h-8 px-2 py-0 text-xs font-semibold text-slate-700">
                  סך שעות חודשי
                </TableHead>
                <TableHead className="h-8 px-2 py-0 text-xs font-semibold text-slate-700">
                  סטטוס
                </TableHead>
                <TableHead className="h-8 px-2 py-0 text-xs font-semibold text-slate-700">
                  פעולות
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!hasWorkers ? (
                <TableRow className="border-slate-100">
                  <TableCell
                    colSpan={6}
                    className="px-2 py-6 text-center text-xs text-slate-500"
                  >
                    אין רשומות שעות לחודש הנבחר.
                  </TableCell>
                </TableRow>
              ) : null}
              {fields.map((field, index) => {
                const row = workersWatch?.[index] as
                  | {
                      workerId?: string
                      workerName?: string
                      regularHours?: number | string
                      overtimeHours?: number | string
                      status?: "pending" | "approved"
                    }
                  | undefined
                const workerId = String(row?.workerId ?? "").trim()
                const reg = parseHours(row?.regularHours)
                const ot = parseHours(row?.overtimeHours)
                const total = computeMonthlyTotalHours(reg, ot)
                const alert = monthlyHoursAlertLevel(total)
                const isSelected =
                  Boolean(workerId) && workerId === selectedWorkerId
                return (
                  <TableRow
                    key={field.id}
                    role="button"
                    tabIndex={0}
                    aria-selected={isSelected}
                    className={cn(
                      "h-8 border-slate-100 outline-none transition-colors",
                      rowAlertClass(alert),
                      isSelected && "ring-2 ring-inset ring-sky-500",
                      "cursor-pointer hover:bg-sky-50/50"
                    )}
                    onClick={() => {
                      const id = getValues(`workers.${index}.workerId`) as
                        | string
                        | undefined
                      if (!id?.trim()) return
                      router.replace(
                        `/marker-ofek/hr/timesheets?${MD_QUERY.worker}=${encodeURIComponent(id.trim())}`,
                        { scroll: false }
                      )
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        const id = getValues(`workers.${index}.workerId`) as
                          | string
                          | undefined
                        if (!id?.trim()) return
                        router.replace(
                          `/marker-ofek/hr/timesheets?${MD_QUERY.worker}=${encodeURIComponent(id.trim())}`,
                          { scroll: false }
                        )
                      }
                    }}
                  >
                    <TableCell className="px-2 py-0 align-middle text-xs font-medium text-slate-900">
                      <input
                        type="hidden"
                        {...register(`workers.${index}.workerId`)}
                      />
                      <input
                        type="hidden"
                        {...register(`workers.${index}.workerName`)}
                      />
                      {row?.workerName ?? "—"}
                    </TableCell>
                    <TableCell
                      className="px-2 py-0 align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.25}
                        className={fieldClass}
                        {...register(`workers.${index}.regularHours`)}
                      />
                    </TableCell>
                    <TableCell
                      className="px-2 py-0 align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.25}
                        className={fieldClass}
                        {...register(`workers.${index}.overtimeHours`)}
                      />
                    </TableCell>
                    <TableCell className="px-2 py-0 align-middle">
                      <span
                        className={cn(
                          "inline-flex min-h-8 min-w-[4.5rem] items-center rounded-md border border-slate-200 bg-slate-50 px-2 font-currency-mono text-xs font-semibold tabular-nums text-slate-900",
                          alert === "red" && "border-red-300 bg-red-100 text-red-900",
                          alert === "amber" &&
                            "border-amber-300 bg-amber-100 text-amber-950"
                        )}
                      >
                        {total.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="px-2 py-0 align-middle text-xs text-slate-800">
                      {statusLabel[String(row?.status)] ?? "—"}
                    </TableCell>
                    <TableCell
                      className="px-2 py-0 align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 border-slate-200 bg-white px-2 text-xs shadow-sm"
                        disabled={row?.status === "approved"}
                        onClick={() => approveWorker(index)}
                      >
                        אשר עובד
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <p className="text-[11px] text-slate-500">
          חריגה מעל {String(180)} שעות — אזהרה ענבר; מעל {String(200)} שעות —
          אזהרה אדומה.
        </p>
      </form>
    </div>
  )
}
