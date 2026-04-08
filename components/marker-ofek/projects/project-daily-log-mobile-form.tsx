"use client"

import * as React from "react"
import { Copy, FileText, Loader2, Minus, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

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
  fetchPreviousDayManpowerDraft,
  fetchProjectSiteId,
  insertSiteMediaRecord,
  submitProjectDailyLogBundle,
} from "@/lib/marker-ofek/project-execution-actions"
import {
  DAILY_LOG_EQUIPMENT_KINDS,
  DAILY_MANPOWER_ROLES,
  SITE_MEDIA_FIELD_TAGS,
  type ManpowerLineInput,
} from "@/lib/marker-ofek/project-execution-shared"
import { TaskPlanVaultSheet } from "@/components/marker-ofek/execution/task-plan-vault-sheet"
import { fetchProjectTasks, type GanttTaskRow } from "@/lib/marker-ofek/gantt-actions"
import { formatWbsPrefixedDisplayName, splitWbsCodePrefix } from "@/lib/marker-ofek/wbs-code-numbering"
import { listPlanDocumentsForTask } from "@/lib/marker-ofek/wbs-plan-link-actions"
import type { PlanLinkRow } from "@/lib/marker-ofek/wbs-plan-link-types"
import { computeWbsDisplayCodes } from "@/lib/marker-ofek/wbs-display-codes"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import type { DailyLogEquipmentKind, DailyManpowerRole, SiteMediaFieldTag } from "@/types/marker-ofek"
import { cn, formatError } from "@/lib/utils"

const BUCKET =
  process.env.NEXT_PUBLIC_PROJECT_DOCUMENTS_BUCKET?.trim() || "project_documents"

const ROLE_LABELS: Record<DailyManpowerRole, string> = {
  project_manager: "מנהל פרויקט",
  team_lead: "ראש צוות",
  certified_electrician: "חשמלאי מוסמך",
  assistant: "עוזר",
  subcontractor_crew: "צוות ספק ביצוע",
}

const TAG_LABELS: Record<SiteMediaFieldTag, string> = {
  before: "לפני",
  after: "אחרי",
  obstacle: "מכשול",
  inspection: "ביקורת",
}

const EQUIP_LABELS: Record<DailyLogEquipmentKind, string> = {
  scissor_lift: "הרמת זיזית (Scissor)",
  generator: "גנרטור",
}

type ProjectDailyLogMobileFormProps = {
  projectId: string
  onSubmitted?: () => void
}

function leafTasks(rows: GanttTaskRow[]): GanttTaskRow[] {
  const hasChild = new Set<string>()
  for (const t of rows) {
    if (t.parent_id) hasChild.add(t.parent_id)
  }
  return rows.filter((t) => !hasChild.has(t.id))
}

function newKey() {
  return crypto.randomUUID()
}

type ManpowerDraft = {
  key: string
  role: DailyManpowerRole
  count: string
  hours: string
  taskId: string
}

type EquipDraft = {
  key: string
  kind: DailyLogEquipmentKind
  assetLabel: string
  hours: string
  notes: string
}

type PhotoDraft = {
  key: string
  file: File
  tag: SiteMediaFieldTag
}

function defaultManpowerRow(): ManpowerDraft {
  return {
    key: newKey(),
    role: "certified_electrician",
    count: "2",
    hours: "8",
    taskId: "",
  }
}

