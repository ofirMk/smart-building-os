"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Camera, HardHat, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  Controller,
  useFieldArray,
  useForm,
  type SubmitHandler,
} from "react-hook-form"

import { DenseMasterDetailTemplate } from "@/components/layout/DenseMasterDetailTemplate"
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  DAILY_LOG_MOCK_PROJECTS,
  DAILY_LOG_TASK_STATUS_VALUES,
  DAILY_LOG_WEATHER_VALUES,
  defaultDailyLogFormValues,
  dailyLogFormSchema,
  type DailyLogFormInput,
  type DailyLogFormOutput,
} from "@/lib/marker-ofek/daily-log-schema"
import { cn } from "@/lib/utils"

const fieldClass =
  "h-8 border-slate-200 bg-card text-sm text-foreground shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15"
const labelClass = "text-xs font-semibold text-slate-600"

const tabListJimmy =
  "h-auto w-full flex-wrap justify-start gap-1 rounded-lg border border-slate-200 bg-background p-1"
const tabTriggerJimmy =
  "text-xs data-active:bg-card data-active:text-foreground data-active:shadow-sm md:text-sm"

export function DailyLogWorkspace() {
  const photoRef = React.useRef<HTMLInputElement>(null)
  const defaults = React.useMemo(() => defaultDailyLogFormValues(), [])

  const form = useForm<DailyLogFormInput, unknown, DailyLogFormOutput>({
    resolver: zodResolver(dailyLogFormSchema),
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

  const manpowerArray = useFieldArray({ control, name: "manpower" })
  const tasksArray = useFieldArray({ control, name: "tasks" })

  function onPhotosClick() {
    photoRef.current?.click()
  }

  function onPhotoChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const files = ev.target.files
    if (files?.length) {
      toast.message(`נבחרו ${files.length} קבצים לצירוף (דמה — Phase 3.1)`)
    }
    ev.target.value = ""
  }

  const onSubmitOffice: SubmitHandler<DailyLogFormOutput> = (data) => {
    toast.success(
      `היומן שודר (כח אדם: ${data.manpower.length}, משימות: ${data.tasks.length})`
    )
  }

  function onSaveDraft() {
    const hasProject = Boolean(getValues().projectId)
    toast.success(hasProject ? "טיוטה נשמרה (מקומית)" : "טיוטה נשמרה ללא פרויקט")
  }

  return (
    <form
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onSubmit={handleSubmit(onSubmitOffice)}
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
        className="min-h-0 flex-1 bg-card text-foreground [color-scheme:light]"
        eyebrow="Marker Ofek · ביצוע"
        title="יומן עבודה יומי"
        description="כוח אדם, משימות וספקים — שידור למשרד (דמה)."
        leading={<HardHat className="size-5 text-amber-800" aria-hidden />}
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
              className="h-8 border-slate-200 bg-card text-sm text-slate-800"
              onClick={onSaveDraft}
            >
              שמור טיוטה
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8 bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              שדר יומן למשרד
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-slate-200 bg-card text-sm text-slate-800"
              onClick={onPhotosClick}
            >
              <Camera className="size-4 opacity-80" aria-hidden />
              הוסף תמונות שטח
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
                      {DAILY_LOG_MOCK_PROJECTS.map((p) => (
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

            <div className="flex min-w-[160px] flex-col gap-1">
              <Label htmlFor="daily-log-date" className={labelClass}>
                תאריך
              </Label>
              <Input
                id="daily-log-date"
                type="date"
                className={cn(
                  fieldClass,
                  errors.logDate && "border-red-300 ring-1 ring-red-200"
                )}
                {...register("logDate")}
              />
              {errors.logDate ? (
                <p className="text-[11px] text-red-600">
                  {errors.logDate.message}
                </p>
              ) : null}
            </div>

            <div className="flex min-w-[160px] flex-col gap-1">
              <span className={labelClass}>מזג אוויר</span>
              <Controller
                control={control}
                name="weather"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={cn(fieldClass, "w-full")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {DAILY_LOG_WEATHER_VALUES.map((w) => (
                        <SelectItem key={w} value={w} className="text-start">
                          {w}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-1">
            <Label htmlFor="daily-log-notes" className={labelClass}>
              הערות כלליות
            </Label>
            <Textarea
              id="daily-log-notes"
              rows={2}
              placeholder="סיכום יום, חריגים, תיאום מול משרד…"
              className={cn(
                "min-h-[4.5rem] resize-y border-slate-200 bg-card py-2 text-sm text-foreground shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15"
              )}
              {...register("generalNotes")}
            />
          </div>
        </div>
        }
        detail={
          <div className="min-h-0 flex-1 overflow-auto pb-2 md:px-1">
        <Tabs defaultValue="manpower" dir="rtl" className="w-full gap-3">
          <TabsList variant="line" className={tabListJimmy}>
            <TabsTrigger value="manpower" className={tabTriggerJimmy}>
              כוח אדם
            </TabsTrigger>
            <TabsTrigger value="tasks" className={tabTriggerJimmy}>
              הספקים ותפוקות
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manpower" className="mt-0 outline-none">
            <div className="rounded-md border border-slate-200 md:rounded-lg">
              <Table dir="rtl">
                <TableHeader>
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="w-[42%] py-2 text-start text-xs font-semibold text-slate-700">
                      תפקיד
                    </TableHead>
                    <TableHead className="w-[28%] py-2 text-start text-xs font-semibold text-slate-700">
                      כמות עובדים
                    </TableHead>
                    <TableHead className="w-[30%] py-2 text-start text-xs font-semibold text-slate-700">
                      פעולות
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manpowerArray.fields.map((field, index) => (
                    <TableRow
                      key={field.id}
                      className="border-slate-100 hover:bg-background/80"
                    >
                      <TableCell className="px-2 py-1.5 align-middle">
                        <Input
                          className={cn(
                            fieldClass,
                            "w-full",
                            errors.manpower?.[index]?.role &&
                              "border-red-300 ring-1 ring-red-200"
                          )}
                          placeholder="למשל: חשמלאי, פועל, מנהל עבודה"
                          aria-label={`תפקיד — שורה ${index + 1}`}
                          {...register(`manpower.${index}.role`)}
                        />
                        {errors.manpower?.[index]?.role ? (
                          <p className="mt-0.5 text-[11px] text-red-600">
                            {errors.manpower[index]?.role?.message}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 align-middle">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          className={cn(
                            fieldClass,
                            "w-28 font-currency-mono tabular-nums",
                            errors.manpower?.[index]?.headCount &&
                              "border-red-300 ring-1 ring-red-200"
                          )}
                          aria-label={`כמות עובדים — שורה ${index + 1}`}
                          {...register(`manpower.${index}.headCount`, {
                            setValueAs: (v) => {
                              if (v === "" || v == null) return 0
                              const n =
                                typeof v === "number"
                                  ? v
                                  : Number(
                                      String(v).replace(",", ".").trim()
                                    )
                              return Number.isFinite(n)
                                ? Math.max(0, Math.floor(n))
                                : 0
                            },
                          })}
                        />
                      </TableCell>
                      <TableCell className="px-2 py-1.5 align-middle">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 shrink-0 border-slate-200 bg-card"
                            disabled={manpowerArray.fields.length <= 1}
                            onClick={() => manpowerArray.remove(index)}
                            aria-label="מחק שורה"
                          >
                            <Trash2 className="size-4 opacity-80" aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-2 flex justify-start">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-slate-200 bg-card text-sm"
                onClick={() =>
                  manpowerArray.append({ role: "", headCount: 0 })
                }
              >
                <Plus className="size-4" aria-hidden />
                הוסף שורה
              </Button>
            </div>
            {errors.manpower && typeof errors.manpower.message === "string" ? (
              <p className="mt-2 text-[11px] text-red-600">
                {errors.manpower.message}
              </p>
            ) : null}
          </TabsContent>

          <TabsContent value="tasks" className="mt-0 outline-none">
            <div className="rounded-md border border-slate-200 md:rounded-lg">
              <Table dir="rtl">
                <TableHeader>
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="w-[48%] py-2 text-start text-xs font-semibold text-slate-700">
                      תיאור העבודה שבוצעה
                    </TableHead>
                    <TableHead className="w-[28%] py-2 text-start text-xs font-semibold text-slate-700">
                      סטטוס
                    </TableHead>
                    <TableHead className="w-[24%] py-2 text-start text-xs font-semibold text-slate-700">
                      פעולות
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasksArray.fields.map((field, index) => (
                    <TableRow
                      key={field.id}
                      className="border-slate-100 hover:bg-background/80"
                    >
                      <TableCell className="px-2 py-1.5 align-middle">
                        <Input
                          className={cn(
                            fieldClass,
                            "w-full",
                            errors.tasks?.[index]?.description &&
                              "border-red-300 ring-1 ring-red-200"
                          )}
                          placeholder="תיאור ביצוע בשטח"
                          aria-label={`תיאור משימה — שורה ${index + 1}`}
                          {...register(`tasks.${index}.description`)}
                        />
                        {errors.tasks?.[index]?.description ? (
                          <p className="mt-0.5 text-[11px] text-red-600">
                            {errors.tasks[index]?.description?.message}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 align-middle">
                        <Controller
                          control={control}
                          name={`tasks.${index}.status`}
                          render={({ field: f }) => (
                            <Select
                              value={f.value}
                              onValueChange={f.onChange}
                            >
                              <SelectTrigger
                                className={cn(fieldClass, "w-full min-w-[7rem]")}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent dir="rtl">
                                {DAILY_LOG_TASK_STATUS_VALUES.map((s) => (
                                  <SelectItem
                                    key={s}
                                    value={s}
                                    className="text-start"
                                  >
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </TableCell>
                      <TableCell className="px-2 py-1.5 align-middle">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0 border-slate-200 bg-card"
                          disabled={tasksArray.fields.length <= 1}
                          onClick={() => tasksArray.remove(index)}
                          aria-label="מחק שורה"
                        >
                          <Trash2 className="size-4 opacity-80" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-2 flex justify-start">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-slate-200 bg-card text-sm"
                onClick={() =>
                  tasksArray.append({ description: "", status: "בוצע" })
                }
              >
                <Plus className="size-4" aria-hidden />
                הוסף שורה
              </Button>
            </div>
            {errors.tasks && typeof errors.tasks.message === "string" ? (
              <p className="mt-2 text-[11px] text-red-600">
                {errors.tasks.message}
              </p>
            ) : null}
          </TabsContent>
        </Tabs>
          </div>
        }
      />
    </form>
  )
}
