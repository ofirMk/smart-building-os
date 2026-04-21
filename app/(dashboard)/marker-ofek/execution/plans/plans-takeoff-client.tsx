"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Check, FileScan, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  confirmBlueprintQuantities,
  processBlueprintAI,
  type BlueprintDetectedItem,
} from "@/lib/marker-ofek/blueprint-actions"
import { fetchProjectBoq, type ProjectBoqRow } from "@/lib/marker-ofek/gantt-actions"
import { cn, formatError } from "@/lib/utils"

type ProjectOption = { id: string; name: string; internal_project_code: string }

type ReviewRow = BlueprintDetectedItem & {
  boqItemId: string | null
  qtyInput: string
}

type ScanPhase = "idle" | "scanning" | "complete"

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function PlansTakeoffClient({
  projects,
  initialProjectId,
  initialBoqRows,
}: {
  projects: ProjectOption[]
  initialProjectId: string
  initialBoqRows: ProjectBoqRow[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectFromUrl = searchParams.get("project")?.trim() ?? ""

  const [projectId, setProjectId] = React.useState(() => {
    if (initialProjectId) return initialProjectId
    if (projectFromUrl && projects.some((p) => p.id === projectFromUrl)) return projectFromUrl
    return projects[0]?.id ?? ""
  })

  const [boqRows, setBoqRows] = React.useState<ProjectBoqRow[]>(initialBoqRows)
  const [loadingBoq, setLoadingBoq] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)
  const [scanPhase, setScanPhase] = React.useState<ScanPhase>("idle")
  const [reviewRows, setReviewRows] = React.useState<ReviewRow[]>([])
  const [lastFileLabel, setLastFileLabel] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setLoadingBoq(true)
    void (async () => {
      try {
        const rows = await fetchProjectBoq(projectId)
        if (!cancelled) setBoqRows(rows)
      } catch {
        if (!cancelled) setBoqRows([])
      } finally {
        if (!cancelled) setLoadingBoq(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  React.useEffect(() => {
    const url = new URL(window.location.href)
    if (projectId) url.searchParams.set("project", projectId)
    else url.searchParams.delete("project")
    window.history.replaceState({}, "", url.toString())
  }, [projectId])

  async function runScan(file: File) {
    if (!projectId) {
      toast.error("בחר פרויקט לפני העלאה.")
      return
    }
    setScanPhase("scanning")
    setLastFileLabel(file.name)
    try {
      const fd = new FormData()
      fd.set("projectId", projectId)
      fd.set("file", file)
      const res = await processBlueprintAI(fd)
      setReviewRows(
        res.detectedItems.map((d) => ({
          ...d,
          boqItemId: d.suggestedBoqItemId,
          qtyInput: String(d.qty),
        }))
      )
      setScanPhase("complete")
      await sleep(700)
      setScanPhase("idle")
      toast.success("זוהו פריטים — יש לסקור ולאשר לפני עדכון כתב כמויות.")
    } catch (error) {
      setScanPhase("idle")
      toast.error(formatError(error))
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void runScan(f)
  }

  function updateRow(id: string, patch: Partial<ReviewRow>) {
    setReviewRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  async function onConfirm() {
    if (!projectId) return
    const updates = reviewRows
      .map((r) => {
        const boqItemId = String(r.boqItemId ?? "").trim()
        const plannedQuantity = Number(r.qtyInput.replace(",", "."))
        if (!boqItemId) return null
        if (!Number.isFinite(plannedQuantity) || plannedQuantity < 0) return null
        return { boqItemId, plannedQuantity }
      })
      .filter((v): v is { boqItemId: string; plannedQuantity: number } => Boolean(v))

    if (updates.length === 0) {
      toast.error("בחר שורת כתב כמויות לכל פריט וודא שכמויות תקינות.")
      return
    }

    setConfirming(true)
    try {
      await confirmBlueprintQuantities({ projectId, updates })
      toast.success("כתב הכמויות עודכן. עלויות הגאנט ישקפו את הכמויות בטעינה הבאה של הגאנט.")
      setReviewRows([])
      void router.refresh()
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setConfirming(false)
    }
  }

  const overlayOpen = scanPhase !== "idle"

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-3 py-6 md:px-5">
      {overlayOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 p-6 backdrop-blur-[2px]"
          aria-live="polite"
        >
          <div className="w-full max-w-md rounded-sm border border-zinc-300/80 bg-zinc-50 px-8 py-10 text-center shadow-xl">
            {scanPhase === "scanning" ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="size-12 animate-spin text-sky-500" aria-hidden />
                <p className="text-[15px] font-medium leading-snug text-sky-500">
                  AI Scanning Blueprint... Detecting Construction Elements
                </p>
                <p className="text-[12px] text-zinc-500">מנתח תוכנית — הכנה לכמויות BOQ</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="flex size-14 items-center justify-center rounded-full bg-emerald-600/15">
                  <Check className="size-8 text-emerald-600" strokeWidth={2.5} aria-hidden />
                </div>
                <p className="text-[15px] font-semibold text-emerald-600">הסריקה הושלמה</p>
                <p className="text-[12px] text-zinc-600">מעבר לסקירה ואישור</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <header className="space-y-2 text-start">
        <div className="inline-flex items-center gap-2 text-zinc-600">
          <FileScan className="size-5" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em]">
            Marker Ofek — Digital Takeoff
          </span>
        </div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">תוכניות וחילוץ כמויות (Blueprint AI)</h1>
        <p className="max-w-2xl text-[13px] text-zinc-500">
          העלאת PDF או תמונה, זיהוי מוקד (Mock), סקירה ואישור — עדכון ישיר של{" "}
          <span className="font-medium text-zinc-700">planned_quantity</span> בכתב כמויות הפרויקט. משימות גאנט
          מקושרות ל-BOQ יציגו עלות מעודכנת לפי הכמות והתעריף.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-zinc-600">פרויקט</label>
          <Select
            value={projectId || undefined}
            onValueChange={(v) => {
              setProjectId(v ?? "")
              setReviewRows([])
            }}
            disabled={projects.length === 0}
          >
            <SelectTrigger className="h-10 w-full min-w-[240px] rounded-sm border-zinc-300 bg-card sm:w-[320px]">
              <SelectValue placeholder="בחר פרויקט" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.internal_project_code ? ` (${p.internal_project_code})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {lastFileLabel ? (
          <p className="text-[12px] text-zinc-500">
            קובץ אחרון: <span className="tabular-nums text-zinc-800">{lastFileLabel}</span>
          </p>
        ) : null}
      </div>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = "copy"
        }}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-sm border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 transition-colors",
          dragOver && "border-sky-400 bg-sky-50/80",
          !projectId && "pointer-events-none opacity-50"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void runScan(f)
            e.target.value = ""
          }}
        />
        <Upload className="size-10 text-zinc-400" aria-hidden />
        <div className="text-center">
          <p className="text-[14px] font-medium text-zinc-800">גרור תוכנית (PDF / תמונה) לאזור זה</p>
          <p className="mt-1 text-[12px] text-zinc-500">או לחץ לבחירת קובץ — מקסימום ~28MB</p>
        </div>
      </div>

      {reviewRows.length > 0 ? (
        <section className="space-y-3 rounded-sm border border-zinc-200 bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[15px] font-bold text-zinc-900">סקירה ואישור לפני BOQ</h2>
            <Button
              type="button"
              disabled={confirming || loadingBoq}
              onClick={() => void onConfirm()}
              className="rounded-sm bg-zinc-900 text-zinc-50 hover:bg-zinc-800"
            >
              {confirming ? (
                <>
                  <Loader2 className="me-2 size-4 animate-spin" />
                  שומר...
                </>
              ) : (
                "אשר והחל על כתב כמויות"
              )}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-start text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                  <th className="px-2 py-2">פריט שזוהה (AI)</th>
                  <th className="px-2 py-2">שורת BOQ</th>
                  <th className="px-2 py-2">יחידה</th>
                  <th className="px-2 py-2">כמות</th>
                </tr>
              </thead>
              <tbody>
                {reviewRows.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-100">
                    <td className="px-2 py-2 text-zinc-900">{row.item}</td>
                    <td className="px-2 py-2">
                      <Select
                        value={row.boqItemId ?? "__none__"}
                        onValueChange={(v) =>
                          updateRow(row.id, { boqItemId: v === "__none__" ? null : v })
                        }
                      >
                        <SelectTrigger className="h-9 w-full min-w-[200px] rounded-sm border-zinc-300 bg-card text-start text-[12px]">
                          <SelectValue placeholder="בחר שורת כתב כמויות" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— לא משויך —</SelectItem>
                          {boqRows.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.item_code} — {b.description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2">
                      <span className="tabular-nums text-zinc-700">{row.unit}</span>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.qtyInput}
                        onChange={(e) => updateRow(row.id, { qtyInput: e.target.value })}
                        className="w-full min-w-[96px] rounded-sm border border-zinc-300 bg-card px-2 py-1.5 text-end tabular-nums text-zinc-900 outline-none focus:border-zinc-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {boqRows.length === 0 && !loadingBoq ? (
            <p className="text-[12px] text-amber-700">
              אין שורות BOQ לפרויקט זה. הוסף פריטים בכתב הכמויות לפני אישור.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
