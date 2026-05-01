"use client"

/**
 * PoHistoryTab — Phase 7.13.1.D
 *
 * חושף את ה-audit trail של PO:
 *   • Change Log (field-level diff) — מטריגר ב-erp_purchase_orders + מ-API.
 *   • Revisions (snapshots מלאים) — מ-RPC erp_create_po_revision_snapshot
 *     שמופעל ב-mעברי סטטוס משמעותיים (APPROVED/SENT) או ידנית כאן.
 *
 * Sub-tabs (פנימיים, לא Tabs primitive — סגנון Pills קל):
 *   - "שינויים" (default) — timeline של change log.
 *   - "Revisions" — רשימת snapshots עם כפתור "צפייה" שטוען snapshot מלא
 *     ב-Dialog.
 *
 * כפתור "יצירת snapshot ידני" יוצר revision חדש (reason=MANUAL).
 */

import * as React from "react"
import {
  AlertTriangle,
  Camera,
  CircleDot,
  Edit3,
  Eye,
  FileEdit,
  GitCommit,
  History,
  Loader2,
  PackageMinus,
  PackagePlus,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"

// ============================================================================
// Types
// ============================================================================

type PoChangeLogEntry = {
  id: string
  entityType: "HEADER" | "LINE" | "APPROVAL" | "ATTACHMENT"
  entityId: string | null
  operation: "INSERT" | "UPDATE" | "DELETE"
  fieldName: string | null
  oldValue: string | null
  newValue: string | null
  changedBy: string | null
  changedByName: string | null
  changedAt: string
  source: string | null
  reason: string | null
}

type PoRevisionMetadata = {
  id: string
  revisionNumber: number
  reason: string | null
  createdBy: string | null
  createdByName: string | null
  createdAt: string
}

type PoRevisionSnapshot = {
  id: string
  revisionNumber: number
  reason: string | null
  createdBy: string | null
  createdAt: string
  headerSnapshot: unknown
  linesSnapshot: unknown
  approvalsSnapshot: unknown
}

type PoHistoryResponse = {
  poId: string
  changeLog: PoChangeLogEntry[]
  revisions: PoRevisionMetadata[]
}

const ENTITY_LABEL: Record<PoChangeLogEntry["entityType"], string> = {
  HEADER: "כותרת",
  LINE: "שורה",
  APPROVAL: "אישור",
  ATTACHMENT: "קובץ",
}

const FIELD_NAME_LABEL: Record<string, string> = {
  status: "סטטוס",
  total_amount_gross: 'סה"כ ברוטו',
  supplier_id: "ספק",
  urgency_level: "דחיפות",
  requires_po_escalation: "דורש אישור חריגה",
  ai_negotiation_status: "AI negotiation",
}

const REASON_LABEL: Record<string, string> = {
  APPROVED: "אישור",
  SENT: "שליחה לספק",
  POST_APPROVAL_EDIT: "עריכה אחרי אישור",
  MANUAL: "ידני",
}

const dateTimeFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
})

function formatDateTime(value: string): string {
  try {
    return dateTimeFormatter.format(new Date(value))
  } catch {
    return value
  }
}

function userLabel(name: string | null, id: string | null): string {
  if (name) return name
  if (id) return `#${id.slice(0, 8)}`
  return "מערכת"
}

// ============================================================================
// Main
// ============================================================================

