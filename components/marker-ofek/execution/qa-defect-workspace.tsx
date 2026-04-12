"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangle, Camera } from "lucide-react"
import { toast } from "sonner"
import { Controller, useForm, useWatch, type SubmitHandler } from "react-hook-form"

import { DenseMasterDetailTemplate } from "@/components/layout/DenseMasterDetailTemplate"
import { Badge } from "@/components/ui/badge"
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
import { Textarea } from "@/components/ui/textarea"
import {
  QA_DEFECT_MOCK_PROJECTS,
  QA_DEFECT_MOCK_SUBCONTRACTORS,
  QA_DEFECT_SEVERITY_VALUES,
  QA_DEFECT_TYPE_VALUES,
  defaultQaDefectFormValues,
  isQaSeverityCritical,
  qaDefectFormSchema,
  type QaDefectFormInput,
  type QaDefectFormOutput,
  type QaDefectSeverity,
} from "@/lib/marker-ofek/qa-defect-schema"
import { cn } from "@/lib/utils"

const fieldClass =
  "h-8 border-slate-200 bg-white text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15"
const labelClass = "text-xs font-semibold text-slate-600"

function severityBadgeClass(severity: QaDefectSeverity): string {
  if (isQaSeverityCritical(severity)) {
    return "border-red-400 bg-red-50 font-semibold text-red-800 ring-1 ring-red-300/60"
  }
  if (severity === "בינוני") {
    return "border-amber-300 bg-amber-50 font-medium text-amber-900"
  }
  return "border-slate-200 bg-slate-50 font-medium text-slate-700"
}

export function QaDefectWorkspace() {
  const photoRef = React.useRef<HTMLInputElement>(null)
  const defaults = React.useMemo(() => defaultQaDefectFormValues(), [])

  const form = useForm<QaDefectFormInput, unknown, QaDefectFormOutput>({
    resolver: zodResolver(qaDefectFormSchema),
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

  const severity = useWatch({ control, name: "severity" }) as QaDefectSeverity | undefined

  function onPhotosClick() {
    photoRef.current?.click()
  }

  function onPhotoChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const files = ev.target.files
    if (files?.length) {
      toast.message(`נבחרו ${files.length} קבצים לצירוף (דמה — Phase 3.2)`)
    }
    ev.target.value = ""
  }

  const onOpenTicket: SubmitHandler<QaDefectFormOutput> = (data) => {
    console.log("[QA Defect] פתח קריאה ושלח לקבלן — payload:", data)
  }

  function onSaveDraft() {
    const data = getValues()
    console.log("[QA Defect] שמור טיוטה:", data)
    toast.success("טיוטה נשמרה (מקומית)")
  }

  return (
    <form
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onSubmit={handleSubmit(onOpenTicket)}
    >
      <input
        ref={photoRef}
        type="file"
        className="sr-only"
        accept="image/*"
        capture="environment"
        multiple
        onChange={onPhotoChange}
      />

      <DenseMasterDetailTemplate
        dir="rtl"
        className="min-h-0 flex-1 bg-white text-slate-900 [color-scheme:light]"
        eyebrow="Marker Ofek · ביצוע"
        title="פתיחת קריאת ליקוי (QA)"
        description="רישום ליקוי בשטח והקצאה לקבלן משנה (דמה)."
        leading={<AlertTriangle className="size-5 text-amber-700" aria-hidden />}
        backLink={{
          href: "/marker-ofek/dashboard",
          label: "חזרה ללוח בקרה",
        }}
        headerActions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-slate-200 bg-white text-sm text-slate-800"
              onClick={onSaveDraft}
            >
              שמור טיוטה
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              className="h-8 px-4 text-sm font-semibold"
            >
              פתח קריאה ושלח לקבלן
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-slate-200 bg-white text-sm text-slate-800"
              onClick={onPhotosClick}
            >
              <Camera className="size-4 opacity-80" aria-hidden />
              הוסף תמונות נזק
            </Button>
          </>
        }
        master={
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex min-w-[200px] flex-1 flex-col gap-1">
              <span className={labelClass}>פרויקט</span>
              <Controller
                control={control}
                name="projectId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
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
                      {QA_DEFECT_MOCK_PROJECTS.map((p) => (
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

            <div className="flex min-w-[140px] flex-col gap-1">
              <span className={labelClass}>סוג ליקוי</span>
              <Controller
                control={control}
                name="defectType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={cn(fieldClass, "w-full min-w-[8rem]")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {QA_DEFECT_TYPE_VALUES.map((t) => (
                        <SelectItem key={t} value={t} className="text-start">
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex min-w-[160px] flex-col gap-1">
              <span className={labelClass}>חומרה</span>
              <Controller
                control={control}
                name="severity"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={cn(fieldClass, "w-full min-w-[9rem]")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {QA_DEFECT_SEVERITY_VALUES.map((s) => (
                        <SelectItem key={s} value={s} className="text-start">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex min-w-[140px] flex-col gap-1">
              <span className={labelClass}>תג חומרה</span>
              {severity ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "h-8 min-h-8 justify-center px-3 text-xs font-semibold shadow-none",
                    severityBadgeClass(severity)
                  )}
                >
                  {severity}
                </Badge>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              )}
            </div>
          </div>

          <input type="hidden" {...register("status")} />
        </div>
        }
        detail={
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            פרטי הליקוי
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="qa-location" className={labelClass}>
                מיקום באתר
              </Label>
              <Input
                id="qa-location"
                className={cn(
                  fieldClass,
                  errors.location && "border-red-300 ring-1 ring-red-200"
                )}
                placeholder="לדוגמה: בניין 2, קומה 4, דירה 12"
                autoComplete="off"
                {...register("location")}
              />
              {errors.location ? (
                <p className="text-[11px] text-red-600">
                  {errors.location.message}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1">
              <span className={labelClass}>קבלן משנה (הקצאה)</span>
              <Controller
                control={control}
                name="assignedSubcontractor"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      className={cn(
                        fieldClass,
                        "w-full",
                        errors.assignedSubcontractor &&
                          "border-red-300 ring-1 ring-red-200"
                      )}
                    >
                      <SelectValue placeholder="בחרו קבלן" />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {QA_DEFECT_MOCK_SUBCONTRACTORS.map((s) => (
                        <SelectItem
                          key={s.id}
                          value={s.id}
                          className="text-start"
                        >
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.assignedSubcontractor ? (
                <p className="text-[11px] text-red-600">
                  {errors.assignedSubcontractor.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-1">
            <Label htmlFor="qa-description" className={labelClass}>
              תיאור הליקוי
            </Label>
            <Textarea
              id="qa-description"
              rows={6}
              placeholder="תיאור מפורט: מה נמצא, מדידות, צילומים מצורפים…"
              className={cn(
                "min-h-[9rem] resize-y border-slate-200 bg-white py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15",
                errors.description && "border-red-300 ring-1 ring-red-200"
              )}
              {...register("description")}
            />
            {errors.description ? (
              <p className="text-[11px] text-red-600">
                {errors.description.message}
              </p>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-500">סטטוס קריאה:</span>
            <Badge
              variant="outline"
              className="h-6 border-slate-200 bg-slate-50 text-xs font-medium text-slate-800"
            >
              פתוח
            </Badge>
          </div>
        </div>
        }
      />
    </form>
  )
}
