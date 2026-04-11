"use client"

import * as React from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import {
  rebuildTenderBuildingModel,
  updateTenderDocumentManual,
} from "@/app/(dashboard)/marker-ofek/pre-construction/tender-intake/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import type {
  MoTenderDocumentStatus,
  MoTenderDocumentType,
} from "@/lib/marker-ofek/tender-intake-types"
import { cn } from "@/lib/utils"

const STATUS_OPTIONS: { value: MoTenderDocumentStatus; label: string }[] = [
  { value: "to_execution", label: "לביצוע" },
  { value: "for_review", label: "לעיון" },
  { value: "for_tender", label: "למכרז" },
  { value: "ai_failed", label: "שגיאת AI" },
]

const TYPE_OPTIONS: { value: MoTenderDocumentType; label: string }[] = [
  { value: "boq", label: "כתב כמויות" },
  { value: "tech_spec", label: "מפרט טכני" },
  { value: "sale_spec", label: "מפרט שיווקי" },
  { value: "drawing_electrical", label: "שרטוט חשמל" },
  { value: "drawing_general", label: "שרטוט כללי" },
]

function statusBadgeClass(s: MoTenderDocumentStatus) {
  switch (s) {
    case "to_execution":
      return "bg-emerald-600/15 text-emerald-800"
    case "for_tender":
      return "bg-amber-600/15 text-amber-900"
    case "ai_failed":
      return "bg-destructive/15 text-destructive"
    case "for_review":
    default:
      return "bg-slate-600/10 text-slate-800"
  }
}

export type TenderDocRow = {
  id: string
  file_name: string
  ai_inferred_name: string | null
  ai_inferred_date: string | null
  status: MoTenderDocumentStatus
  floors_data: { labels: string[]; vertical_hints?: string[] }
  document_type: MoTenderDocumentType
  tags: string[]
}

export type TenderDocPendingRow = { key: string; file_name: string }

export function TenderDocumentsTable({
  tenderId,
  documents,
  pendingRows = [],
  onUpdated,
}: {
  tenderId: string
  documents: TenderDocRow[]
  pendingRows?: TenderDocPendingRow[]
  onUpdated: () => void
}) {
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const [rebuildBusy, setRebuildBusy] = React.useState(false)

  async function saveRow(doc: TenderDocRow, overrides: Partial<TenderDocRow>) {
    setPendingId(doc.id)
    try {
      const floor_labels =
        overrides.floors_data !== undefined
          ? overrides.floors_data.labels
          : doc.floors_data.labels
      const tags =
        overrides.tags !== undefined ? overrides.tags : doc.tags

      const res = await updateTenderDocumentManual({
        documentId: doc.id,
        tenderId,
        ai_inferred_name:
          overrides.ai_inferred_name !== undefined
            ? overrides.ai_inferred_name
            : doc.ai_inferred_name,
        ai_inferred_date:
          overrides.ai_inferred_date !== undefined
            ? overrides.ai_inferred_date
            : doc.ai_inferred_date,
        status: overrides.status ?? doc.status,
        document_type: overrides.document_type ?? doc.document_type,
        floor_labels,
        tags,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("עודכן")
      onUpdated()
    } finally {
      setPendingId(null)
    }
  }

  async function handleRebuild() {
    setRebuildBusy(true)
    try {
      const res = await rebuildTenderBuildingModel(tenderId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("מודל הבניין חושב מחדש")
      onUpdated()
    } finally {
      setRebuildBusy(false)
    }
  }

  if (documents.length === 0 && pendingRows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        אין מסמכים. גררו קבצים לאזור ההעלאה.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rebuildBusy || documents.length === 0}
          onClick={() => void handleRebuild()}
        >
          {rebuildBusy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          <span className="ms-2">חישוב מחדש של מודל הבניין</span>
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>קובץ</TableHead>
              <TableHead>שם (AI)</TableHead>
              <TableHead>תאריך</TableHead>
              <TableHead>סטטוס</TableHead>
              <TableHead>קומות</TableHead>
              <TableHead>סוג</TableHead>
              <TableHead>תגיות</TableHead>
              <TableHead className="w-[100px]">פעולה</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingRows.map((p) => (
              <TableRow key={p.key} className="bg-muted/30">
                <TableCell className="max-w-[140px] truncate text-xs font-medium">
                  <span className="inline-flex items-center gap-2">
                    <Loader2
                      className="size-4 shrink-0 animate-spin text-muted-foreground"
                      aria-hidden
                    />
                    {p.file_name}
                  </span>
                </TableCell>
                <TableCell colSpan={7} className="text-xs text-muted-foreground">
                  מנתחים ב-Gemini…
                </TableCell>
              </TableRow>
            ))}
            {documents.map((doc) => (
              <TenderDocEditRow
                key={doc.id}
                doc={doc}
                pending={pendingId === doc.id}
                onSave={(next) => void saveRow(doc, next)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function TenderDocEditRow({
  doc,
  pending,
  onSave,
}: {
  doc: TenderDocRow
  pending: boolean
  onSave: (next: Partial<TenderDocRow>) => void
}) {
  const [name, setName] = React.useState(doc.ai_inferred_name ?? "")
  const [date, setDate] = React.useState(doc.ai_inferred_date ?? "")
  const [status, setStatus] = React.useState(doc.status)
  const [docType, setDocType] = React.useState(doc.document_type)
  const [floorsStr, setFloorsStr] = React.useState(
    doc.floors_data.labels.join(", ")
  )
  const [tagsStr, setTagsStr] = React.useState(doc.tags.join(", "))

  React.useEffect(() => {
    setName(doc.ai_inferred_name ?? "")
    setDate(doc.ai_inferred_date ?? "")
    setStatus(doc.status)
    setDocType(doc.document_type)
    setFloorsStr(doc.floors_data.labels.join(", "))
    setTagsStr(doc.tags.join(", "))
  }, [doc])

  return (
    <TableRow>
      <TableCell className="max-w-[140px] truncate text-xs font-medium">
        {doc.file_name}
      </TableCell>
      <TableCell>
        <Input
          className="h-8 min-w-[120px] text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Input
          className="h-8 w-[128px] text-sm"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as MoTenderDocumentStatus)}
          >
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge
            variant="secondary"
            className={cn("w-fit text-[10px]", statusBadgeClass(status))}
          >
            {STATUS_OPTIONS.find((x) => x.value === status)?.label}
          </Badge>
        </div>
      </TableCell>
      <TableCell>
        <Input
          className="h-8 min-w-[100px] text-xs"
          placeholder="3, גג, B1"
          value={floorsStr}
          onChange={(e) => setFloorsStr(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Select
          value={docType}
          onValueChange={(v) => setDocType(v as MoTenderDocumentType)}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          className="h-8 min-w-[100px] text-xs"
          value={tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            onSave({
              ai_inferred_name: name.trim() || null,
              ai_inferred_date: date || null,
              status,
              document_type: docType,
              floors_data: {
                labels: floorsStr
                  .split(/[,;]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
              tags: tagsStr
                .split(/[,;]/)
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            "שמור"
          )}
        </Button>
      </TableCell>
    </TableRow>
  )
}
