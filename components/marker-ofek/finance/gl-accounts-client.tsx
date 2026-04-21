"use client"

import React, { useCallback, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Columns3,
  Check,
  Trash2,
  Wand2,
} from "lucide-react"
import { toast } from "sonner"

import { GlAccountsTable } from "@/components/marker-ofek/finance/gl-accounts-table"
import { bulkImportGlAccounts } from "@/lib/holden-erp/gl-accounts-import-actions"
import { deleteAllGlAccounts } from "@/lib/holden-erp/gl-accounts-actions"
import type { GlAccountImportInput } from "@/lib/marker-ofek/erp-validation-schemas"
import type { GlAccountRow } from "@/types/holden-finance"

export type GlAccountsClientProps = {
  embedded?: boolean
  initialAccounts?: GlAccountRow[]
  loadError?: string | null
}

type MappingKey =
  | "account_code"
  | "account_name_he"
  | "account_name_en"
  | "trial_balance_group"
  | "financial_statement_category"
  | "is_active"

const MAPPING_FIELDS: {
  key: MappingKey
  label: string
  description: string
  required: boolean
}[] = [
  {
    key: "account_code",
    label: "קוד חשבון",
    description: "מזהה ייחודי של החשבון בכרטסת",
    required: true,
  },
  {
    key: "account_name_he",
    label: "שם חשבון (עברית)",
    description: "תיאור בעברית",
    required: true,
  },
  {
    key: "account_name_en",
    label: "שם חשבון (אנגלית)",
    description: "אופציונלי — יכול להישאר ריק",
    required: false,
  },
  {
    key: "trial_balance_group",
    label: "קבוצת מאזן בוחן",
    description:
      "אופציונלי — בייבוא Priority היררכיה נגזרת מקוד החשבון (* / **)",
    required: false,
  },
  {
    key: "financial_statement_category",
    label: "קטגוריית דוח כספי",
    description:
      "אופציונלי — בייבוא Priority היררכיה נגזרת מקוד החשבון (* / **)",
    required: false,
  },
  {
    key: "is_active",
    label: "סטטוס פעיל",
    description: "אופציונלי — אם אין עמודה, יסומן פעיל",
    required: false,
  },
]

