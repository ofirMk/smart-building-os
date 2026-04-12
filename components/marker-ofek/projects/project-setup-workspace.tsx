"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowRight,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import {
  useFieldArray,
  useForm,
  useWatch,
  type SubmitHandler,
} from "react-hook-form"

import { createProject } from "@/app/(dashboard)/marker-ofek/projects/actions"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import {
  DIAMOND_TENDER_INTAKE_HREF,
  useDiamondNavigation,
} from "@/hooks/use-diamond-navigation"
import {
  PROJECT_CONTRACT_TYPE_VALUES,
  PROJECT_SETUP_STATUS_VALUES,
  defaultProjectSetupFormValues,
  projectSetupFormSchema,
  type ProjectSetupFormInput,
  type ProjectSetupFormOutput,
} from "@/lib/marker-ofek/project-schema"
import { MD_QUERY } from "@/lib/marker-ofek/master-detail-nav"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"
import type { MarkerOfekTenderRow } from "@/types/marker-ofek"

const TENDER_NONE_VALUE = "none"
const CREATED_PROJECT_STORAGE_KEY =
  "marker-ofek:projects:newly-created-id"

const fieldClass =
  "h-8 border-slate-200 bg-white text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15"
const labelClass = "text-[11px] font-semibold text-slate-600"
const tableInputClass =
  "h-7 min-h-7 border-slate-200 bg-white px-1.5 text-xs text-slate-900 shadow-sm focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15"

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

function tenderLabel(t: MarkerOfekTenderRow): string {
  const name = t.project_name_from_ai?.trim()
  if (name) return name
  const d = t.tender_date_target?.trim()
  if (d) return `מכרז · ${d}`
  return `מכרז ${t.id.slice(0, 8)}…`
}

function parseMoney(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (v === "" || v == null) return 0
  const n = Number(String(v).replace(",", ".").trim())
  return Number.isFinite(n) ? n : 0
}

