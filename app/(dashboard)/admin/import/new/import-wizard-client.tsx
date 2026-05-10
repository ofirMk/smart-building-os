"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react"
import { useRouter } from "next/navigation"

import {
  cancelImport,
  commitImport,
  dryRunImport,
  type DryRunResult,
} from "../actions"
import type { ImporterEntityKind } from "@/lib/admin/import/types"

type EntityOption = {
  kind: ImporterEntityKind
  title: string
  description: string
}

type WizardStep = "pick" | "upload" | "preview" | "done"

export function ImportWizardClient({ entities }: { entities: EntityOption[] }) {
  const router = useRouter()
  const [step, setStep] = useState<WizardStep>("pick")
  const [entityKind, setEntityKind] = useState<ImporterEntityKind | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null)
  const [commitOutcome, setCommitOutcome] = useState<{
    inserted: number
    updated: number
    failed: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedEntity = useMemo(
    () => entities.find((e) => e.kind === entityKind) ?? null,
    [entities, entityKind],
  )

  function handleEntityPicked(kind: ImporterEntityKind): void {
    setEntityKind(kind)
    setStep("upload")
    setError(null)
  }

  function handleFileChosen(f: File | null): void {
    setFile(f)
    setError(null)
  }

  async function handleDryRun(): Promise<void> {
    if (!entityKind || !file) return
    setError(null)
    const isXlsx = /\.(xlsx|xlsm)$/i.test(file.name)
    const arrayBuffer = await file.arrayBuffer()
    const fileContent = isXlsx
      ? Buffer.from(arrayBuffer).toString("base64")
      : new TextDecoder("utf-8").decode(arrayBuffer)

    startTransition(async () => {
      try {
        const result = await dryRunImport({
          entityKind,
          fileName: file.name,
          fileSizeBytes: file.size,
          fileContent,
          encoding: isXlsx ? "base64" : "text",
        })
        setDryRun(result)
        setStep("preview")
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  async function handleCommit(): Promise<void> {
    if (!dryRun) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await commitImport(dryRun.jobId)
        setCommitOutcome({
          inserted: result.inserted,
          updated: result.updated,
          failed: result.failed,
        })
        setStep("done")
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  async function handleCancel(): Promise<void> {
    if (!dryRun) {
      setStep("pick")
      setEntityKind(null)
      setFile(null)
      return
    }
    startTransition(async () => {
      try {
        await cancelImport(dryRun.jobId)
        setDryRun(null)
        setStep("upload")
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <Stepper step={step} />

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {step === "pick" && (
        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {entities.map((e) => (
            <button
              key={e.kind}
              type="button"
              onClick={() => handleEntityPicked(e.kind)}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-right transition hover:border-indigo-300 hover:bg-indigo-50"
            >
              <div className="font-semibold text-slate-900">{e.title}</div>
              <div className="mt-1 text-xs text-slate-600">{e.description}</div>
            </button>
          ))}
        </div>
      )}

      {step === "upload" && selectedEntity && (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
            <span className="text-slate-600">ישות נבחרה: </span>
            <span className="font-semibold text-slate-900">
              {selectedEntity.title}
            </span>
          </div>

          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-indigo-300 hover:bg-indigo-50"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-8 text-slate-400" aria-hidden />
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {file ? file.name : "בחרו קובץ CSV או XLSX"}
              </div>
              <div className="text-xs text-slate-600">
                {file
                  ? `${(file.size / 1024).toFixed(1)} KB`
                  : "ניתן לגרור ולשחרר או ללחוץ לבחירה"}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xlsm,.tsv,.txt"
              className="hidden"
              onChange={(e) => handleFileChosen(e.target.files?.[0] ?? null)}
            />
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              חזרה
            </button>
            <button
              type="button"
              onClick={handleDryRun}
              disabled={!file || isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FileSpreadsheet className="size-4" aria-hidden />
              )}
              ניתוח קובץ (dry-run)
            </button>
          </div>
        </div>
      )}

      {step === "preview" && dryRun && (
        <PreviewPane
          dryRun={dryRun}
          entityTitle={selectedEntity?.title ?? ""}
          isPending={isPending}
          onCommit={handleCommit}
          onCancel={handleCancel}
        />
      )}

      {step === "done" && commitOutcome && (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
              <span className="font-semibold text-emerald-900">
                ייבוא הושלם
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
              <Stat label="נוספו" value={commitOutcome.inserted} tone="success" />
              <Stat label="עודכנו" value={commitOutcome.updated} tone="info" />
              <Stat label="נכשלו" value={commitOutcome.failed} tone="error" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => router.push("/admin/import")}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              חזרה לרשימה
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("pick")
                setEntityKind(null)
                setFile(null)
                setDryRun(null)
                setCommitOutcome(null)
              }}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              ייבוא נוסף
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stepper({ step }: { step: WizardStep }) {
  const steps: { key: WizardStep; label: string }[] = [
    { key: "pick", label: "בחירת ישות" },
    { key: "upload", label: "העלאת קובץ" },
    { key: "preview", label: "תצוגה מקדימה" },
    { key: "done", label: "סיום" },
  ]
  const activeIndex = steps.findIndex((s) => s.key === step)
  return (
    <ol className="flex flex-wrap items-center gap-3 text-sm">
      {steps.map((s, i) => {
        const isActive = i === activeIndex
        const isPast = i < activeIndex
        return (
          <li key={s.key} className="flex items-center gap-3">
            <span
              className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${
                isPast
                  ? "bg-emerald-100 text-emerald-700"
                  : isActive
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`font-medium ${
                isActive ? "text-indigo-700" : "text-slate-600"
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="text-slate-300" aria-hidden>
                ←
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function PreviewPane({
  dryRun,
  entityTitle,
  isPending,
  onCommit,
  onCancel,
}: {
  dryRun: DryRunResult
  entityTitle: string
  isPending: boolean
  onCommit: () => void
  onCancel: () => void
}) {
  const blocking =
    dryRun.missingRequiredFields.length > 0 || dryRun.rowsValid === 0
  const previewKeys = dryRun.previewRows.length
    ? Object.keys(dryRun.previewRows[0])
    : []

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="סה״כ שורות" value={dryRun.rowsTotal} />
        <Stat label="תקינות" value={dryRun.rowsValid} tone="success" />
        <Stat label="שגיאות" value={dryRun.rowsError} tone="error" />
        <Stat label="דולגו" value={dryRun.rowsSkipped} tone="info" />
      </div>

      {dryRun.missingRequiredFields.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <div className="flex items-center gap-2">
            <XCircle className="size-4" aria-hidden />
            <span className="font-semibold">חסרות עמודות חובה:</span>
          </div>
          <ul className="mt-1 mr-6 list-disc text-xs">
            {dryRun.missingRequiredFields.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {dryRun.unmappedHeaders.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <span className="font-semibold">עמודות לא ממופות (יתעלמו): </span>
          {dryRun.unmappedHeaders.join(", ")}
        </div>
      )}

      {dryRun.errors.length > 0 && (
        <details className="rounded-lg border border-rose-200 bg-rose-50">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-rose-800">
            שגיאות ברמת שורה ({dryRun.errors.length})
          </summary>
          <ul className="max-h-60 overflow-y-auto px-3 py-2 text-xs text-rose-900">
            {dryRun.errors.slice(0, 200).map((err, idx) => (
              <li key={idx} className="border-t border-rose-100 py-1">
                שורה {err.rowNumber}
                {err.field ? ` · עמודה ${err.field}` : ""}: {err.message}
                {err.rawValue ? ` (ערך: "${err.rawValue}")` : ""}
              </li>
            ))}
            {dryRun.errors.length > 200 && (
              <li className="py-1 text-slate-600">
                + עוד {dryRun.errors.length - 200} שגיאות נוספות
              </li>
            )}
          </ul>
        </details>
      )}

      {previewKeys.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-right uppercase tracking-wide text-slate-500">
              <tr>
                {previewKeys.map((k) => (
                  <th key={k} className="px-3 py-2 font-medium">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dryRun.previewRows.slice(0, 10).map((row, i) => (
                <tr key={i} className="border-t border-slate-100">
                  {previewKeys.map((k) => (
                    <td key={k} className="px-3 py-1.5 text-slate-700">
                      {String(row[k] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
            תצוגה מקדימה של 10 שורות ראשונות מתוך {dryRun.rowsValid} תקינות
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ביטול ({entityTitle})
        </button>
        <button
          type="button"
          onClick={onCommit}
          disabled={blocking || isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <CheckCircle2 className="size-4" aria-hidden />
          )}
          ביצוע ייבוא ({dryRun.rowsValid} שורות)
        </button>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: number
  tone?: "default" | "success" | "error" | "info"
}) {
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : tone === "info"
      ? "border-indigo-200 bg-indigo-50 text-indigo-900"
      : "border-slate-200 bg-slate-50 text-slate-900"
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <div className="text-xs">{label}</div>
      <div className="text-2xl font-bold">{value.toLocaleString("he-IL")}</div>
    </div>
  )
}
