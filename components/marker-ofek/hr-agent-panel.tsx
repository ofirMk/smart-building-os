"use client"

import * as React from "react"
import {
  FileText,
  Files,
  Loader2,
  MessageSquare,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type {
  HrAgentRiskItem,
  HrAgentSuggestions,
} from "@/lib/agents/hr/contract-cited-extractions"
import {
  parseHrAgentDataFromAnalysis,
  parseHrAgentFromStructuredJsonValue,
  stripHrAgentDataBlockFromDisplay,
} from "@/lib/agents/hr/contract-cited-extractions"

function fileKey(f: File, index: number): string {
  return `${index}-${f.name}-${f.size}-${f.lastModified}`
}

/** הודעת שגיאה אחידה — כולל עומס/Timeout (504) */
export const HR_AGENT_DOCUMENT_PROCESSING_ERROR_HE =
  "שגיאה בעיבוד המסמכים. נסה לצמצם את כמות הקבצים או נסה שוב."

function mergeSuggestions(
  prev: HrAgentSuggestions | null,
  next: HrAgentSuggestions | null
): HrAgentSuggestions | null {
  if (!prev) return next
  if (!next) return prev
  return {
    paymentTerms:
      next.paymentTerms.value != null ? next.paymentTerms : prev.paymentTerms,
    retention:
      next.retention.value != null ? next.retention : prev.retention,
    guarantee:
      next.guarantee.value != null ? next.guarantee : prev.guarantee,
    endDate: next.endDate.value != null ? next.endDate : prev.endDate,
  }
}

function dedupeRisks(items: HrAgentRiskItem[]): HrAgentRiskItem[] {
  const seen = new Set<string>()
  const out: HrAgentRiskItem[] = []
  for (const r of items) {
    const k = `${r.title.trim()}|${r.source.trim()}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

function parseRawAnalysis(rawAnalysis: string): {
  cleanAnalysis: string
  suggestions: HrAgentSuggestions | null
  risks: HrAgentRiskItem[]
  contractTypeMismatchMessage: string | null
  backToBackMismatchMessage: string | null
} {
  const raw = rawAnalysis.trim()
  const dataMatch = raw.match(/---DATA---([\s\S]*?)---/)
  let structuredData: unknown = null
  if (dataMatch?.[1]) {
    try {
      structuredData = JSON.parse(dataMatch[1].trim()) as unknown
    } catch (e) {
      console.error("Failed to parse AI data", e)
    }
  }

  let cleanAnalysis = raw.replace(/---DATA---[\s\S]*?---/, "").trim()
  if (cleanAnalysis === raw.trim()) {
    cleanAnalysis = stripHrAgentDataBlockFromDisplay(raw)
  }

  const fromStructured =
    structuredData !== null
      ? parseHrAgentFromStructuredJsonValue(structuredData)
      : {
          suggestions: null as HrAgentSuggestions | null,
          risks: [] as HrAgentRiskItem[],
          contractTypeMismatchMessage: null as string | null,
          backToBackMismatchMessage: null as string | null,
        }
  const fallback = parseHrAgentDataFromAnalysis(raw)
  const suggestions =
    fromStructured.suggestions ?? fallback.suggestions
  const risks =
    fromStructured.risks.length > 0
      ? fromStructured.risks
      : fallback.risks

  const mmFrom =
    fromStructured.contractTypeMismatchMessage?.trim() || null
  const mmFb = fallback.contractTypeMismatchMessage?.trim() || null
  const contractTypeMismatchMessage = mmFrom ?? mmFb

  const b2bFrom =
    fromStructured.backToBackMismatchMessage?.trim() || null
  const b2bFb = fallback.backToBackMismatchMessage?.trim() || null
  const backToBackMismatchMessage = b2bFrom ?? b2bFb

  return {
    cleanAnalysis,
    suggestions,
    risks,
    contractTypeMismatchMessage,
    backToBackMismatchMessage,
  }
}

/** ממיר metadata מהטופס לטקסט הקשר עבור המודל */
function formatMetadataForAgent(meta: Record<string, unknown>): string {
  const lines: string[] = []
  if ("laborOnly" in meta && typeof meta.laborOnly === "boolean") {
    lines.push(
      `סוג התקשרות: ${meta.laborOnly ? "ביצוע בלבד (ללא חומר)" : "חומר + ביצוע"}`
    )
  }
  const paymentModelRaw =
    "paymentModel" in meta && typeof meta.paymentModel === "string"
      ? meta.paymentModel
      : "paymentTerms" in meta && typeof meta.paymentTerms === "string"
        ? meta.paymentTerms
        : null
  if (paymentModelRaw) {
    lines.push(
      `תנאי תשלום נדרשים: ${paymentModelRaw === "btb" ? "גב אל גב מול המזמין" : "שוטף פלוס קבוע"}`
    )
  }
  if ("shoftefPlusDays" in meta) {
    const d = meta.shoftefPlusDays
    const s = d == null ? "" : String(d).trim()
    if (s) lines.push(`שוטף+ (ימים) בטופס: ${s}`)
  }
  if ("trade" in meta) {
    const raw = meta.trade
    const s = raw == null ? "" : String(raw).trim()
    if (s) lines.push(`תחום עבודה: ${s}`)
  }
  if ("contractType" in meta && typeof meta.contractType === "string") {
    const v = meta.contractType.trim()
    const label =
      v === "lump-sum"
        ? "פאושלי / גלובלי"
        : v === "measurement"
          ? "לפי מדידה / כמויות"
          : v
    if (v) lines.push(`סוג חוזה שנבחר בטופס: ${label}`)
  }
  if (
    "parentProjectName" in meta &&
    typeof meta.parentProjectName === "string"
  ) {
    const s = meta.parentProjectName.trim()
    if (s) {
      lines.push(`פרויקט אב / חוזה מזמין (שם במערכת): ${s}`)
      lines.push(
        "השוואה מול חוזה אב: בדוק התאמת גב-אל-גב (תשלום, עיכבון, אחריות) מול מסמכי הקבלן."
      )
    }
  }
  if ("backToBackNotes" in meta && typeof meta.backToBackNotes === "string") {
    const s = meta.backToBackNotes.trim()
    if (s) lines.push(`תקציר / הערות מזמין לגבי חוזה האב:\n${s}`)
  }
  const handled = new Set([
    "laborOnly",
    "paymentTerms",
    "paymentModel",
    "shoftefPlusDays",
    "trade",
    "contractType",
    "parentProjectName",
    "backToBackNotes",
  ])
  for (const [k, v] of Object.entries(meta)) {
    if (handled.has(k)) continue
    if (v === undefined || v === null || v === "") continue
    lines.push(
      `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`
    )
  }
  return lines.join("\n")
}

export type {
  HrAgentRiskItem,
  HrAgentSuggestions,
} from "@/lib/agents/hr/contract-cited-extractions"

export type HRAgentPanelProps = {
  /** מצב ניתוח — נשלח לשרת (client | subcontractor וכו׳) */
  mode?: string
  /** שדות מהטופס — יומרו לטקסט לפני גוף המסמכים */
  metadata?: Record<string, unknown>
  /** טקסט חופשי נוסף (אחרי metadata) */
  extraContext?: string
  /** נקרא כשזוהה בלוק JSON תקין עם suggestions בסוף ניתוח ה-Agent */
  onSuggestionsFound?: (suggestions: HrAgentSuggestions) => void
  /** מערך סיכונים מבלוק ---DATA--- (אם קיים) */
  onRisksFound?: (risks: HrAgentRiskItem[]) => void
  /** טקסט כפתור הניתוח (ברירת מחדל: נתח את כל החבילה) */
  primaryActionLabel?: string
  /**
   * תור קבצים: בקשה נפרדת לכל PDF כדי להפחית עומס ו-Timeout.
   * ברירת מחדל: true כשיש יותר מקובץ אחד; false — שליחה אחת לכל הקבצים.
   */
  queueSequential?: boolean
  /** לא להציג את עמודת „תוצאות ניתוח” (הצגה חיצונית, למשל סרגל סיכונים) */
  hideResultsColumn?: boolean
  /** בסיום ניסיון ניתוח (הצלחה או כישלון) */
  onAnalysisFinished?: (payload: { success: boolean }) => void
  /** סתירה בין סוג החוזה בטופס לבין המסמך (מבלוק JSON) */
  onContractTypeMismatch?: (message: string | null) => void
  /** פערי גב-אל-גב מול חוזה מזמין (מבלוק JSON) */
  onBackToBackMismatch?: (message: string | null) => void
  /**
   * כשמופעל: אם הועלו PDF — שמירה חיצונית מותרת רק אחרי ניתוח מוצלח או לחיצה על „דלג על ניתוח”.
   */
  pdfGateForSave?: boolean
  /** עדכון מצב שער שמירה (למשל השבתת כפתור „שמור חוזה”) */
  onPdfSaveGateSatisfied?: (satisfied: boolean) => void
}

export function HRAgentPanel({
  mode = "client",
  metadata,
  extraContext = "",
  onSuggestionsFound,
  onRisksFound,
  primaryActionLabel = "נתח את כל החבילה",
  queueSequential,
  hideResultsColumn = false,
  onAnalysisFinished,
  onContractTypeMismatch,
  onBackToBackMismatch,
  pdfGateForSave = false,
  onPdfSaveGateSatisfied,
}: HRAgentPanelProps = {}) {
  const [files, setFiles] = React.useState<File[]>([])
  const [loading, setLoading] = React.useState(false)
  const [analysis, setAnalysis] = React.useState<string | null>(null)
  const [queueStep, setQueueStep] = React.useState<string | null>(null)
  const [analysisRunSucceeded, setAnalysisRunSucceeded] =
    React.useState(false)
  const [skippedPdfGate, setSkippedPdfGate] = React.useState(false)

  const filesSignature = React.useMemo(
    () => files.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join("|"),
    [files]
  )

  React.useEffect(() => {
    setAnalysisRunSucceeded(false)
    setSkippedPdfGate(false)
  }, [filesSignature])

  const pdfSaveSatisfied =
    !pdfGateForSave ||
    files.length === 0 ||
    analysisRunSucceeded ||
    skippedPdfGate

  React.useEffect(() => {
    onPdfSaveGateSatisfied?.(pdfSaveSatisfied)
  }, [pdfSaveSatisfied, onPdfSaveGateSatisfied])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (list?.length) {
      const newFiles = Array.from(list)
      setFiles((prev) => [...prev, ...newFiles])
      setAnalysis(null)
    }
    e.target.value = ""
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setAnalysis(null)
  }

  const clearAll = () => {
    setFiles([])
    setAnalysis(null)
  }

  const buildFormData = React.useCallback(
    (batch: File[]) => {
      const formData = new FormData()
      for (const file of batch) {
        formData.append("files", file)
      }
      formData.append(
        "question",
        "נתח את חבילת החוזים הזו. מצא סתירות בין המסמכים, סכם תנאי תשלום וציין סיכונים מהותיים."
      )
      formData.append("contextType", mode)
      const metaBlock =
        metadata && Object.keys(metadata).length > 0
          ? formatMetadataForAgent(metadata)
          : ""
      const trimmedExtra = extraContext.trim()
      const mergedContext = [metaBlock, trimmedExtra]
        .filter(Boolean)
        .join("\n\n")
      if (mergedContext) {
        formData.append("extraContext", mergedContext)
      }
      return formData
    },
    [metadata, extraContext, mode]
  )

  const postAnalyze = React.useCallback(
    async (batch: File[]): Promise<{ ok: true; raw: string } | { ok: false }> => {
      try {
        const response = await fetch("/api/hr/analyze-contract", {
          method: "POST",
          body: buildFormData(batch),
        })
        const data = (await response.json()) as {
          success?: boolean
          analysis?: string
          error?: string
          details?: string
        }
        if (!response.ok) {
          return { ok: false }
        }
        if (typeof data.analysis === "string" && data.analysis.trim()) {
          return { ok: true, raw: data.analysis.trim() }
        }
        return { ok: false }
      } catch {
        return { ok: false }
      }
    },
    [buildFormData]
  )

  const applyParsed = React.useCallback(
    (
      cleanAnalysis: string,
      suggestions: HrAgentSuggestions | null,
      risks: HrAgentRiskItem[],
      contractTypeMismatchMessage: string | null,
      backToBackMismatchMessage: string | null
    ) => {
      setAnalysis(cleanAnalysis)
      if (suggestions) {
        onSuggestionsFound?.(suggestions)
      }
      onRisksFound?.(risks)
      onContractTypeMismatch?.(contractTypeMismatchMessage)
      onBackToBackMismatch?.(backToBackMismatchMessage)
    },
    [
      onSuggestionsFound,
      onRisksFound,
      onContractTypeMismatch,
      onBackToBackMismatch,
    ]
  )

  const runAnalysis = async () => {
    if (files.length === 0) return
    setLoading(true)
    setAnalysis(null)
    setQueueStep(null)
    onRisksFound?.([])
    onContractTypeMismatch?.(null)
    onBackToBackMismatch?.(null)

    const useQueue =
      queueSequential === true ||
      (queueSequential !== false && files.length > 1)

    try {
      if (!useQueue) {
        const result = await postAnalyze(files)
        if (!result.ok) {
          toast.error(HR_AGENT_DOCUMENT_PROCESSING_ERROR_HE)
          onAnalysisFinished?.({ success: false })
          return
        }
        const parsed = parseRawAnalysis(result.raw)
        applyParsed(
          parsed.cleanAnalysis,
          parsed.suggestions,
          parsed.risks,
          parsed.contractTypeMismatchMessage,
          parsed.backToBackMismatchMessage
        )
        setAnalysisRunSucceeded(true)
        toast.success("הניתוח הושלם בהצלחה")
        onAnalysisFinished?.({ success: true })
        return
      }

      let combined = ""
      const allRisks: HrAgentRiskItem[] = []
      let mergedSuggestions: HrAgentSuggestions | null = null
      let mergedMismatch: string | null = null
      let mergedB2b: string | null = null

      for (let i = 0; i < files.length; i++) {
        const file = files[i]!
        setQueueStep(`${i + 1} מתוך ${files.length}`)
        const result = await postAnalyze([file])
        if (!result.ok) {
          toast.error(HR_AGENT_DOCUMENT_PROCESSING_ERROR_HE)
          onAnalysisFinished?.({ success: false })
          return
        }
        const parsed = parseRawAnalysis(result.raw)
        combined += `\n\n─── קובץ ${i + 1}: ${file.name} ───\n\n${parsed.cleanAnalysis}`
        allRisks.push(...parsed.risks)
        mergedSuggestions = mergeSuggestions(mergedSuggestions, parsed.suggestions)
        const mm = parsed.contractTypeMismatchMessage?.trim()
        if (mm) {
          mergedMismatch = mergedMismatch ? `${mergedMismatch} · ${mm}` : mm
        }
        const b2b = parsed.backToBackMismatchMessage?.trim()
        if (b2b) {
          mergedB2b = mergedB2b ? `${mergedB2b} · ${b2b}` : b2b
        }
      }

      const deduped = dedupeRisks(allRisks)
      applyParsed(
        combined.trim(),
        mergedSuggestions,
        deduped,
        mergedMismatch,
        mergedB2b
      )
      setAnalysisRunSucceeded(true)
      toast.success("הניתוח הושלם בהצלחה")
      onAnalysisFinished?.({ success: true })
    } catch (err) {
      console.error(err)
      toast.error(HR_AGENT_DOCUMENT_PROCESSING_ERROR_HE)
      onAnalysisFinished?.({ success: false })
    } finally {
      setLoading(false)
      setQueueStep(null)
    }
  }

  const gridClass = hideResultsColumn
    ? "grid grid-cols-1 gap-8 p-6"
    : "grid grid-cols-1 gap-8 p-6 lg:grid-cols-2"

  return (
    <div className={gridClass} dir="rtl">
      <Card className="border-2 border-dashed border-slate-200 transition-all hover:border-slate-300">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="flex items-center gap-2 text-xl font-light text-slate-800">
            <Files className="h-6 w-6 text-slate-600" aria-hidden />
            חבילת מסמכי פרויקט
          </CardTitle>
          <p className="text-sm font-extralight leading-relaxed text-slate-500">
            העלאת PDF אינה מפעילה ניתוח. לאחר הבחירה לחצו על הכפתור למטה.
            {files.length > 1 ? (
              <>
                {" "}
                קבצים מרובים יעובדו בתור (קובץ-קובץ) כדי להפחית עומס על השרת.
              </>
            ) : null}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-stretch">
          <input
            type="file"
            id="contract-upload-multi"
            className="hidden"
            accept=".pdf,application/pdf"
            multiple
            onChange={handleFileUpload}
          />
          <label
            htmlFor="contract-upload-multi"
            className="flex w-full cursor-pointer flex-col items-center gap-6 py-12 text-slate-500"
          >
            <div className="rounded-full bg-background p-5">
              <Upload className="h-10 w-10 text-slate-500" aria-hidden />
            </div>
            <span className="text-base font-light text-slate-600">
              לחיצה להוספת מסמכי חוזה (פורמט PDF, ניתן לבחור מספר קבצים)
            </span>
          </label>

          {files.length > 0 ? (
            <div className="mb-8 w-full space-y-3">
              {files.map((f, i) => (
                <div
                  key={fileKey(f, i)}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-background/80 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-2 truncate">
                    <FileText
                      className="h-4 w-4 shrink-0 text-slate-500"
                      aria-hidden
                    />
                    <span className="truncate text-sm font-medium text-slate-700">
                      {f.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="shrink-0 text-slate-400 transition-colors hover:text-red-500"
                    aria-label={`הסר ${f.name}`}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {loading && queueStep ? (
            <p className="mb-4 text-center text-sm font-light text-slate-500">
              תור עיבוד: קובץ {queueStep}
            </p>
          ) : null}

          {hideResultsColumn && loading ? (
            <div className="mb-6 flex flex-col items-center gap-3 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" aria-hidden />
              <p className="text-sm font-light">מנתחים את המסמכים…</p>
            </div>
          ) : null}

          <div className="flex w-full flex-wrap gap-3">
            {files.length > 0 ? (
              <>
                <Button
                  type="button"
                  onClick={() => void runAnalysis()}
                  disabled={loading}
                  size="lg"
                  className="min-h-12 flex-1 gap-2 rounded-full bg-slate-900 px-8 text-base font-medium text-white hover:bg-slate-800"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  ) : null}
                  {primaryActionLabel}
                </Button>
                {pdfGateForSave &&
                !analysisRunSucceeded &&
                !skippedPdfGate &&
                !loading ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    className="min-h-12 rounded-full px-6"
                    onClick={() => setSkippedPdfGate(true)}
                  >
                    דלג על ניתוח
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-12 rounded-full px-6"
                  onClick={clearAll}
                  disabled={loading}
                >
                  נקה הכל
                </Button>
              </>
            ) : null}
          </div>
          {pdfGateForSave &&
          files.length > 0 &&
          !pdfSaveSatisfied &&
          !loading ? (
            <p className="mt-4 text-center text-sm font-light text-amber-800">
              יש להריץ ניתוח מסמכים או ללחוץ „דלג על ניתוח” לפני שמירת החוזה.
            </p>
          ) : null}
          {pdfGateForSave && skippedPdfGate && files.length > 0 ? (
            <p className="mt-3 text-center text-xs font-light text-slate-500">
              ניתוח דולג — ניתן לשמור; מומלץ להשלים ניתוח לפני חתימה.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!hideResultsColumn ? (
        <Card className="overflow-hidden border-slate-200 bg-card shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-background">
            <CardTitle className="flex items-center gap-2 text-lg font-light text-slate-800">
              <MessageSquare className="h-5 w-5 text-slate-600" aria-hidden />
              תוצאות ניתוח מסמכים
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[500px] overflow-y-auto p-6">
            {loading ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-400">
                <Loader2 className="h-10 w-10 animate-spin text-slate-500" aria-hidden />
                <p className="text-lg font-light">משווים בין המסמכים…</p>
              </div>
            ) : analysis ? (
              <div className="prose prose-slate max-w-none whitespace-pre-wrap font-sans text-right leading-relaxed text-slate-700">
                {stripHrAgentDataBlockFromDisplay(analysis)}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 font-light italic text-slate-400">
                <p>ממתינים להפעלת הניתוח.</p>
                <p className="text-sm">העלו PDF ולחצו על כפתור הניתוח.</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