export function ProjectSetupWorkspace() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  useDiamondNavigation(undefined, { f2Href: DIAMOND_TENDER_INTAKE_HREF })

  const [tenders, setTenders] = React.useState<MarkerOfekTenderRow[]>([])
  const [loadingTenders, setLoadingTenders] = React.useState(true)
  const [tenderId, setTenderId] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const defaults = React.useMemo(() => defaultProjectSetupFormValues(), [])

  const form = useForm<
    ProjectSetupFormInput,
    unknown,
    ProjectSetupFormOutput
  >({
    resolver: zodResolver(projectSetupFormSchema),
    defaultValues: defaults,
    mode: "onChange",
  })

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = form

  const { fields, append, remove } = useFieldArray({
    control,
    name: "tenderLines",
  })

  const watchedLines = useWatch({ control, name: "tenderLines" })

  const quoteTotal = React.useMemo(() => {
    const rows = watchedLines ?? []
    let sum = 0
    for (const row of rows) {
      const q = parseMoney(row?.quantity)
      const p = parseMoney(row?.unitPrice)
      sum += q * p
    }
    return sum
  }, [watchedLines])

  const pushQuoteLineUrl = React.useCallback(
    (lineIndex: number) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set(MD_QUERY.line, String(lineIndex))
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  React.useEffect(() => {
    const raw = searchParams.get(MD_QUERY.line)
    if (raw == null) return
    const idx = Number.parseInt(raw, 10)
    if (!Number.isFinite(idx) || idx < 0) return
    requestAnimationFrame(() => {
      document
        .getElementById(`project-quote-line-${idx}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }, [searchParams, fields.length])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingTenders(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from("tenders")
          .select(
            "id, project_name_from_ai, tender_date_target, consultant_name_from_ai, created_at, updated_at"
          )
          .order("updated_at", { ascending: false })
        if (error) throw error
        if (!cancelled) setTenders((data ?? []) as MarkerOfekTenderRow[])
      } catch (e) {
        if (!cancelled) {
          notifyError("טעינת מכרזים נכשלה", formatError(e))
        }
      } finally {
        if (!cancelled) setLoadingTenders(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onSubmit: SubmitHandler<ProjectSetupFormOutput> = async (data) => {
    if (data.tenderLines.length === 0) {
      notifyError("לא ניתן ליצור פרויקט", "נדרשת לפחות שורת הצעת מחיר אחת.")
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.set("name", data.projectName)
      fd.set("client_name", data.clientName)
      fd.set("internal_project_code", data.projectCode)
      const tid = tenderId.trim()
      if (tid && tid !== TENDER_NONE_VALUE) fd.set("tender_id", tid)

      const result = await createProject(fd)
      if (!result.ok) {
        notifyError("יצירת פרויקט נכשלה", result.error)
        return
      }

      try {
        localStorage.setItem(CREATED_PROJECT_STORAGE_KEY, result.projectId)
      } catch {
        /* ignore */
      }

      notifySuccess(
        "יצירת פרויקט הושלמה",
        `סה״כ הצעת מחיר ${ils.format(data.totalQuoteAmount)} · קוד ${data.projectCode}`
      )
      router.push(`/marker-ofek/projects/${result.projectId}`)
    } catch (err) {
      notifyError("יצירת פרויקט נכשלה", formatError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-12 pt-1"
    >
      <Link
        href="/marker-ofek/projects"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לפרויקטים
      </Link>

      <header className="space-y-1 border-b border-slate-200 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Phase 8.3 · נתוני מאסטר
        </p>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
          הקמת פרויקט והצעת מחיר
        </h1>
        <p className="text-sm text-slate-600">
          מסך מאוחד: פרטי פרויקט + טיוטת הצעת מחיר ראשונית ללקוח (מכרז).
        </p>
        <p className="text-xs text-slate-500">
          F2 — קליטת מכרז. Escape — חזרה (ניווט יהלום).
        </p>
      </header>

      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className="grid min-h-0 gap-4 lg:grid-cols-2">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="space-y-1 border-b border-slate-100 py-3">
              <CardTitle className="text-base">פרטי פרויקט</CardTitle>
              <CardDescription className="text-xs">
                זיהוי, לקוח, סוג חוזה ותאריכים
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 p-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="projectName" className={labelClass}>
                  שם פרויקט
                </Label>
                <Input
                  id="projectName"
                  className={fieldClass}
                  autoComplete="off"
                  placeholder="למשל: מגדלי הרצליה — חשמל ראשי"
                  {...register("projectName")}
                />
                {errors.projectName ? (
                  <p className="text-[11px] text-red-600">
                    {errors.projectName.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1">
                <Label htmlFor="projectCode" className={labelClass}>
                  קוד פרויקט
                </Label>
                <Input
                  id="projectCode"
                  dir="ltr"
                  className={cn(fieldClass, "font-mono text-start")}
                  placeholder="PR16000010"
                  {...register("projectCode")}
                />
                {errors.projectCode ? (
                  <p className="text-[11px] text-red-600">
                    {errors.projectCode.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1">
                <Label htmlFor="clientName" className={labelClass}>
                  שם לקוח
                </Label>
                <Input
                  id="clientName"
                  className={fieldClass}
                  autoComplete="organization"
                  {...register("clientName")}
                />
                {errors.clientName ? (
                  <p className="text-[11px] text-red-600">
                    {errors.clientName.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="projectManager" className={labelClass}>
                  אחראי פרויקט
                </Label>
                <Input
                  id="projectManager"
                  className={fieldClass}
                  {...register("projectManager")}
                />
                {errors.projectManager ? (
                  <p className="text-[11px] text-red-600">
                    {errors.projectManager.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1">
                <Label className={labelClass}>סוג חוזה</Label>
                <Select
                  value={form.watch("contractType")}
                  onValueChange={(v) =>
                    form.setValue(
                      "contractType",
                      v as ProjectSetupFormInput["contractType"],
                      { shouldValidate: true }
                    )
                  }
                >
                  <SelectTrigger className={fieldClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_CONTRACT_TYPE_VALUES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className={labelClass}>סטטוס הקמה</Label>
                <Select
                  value={form.watch("status")}
                  onValueChange={(v) =>
                    form.setValue(
                      "status",
                      v as ProjectSetupFormInput["status"],
                      { shouldValidate: true }
                    )
                  }
                >
                  <SelectTrigger className={fieldClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_SETUP_STATUS_VALUES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="startDate" className={labelClass}>
                  תאריך התחלה
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  className={fieldClass}
                  {...register("startDate")}
                />
                {errors.startDate ? (
                  <p className="text-[11px] text-red-600">
                    {errors.startDate.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1">
                <Label htmlFor="endDate" className={labelClass}>
                  תאריך סיום צפוי
                </Label>
                <Input
                  id="endDate"
                  type="date"
                  className={fieldClass}
                  {...register("endDate")}
                />
                {errors.endDate ? (
                  <p className="text-[11px] text-red-600">
                    {errors.endDate.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className={labelClass}>מכרז זוכה (אופציונלי)</Label>
                {loadingTenders ? (
                  <p className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    טוען מכרזים…
                  </p>
                ) : tenders.length === 0 ? (
                  <p className="text-xs text-slate-600">
                    אין מכרזים במערכת.{" "}
                    <Link
                      href="/marker-ofek/pre-construction/tender-intake"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      קליטת מכרז
                    </Link>
                  </p>
                ) : (
                  <div className="flex items-center gap-1">
                    <Select
                      value={tenderId.trim() ? tenderId : TENDER_NONE_VALUE}
                      onValueChange={(v) =>
                        setTenderId(!v || v === TENDER_NONE_VALUE ? "" : v)
                      }
                    >
                      <SelectTrigger
                        className={cn(fieldClass, "min-w-0 flex-1")}
                        onKeyDown={(e) => {
                          if (e.key === "Delete" || e.key === "Backspace") {
                            e.preventDefault()
                            setTenderId("")
                          }
                        }}
                      >
                        <SelectValue placeholder="ללא שיוך / בחרו מכרז" />
                      </SelectTrigger>
                      <SelectContent diamondHref={DIAMOND_TENDER_INTAKE_HREF}>
                        <SelectItem value={TENDER_NONE_VALUE}>
                          ללא שיוך (פרויקט עצמאי)
                        </SelectItem>
                        {tenders.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {tenderLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-slate-500 hover:text-slate-900"
                      title="ניקוי בחירת מכרז"
                      aria-label="ניקוי בחירת מכרז"
                      onClick={() => setTenderId("")}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col border-slate-200 bg-white shadow-sm">
            <CardHeader className="space-y-1 border-b border-slate-100 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">הצעת מחיר ראשונית</CardTitle>
                  <CardDescription className="text-xs">
                    שורות BoQ להצגה ללקוח — כמות × מחיר יחידה
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() =>
                    append({
                      section: "",
                      workDescription: "",
                      unit: "יח״מ",
                      quantity: 0,
                      unitPrice: 0,
                    })
                  }
                >
                  <Plus className="size-3.5" aria-hidden />
                  שורה
                </Button>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="w-[4.5rem] text-[10px] font-semibold">
                      סעיף
                    </TableHead>
                    <TableHead className="min-w-[8rem] text-[10px] font-semibold">
                      תיאור עבודה
                    </TableHead>
                    <TableHead className="w-[4rem] text-[10px] font-semibold">
                      יח׳
                    </TableHead>
                    <TableHead className="w-[5rem] text-[10px] font-semibold">
                      כמות
                    </TableHead>
                    <TableHead className="w-[6rem] text-[10px] font-semibold">
                      מחיר יח׳
                    </TableHead>
                    <TableHead className="w-[6.5rem] text-[10px] font-semibold">
                      סה״כ שורה
                    </TableHead>
                    <TableHead className="w-8 p-1" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.length === 0 ? (
                    <TableRow className="border-slate-100">
                      <TableCell
                        colSpan={7}
                        className="p-4 text-center text-xs text-slate-500"
                      >
                        אין שורות בהצעת המחיר. הוסיפו לפחות סעיף אחד לפני שמירה.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {fields.map((field, index) => {
                    const row = watchedLines?.[index]
                    const lineTot =
                      row != null
                        ? parseMoney(row.quantity) * parseMoney(row.unitPrice)
                        : 0
                    return (
                      <TableRow
                        key={field.id}
                        id={`project-quote-line-${index}`}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer border-slate-100 hover:bg-slate-50/80"
                        onClick={() => pushQuoteLineUrl(index)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            pushQuoteLineUrl(index)
                          }
                        }}
                      >
                        <TableCell
                          className="p-1 align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Input
                            className={tableInputClass}
                            {...register(`tenderLines.${index}.section`)}
                          />
                        </TableCell>
                        <TableCell
                          className="p-1 align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Input
                            className={tableInputClass}
                            {...register(`tenderLines.${index}.workDescription`)}
                          />
                        </TableCell>
                        <TableCell
                          className="p-1 align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Input
                            className={tableInputClass}
                            {...register(`tenderLines.${index}.unit`)}
                          />
                        </TableCell>
                        <TableCell
                          className="p-1 align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            className={cn(tableInputClass, "tabular-nums")}
                            {...register(`tenderLines.${index}.quantity`, {
                              valueAsNumber: true,
                            })}
                          />
                        </TableCell>
                        <TableCell
                          className="p-1 align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            className={cn(
                              tableInputClass,
                              "font-currency-mono tabular-nums"
                            )}
                            {...register(`tenderLines.${index}.unitPrice`, {
                              valueAsNumber: true,
                            })}
                          />
                        </TableCell>
                        <TableCell className="p-1 align-middle">
                          <span className="font-currency-mono text-xs tabular-nums text-slate-800">
                            {ils.format(lineTot)}
                          </span>
                        </TableCell>
                        <TableCell
                          className="p-0.5 align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-slate-400 hover:text-red-600"
                            aria-label="מחק שורה"
                            disabled={fields.length <= 1}
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="border-t-2 border-slate-200 bg-slate-50/90 hover:bg-slate-50/90">
                    <TableCell
                      colSpan={5}
                      className="text-start text-xs font-semibold text-slate-800"
                    >
                      סה״כ הצעת מחיר
                    </TableCell>
                    <TableCell className="font-currency-mono text-sm font-bold tabular-nums text-slate-900">
                      {ils.format(quoteTotal)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
            {errors.tenderLines ? (
              <CardFooter className="border-t border-slate-100 py-2">
                <p className="text-[11px] text-red-600">
                  {errors.tenderLines.root?.message ??
                    errors.tenderLines.message ??
                    "נא לתקן שורות ההצעה"}
                </p>
              </CardFooter>
            ) : null}
          </Card>
        </div>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 py-3">
            <p className="text-xs text-slate-500">
              שמירה ב-ERP: שם, לקוח, קוד פנימי ושיוך מכרז. שורות הצעת המחיר
              מוצגות לבחינה (אינטגרציית BoQ — בשלב הבא).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                render={<Link href="/marker-ofek/projects" />}
              >
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={submitting || loadingTenders}
                className="gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    שומר…
                  </>
                ) : (
                  <>
                    <Save className="size-4" aria-hidden />
                    צור פרויקט
                  </>
                )}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