export function PoHistoryTab({ poId }: { poId: string }) {
  const [data, setData] = React.useState<PoHistoryResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [view, setView] = React.useState<"changes" | "revisions">("changes")
  const [snapshotting, setSnapshotting] = React.useState(false)

  const refetch = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await masterDataFetch<PoHistoryResponse>(
        `/api/procurement/orders/${encodeURIComponent(poId)}/history`
      )
      setData(result)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "טעינת היסטוריה נכשלה"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [poId])

  React.useEffect(() => {
    void refetch()
  }, [refetch])

  const handleCreateSnapshot = React.useCallback(async () => {
    setSnapshotting(true)
    try {
      await masterDataFetch(
        `/api/procurement/orders/${encodeURIComponent(poId)}/history`,
        { method: "POST" }
      )
      toast.success("snapshot ידני נוצר")
      await refetch()
      setView("revisions")
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "יצירת snapshot נכשלה"
      toast.error(message)
    } finally {
      setSnapshotting(false)
    }
  }, [poId, refetch])

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/10 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        טוען היסטוריה…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertTriangle className="size-4" aria-hidden />
        {error ?? "שגיאה לא ידועה"}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="תצוגת היסטוריה" className="flex gap-1">
          <ViewPill
            active={view === "changes"}
            onClick={() => setView("changes")}
            icon={<Edit3 className="size-3.5" aria-hidden />}
            label={`שינויים (${data.changeLog.length})`}
          />
          <ViewPill
            active={view === "revisions"}
            onClick={() => setView("revisions")}
            icon={<GitCommit className="size-3.5" aria-hidden />}
            label={`Revisions (${data.revisions.length})`}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void handleCreateSnapshot()}
          disabled={snapshotting}
          className="gap-1.5"
        >
          {snapshotting ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Camera className="size-3.5" aria-hidden />
          )}
          {snapshotting ? "יוצר…" : "יצירת snapshot ידני"}
        </Button>
      </header>

      {view === "changes" ? (
        <ChangeLogTimeline entries={data.changeLog} />
      ) : (
        <RevisionsList revisions={data.revisions} poId={poId} />
      )}
    </div>
  )
}

function ViewPill({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-muted/50"
      )}
    >
      {icon}
      {label}
    </button>
  )
}

// ============================================================================
// ChangeLogTimeline
// ============================================================================

function ChangeLogTimeline({ entries }: { entries: PoChangeLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/10 p-10 text-center">
        <History className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">אין שינויים עדיין.</p>
      </div>
    )
  }

  return (
    <ol className="relative space-y-2 ps-6">
      <span
        aria-hidden
        className="absolute inset-y-0 right-2.5 w-px bg-border rtl:right-auto rtl:left-2.5"
      />
      {entries.map((entry) => (
        <ChangeLogEntryRow key={entry.id} entry={entry} />
      ))}
    </ol>
  )
}

function ChangeLogEntryRow({ entry }: { entry: PoChangeLogEntry }) {
  const opIcon =
    entry.operation === "INSERT" ? (
      <PackagePlus className="size-3.5 text-emerald-600" aria-hidden />
    ) : entry.operation === "DELETE" ? (
      <PackageMinus className="size-3.5 text-rose-600" aria-hidden />
    ) : (
      <FileEdit className="size-3.5 text-amber-600" aria-hidden />
    )

  const fieldLabel = entry.fieldName
    ? FIELD_NAME_LABEL[entry.fieldName] ?? entry.fieldName
    : null

  return (
    <li className="relative">
      <span
        aria-hidden
        className="absolute right-0 top-2 z-10 inline-flex size-5 items-center justify-center rounded-full border border-border bg-card rtl:right-auto rtl:left-0"
      >
        {opIcon}
      </span>
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge
            variant="outline"
            className="border-slate-300/50 bg-slate-100/40 text-xs text-slate-700"
          >
            {ENTITY_LABEL[entry.entityType]}
          </Badge>
          <span className="font-mono uppercase">{entry.operation}</span>
          {fieldLabel ? (
            <span className="font-medium text-foreground">{fieldLabel}</span>
          ) : null}
          {entry.source ? (
            <span className="font-mono text-[10px] uppercase opacity-70">
              {entry.source}
            </span>
          ) : null}
          <span className="ms-auto whitespace-nowrap">
            {formatDateTime(entry.changedAt)}
          </span>
        </div>

        {entry.fieldName && (entry.oldValue || entry.newValue) ? (
          <div className="mt-2 space-y-1 text-xs">
            <DiffLine label="לפני" value={entry.oldValue} tone="rose" />
            <DiffLine label="אחרי" value={entry.newValue} tone="emerald" />
          </div>
        ) : null}

        {entry.reason ? (
          <p className="mt-2 text-xs text-muted-foreground">
            <strong className="text-foreground">סיבה: </strong>
            {entry.reason}
          </p>
        ) : null}

        <p className="mt-2 text-xs text-muted-foreground">
          ע&quot;י: {userLabel(entry.changedByName, entry.changedBy)}
        </p>
      </div>
    </li>
  )
}