function parseCsvLines(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split("\n").filter((row) => row.trim().length > 0)
  if (lines.length < 1) return { headers: [], rows: [] }
  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""))
  const rows: string[][] = []
  for (let i = 1; i < lines.length; i++) {
    rows.push(lines[i].split(",").map((v) => v.trim().replace(/"/g, "")))
  }
  return { headers, rows }
}

const SMART_KEYWORDS: Record<
  Exclude<
    MappingKey,
    "trial_balance_group" | "financial_statement_category"
  >,
  string[]
> = {
  account_code: ["קוד", "סעיף", "סדר", "מפתח", "מספר", "חשבון"],
  account_name_he: ["שם", "כותרת", "תיאור", "פרטים", "חשבון", "hebrew"],
  account_name_en: ["אנגלית", "english", "en", "לועזי"],
  is_active: ["פעיל", "active", "סטטוס", "status", "is_active"],
}

function normalizeHeaderToken(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/["'`־״׳.,;:\-_/()[\]{}]/g, "")
}

function headerMatchesKeyword(
  raw: string,
  headerNorm: string,
  keyword: string
): boolean {
  const kn = normalizeHeaderToken(keyword)
  if (!kn) return false
  if (kn === "en") {
    return /\ben\b/i.test(raw) || headerNorm === "en"
  }
  if (headerNorm === kn) return true
  return headerNorm.includes(kn)
}

function pickColumnForKeywords(
  headers: string[],
  keywords: string[],
  used: Set<string>
): string {
  const sortedKw = [...keywords].sort(
    (a, b) => normalizeHeaderToken(b).length - normalizeHeaderToken(a).length
  )
  for (const raw of headers) {
    if (used.has(raw)) continue
    const n = normalizeHeaderToken(raw)
    for (const kw of keywords) {
      const kn = normalizeHeaderToken(kw)
      if (kn && n === kn) {
        used.add(raw)
        return raw
      }
    }
  }
  for (const raw of headers) {
    if (used.has(raw)) continue
    const n = normalizeHeaderToken(raw)
    for (const kw of sortedKw) {
      if (headerMatchesKeyword(raw, n, kw)) {
        used.add(raw)
        return raw
      }
    }
  }
  return ""
}

function computeSmartMapping(headers: string[]): Record<MappingKey, string> {
  const used = new Set<string>()
  const account_code = pickColumnForKeywords(
    headers,
    SMART_KEYWORDS.account_code,
    used
  )
  const account_name_he = pickColumnForKeywords(
    headers,
    SMART_KEYWORDS.account_name_he,
    used
  )
  const account_name_en = pickColumnForKeywords(
    headers,
    SMART_KEYWORDS.account_name_en,
    used
  )
  const is_active = pickColumnForKeywords(
    headers,
    SMART_KEYWORDS.is_active,
    used
  )
  return {
    account_code,
    account_name_he,
    account_name_en,
    trial_balance_group: "",
    financial_statement_category: "",
    is_active,
  }
}

function colIndex(headers: string[], selectedHeader: string): number {
  if (!selectedHeader) return -1
  return headers.findIndex((x) => x === selectedHeader)
}

function parseBoolCell(raw: string | undefined): boolean {
  if (raw == null || raw === "") return true
  const s = raw.trim().toLowerCase()
  if (s === "false" || s === "0" || s === "no" || s === "לא" || s === "inactive")
    return false
  return true
}

function buildPreviewFromMapping(
  headers: string[],
  rows: string[][],
  mapping: Record<MappingKey, string>
): GlAccountImportInput[] {
  const out: GlAccountImportInput[] = []
  const ix = (k: MappingKey) => colIndex(headers, mapping[k] ?? "")

  const iCode = ix("account_code")
  const iHe = ix("account_name_he")
  const iEn = ix("account_name_en")
  const iAct = ix("is_active")

  let currentCategory = ""
  let currentGroup = ""

  for (const vals of rows) {
    if (vals.length !== headers.length) continue

    const account_code = (iCode >= 0 ? vals[iCode] : "")?.trim() ?? ""
    const account_name_he = (iHe >= 0 ? vals[iHe] : "")?.trim() ?? ""
    const account_name_en = (iEn >= 0 ? vals[iEn] : "")?.trim() ?? ""
    const is_active =
      iAct >= 0 ? parseBoolCell(vals[iAct]) : true

    if (!account_code && !account_name_he) continue

    if (account_code.includes("**")) {
      currentCategory = account_name_he
      continue
    }

    if (account_code.includes("*") && !account_code.includes("**")) {
      currentGroup = account_name_he
      continue
    }

    const trial_balance_group = currentGroup || "כללי"
    const financial_statement_category = currentCategory || "כללי"

    out.push({
      account_code,
      account_name_he,
      account_name_en,
      trial_balance_group,
      financial_statement_category,
      is_active,
    })
  }
  return out
}

export function GlAccountsClient({
  embedded = true,
  initialAccounts = [],
  loadError,
}: GlAccountsClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [previewData, setPreviewData] = useState<GlAccountImportInput[]>([])
  const [importStats, setImportStats] = useState<{
    success?: number
    errors?: string[]
  } | null>(null)

  const [csvHeaders, setCsvHeaders] = useState<string[] | null>(null)
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [columnMapping, setColumnMapping] = useState<Record<MappingKey, string>>(
    () => ({
      account_code: "",
      account_name_he: "",
      account_name_en: "",
      trial_balance_group: "",
      financial_statement_category: "",
      is_active: "",
    })
  )
  const [mappingConfirmed, setMappingConfirmed] = useState(false)

  const resetCsvState = useCallback(() => {
    setCsvHeaders(null)
    setCsvRows([])
    setColumnMapping({
      account_code: "",
      account_name_he: "",
      account_name_en: "",
      trial_balance_group: "",
      financial_statement_category: "",
      is_active: "",
    })
    setMappingConfirmed(false)
    setPreviewData([])
    setImportStats(null)
  }, [])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const { headers, rows } = parseCsvLines(text)
      if (headers.length === 0) {
        toast.error("לא נמצאו עמודות בקובץ")
        return
      }
      if (rows.length === 0) {
        toast.error("הקובץ אינו מכיל שורות נתונים")
        return
      }

      setCsvHeaders(headers)
      setCsvRows(rows)
      setMappingConfirmed(false)
      setPreviewData([])
      setImportStats(null)
      setColumnMapping(computeSmartMapping(headers))
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  const handleConfirmMapping = () => {
    if (!csvHeaders) return

    const requiredOk = MAPPING_FIELDS.filter((f) => f.required).every((f) => {
      const v = columnMapping[f.key]
      return v && csvHeaders.includes(v)
    })

    if (!requiredOk) {
      toast.error("נא למפות את כל השדות החובה לעמודה בקובץ")
      return
    }

    const data = buildPreviewFromMapping(csvHeaders, csvRows, columnMapping)
    if (data.length === 0) {
      toast.error("לא נוצרו שורות תקינות — בדקו את המיפוי ואת תוכן הקובץ")
      return
    }

    setPreviewData(data)
    setMappingConfirmed(true)
  }

  const handleImport = () => {
    if (previewData.length === 0) return

    startTransition(async () => {
      const result = await bulkImportGlAccounts(previewData)
      if (result.success) {
        toast.success(`יובאו בהצלחה ${result.count} חשבונות`)
        setImportStats({
          success: result.count,
          errors: result.errors,
        })
        setPreviewData([])
        resetCsvState()
        router.refresh()
      } else {
        toast.error(result.error)
        setImportStats({
          errors: result.details ?? [result.error],
        })
      }
    })
  }

  const handleSmartMapping = useCallback(() => {
    if (!csvHeaders?.length) return
    setColumnMapping(computeSmartMapping(csvHeaders))
    toast.success("הוחל מיפוי חכם לפי כותרות הקובץ")
  }, [csvHeaders])

  const handleWipeData = () => {
    if (
      window.confirm(
        "האם אתה בטוח שברצונך למחוק את כל נתוני הכרטסת הראשית? פעולה זו אינה הפיכה!"
      )
    ) {
      startTransition(async () => {
        const result = await deleteAllGlAccounts()
        if (result.success) {
          toast.success(
            "הכרטסת נוקתה בהצלחה. כעת ניתן לייבא נתונים מחדש."
          )
          router.refresh()
        } else {
          toast.error(result.error || "שגיאה במחיקת הנתונים")
        }
      })
    }
  }

  const showDropzone = !csvHeaders
  const showMapper = csvHeaders && !mappingConfirmed
  const showPreview = mappingConfirmed && previewData.length >= 0

  const importCard = (
    <div className="rounded-xl border border-slate-200 bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2 border-b border-slate-100 pb-4">
        <button
          type="button"
          onClick={handleWipeData}
          disabled={isPending}
          className="flex items-center gap-2 rounded-md border border-red-200 bg-card px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          נקה כרטסת (מחיקת כל הנתונים)
        </button>
      </div>
      <div
        className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-background p-10 transition-colors ${
          showDropzone
            ? "hover:bg-slate-100"
            : "border-slate-200/80 bg-background/50"
        }`}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileUpload}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          disabled={isPending}
        />
        <FileSpreadsheet className="mb-4 h-12 w-12 text-slate-400" />
        <h3 className="text-lg font-medium text-slate-700">
          {showDropzone ? "העלאת קובץ כרטסת (CSV)" : "הקובץ נטען — המשיכו למיפוי עמודות"}
        </h3>
        <p className="mt-1 text-center text-sm text-slate-500">
          {showDropzone
            ? "גרור לכאן או לחץ לבחירת קובץ"
            : "ניתן להעלות קובץ אחר אחרי סיום המיפוי או לאפס"}
        </p>
        {!showDropzone ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              resetCsvState()
            }}
            className="relative z-20 mt-3 text-xs font-medium text-blue-600 underline hover:text-blue-800"
          >
            נקה והעלה קובץ מחדש
          </button>
        ) : null}
      </div>

      {showMapper && csvHeaders ? (
        <div className="mt-8 space-y-4 rounded-lg border border-slate-200 bg-background/80 p-4">
          <div className="flex w-full flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
            <button
              type="button"
              onClick={handleSmartMapping}
              className="flex items-center gap-1.5 rounded border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
            >
              <Wand2 className="h-3.5 w-3.5" />
              מיפוי אוטומטי (AI)
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Columns3 className="h-5 w-5 shrink-0 text-slate-600" />
              <div className="min-w-0">
                <h4 className="font-semibold text-slate-800">
                  מיפוי עמודות
                </h4>
                <p className="text-xs text-slate-500">
                  קשרו כל שדה במערכת לעמודה המתאימה בקובץ (שורת כותרות:{" "}
                  {csvHeaders.join(" · ")})
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {MAPPING_FIELDS.map((field) => (
              <label
                key={field.key}
                className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-card p-3"
              >
                <span className="text-sm font-medium text-slate-800">
                  {field.label}
                  {field.required ? (
                    <span className="text-red-500"> *</span>
                  ) : null}
                </span>
                <span className="text-[11px] text-slate-500">{field.description}</span>
                <select
                  value={columnMapping[field.key]}
                  onChange={(e) =>
                    setColumnMapping((m) => ({
                      ...m,
                      [field.key]: e.target.value,
                    }))
                  }
                  className="mt-1 rounded-md border border-slate-300 bg-card py-2 ps-3 pe-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">
                    {field.required ? "— בחר עמודה —" : "— ללא (ברירת מחדל) —"}
                  </option>
                  {csvHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleConfirmMapping}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Check className="h-4 w-4" />
              אשר מיפוי והצג תצוגה מקדימה
            </button>
          </div>
        </div>
      ) : null}

      {showPreview && previewData.length > 0 ? (
        <div className="mt-8 space-y-4">
          <div className="flex flex-col justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4 sm:flex-row sm:items-center">
            <span className="font-medium text-blue-800">
              זוהו {previewData.length} שורות בקובץ (יימסרו לוולידציה בשרת)
            </span>
            <button
              type="button"
              onClick={handleImport}
              disabled={isPending}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              בצע ייבוא למערכת
            </button>
          </div>

          <div className="max-h-96 overflow-x-auto overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 bg-background shadow-sm">
                <tr>
                  <th className="p-3 font-medium text-slate-600">
                    קוד
                  </th>
                  <th className="p-3 font-medium text-slate-600">
                    שם חשבון
                  </th>
                  <th className="p-3 font-medium text-slate-600">
                    קבוצת מאזן
                  </th>
                  <th className="p-3 font-medium text-slate-600">
                    קטגוריית דוח
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewData.slice(0, 10).map((row, i) => (
                  <tr key={i} className="hover:bg-background">
                    <td className="p-3 font-mono text-foreground">
                      {row.account_code}
                    </td>
                    <td className="p-3 text-slate-700">
                      {row.account_name_he}
                    </td>
                    <td className="p-3 text-slate-600">
                      {row.trial_balance_group}
                    </td>
                    <td className="p-3 text-slate-600">
                      {row.financial_statement_category}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previewData.length > 10 ? (
              <div className="border-t border-slate-100 bg-background p-3 text-center text-slate-500">
                מציג 10 שורות ראשונות מתוך {previewData.length}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {mappingConfirmed && previewData.length === 0 ? (
        <p className="mt-4 text-center text-sm text-amber-700">
          לא נוצרו שורות לתצוגה — חזרו למיפוי או העלו קובץ אחר.
        </p>
      ) : null}

      {importStats ? (
        <div className="mt-6 space-y-4">
          {importStats.success !== undefined ? (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span className="font-medium">
                הייבוא הושלם! {importStats.success} חשבונות עודכנו במסד הנתונים.
              </span>
            </div>
          ) : null}
          {importStats.errors && importStats.errors.length > 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>שגיאות:</span>
              </div>
              <ul className="max-h-40 list-inside list-disc space-y-1 overflow-y-auto pr-6 text-sm">
                {importStats.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  if (embedded) {
    return importCard
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
        <BookOpen className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            כרטסת ראשית (Chart of Accounts)
          </h1>
          <p className="text-slate-500">
            ניהול עץ החשבונות וייבוא סעיפי מאזן מקובץ CSV
          </p>
        </div>
      </div>

      {loadError ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="alert"
        >
          לא ניתן לטעון את רשימת החשבונות: {loadError}
        </div>
      ) : null}

      <GlAccountsTable initialAccounts={initialAccounts} />

      {importCard}
    </div>
  )
}
