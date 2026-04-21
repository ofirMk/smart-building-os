"use client"

import Link from "next/link"
import * as React from "react"
import { Controller, useForm, useFormState } from "react-hook-form"

import { MARKER_OFEK_HREFS } from "@/lib/infrastructure/navigation/sidebar-routes"
import {
  importBaselineBillAI,
  saveAiBaseline,
} from "../actions/project-ai-actions"
import {
  BarChart3,
  FileText,
  FileSpreadsheet,
  FolderOpen,
  LayoutList,
  Loader2,
  MessageCircleQuestion,
  ShoppingCart,
  Sparkles,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import * as XLSX from "xlsx-js-style"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"
import type {
  MarkerOfekProjectDocumentRow,
  MarkerOfekProjectRow,
  PartialBillBaselineAIExtract,
} from "@/types/marker-ofek"
import { ProjectDocumentsVaultExplorer } from "@/components/marker-ofek/projects/project-documents-vault-explorer"
import { ProjectGanttLaunchDialog } from "@/components/marker-ofek/projects/project-gantt-launch-dialog"

const PROJECT_DOCS_BUCKET =
  process.env.NEXT_PUBLIC_PROJECT_DOCUMENTS_BUCKET?.trim() ||
  "project_documents"

type ContractBrief = {
  id: string
  contract_type: string
  status: string
  total_amount: number | null
  entities: { name: string } | { name: string }[] | null
}

type BaselineFormValues = {
  contract_id: string
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function sanitizeFileName(name: string): string {
  const t = name.trim().replace(/[^\w.\u0590-\u05FF-]+/g, "_")
  return t.slice(0, 180) || "document"
}

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function baselineContractSelectLabel(c: ContractBrief): string {
  const ent = embedOne(c.entities)
  const amt =
    c.total_amount != null
      ? currencyFormatter.format(Number(c.total_amount))
      : "—"
  return `${ent?.name?.trim() || "ישות"} · ${c.contract_type} · ${amt}`
}

type BaselinePreviewFormat = "currency" | "percent" | "index" | "text" | "int"

const BASELINE_PREVIEW_FIELDS: {
  key: Exclude<keyof PartialBillBaselineAIExtract, "items">
  label: string
  format: BaselinePreviewFormat
}[] = [
  { key: "bill_number", label: "מספר חשבון", format: "int" },
  { key: "bill_month", label: "חודש חשבון", format: "text" },
  { key: "base_index", label: "מדד בסיס", format: "index" },
  { key: "current_index", label: "מדד נוכחי", format: "index" },
  {
    key: "cumulative_work_value",
    label: "סה״כ מצטבר (לפני מדד וקיזוזים)",
    format: "currency",
  },
  {
    key: "indexation_amount",
    label: "הצמדה / תוספת התייקרות",
    format: "currency",
  },
  { key: "retention_percent", label: "אחוז עכבון", format: "percent" },
  { key: "retention_amount", label: "סכום עכבון", format: "currency" },
  { key: "insurance_amount", label: "ביטוח", format: "currency" },
  { key: "testing_amount", label: "בדיקות", format: "currency" },
  {
    key: "subcontractor_deductions",
    label: "קיזוזים / חיובים אחרים",
    format: "currency",
  },
  {
    key: "total_approved",
    label: "סה״כ לתשלום בחשבון (נטו)",
    format: "currency",
  },
  {
    key: "glAccountCode",
    label: "חשבון הנה״ח (סיווג AI)",
    format: "text",
  },
]

function formatBaselineCell(
  value: number | string,
  format: BaselinePreviewFormat,
  ils: Intl.NumberFormat,
  idx: Intl.NumberFormat
): string {
  switch (format) {
    case "currency":
      return ils.format(Number(value) || 0)
    case "percent":
      return `${Number(value).toLocaleString("he-IL", {
        maximumFractionDigits: 2,
      })}%`
    case "index":
      return idx.format(Number(value) || 0)
    case "int":
      return String(Math.round(Number(value) || 0))
    case "text":
    default: {
      const s = String(value ?? "").trim()
      return s.length > 0 ? s : "—"
    }
  }
}

function asRowNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function makeFileSafePart(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function BaselineBillDataPreview({
  data,
  projectName,
}: {
  data: PartialBillBaselineAIExtract
  projectName: string
}) {
  const indexFmt = new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const ils = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const exportRows = React.useMemo(() => {
    return data.items.map((row) => {
      const previousPercent = asRowNumber(
        (row as { previous_percent?: unknown }).previous_percent ??
          row.cumulative_execution_percent
      )
      const currentPerformance = asRowNumber(
        (row as { current_performance?: unknown }).current_performance
      )
      const totalAccumulated = asRowNumber(
        (row as { total_accumulated?: unknown }).total_accumulated ??
          previousPercent + currentPerformance
      )
      const isOverBudget =
        totalAccumulated > 100 ||
        String((row as { alert?: unknown }).alert ?? "")
          .trim()
          .toUpperCase() === "OVER_BUDGET"

      return {
        itemId:
          String((row as { item_id?: unknown }).item_id ?? "").trim() ||
          row.section_number ||
          "—",
        description: row.description || "",
        previousPercent,
        currentPerformance,
        totalAccumulated,
        status: isOverBudget ? "OVER_BUDGET" : "OK",
      }
    })
  }, [data.items])

  function exportToExcel() {
    const headers = [
      "Item ID",
      "Description",
      "Previous %",
      "Current %",
      "Total %",
      "Status",
    ]

    const rows = exportRows.map((row) => [
      row.itemId,
      row.description,
      row.previousPercent / 100,
      row.currentPerformance / 100,
      row.totalAccumulated / 100,
      row.status,
    ])
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])

    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFFFF" } },
      fill: { fgColor: { rgb: "1F2937" } },
      alignment: { horizontal: "center", vertical: "center" },
    }
    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c })
      const cell = worksheet[addr]
      if (cell) cell.s = headerStyle
    }

    const totalPercentColumnIndex = 4 // E
    for (let r = 1; r < rows.length + 1; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: totalPercentColumnIndex })
      const cell = worksheet[addr]
      if (!cell) continue
      cell.s = {
        ...(cell.s ?? ({} as object)),
        font: {
          ...((cell.s as { font?: Record<string, unknown> } | undefined)?.font ??
            {}),
          bold: true,
        },
        alignment: { horizontal: "center" },
      }
    }

    // אחידות פורמט לאחוזים: Previous / Current / Total
    for (let r = 1; r < rows.length + 1; r++) {
      for (const c of [2, 3, 4]) {
        const addr = XLSX.utils.encode_cell({ r, c })
        const cell = worksheet[addr]
        if (!cell) continue
        cell.s = {
          ...(cell.s ?? ({} as object)),
          numFmt: "0.00%",
          alignment: { horizontal: "center" },
        }
      }
    }

    for (let r = 1; r < rows.length + 1; r++) {
      const status = String(rows[r - 1]?.[5] ?? "")
      if (status !== "OVER_BUDGET") continue
      for (let c = 0; c < headers.length; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        const cell = worksheet[addr]
        if (!cell) continue
        const isStatusCol = c === 5
        cell.s = {
          ...(cell.s ?? ({} as object)),
          fill: { fgColor: { rgb: isStatusCol ? "991B1B" : "FEE2E2" } },
          font: {
            ...((cell.s as { font?: Record<string, unknown> } | undefined)
              ?.font ?? {}),
            color: { rgb: isStatusCol ? "FFFFFF" : "991B1B" },
            bold: isStatusCol ? true : undefined,
          },
          alignment: isStatusCol ? { horizontal: "center" } : cell.s?.alignment,
        }
      }
    }

    worksheet["!cols"] = [
      { wch: 14 },
      { wch: 48 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 16 },
    ]
    worksheet["!autofilter"] = {
      ref: `A1:F${rows.length + 1}`,
    }
    worksheet["!rows"] = [{ hpt: 22 }]
    worksheet["!freeze"] = {
      xSplit: 0,
      ySplit: 1,
      topLeftCell: "A2",
      activePane: "bottomLeft",
      state: "frozen",
    }

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Invoice Tracking")

    const now = new Date()
    const day = String(now.getDate()).padStart(2, "0")
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const year = String(now.getFullYear())
    const projectLabel = makeFileSafePart(projectName || "project")
    const accountNo =
      Number.isFinite(Number(data.bill_number)) && Number(data.bill_number) > 0
        ? Math.round(Number(data.bill_number))
        : "unknown"
    const filename = `${projectLabel}-חשבון-${accountNo}-${day}-${month}-${year}.xlsx`

    XLSX.writeFile(workbook, filename, { compression: true })
    toast.success("הקובץ יוצא לאקסל בהצלחה")
  }

  function exportToPDF() {
    const printableRows = exportRows
      .map(
        (row) => `
          <tr class="${row.status === "OVER_BUDGET" ? "warn-row" : ""}">
            <td>${escapeHtml(row.itemId)}</td>
            <td>${escapeHtml(row.description)}</td>
            <td>${row.previousPercent}%</td>
            <td>${row.currentPerformance}%</td>
            <td>${row.totalAccumulated}%${row.status === "OVER_BUDGET" ? ' <strong>(חריגה)</strong>' : ""}</td>
          </tr>
        `
      )
      .join("")

    const html = `
      <!doctype html>
      <html lang="he" dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>דוח חשבון חלקי</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { font-size: 20px; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: right; }
            th { background: #f3f4f6; }
            .warn-row { background: #fee2e2; color: #991b1b; font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>דוח חשבון חלקי ${data.bill_number ? `#${data.bill_number}` : ""}</h1>
          <table>
            <thead>
              <tr>
                <th>סעיף</th>
                <th>תיאור</th>
                <th>אחוז קודם</th>
                <th>ביצוע נוכחי</th>
                <th>מצטבר סופי</th>
              </tr>
            </thead>
            <tbody>${printableRows}</tbody>
          </table>
        </body>
      </html>
    `

    const win = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768")
    if (!win) {
      toast.error("לא ניתן לפתוח חלון להפקת PDF")
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <div
      className="rounded-xl border border-cyan-500/25 bg-gradient-to-br from-cyan-950/30 via-background to-background p-3 shadow-inner"
      dir="rtl"
    >
      <h3 className="mb-4 text-sm font-semibold text-cyan-200/90">
        תצוגה מקדימה של נתוני החשבון
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {BASELINE_PREVIEW_FIELDS.map(({ key, label, format }) => (
          <div
            key={key}
            className="rounded-lg border border-border/60 bg-card/80 px-3 py-2.5 shadow-sm backdrop-blur-sm"
          >
            <p className="text-xs leading-snug text-muted-foreground">{label}</p>
            <p className="mt-1 text-base font-semibold tracking-tight text-foreground tabular-nums">
              {formatBaselineCell(data[key], format, ils, indexFmt)}
            </p>
          </div>
        ))}
      </div>
      {data.items && data.items.length > 0 ? (
        <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-border/60 bg-card/60 p-3 text-xs">
          <p className="mb-2 font-semibold text-foreground">
            שורות סעיפים (items) — {data.items.length}
          </p>
          <div className="mb-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={exportToExcel}
              className="inline-flex items-center gap-2 rounded bg-green-700 px-4 py-2 text-white transition-colors hover:bg-green-800"
            >
              <FileSpreadsheet className="size-5" aria-hidden />
              ייצוא לאקסל
            </button>
            <button
              type="button"
              onClick={exportToPDF}
              className="inline-flex items-center gap-2 rounded bg-red-700 px-4 py-2 text-white transition-colors hover:bg-red-800"
            >
              <FileText className="size-5" aria-hidden />
              ייצוא ל-PDF
            </button>
          </div>
          <table className="w-full border-collapse text-start text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="px-3 py-2 font-medium">סעיף</th>
                <th className="px-3 py-2 font-medium">תיאור</th>
                <th className="px-3 py-2 font-medium">אחוז קודם</th>
                <th className="px-3 py-2 font-medium">ביצוע נוכחי</th>
                <th className="px-3 py-2 font-medium">מצטבר סופי</th>
              </tr>
            </thead>
            <tbody>
              {data.items.slice(0, 40).map((row, i) => {
                const previousPercent = asRowNumber(
                  (row as { previous_percent?: unknown }).previous_percent ??
                    row.cumulative_execution_percent
                )
                const currentPerformance = asRowNumber(
                  (row as { current_performance?: unknown }).current_performance
                )
                const totalAccumulated = asRowNumber(
                  (row as { total_accumulated?: unknown }).total_accumulated ??
                    previousPercent + currentPerformance
                )
                const isOverBudget =
                  totalAccumulated > 100 ||
                  String((row as { alert?: unknown }).alert ?? "")
                    .trim()
                    .toUpperCase() === "OVER_BUDGET"

                return (
                  <tr
                    key={`${row.section_number}-${i}`}
                    className={`border-b border-border/40 ${isOverBudget ? "bg-red-500/10" : "bg-card/30"}`}
                  >
                    <td className="px-3 py-2 font-currency-mono text-[11px] text-muted-foreground tabular-nums">
                      {row.section_number || "—"}
                    </td>
                    <td className="max-w-[20rem] px-3 py-2 font-medium">
                      {row.description.slice(0, 140)}
                    </td>
                    <td className="bg-muted/35 px-3 py-2 text-muted-foreground tabular-nums">
                      {previousPercent.toLocaleString("he-IL", {
                        maximumFractionDigits: 2,
                      })}
                      %
                    </td>
                    <td className="px-3 py-2 font-bold text-primary tabular-nums">
                      {currentPerformance.toLocaleString("he-IL", {
                        maximumFractionDigits: 2,
                      })}
                      %
                    </td>
                    <td
                      className={`px-3 py-2 font-black tabular-nums ${isOverBudget ? "text-red-600" : "text-emerald-600"}`}
                    >
                      {totalAccumulated.toLocaleString("he-IL", {
                        maximumFractionDigits: 2,
                      })}
                      %
                      {isOverBudget ? (
                        <span className="ms-2 inline-flex items-center text-[11px] font-semibold text-red-700">
                          חריגה
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {data.items.length > 40 ? (
            <p className="mt-2 text-muted-foreground">
              … ועוד {data.items.length - 40} שורות
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-amber-600">
          לא חולצו שורות טבלה (items ריק) — נסו PDF עם כתב כמויות ברור.
        </p>
      )}
    </div>
  )
}

export function MarkerOfekProjectHubClient({
  project,
  contracts,
  documents: initialDocuments,
  tenderDisplay,
}: {
  project: MarkerOfekProjectRow
  contracts: ContractBrief[]
  documents: MarkerOfekProjectDocumentRow[]
  tenderDisplay: string | null
}) {
  const [documents, setDocuments] =
    React.useState<MarkerOfekProjectDocumentRow[]>(initialDocuments)
  const [uploading, setUploading] = React.useState(false)
  const [vaultDocumentKind, setVaultDocumentKind] = React.useState("תוכניות")
  const [baselinePreview, setBaselinePreview] =
    React.useState<PartialBillBaselineAIExtract | null>(null)
  const [baselineScanPending, startBaselineScanTransition] =
    React.useTransition()
  const baselinePdfInputRef = React.useRef<HTMLInputElement>(null)

  const baselineForm = useForm<BaselineFormValues>({
    defaultValues: { contract_id: "" },
    mode: "onChange",
  })

  const { errors: baselineFormErrors, isSubmitting: baselineFormSubmitting } =
    useFormState({ control: baselineForm.control })

  const selectedContractId = baselineForm.watch("contract_id") ?? ""
  const selectedContractLabel = React.useMemo(() => {
    const row = contracts.find((contract) => contract.id === selectedContractId.trim())
    return row ? baselineContractSelectLabel(row) : ""
  }, [contracts, selectedContractId])
  const baselineItems = baselinePreview?.items ?? []
  const baselineSubmitDisabled =
    !selectedContractId.trim() ||
    baselineItems.length === 0 ||
    baselineFormSubmitting

  function runBaselineBillAi() {
    const file = baselinePdfInputRef.current?.files?.[0]
    if (!file) {
      toast.error("נא לבחור קובץ PDF")
      return
    }
    const fd = new FormData()
    fd.set("project_id", project.id)
    fd.set("baseline_pdf", file)

    startBaselineScanTransition(async () => {
      try {
        const res = await importBaselineBillAI(fd)
        if (res.ok) {
          setBaselinePreview(res.data)
          toast.success("הנתונים חולצו מהמסמך")
        } else {
          toast.error(res.error)
        }
      } catch (e) {
        toast.error(formatError(e))
      }
    })
  }

  const onBaselineSubmit = baselineForm.handleSubmit(
    async (data) => {
      if (!baselinePreview) {
        toast.error("אין נתונים לשמירה — הריצו קודם סריקת AI")
        return
      }
      const cid = data.contract_id.trim()
      if (!cid) {
        alert("אנא בחר חוזה מהרשימה")
        return
      }
      if ((baselinePreview.items?.length ?? 0) < 1) {
        toast.error("חובה לפחות שורת BoQ אחת מהסריקה")
        return
      }
      if (
        !window.confirm(
          "אזהרה: פעולה זו תייצר את סעיפי כתב הכמויות בחוזה ותקבע את המצטבר הנוכחי כנקודת האפס להמשך התחשבנות. האם להמשיך?"
        )
      ) {
        return
      }

      const { items, ...summary } = baselinePreview

      try {
        const res = await saveAiBaseline({
          projectId: project.id,
          contractId: cid,
          items,
          summary: summary as Record<string, unknown>,
        })
        if (!res.ok) {
          alert("שגיאה בשמירה: " + res.error)
          return
        }
        toast.success("הבסיס נשמר כדוח מאושר — ישמש למילוי אוטומטי בדיווח הבא")
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : formatError(error)
        alert("שגיאה בשמירה: " + msg)
      }
    },
    (errors) => console.error("FORM_VALIDATION_ERRORS:", errors)
  )

  async function onVaultFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    setUploading(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const path = `${project.id}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`
      const { error: upErr } = await supabase.storage
        .from(PROJECT_DOCS_BUCKET)
        .upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        })
      if (upErr) throw upErr

      const versionGroupId = crypto.randomUUID()
      const { data: row, error: insErr } = await supabase
        .from("project_documents")
        .insert({
          project_id: project.id,
          file_path: path,
          title: file.name,
          mime_type: file.type || null,
          document_kind: vaultDocumentKind,
          version_group_id: versionGroupId,
          version_number: 1,
          is_current: true,
        })
        .select(
          "id, project_id, title, file_path, document_kind, mime_type, created_at, version_group_id, version_number, is_current, parent_document_id"
        )
        .single()

      if (insErr) throw insErr
      if (row) {
        setDocuments((prev) => [row as MarkerOfekProjectDocumentRow, ...prev])
        toast.success("הקובץ נשמר בכספת הפרויקט")
      }
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setUploading(false)
    }
  }

  const progressUrl = `/marker-ofek/execution/progress-reports/new?projectId=${encodeURIComponent(project.id)}`

  return (
    <Tabs defaultValue="details" className="w-full gap-2">
      <TabsList
        variant="line"
        className="mb-1 h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0"
      >
        <TabsTrigger value="details" className="shrink-0">
          פרטי פרויקט
        </TabsTrigger>
        <TabsTrigger value="partial" className="shrink-0">
          חשבונות חלקיים
        </TabsTrigger>
        <TabsTrigger value="vault" className="shrink-0">
          כספת מסמכים ו-AI
        </TabsTrigger>
        <TabsTrigger value="procurement" className="shrink-0">
          רכש והוצאות
        </TabsTrigger>
      </TabsList>

      <TabsContent value="details" className="mt-0 space-y-4">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">פרטי פרויקט</CardTitle>
            <CardDescription>
              {project.internal_project_code} · סטטוס: {project.status}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {project.client_name?.trim() ? (
              <p>
                <span className="text-muted-foreground">לקוח: </span>
                {project.client_name.trim()}
              </p>
            ) : null}
            {project.address?.trim() ? (
              <p>
                <span className="text-muted-foreground">כתובת: </span>
                {project.address.trim()}
              </p>
            ) : null}
            {tenderDisplay ? (
              <p>
                <span className="text-muted-foreground">מכרז מקושר: </span>
                {tenderDisplay}
              </p>
            ) : project.tender_id ? (
              <p className="text-muted-foreground">מכרז מקושר (ללא שם תצוגה)</p>
            ) : (
              <p className="text-muted-foreground">לא מקושר למכרז</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base text-foreground">לו״ז וביצוע (גאנט)</CardTitle>
            <CardDescription className="text-muted-foreground">
              ניהול משימות, כספת תוכניות לפי WBS, וסנכרון שטח
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              render={
                <Link href={`/marker-ofek/execution/gantt/${encodeURIComponent(project.id)}`} />
              }
            >
              <LayoutList className="size-4" aria-hidden />
              פתח לו״ז
            </Button>
            <ProjectGanttLaunchDialog defaultProjectId={project.id} />
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">חוזי לקוח / ביצוע</CardTitle>
              <CardDescription>חוזים המשויכים לפרויקט זה</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              render={<Link href="/marker-ofek/contracts/select-type" />}
            >
              חוזה חדש
            </Button>
          </CardHeader>
          <CardContent>
            {contracts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                אין חוזים לפרויקט. צרו חוזה חדש או שייכו חוזה קיים ממסך החוזים.
              </p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/50">
                {contracts.map((c) => {
                  const ent = embedOne(c.entities)
                  const amt =
                    c.total_amount != null
                      ? currencyFormatter.format(Number(c.total_amount))
                      : "—"
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/marker-ofek/contracts/${c.id}/edit`}
                        className="flex cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-accent/50 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="font-medium">
                          {ent?.name?.trim() || "ישות"} · {c.contract_type}
                        </span>
                        <span className="text-muted-foreground">
                          {amt} · {c.status}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="partial" className="mt-0 space-y-4">
        <Card className="border-border/70">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="size-5 text-cyan-500" aria-hidden />
              <CardTitle className="text-base">חשבונות חלקיים</CardTitle>
            </div>
            <CardDescription>
              מנוע החשבונות החלקיים מבוסס על חוזה ואבני דרך — פתיחה עם סינון
              לפרויקט זה.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button render={<Link href={progressUrl} />}>
              דיווח התקדמות / חשבון חלקי
            </Button>
            <Button variant="outline" render={<Link href="/marker-ofek/finance" />}>
              כספים
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/70 border-cyan-500/20 bg-gradient-to-br from-cyan-950/15 to-transparent">
          <CardHeader>
            <CardTitle className="text-base">
              קליטת חשבון מאושר קודם (Baseline)
            </CardTitle>
            <CardDescription>
              העלו PDF של חשבון חלקי מאושר כדי לחלץ מצב מצטבר, מדדים וקיזוזים לפני
              הפקת החשבון הבא.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="baseline-pdf-input">קובץ חשבון (PDF)</Label>
                <Input
                  id="baseline-pdf-input"
                  ref={baselinePdfInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={baselineScanPending}
                  className="cursor-pointer bg-background/80 file:me-3 file:rounded-md file:border-0 file:bg-cyan-500/15 file:px-3 file:py-1 file:text-sm file:font-medium file:text-cyan-100"
                />
              </div>
              <Button
                type="button"
                className="shrink-0 gap-2 bg-cyan-700 text-white hover:bg-cyan-600"
                disabled={baselineScanPending}
                onClick={() => runBaselineBillAi()}
              >
                {baselineScanPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    קורא מסמך…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" aria-hidden />
                    קרא חשבון באמצעות AI
                  </>
                )}
              </Button>
            </div>

            <form
              id="marker-ofek-baseline-import-form"
              className="space-y-4"
              onSubmit={onBaselineSubmit}
            >
              <div className="space-y-2">
                <Label htmlFor="baseline-contract-select">חוזה לשיוך הבסיס</Label>
                {contracts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    אין חוזים לפרויקט — צרו חוזה לפני שמירת בסיס.
                  </p>
                ) : (
                  <Controller
                    name="contract_id"
                    control={baselineForm.control}
                    render={({ field }) => (
                      <Select
                        value={field.value || undefined}
                        onValueChange={(v) => {
                          const id = v ?? ""
                          field.onChange(id)
                          baselineForm.setValue("contract_id", id, {
                            shouldValidate: true,
                            shouldDirty: true,
                          })
                        }}
                        disabled={baselineFormSubmitting}
                      >
                        <SelectTrigger
                          id="baseline-contract-select"
                          className="w-full max-w-md"
                        >
                          <SelectValue placeholder="בחרו חוזה…">
                            {selectedContractLabel || undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent diamondEntity="contracts">
                          {contracts.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {baselineContractSelectLabel(c)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )}
              </div>

              {baselinePreview ? (
                <div className="space-y-3">
                  <BaselineBillDataPreview
                    data={baselinePreview}
                    projectName={project.name}
                  />
                  {!selectedContractId.trim() ? (
                    <p className="text-xs text-muted-foreground">
                      בחרו חוזה מהרשימה כדי להפעיל שמירה.
                    </p>
                  ) : null}
                  {selectedContractId.trim() && baselineItems.length === 0 ? (
                    <p className="text-xs font-medium text-amber-700">
                      אין שורות items בסריקה — הריצו מחדש את ה-AI או בדקו את ה-PDF.
                    </p>
                  ) : null}
                  {Object.keys(baselineFormErrors).length > 0 ? (
                    <div className="mb-4 max-h-40 overflow-auto rounded border border-destructive/50 bg-destructive/10 p-3 text-left font-mono text-sm text-destructive dir-ltr">
                      <strong>Form Validation Blocked Submission:</strong>
                      <pre className="mt-2 whitespace-pre-wrap break-words">
                        {JSON.stringify(baselineFormErrors, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                  <Button
                    type="submit"
                    className="w-full max-w-md gap-2 bg-emerald-700 text-white hover:bg-emerald-600 sm:w-auto"
                    disabled={baselineSubmitDisabled}
                  >
                    {baselineFormSubmitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        שומר בסיס…
                      </>
                    ) : (
                      "אשר ושמור נתוני פתיחה (Baseline)"
                    )}
                  </Button>
                  <details className="rounded-lg border border-border/60 bg-muted/25 text-sm">
                    <summary className="cursor-pointer px-3 py-2 font-medium text-muted-foreground">
                      תצוגת JSON גולמית
                    </summary>
                    <pre
                      className="max-h-52 overflow-auto border-t border-border/50 bg-background/80 p-3 text-xs leading-relaxed"
                      dir="ltr"
                    >
                      {JSON.stringify(baselinePreview, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="vault" className="mt-0 space-y-4">
        <Card className="border-border/70">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FolderOpen className="size-5 text-violet-400" aria-hidden />
              <CardTitle className="text-base">כספת מסמכים ו-AI</CardTitle>
            </div>
            <CardDescription>
              העלאת מסמכי חוזה, מפרטים ותוכניות — נשמר ב-{PROJECT_DOCS_BUCKET}{" "}
              ונרשם ב־<code className="rounded bg-muted px-1 text-xs">project_documents</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge
              variant="outline"
              className="h-auto max-w-full whitespace-normal border-amber-500/55 bg-amber-500/10 px-3 py-2.5 text-start text-xs font-normal leading-relaxed text-amber-950"
            >
              ה-AI מבסס תשובות אך ורק על מסמכי הכספת. תשובות שאינן מבוססות סעיף
              יסומנו כהמלצה מסחרית בלבד.
            </Badge>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="grid gap-1">
                <Label className="text-xs text-slate-600">סוג מסמך (תיקייה)</Label>
                <Select
                  value={vaultDocumentKind}
                  onValueChange={(v) => setVaultDocumentKind(v ?? "תוכניות")}
                >
                  <SelectTrigger className="w-[min(100%,14rem)] border-slate-100 bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="תוכניות">תוכניות</SelectItem>
                    <SelectItem value="היתרים">היתרים</SelectItem>
                    <SelectItem value="תעודות">תעודות</SelectItem>
                    <SelectItem value="חוזה">חוזה</SelectItem>
                    <SelectItem value="אחר">אחר</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                className="relative gap-2 border-slate-100 bg-card"
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="size-4" aria-hidden />
                )}
                העלאת מסמכי חוזה לכספת
                <Input
                  type="file"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  accept=".pdf,application/pdf,image/*,.dwg"
                  disabled={uploading}
                  onChange={onVaultFileChange}
                />
              </Button>
            </div>

            <ProjectDocumentsVaultExplorer documents={documents} />

            <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
              <p className="mb-2 text-xs text-muted-foreground">
                שאלות על החוזה מבוססות על תוכן הכספת בלבד.
              </p>
              <Button
                className="gap-2"
                render={
                  <Link
                    href={`/marker-ofek/projects/${project.id}/contract-ai`}
                  />
                }
              >
                <MessageCircleQuestion className="size-4" aria-hidden />
                שאל את עוזר ה-AI החוזי
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="procurement" className="mt-0 space-y-4">
        <Card className="border-border/70">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-5 text-emerald-400" aria-hidden />
              <CardTitle className="text-base">רכש והוצאות</CardTitle>
            </div>
            <CardDescription>
              הזמנות רכש וקליטת חשבוניות ספק — לפי פרויקט במסכי הרכש.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button render={<Link href="/marker-ofek/procurement" />}>
              לוח רכש
            </Button>
            <Button
              variant="outline"
              render={<Link href="/marker-ofek/procurement/new" />}
            >
              הזמנת רכש חדשה
            </Button>
            <Button
              variant="outline"
              render={<Link href={MARKER_OFEK_HREFS.procurementAiImport} />}
            >
              קליטת חשבונית AI
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