function DiffLine({
  label,
  value,
  tone,
}: {
  label: string
  value: string | null
  tone: "rose" | "emerald"
}) {
  const colorClasses =
    tone === "rose"
      ? "border-rose-300/40 bg-rose-50/50 text-rose-900"
      : "border-emerald-300/40 bg-emerald-50/50 text-emerald-900"
  return (
    <div className={cn("flex items-start gap-2 rounded-md border px-2 py-1", colorClasses)}>
      <span className="mt-0.5 inline-flex w-10 flex-none text-[10px] font-semibold uppercase opacity-80">
        {label}
      </span>
      <span className="break-all font-mono">
        {value === null || value === "" ? (
          <em className="opacity-60">—</em>
        ) : (
          value
        )}
      </span>
    </div>
  )
}

// ============================================================================
// RevisionsList + Snapshot dialog
// ============================================================================

function RevisionsList({
  revisions,
  poId,
}: {
  revisions: PoRevisionMetadata[]
  poId: string
}) {
  const [openId, setOpenId] = React.useState<string | null>(null)

  if (revisions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/10 p-10 text-center">
        <GitCommit className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          טרם נוצרו snapshots. revisions נוצרים אוטומטית בעת אישור / שליחה.
        </p>
      </div>
    )
  }

  return (
    <>
      <ul className="space-y-2">
        {revisions.map((rev) => (
          <li
            key={rev.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3"
          >
            <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-primary/10 font-mono text-sm font-bold tabular-nums text-primary">
              {rev.revisionNumber}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  Revision {rev.revisionNumber}
                </span>
                {rev.reason ? (
                  <Badge
                    variant="outline"
                    className="border-slate-300/50 bg-slate-100/40 text-xs text-slate-700"
                  >
                    {REASON_LABEL[rev.reason] ?? rev.reason}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(rev.createdAt)} · ע&quot;י{" "}
                {userLabel(rev.createdByName, rev.createdBy)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setOpenId(rev.id)}
              className="gap-1.5"
            >
              <Eye className="size-3.5" aria-hidden />
              צפייה
            </Button>
          </li>
        ))}
      </ul>

      <RevisionSnapshotDialog
        poId={poId}
        revisionId={openId}
        open={openId != null}
        onClose={() => setOpenId(null)}
      />
    </>
  )
}

function RevisionSnapshotDialog({
  poId,
  revisionId,
  open,
  onClose,
}: {
  poId: string
  revisionId: string | null
  open: boolean
  onClose: () => void
}) {
  const [snapshot, setSnapshot] = React.useState<PoRevisionSnapshot | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open || !revisionId) {
      setSnapshot(null)
      setError(null)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await masterDataFetch<PoRevisionSnapshot>(
          `/api/procurement/orders/${encodeURIComponent(poId)}/history/${encodeURIComponent(revisionId)}`
        )
        if (!cancelled) setSnapshot(result)
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "שגיאה")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, poId, revisionId])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2">
              <CircleDot className="size-4 text-primary" aria-hidden />
              {snapshot
                ? `Snapshot — Revision ${snapshot.revisionNumber}`
                : "Snapshot"}
            </span>
          </DialogTitle>
          <DialogDescription>
            תצוגת JSON מלאה של מצב ה-PO ברגע ה-revision.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            טוען snapshot…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="size-4" aria-hidden />
            {error}
          </div>
        ) : snapshot ? (
          <div className="space-y-3">
            <SnapshotSection
              title="כותרת"
              data={snapshot.headerSnapshot}
            />
            <SnapshotSection title="שורות" data={snapshot.linesSnapshot} />
            <SnapshotSection
              title="אישורים"
              data={snapshot.approvalsSnapshot}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SnapshotSection({
  title,
  data,
}: {
  title: string
  data: unknown
}) {
  const [expanded, setExpanded] = React.useState(false)
  const json = React.useMemo(() => {
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return String(data)
    }
  }, [data])
  const preview = json.length > 400 && !expanded ? `${json.slice(0, 400)}…` : json

  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold">{title}</h3>
        {json.length > 400 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setExpanded((v) => !v)}
            className="h-6 px-2 text-xs"
          >
            {expanded ? "הקטן" : "הצג הכל"}
          </Button>
        ) : null}
      </header>
      <pre
        dir="ltr"
        className="max-h-[40vh] overflow-auto p-3 text-[10px] leading-snug font-mono"
      >
        {preview}
      </pre>
    </section>
  )
}