function ManpowerRowLinkedDocs({
  taskId,
  onOpenVault,
}: {
  taskId: string
  onOpenVault: () => void
}) {
  const [docs, setDocs] = React.useState<PlanLinkRow[] | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setBusy(true)
    setDocs(null)
    void listPlanDocumentsForTask(taskId)
      .then((rows) => {
        if (!cancelled) {
          setDocs(rows)
          setBusy(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDocs([])
          setBusy(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [taskId])

  return (
    <div className="mt-2 sm:col-span-2 rounded-lg border border-slate-100 bg-white p-3 text-indigo-900 shadow-sm">
      <p className="text-xs font-semibold text-indigo-900">תוכניות ומסמכים למשימה</p>
      {busy ? (
        <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          טוען…
        </p>
      ) : !docs || docs.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          אין מסמכים מקושרים (קישור ב־WBS לכספת הפרויקט).
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {docs.slice(0, 6).map((r) => (
            <li key={r.document.id} className="flex items-start gap-2 text-xs">
              <FileText className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />
              <span className="min-w-0 flex-1 text-indigo-900">
                {r.document.title?.trim() || r.document.file_path}
              </span>
              <span className="shrink-0 font-currency-mono text-[10px] tabular-nums text-slate-600">
                v{r.document.version_number ?? 1}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 w-full gap-2 border-slate-200 bg-white font-semibold text-indigo-900 hover:bg-slate-50"
        onClick={onOpenVault}
      >
        <FileText className="size-4" aria-hidden />
        תצוגת PDF מהירה
      </Button>
    </div>
  )
}

function tryGeolocation(): Promise<{ latitude: number; longitude: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 }
    )
  })
}

export function ProjectDailyLogMobileForm({
  projectId,
  onSubmitted,
}: ProjectDailyLogMobileFormProps) {
  const [tasks, setTasks] = React.useState<GanttTaskRow[]>([])
  const [loadingTasks, setLoadingTasks] = React.useState(true)
  const [siteId, setSiteId] = React.useState<string | null>(null)
  const [logDate, setLogDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [weather, setWeather] = React.useState("sunny")
  const [work, setWork] = React.useState("")
  const [redFlags, setRedFlags] = React.useState("")
  const [manpower, setManpower] = React.useState<ManpowerDraft[]>(() => [defaultManpowerRow()])
  const [equipment, setEquipment] = React.useState<EquipDraft[]>([])
  const [photos, setPhotos] = React.useState<PhotoDraft[]>([])
  const [copyBusy, setCopyBusy] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [planVaultOpen, setPlanVaultOpen] = React.useState(false)
  const [planVaultTask, setPlanVaultTask] = React.useState<{ id: string; name: string } | null>(null)

  const taskPickerLabels = React.useMemo(() => {
    const computed = computeWbsDisplayCodes(tasks)
    const m = new Map<string, string>()
    for (const t of tasks) {
      const code = t.wbs_code?.trim() || computed.get(t.id)?.trim() || ""
      m.set(t.id, formatWbsPrefixedDisplayName(code || null, t.name))
    }
    return m
  }, [tasks])

  React.useEffect(() => {
    void (async () => {
      setLoadingTasks(true)
      try {
        const [rows, sid] = await Promise.all([
          fetchProjectTasks(projectId),
          fetchProjectSiteId(projectId),
        ])
        setTasks(leafTasks(rows))
        setSiteId(sid)
        if (!sid) {
          toast.error("לא נמצא אתר ביצוע לפרויקט — פנו להגדרות הפרויקט")
        }
      } catch (e) {
        toast.error(formatError(e))
      } finally {
        setLoadingTasks(false)
      }
    })()
  }, [projectId])

  async function copyFromPreviousDay() {
    setCopyBusy(true)
    try {
      const res = await fetchPreviousDayManpowerDraft(projectId, logDate)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      if (res.lines.length === 0) {
        toast.message("אין יומן ביום הקודם להעתקה")
        return
      }
      setManpower(
        res.lines.map((l: ManpowerLineInput) => ({
          key: newKey(),
          role: l.role,
          count: String(l.count),
          hours: String(l.hours),
          taskId: l.taskId ?? "",
        }))
      )
      toast.success("הועתקו שורות מאתמול — עדכנו לפי הצורך")
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setCopyBusy(false)
    }
  }

  function onPhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? [])
    if (list.length === 0) return
    setPhotos((prev) => [
      ...prev,
      ...list.map((file) => ({
        key: newKey(),
        file,
        tag: "before" as SiteMediaFieldTag,
      })),
    ])
    e.target.value = ""
  }

  function removePhoto(key: string) {
    setPhotos((prev) => prev.filter((p) => p.key !== key))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!siteId) {
      toast.error("חסר אתר ביצוע — לא ניתן לשמור")
      return
    }
    setSubmitting(true)
    try {
      const pos = await tryGeolocation()
      const supabase = createSupabaseBrowserClient()
      const photoPaths: string[] = []
      for (const f of photos.map((p) => p.file)) {
        const path = `${projectId}/daily-log/${crypto.randomUUID()}-${f.name.replace(/[^\w.\u0590-\u05FF-]+/g, "_")}`
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, {
          contentType: f.type || "application/octet-stream",
          upsert: false,
        })
        if (error) throw error
        photoPaths.push(path)
      }

      const manpowerParsed: ManpowerLineInput[] = manpower.map((m) => ({
        role: m.role,
        count: Math.max(1, Math.floor(Number(m.count) || 0)),
        hours: Math.max(0, Number(m.hours) || 0),
        taskId: m.taskId.trim() || null,
      }))

      const equipmentParsed = equipment
        .filter((r) => r.kind && (Number(r.hours) > 0 || r.assetLabel.trim() || r.notes.trim()))
        .map((r) => ({
          kind: r.kind,
          assetLabel: r.assetLabel.trim() || null,
          hours: Math.max(0, Number(r.hours) || 0),
          notes: r.notes.trim() || null,
        }))

      const taskIds = [...new Set(manpowerParsed.map((m) => m.taskId).filter(Boolean))] as string[]

      const bundle = await submitProjectDailyLogBundle({
        projectId,
        siteId,
        logDate,
        weather,
        workPerformed: work,
        taskIds,
        redFlags: redFlags.trim() || null,
        photoPaths,
        manpower: manpowerParsed,
        equipment: equipmentParsed,
      })
      if (!bundle.ok) {
        toast.error(bundle.error)
        return
      }

      for (let i = 0; i < photoPaths.length; i++) {
        const draft = photos[i]
        const path = photoPaths[i]!
        const f = draft?.file
        const takenAt =
          f && f.lastModified
            ? new Date(f.lastModified).toISOString()
            : new Date().toISOString()
        const m = await insertSiteMediaRecord({
          projectId,
          storagePath: path,
          mimeType: f?.type ?? null,
          caption: null,
          takenAt,
          fieldTag: draft?.tag ?? "before",
          latitude: pos?.latitude ?? null,
          longitude: pos?.longitude ?? null,
          dailyLogId: bundle.id,
        })
        if (!m.ok) {
          toast.error(m.error)
          break
        }
      }

      toast.success("היומן נשמר")
      setWork("")
      setRedFlags("")
      setPhotos([])
      setManpower([defaultManpowerRow()])
      setEquipment([])
      onSubmitted?.()
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const mono = "font-currency-mono tabular-nums"

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className={cn(
        "mx-auto max-w-lg space-y-6 rounded-xl border-2 border-slate-300 bg-white p-4 shadow-md sm:p-6",
        "text-[#0f172a]"
      )}
    >
      <TaskPlanVaultSheet
        open={planVaultOpen}
        onOpenChange={setPlanVaultOpen}
        projectId={projectId}
        taskId={planVaultTask?.id ?? null}
        taskName={planVaultTask?.name ?? null}
      />
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#0f172a]">יומן עבודה — חברת מערכות</h1>
        <p className="mt-1 text-sm font-medium text-slate-600">
          חשמל / בקרה — מותאם לשטח, ניגודיות גבוהה
        </p>
      </div>

      {/* נוכחות ומשימות */}
      <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <h2 className="text-base font-bold text-[#0f172a]">נוכחות ומשימות</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 gap-1.5 border-slate-300 bg-white font-semibold text-indigo-700 hover:bg-indigo-50"
            disabled={copyBusy || loadingTasks}
            onClick={() => void copyFromPreviousDay()}
          >
            {copyBusy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            העתק מאתמול
          </Button>
        </div>
        <p className="text-xs font-medium text-slate-600">
          כל שורה = תפקיד, מספר אנשים, שעות, ואופציונלית משימת גאנט (מעקב שעות־אדם למשימה).
        </p>

        <ul className="space-y-3">
          {manpower.map((row, idx) => (
            <li
              key={row.key}
              className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">שורה {idx + 1}</span>
                {manpower.length > 1 ? (
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-red-600 hover:bg-red-50"
                    aria-label="מחיקת שורה"
                    onClick={() => setManpower((prev) => prev.filter((r) => r.key !== row.key))}
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label className="text-slate-700">תפקיד</Label>
                  <Select
                    value={row.role}
                    onValueChange={(v) =>
                      setManpower((prev) =>
                        prev.map((r) =>
                          r.key === row.key ? { ...r, role: v as DailyManpowerRole } : r
                        )
                      )
                    }
                  >
                    <SelectTrigger className="mt-1 border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAILY_MANPOWER_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-700">כמות</Label>
                  <Input
                    inputMode="numeric"
                    value={row.count}
                    onChange={(e) =>
                      setManpower((prev) =>
                        prev.map((r) => (r.key === row.key ? { ...r, count: e.target.value } : r))
                      )
                    }
                    className={cn("mt-1 border-slate-200", mono)}
                  />
                </div>
                <div>
                  <Label className="text-slate-700">שעות</Label>
                  <Input
                    inputMode="decimal"
                    value={row.hours}
                    onChange={(e) =>
                      setManpower((prev) =>
                        prev.map((r) => (r.key === row.key ? { ...r, hours: e.target.value } : r))
                      )
                    }
                    className={cn("mt-1 border-slate-200", mono)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-slate-700">משימת גאנט (אופציונלי)</Label>
                  {loadingTasks ? (
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      טוען…
                    </p>
                  ) : (
                    <Select
                      value={row.taskId || "__none__"}
                      onValueChange={(v) => {
                        const tid = v === "__none__" ? "" : String(v)
                        setManpower((prev) =>
                          prev.map((r) => (r.key === row.key ? { ...r, taskId: tid } : r))
                        )
                      }}
                    >
                      <SelectTrigger className="mt-1 border-slate-200">
                        <SelectValue placeholder="ללא משימה" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">ללא משימה ספציפית</SelectItem>
                        {tasks.map((t) => {
                          const label = taskPickerLabels.get(t.id) ?? t.name
                          const sp = splitWbsCodePrefix(label)
                          return (
                            <SelectItem key={t.id} value={t.id}>
                              {sp ? (
                                <>
                                  <span className="font-currency-mono text-[11px] tabular-nums text-indigo-900">
                                    {sp.code}
                                  </span>
                                  <span className="text-indigo-900"> {sp.rest}</span>
                                </>
                              ) : (
                                <span className="text-indigo-900">{label}</span>
                              )}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {row.taskId ? (
                  <ManpowerRowLinkedDocs
                    taskId={row.taskId}
                    onOpenVault={() => {
                      const t = tasks.find((x) => x.id === row.taskId)
                      setPlanVaultTask({
                        id: row.taskId,
                        name: taskPickerLabels.get(row.taskId) ?? t?.name ?? "",
                      })
                      setPlanVaultOpen(true)
                    }}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-slate-300 bg-white font-semibold"
          onClick={() => setManpower((prev) => [...prev, defaultManpowerRow()])}
        >
          <Plus className="ms-1 size-4" aria-hidden />
          הוספת שורת נוכחות
        </Button>
      </section>

      <div className="grid gap-2">
        <Label htmlFor="log-date" className="font-semibold text-slate-700">
          תאריך
        </Label>
        <Input
          id="log-date"
          type="date"
          value={logDate}
          onChange={(e) => setLogDate(e.target.value)}
          className={cn("border-slate-200", mono)}
        />
      </div>

      <div className="grid gap-2">
        <Label className="font-semibold text-slate-700">מזג אוויר</Label>
        <Select value={weather} onValueChange={(v) => setWeather(v ?? "sunny")}>
          <SelectTrigger className="border-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sunny">בהיר</SelectItem>
            <SelectItem value="cloudy">מעונן</SelectItem>
            <SelectItem value="rain">גשם</SelectItem>
            <SelectItem value="heat_wind">חום / רוח</SelectItem>
            <SelectItem value="other">אחר</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="work" className="font-semibold text-slate-700">
          תיאור ביצוע
        </Label>
        <Textarea
          id="work"
          value={work}
          onChange={(e) => setWork(e.target.value)}
          rows={4}
          className="border-slate-200"
          placeholder="מה בוצע היום באתר? (עבודות חשמל, כבילה, בדיקות…)"
          dir="rtl"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="flags" className="font-semibold text-slate-700">
          דגלים אדומים / סיכונים
        </Label>
        <Textarea
          id="flags"
          value={redFlags}
          onChange={(e) => setRedFlags(e.target.value)}
          rows={2}
          className="border-slate-200"
          placeholder="עיכובים, בטיחות, חוסרים…"
          dir="rtl"
        />
      </div>

      {/* צילום ראיות */}
      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
        <h2 className="border-b border-slate-200 pb-2 text-base font-bold text-[#0f172a]">
          צילום ראיות (תיוג חכם)
        </h2>
        <p className="text-xs font-medium text-slate-600">
          בזמן שמירה ננסה לצרף מיקום GPS (אם הדפדפן מאשר). חותמת זמן נלקחת מהקובץ או מהרגע הנוכחי.
        </p>
        <Input
          type="file"
          accept="image/*"
          multiple
          className="border-slate-200"
          onChange={onPhotoPick}
        />
        {photos.length > 0 ? (
          <ul className="space-y-2">
            {photos.map((p, i) => (
              <li
                key={p.key}
                className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="truncate text-xs font-medium text-slate-700">
                  {i + 1}. {p.file.name}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={p.tag}
                    onValueChange={(v) =>
                      setPhotos((prev) =>
                        prev.map((x) =>
                          x.key === p.key ? { ...x, tag: v as SiteMediaFieldTag } : x
                        )
                      )
                    }
                  >
                    <SelectTrigger className="h-9 w-[9.5rem] border-slate-200 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SITE_MEDIA_FIELD_TAGS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TAG_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    className="rounded-md p-2 text-red-600 hover:bg-red-50"
                    aria-label="הסרת תמונה"
                    onClick={() => removePhoto(p.key)}
                  >
                    <Minus className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ציוד כבד */}
      <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <h2 className="text-base font-bold text-[#0f172a]">ציוד כבד</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-300 bg-white"
            onClick={() =>
              setEquipment((prev) => [
                ...prev,
                {
                  key: newKey(),
                  kind: "scissor_lift",
                  assetLabel: "",
                  hours: "",
                  notes: "",
                },
              ])
            }
          >
            <Plus className="size-4" aria-hidden />
            שורה
          </Button>
        </div>
        {equipment.length === 0 ? (
          <p className="text-sm text-slate-600">אין רישום — לחצו &quot;שורה&quot; להרמת זיזית / גנרטור.</p>
        ) : (
          <ul className="space-y-3">
            {equipment.map((row) => (
              <li key={row.key} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    className="rounded-md p-1 text-red-600 hover:bg-red-50"
                    aria-label="מחיקה"
                    onClick={() => setEquipment((prev) => prev.filter((e) => e.key !== row.key))}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label>סוג</Label>
                    <Select
                      value={row.kind}
                      onValueChange={(v) =>
                        setEquipment((prev) =>
                          prev.map((r) =>
                            r.key === row.key ? { ...r, kind: v as DailyLogEquipmentKind } : r
                          )
                        )
                      }
                    >
                      <SelectTrigger className="mt-1 border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAILY_LOG_EQUIPMENT_KINDS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {EQUIP_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>מזהה / מספר ציוד</Label>
                    <Input
                      value={row.assetLabel}
                      onChange={(e) =>
                        setEquipment((prev) =>
                          prev.map((r) =>
                            r.key === row.key ? { ...r, assetLabel: e.target.value } : r
                          )
                        )
                      }
                      className="mt-1 border-slate-200"
                      placeholder="למשל מספר הרמה / גנרטור"
                    />
                  </div>
                  <div>
                    <Label>שעות פעילות</Label>
                    <Input
                      inputMode="decimal"
                      value={row.hours}
                      onChange={(e) =>
                        setEquipment((prev) =>
                          prev.map((r) =>
                            r.key === row.key ? { ...r, hours: e.target.value } : r
                          )
                        )
                      }
                      className={cn("mt-1 border-slate-200", mono)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>הערות</Label>
                    <Input
                      value={row.notes}
                      onChange={(e) =>
                        setEquipment((prev) =>
                          prev.map((r) =>
                            r.key === row.key ? { ...r, notes: e.target.value } : r
                          )
                        )
                      }
                      className="mt-1 border-slate-200"
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Button
        type="submit"
        className="h-12 w-full bg-indigo-700 text-base font-bold text-white hover:bg-indigo-600"
        disabled={submitting || !siteId}
      >
        {submitting ? <Loader2 className="size-5 animate-spin" aria-hidden /> : "שמירת יומן"}
      </Button>
    </form>
  )
}
