"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, FileUp, Loader2, Plus, Upload } from "lucide-react"
import { toast } from "sonner"

import { processTenderDocumentAI } from "./actions/tender-ai-actions"
import { TenderBuildingVisualization } from "./_components/tender-building-visualization"
import {
  TenderDocumentsTable,
  type TenderDocPendingRow,
  type TenderDocRow,
} from "./_components/tender-documents-table"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createSupabaseBrowserClient as createClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"

const TENDER_STORAGE_BUCKET =
  process.env.NEXT_PUBLIC_TENDER_DOCUMENTS_BUCKET ?? "tender_documents"

const TENDER_FILE_INPUT_ID = "tender-intake-file-input"

type TenderListRow = {
  id: string
  project_name_from_ai: string | null
  created_at: string
  updated_at: string
}

type TenderDetail = TenderListRow & {
  tender_date_target: string | null
  consultant_name_from_ai: string | null
  building_structure_raw_data: Record<string, unknown>
}

function safeStorageFileName(name: string): string {
  const t = name.trim().replace(/[^\w.\u0590-\u05FF-]+/g, "_")
  return t.slice(0, 180) || "document"
}

function isAllowedTenderFile(file: File): boolean {
  const n = file.name.toLowerCase()
  return /\.(pdf|png|jpg|jpeg)$/.test(n)
}

const PENDING_TENDER_PREFIX = "pending:"

function isPendingTenderId(id: string): boolean {
  return id.length > 0 && id.startsWith(PENDING_TENDER_PREFIX)
}

const primaryPress =
  "transition-transform duration-150 ease-out active:scale-95 motion-reduce:active:scale-100"

const sectionEnter =
  "animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-500 ease-out motion-reduce:animate-none"

export default function TenderIntakePage() {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [tenders, setTenders] = React.useState<TenderListRow[]>([])
  const [selectedTenderId, setSelectedTenderId] = React.useState<string>("")
  const [loadingTenders, setLoadingTenders] = React.useState(true)
  const [tenderDetail, setTenderDetail] = React.useState<TenderDetail | null>(
    null
  )
  const [documents, setDocuments] = React.useState<TenderDocRow[]>([])
  const [loadingBundle, setLoadingBundle] = React.useState(false)
  const [isUploading, setIsUploading] = React.useState(false)
  const [pendingDocRows, setPendingDocRows] = React.useState<TenderDocPendingRow[]>(
    []
  )
  const [dragActive, setDragActive] = React.useState(false)

  const [newTenderOpen, setNewTenderOpen] = React.useState(false)
  const [newTenderName, setNewTenderName] = React.useState("")

  /** מכרז אופטימי → Promise ל־UUID אמיתי (העלאה ממתינה ל־resolve לפני Storage/DB) */
  const tenderSyncRef = React.useRef(
    new Map<
      string,
      {
        promise: Promise<string>
        resolve: (id: string) => void
        reject: (e: Error) => void
      }
    >()
  )
  /** אחרי insert מוצלח — מזהה זמני → אמיתי (מניעת מרוץ אם ה־map כבר נוקה) */
  const pendingResolvedRef = React.useRef(new Map<string, string>())

  function createTenderSync() {
    let resolve!: (id: string) => void
    let reject!: (e: Error) => void
    const promise = new Promise<string>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  const refreshTenders = React.useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("tenders")
      .select("id, project_name_from_ai, created_at, updated_at")
      .order("updated_at", { ascending: false })
    if (error) {
      toast.error(error.message)
      return
    }
    setTenders((data ?? []) as TenderListRow[])
  }, [])

  const refreshBundle = React.useCallback(async (id: string) => {
    setLoadingBundle(true)
    try {
      const supabase = createClient()
      const { data: tender, error: tErr } = await supabase
        .from("tenders")
        .select("*")
        .eq("id", id)
        .maybeSingle()
      if (tErr) {
        toast.error(tErr.message)
        setTenderDetail(null)
        setDocuments([])
        return
      }
      if (!tender) {
        toast.error("מכרז לא נמצא")
        setTenderDetail(null)
        setDocuments([])
        return
      }

      const { data: docs, error: dErr } = await supabase
        .from("tender_documents")
        .select("*")
        .eq("tender_id", id)
        .order("file_name", { ascending: true })
      if (dErr) {
        toast.error(dErr.message)
        setDocuments([])
      } else {
        setDocuments(
          (docs ?? []).map((d) => ({
            id: d.id as string,
            file_name: d.file_name as string,
            ai_inferred_name: d.ai_inferred_name as string | null,
            ai_inferred_date: d.ai_inferred_date as string | null,
            status: d.status as TenderDocRow["status"],
            floors_data: (d.floors_data ?? { labels: [] }) as TenderDocRow["floors_data"],
            document_type: d.document_type as TenderDocRow["document_type"],
            tags: (d.tags as string[]) ?? [],
          }))
        )
      }

      setTenderDetail({
        id: tender.id as string,
        project_name_from_ai: tender.project_name_from_ai as string | null,
        created_at: tender.created_at as string,
        updated_at: tender.updated_at as string,
        tender_date_target: tender.tender_date_target as string | null,
        consultant_name_from_ai: tender.consultant_name_from_ai as string | null,
        building_structure_raw_data:
          (tender.building_structure_raw_data as Record<string, unknown>) ?? {},
      })
    } finally {
      setLoadingBundle(false)
    }
  }, [])

  React.useEffect(() => {
    let alive = true
    void (async () => {
      setLoadingTenders(true)
      await refreshTenders()
      if (alive) setLoadingTenders(false)
    })()
    return () => {
      alive = false
    }
  }, [refreshTenders])

  React.useEffect(() => {
    if (!selectedTenderId) {
      setTenderDetail(null)
      setDocuments([])
      return
    }
    if (isPendingTenderId(selectedTenderId)) {
      return
    }
    void refreshBundle(selectedTenderId)
  }, [selectedTenderId, refreshBundle])

  function handleCreateTender(e: React.FormEvent) {
    e.preventDefault()
    const name = newTenderName.trim()
    if (!name) {
      toast.error("נא להזין שם פרויקט או מכרז")
      return
    }

    const tempId = `${PENDING_TENDER_PREFIX}${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const optimisticRow: TenderListRow = {
      id: tempId,
      project_name_from_ai: name,
      created_at: now,
      updated_at: now,
    }

    const sync = createTenderSync()
    tenderSyncRef.current.set(tempId, sync)

    setNewTenderOpen(false)
    setNewTenderName("")
    setTenders((prev) => [optimisticRow, ...prev])
    setSelectedTenderId(tempId)
    setTenderDetail({
      ...optimisticRow,
      tender_date_target: null,
      consultant_name_from_ai: null,
      building_structure_raw_data: {},
    })
    setDocuments([])

    void (async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("tenders")
        .insert({ project_name_from_ai: name })
        .select("id, created_at, updated_at")
        .single()

      const syncEntry = tenderSyncRef.current.get(tempId)

      if (error || !data) {
        const msg = error?.message ?? "יצירת מכרז נכשלה"
        toast.error(msg)
        syncEntry?.reject(new Error(msg))
        tenderSyncRef.current.delete(tempId)
        pendingResolvedRef.current.delete(tempId)
        setTenders((prev) => prev.filter((t) => t.id !== tempId))
        setSelectedTenderId((cur) => (cur === tempId ? "" : cur))
        setTenderDetail((cur) => (cur?.id === tempId ? null : cur))
        return
      }

      const realId = data.id as string
      const created_at = data.created_at as string
      const updated_at = data.updated_at as string
      const serverRow: TenderListRow = {
        id: realId,
        project_name_from_ai: name,
        created_at,
        updated_at,
      }

      setTenders((prev) => {
        const rest = prev.filter((t) => t.id !== tempId)
        return [serverRow, ...rest]
      })
      setSelectedTenderId((cur) => (cur === tempId ? realId : cur))
      setTenderDetail((cur) =>
        cur?.id === tempId
          ? {
              ...cur,
              id: realId,
              created_at,
              updated_at,
            }
          : cur
      )
      syncEntry?.resolve(realId)
      pendingResolvedRef.current.set(tempId, realId)
      tenderSyncRef.current.delete(tempId)
      toast.success("נוצר מכרז חדש")
      await refreshTenders()
    })()
  }

  async function ensureRealTenderIdForUpload(id: string): Promise<string | null> {
    if (!isPendingTenderId(id)) return id
    const resolvedEarly = pendingResolvedRef.current.get(id)
    if (resolvedEarly) return resolvedEarly
    const syncEntry = tenderSyncRef.current.get(id)
    if (!syncEntry) {
      toast.error("ממתינים לסנכרון מכרז — נסו שוב בעוד רגע")
      return null
    }
    try {
      return await syncEntry.promise
    } catch {
      toast.error("יצירת המכרז נכשלה — לא ניתן להעלות קבצים")
      return null
    }
  }

  async function runUpload(files: FileList | File[]) {
    if (!selectedTenderId) {
      toast.error("יש לבחור או ליצור מכרז לפני העלאת קבצים")
      return
    }

    const effectiveTenderId = await ensureRealTenderIdForUpload(selectedTenderId)
    if (!effectiveTenderId) return

    const list = Array.from(files).filter(isAllowedTenderFile)
    const rejected = Array.from(files).length - list.length
    if (rejected > 0) {
      toast.message("חלק מהקבצים דולגו — נתמכים רק PDF, PNG, JPG, JPEG")
    }
    if (list.length === 0) {
      toast.error("לא נמצאו קבצים תקינים להעלאה")
      return
    }
    if (list.length > 15) {
      toast.error("ניתן להעלות עד 15 קבצים בבת אחת")
      return
    }

    toast.info("מתחיל בהעלאת קבצים...")
    setIsUploading(true)

    const pairs = list.map((file) => ({
      key: crypto.randomUUID(),
      file,
    }))
    setPendingDocRows(
      pairs.map(({ key, file }) => ({ key, file_name: file.name }))
    )

    const supabase = createClient()
    let uploadedCount = 0

    try {
      for (const { key, file } of pairs) {
        try {
          const filePath = `${effectiveTenderId}/${Date.now()}-${key.slice(0, 8)}-${safeStorageFileName(file.name)}`
          const contentType = file.type?.trim() || undefined

          const { error: upErr } = await supabase.storage
            .from(TENDER_STORAGE_BUCKET)
            .upload(filePath, file, { upsert: false, contentType })

          if (upErr) {
            toast.error(`${file.name}: ${upErr.message}`)
            setPendingDocRows((prev) => prev.filter((p) => p.key !== key))
            continue
          }

          const { data: row, error: insErr } = await supabase
            .from("tender_documents")
            .insert({
              tender_id: effectiveTenderId,
              file_name: file.name,
              file_path: filePath,
            })
            .select("id")
            .single()

          if (insErr || !row) {
            const msg = insErr?.message ?? "שמירה נכשלה"
            toast.error(`${file.name}: ${msg}`)
            await supabase.storage.from(TENDER_STORAGE_BUCKET).remove([filePath])
            setPendingDocRows((prev) => prev.filter((p) => p.key !== key))
            continue
          }

          const ai = await processTenderDocumentAI(
            row.id as string,
            effectiveTenderId,
            filePath
          )
          if (!ai.success) {
            toast.error(`${file.name}: ${ai.error}`)
          } else {
            toast.success("הקובץ הועלה ועבר לניתוח AI")
          }

          uploadedCount += 1
          setPendingDocRows((prev) => prev.filter((p) => p.key !== key))
          await refreshBundle(effectiveTenderId)
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          toast.error(`${file.name}: ${message}`)
          console.error("Upload / AI failed:", file.name, e)
          setPendingDocRows((prev) => prev.filter((p) => p.key !== key))
        }
      }

      if (uploadedCount > 0) {
        await refreshTenders()
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      toast.error(message)
      console.error("runUpload failed:", e)
    } finally {
      setPendingDocRows([])
      setIsUploading(false)
    }
  }

  const dropzoneDisabled = !selectedTenderId || isUploading

  return (
    <div className="px-4 py-6 md:px-6" dir="rtl" lang="he">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-12">
        <Link
          href="/marker-ofek/pre-construction"
          className={cn(
            sectionEnter,
            "inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground"
          )}
        >
          <ArrowRight className="size-4 rotate-180" aria-hidden />
          חזרה למכרזים ותמחור
        </Link>

        <div
          className={cn(sectionEnter, "delay-75 [animation-delay:75ms]")}
        >
          <h1 className="text-2xl font-semibold tracking-tight">
            קליטת חומרי מכרז (AI)
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            העלאת שרטוטים, מפרטים וכתבי כמויות — חילוץ מטא-דאטה מבלוק כותרת,
            סיווג סטטוס (לביצוע / לעיון / למכרז), ומודל אנכי של הבניין.
          </p>
        </div>

        <Card className={cn(sectionEnter, "delay-150 [animation-delay:150ms]")}>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>בחירת מכרז</CardTitle>
              <CardDescription>
                כל העלאה משויכת למכרז. ניתן ליצור מכרז חדש ואז להוסיף מסמכים.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  primaryPress,
                  "transition-colors duration-200 ease-out"
                )}
                onClick={() => setNewTenderOpen(true)}
              >
                <Plus className="size-4" aria-hidden />
                מכרז חדש
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="tender-select">מכרז פעיל</Label>
              <Select
                value={selectedTenderId || ""}
                onValueChange={(v) => setSelectedTenderId(v ?? "")}
                disabled={loadingTenders}
              >
                <SelectTrigger id="tender-select" className="max-w-md">
                  <SelectValue placeholder="בחרו מכרז מהרשימה" />
                </SelectTrigger>
                <SelectContent>
                  {tenders.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {(t.project_name_from_ai?.trim() || "ללא שם") +
                        ` — ${new Date(t.updated_at).toLocaleDateString("he-IL")}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Dialog open={newTenderOpen} onOpenChange={setNewTenderOpen}>
          <DialogContent className="sm:max-w-md">
            <form onSubmit={(e) => void handleCreateTender(e)}>
              <DialogHeader>
                <DialogTitle>מכרז חדש</DialogTitle>
                <DialogDescription>
                  שם לתצוגה ברשימה; ניתן לעדכן מטא-דאטה מאוחר יותר מתוך המסמכים.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 py-2">
                <Label htmlFor="new-tender-name">שם פרויקט / מכרז</Label>
                <Input
                  id="new-tender-name"
                  value={newTenderName}
                  onChange={(e) => setNewTenderName(e.target.value)}
                  placeholder="לדוגמה: מגדל הרצליה"
                  autoComplete="off"
                />
              </div>
              <DialogFooter className="gap-2 border-0 bg-transparent p-0 pt-2 sm:justify-start">
                <Button
                  type="submit"
                  className={cn(
                    primaryPress,
                    "transition-colors duration-200 ease-out"
                  )}
                >
                  שמירה
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    primaryPress,
                    "transition-colors duration-200 ease-out"
                  )}
                  onClick={() => setNewTenderOpen(false)}
                >
                  ביטול
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <div
          className={cn(
            "grid gap-6 lg:grid-cols-2",
            sectionEnter,
            "delay-200 [animation-delay:200ms]"
          )}
        >
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>העלאת מסמכים</CardTitle>
              <CardDescription>
                אחסון ב־Supabase ({TENDER_STORAGE_BUCKET}); עיבוד AI יופעל בשלב
                הבא.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input
                id={TENDER_FILE_INPUT_ID}
                ref={inputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                multiple
                disabled={dropzoneDisabled}
                className="sr-only"
                aria-label="בחירת קבצי מכרז להעלאה"
                onChange={(e) => {
                  const input = e.currentTarget
                  const f = input.files
                  if (f?.length) {
                    void runUpload(f).finally(() => {
                      input.value = ""
                    })
                  } else {
                    input.value = ""
                  }
                }}
              />
              <button
                type="button"
                disabled={dropzoneDisabled}
                onClick={() => inputRef.current?.click()}
                onDragEnter={(e) => {
                  e.preventDefault()
                  setDragActive(true)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragActive(true)
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragActive(false)
                  const f = e.dataTransfer.files
                  if (f?.length) void runUpload(f)
                }}
                className={cn(
                  "flex min-h-[180px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm",
                  "motion-safe:transition-[opacity,transform,border-color,background-color,min-height] motion-safe:duration-500 motion-safe:ease-out",
                  !dropzoneDisabled && primaryPress,
                  dragActive
                    ? "border-primary/60 bg-muted/50"
                    : "border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/30",
                  dropzoneDisabled
                    ? "pointer-events-none scale-[0.985] opacity-40"
                    : "scale-100 opacity-100"
                )}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="size-8 animate-spin text-muted-foreground" />
                    מעלים קבצים…
                  </>
                ) : (
                  <>
                    <Upload className="size-8 text-muted-foreground" />
                    <span className="flex items-center gap-2 font-medium">
                      <FileUp className="size-4" aria-hidden />
                      גרירה לכאן או לחיצה לבחירה
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {!selectedTenderId ? "בחרו מכרז לפני העלאה" : null}
                    </span>
                  </>
                )}
              </button>
              <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
                PDF או תמונה — עד 15 קבצים. חומרי המכרז מאוחסנים בענן אחסון ייעודי
                (Object Storage) ומעובדים ברקע כדי לשמור על ביצועי מערכת שיא.
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>מודל אנכי (AI)</CardTitle>
              <CardDescription>
                סיכום מבנה מהמסמכים — גג למעלה, מרתף למטה.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingBundle ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <TenderBuildingVisualization
                  data={tenderDetail?.building_structure_raw_data}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {selectedTenderId ? (
          <Card
            className={cn(
              sectionEnter,
              "delay-100 [animation-delay:100ms] motion-reduce:delay-0 motion-reduce:[animation-delay:0ms]"
            )}
          >
            <CardHeader>
              <CardTitle>מטא-דאטה למכרז</CardTitle>
              <CardDescription>
                מסוכמים אוטומטית מהמסמכים; ניתן לכוונן בשורות הטבלה.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground">שם פרויקט (AI)</span>
                <p className="font-medium">
                  {tenderDetail?.project_name_from_ai?.trim() || "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">תאריך יעד</span>
                <p className="font-medium">
                  {tenderDetail?.tender_date_target?.trim() || "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">יועץ / מהנדס</span>
                <p className="font-medium">
                  {tenderDetail?.consultant_name_from_ai?.trim() || "—"}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {selectedTenderId ? (
          <Card
            className={cn(
              sectionEnter,
              "delay-150 [animation-delay:150ms] motion-reduce:delay-0 motion-reduce:[animation-delay:0ms]"
            )}
          >
            <CardHeader>
              <CardTitle>מסמכים</CardTitle>
              <CardDescription>
                שדות שנחצבו ב-AI — עריכה ידנית ואז &quot;שמור&quot;; לאחר מכן ניתן
                לחשב מחדש את מודל הבניין.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TenderDocumentsTable
                tenderId={selectedTenderId}
                documents={documents}
                pendingRows={pendingDocRows}
                onUpdated={() => void refreshBundle(selectedTenderId)}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
