"use client"

/**
 * PoApprovalsTab — Phase 7.13.1.C
 *
 * חושף את ה-RPCs מ-Phase 7.7 ב-UI:
 *   • erp_resolve_approval_chain → הצגת השרשרת התיאורטית (מתי כל level פעיל)
 *   • erp_submit_po_for_approval → כפתור "הגש לאישור" (DRAFT → PENDING_APPROVAL)
 *   • erp_decide_approval        → כפתורי אשר/דחה ברמה הפעילה
 *
 * ה-tab מציג:
 *   1. סטטוס PO ובאנר הסבר
 *   2. כפתור הגשה (אם DRAFT)
 *   3. ציר זמן של ה-chain — לכל level: required_role, threshold, trigger,
 *      activated, סטטוס בפועל מ-erp_po_approvals (אם נוצר)
 *   4. action panel ברמה הפעילה (PENDING ב-current_approval_level) עם
 *      textarea לקומנט + APPROVE/REJECT buttons
 *
 * כל אחרי-פעולה (submit/decide) מבצע onChanged callback כדי שה-page יבצע
 * refetch של ה-PO וה-approvals יחד (ה-status / current_approval_level
 * השתנו).
 */

import * as React from "react"
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Hourglass,
  Loader2,
  PlayCircle,
  ShieldCheck,
  ShieldX,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"

// ============================================================================
// Types — mirror של ה-API
// ============================================================================

type ApprovalChainEntry = {
  level: number
  requiredRole: string | null
  amountThresholdGross: number | null
  triggerExpr: string | null
  activated: boolean
}

type ApprovalRecord = {
  id: string
  level: number
  requiredRole: string | null
  approverUserId: string | null
  status: "PENDING" | "APPROVED" | "REJECTED" | "BYPASSED" | "CANCELLED"
  comment: string | null
  decidedAt: string | null
  createdAt: string
}

type ApprovalsResponse = {
  poId: string
  currentStatus: string
  currentApprovalLevel: number
  poTypeId: string | null
  hasPoType: boolean
  chain: ApprovalChainEntry[]
  approvals: ApprovalRecord[]
}

const STATUS_LABEL: Record<ApprovalRecord["status"], string> = {
  PENDING: "ממתין",
  APPROVED: "אושר",
  REJECTED: "נדחה",
  BYPASSED: "נעקף",
  CANCELLED: "בוטל",
}

const STATUS_BADGE_CLASS: Record<ApprovalRecord["status"], string> = {
  PENDING: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  APPROVED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800",
  REJECTED: "border-rose-500/40 bg-rose-500/10 text-rose-800",
  BYPASSED: "border-slate-500/40 bg-slate-500/10 text-slate-800",
  CANCELLED: "border-zinc-500/40 bg-zinc-500/10 text-zinc-700",
}

const formatCurrency = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const formatDateTime = (value: string | null) => {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value))
  } catch {
    return value
  }
}

// ============================================================================
// Main component
// ============================================================================

export function PoApprovalsTab({
  poId,
  poStatus,
  onChanged,
}: {
  poId: string
  poStatus: string
  /** callback to ask the parent to refetch the PO header (status changes). */
  onChanged: () => Promise<void> | void
}) {
  const [data, setData] = React.useState<ApprovalsResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refetch = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await masterDataFetch<ApprovalsResponse>(
        `/api/procurement/orders/${encodeURIComponent(poId)}/approvals`
      )
      setData(result)
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "טעינת תהליך אישור נכשלה"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [poId])

  React.useEffect(() => {
    void refetch()
  }, [refetch])

  // re-poll when poStatus prop changes (parent refetched after a decision)
  React.useEffect(() => {
    if (data && data.currentStatus !== poStatus) {
      void refetch()
    }
  }, [data, poStatus, refetch])

  const handleSubmit = React.useCallback(async () => {
    try {
      const res = await masterDataFetch<{
        approvalsCreated: number
        newStatus: string | null
      }>(`/api/procurement/orders/${encodeURIComponent(poId)}/approvals/submit`, {
        method: "POST",
      })
      if (res.newStatus === "APPROVED") {
        toast.success("ההזמנה אושרה — לא הוגדרה שרשרת אישור")
      } else {
        toast.success(`הוגשה לאישור (${res.approvalsCreated} רמות)`)
      }
      await refetch()
      await onChanged()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "הגשה לאישור נכשלה"
      toast.error(message)
    }
  }, [onChanged, poId, refetch])

  const handleDecide = React.useCallback(
    async (
      approvalId: string,
      decision: "APPROVE" | "REJECT",
      comment: string | null
    ) => {
      try {
        const res = await masterDataFetch<{
          newPoStatus: string | null
          nextLevel: number | null
        }>(
          `/api/procurement/orders/${encodeURIComponent(poId)}/approvals/${encodeURIComponent(approvalId)}/decide`,
          {
            method: "POST",
            body: JSON.stringify({ decision, comment }),
          }
        )
        if (decision === "APPROVE") {
          if (res.newPoStatus === "APPROVED") {
            toast.success("ההזמנה אושרה במלואה")
          } else {
            toast.success(`אושר. ממתין לרמה ${res.nextLevel}`)
          }
        } else {
          toast.success("נדחה. ההזמנה חזרה לטיוטה")
        }
        await refetch()
        await onChanged()
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : "שמירת ההחלטה נכשלה"
        toast.error(message)
      }
    },
    [onChanged, poId, refetch]
  )

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/10 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        טוען תהליך אישור…
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
      <StatusBanner data={data} />

      {/* Submit button */}
      {data.currentStatus === "DRAFT" ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">הגשה לאישור</p>
              <p className="text-xs text-muted-foreground">
                {data.hasPoType
                  ? "השרשרת התיאורטית למטה. הגשה תיצור רשומות אישור פעילות."
                  : "להזמנה אין סוג (po_type) — בעת הגשה תאושר אוטומטית."}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              className="gap-2"
            >
              <PlayCircle className="size-4" aria-hidden />
              הגש לאישור
            </Button>
          </div>
        </div>
      ) : null}

      {/* Chain timeline + actions */}
      {data.chain.length === 0 && data.approvals.length === 0 ? (
        <EmptyChain hasPoType={data.hasPoType} />
      ) : (
        <ChainTimeline
          chain={data.chain}
          approvals={data.approvals}
          currentApprovalLevel={data.currentApprovalLevel}
          poStatus={data.currentStatus}
          onDecide={handleDecide}
        />
      )}
    </div>
  )
}

// ============================================================================
// StatusBanner — top of tab
// ============================================================================

function StatusBanner({ data }: { data: ApprovalsResponse }) {
  const config = (() => {
    switch (data.currentStatus) {
      case "DRAFT":
        return {
          icon: <Circle className="size-4" aria-hidden />,
          label: "טיוטה",
          tone: "border-slate-300/50 bg-slate-100/40 text-slate-800",
          description: "הזמנה זו עדיין לא הוגשה לאישור.",
        }
      case "PENDING_APPROVAL":
        return {
          icon: <Hourglass className="size-4" aria-hidden />,
          label: `ממתין לרמה ${data.currentApprovalLevel}`,
          tone: "border-amber-500/40 bg-amber-500/10 text-amber-900",
          description: "ההזמנה במהלך אישור פנימי.",
        }
      case "APPROVED":
        return {
          icon: <CheckCircle2 className="size-4" aria-hidden />,
          label: "מאושר",
          tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900",
          description: "כל רמות האישור הושלמו.",
        }
      case "ISSUED":
        return {
          icon: <ShieldCheck className="size-4" aria-hidden />,
          label: "הוצא",
          tone: "border-sky-500/40 bg-sky-500/10 text-sky-900",
          description: "ההזמנה הוצאה לספק.",
        }
      case "CANCELLED":
        return {
          icon: <Ban className="size-4" aria-hidden />,
          label: "מבוטל",
          tone: "border-rose-500/40 bg-rose-500/10 text-rose-900",
          description: "ההזמנה בוטלה.",
        }
      default:
        return {
          icon: <Circle className="size-4" aria-hidden />,
          label: data.currentStatus,
          tone: "border-slate-300/50 bg-slate-100/40 text-slate-800",
          description: "סטטוס ייעודי.",
        }
    }
  })()

  return (
    <section
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4",
        config.tone
      )}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden>{config.icon}</span>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">{config.label}</p>
          <p className="text-xs opacity-80">{config.description}</p>
        </div>
      </div>
    </section>
  )
}

function EmptyChain({ hasPoType }: { hasPoType: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/10 p-10 text-center">
      <ShieldX className="size-6 text-muted-foreground" aria-hidden />
      {hasPoType ? (
        <>
          <p className="text-sm font-medium">
            לסוג ההזמנה לא הוגדרה שרשרת אישור פעילה
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            כל הרמות שב-`approval_chain_json` החזירו `activated=false` עבור
            הסכומים והתנאים של הזמנה זו. הגשה תוביל לאישור אוטומטי.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">
            להזמנה לא מוגדר סוג (po_type)
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            השרשרת תוצג מיד עם בחירת po_type. בינתיים, הגשה תוביל ל-APPROVED.
          </p>
        </>
      )}
    </div>
  )
}

// ============================================================================
// ChainTimeline
// ============================================================================

function ChainTimeline({
  chain,
  approvals,
  currentApprovalLevel,
  poStatus,
  onDecide,
}: {
  chain: ApprovalChainEntry[]
  approvals: ApprovalRecord[]
  currentApprovalLevel: number
  poStatus: string
  onDecide: (
    approvalId: string,
    decision: "APPROVE" | "REJECT",
    comment: string | null
  ) => Promise<void>
}) {
  // Merge: each level is either from chain (theoretical) or from approvals
  // (active record). Build a unified list keyed by level.
  const mergedLevels = React.useMemo(() => {
    const map = new Map<
      number,
      { chain?: ApprovalChainEntry; approval?: ApprovalRecord }
    >()
    for (const c of chain) {
      map.set(c.level, { chain: c })
    }
    for (const a of approvals) {
      const existing = map.get(a.level) ?? {}
      map.set(a.level, { ...existing, approval: a })
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([level, value]) => ({ level, ...value }))
  }, [approvals, chain])

  return (
    <ol className="space-y-3" aria-label="ציר זמן של תהליך אישור">
      {mergedLevels.map((entry) => (
        <ChainLevelRow
          key={entry.level}
          level={entry.level}
          chain={entry.chain}
          approval={entry.approval}
          isCurrentLevel={
            entry.level === currentApprovalLevel && poStatus === "PENDING_APPROVAL"
          }
          onDecide={onDecide}
        />
      ))}
    </ol>
  )
}

function ChainLevelRow({
  level,
  chain,
  approval,
  isCurrentLevel,
  onDecide,
}: {
  level: number
  chain?: ApprovalChainEntry
  approval?: ApprovalRecord
  isCurrentLevel: boolean
  onDecide: (
    approvalId: string,
    decision: "APPROVE" | "REJECT",
    comment: string | null
  ) => Promise<void>
}) {
  const status = approval?.status ?? null
  const requiredRole = approval?.requiredRole ?? chain?.requiredRole ?? null
  const isActivated = chain?.activated ?? Boolean(approval)
  const stateIcon = (() => {
    if (status === "APPROVED")
      return <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
    if (status === "REJECTED")
      return <XCircle className="size-4 text-rose-600" aria-hidden />
    if (status === "CANCELLED")
      return <Ban className="size-4 text-zinc-600" aria-hidden />
    if (status === "BYPASSED")
      return <ShieldX className="size-4 text-slate-600" aria-hidden />
    if (status === "PENDING")
      return <Hourglass className="size-4 text-amber-600" aria-hidden />
    if (!isActivated)
      return <Circle className="size-4 text-muted-foreground/50" aria-hidden />
    return <Circle className="size-4 text-muted-foreground" aria-hidden />
  })()

  return (
    <li
      className={cn(
        "rounded-lg border bg-card p-4 transition-colors",
        isCurrentLevel
          ? "border-amber-500/40 ring-1 ring-amber-500/20"
          : "border-border",
        !isActivated && "opacity-60"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 flex-none items-center justify-center rounded-full border",
              isCurrentLevel
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-border bg-muted"
            )}
          >
            {stateIcon}
          </span>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span>רמה {level}</span>
              {requiredRole ? (
                <Badge
                  variant="outline"
                  className="border-slate-300/50 bg-slate-100/40 font-mono text-xs text-slate-700"
                >
                  {requiredRole}
                </Badge>
              ) : null}
              {status ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "font-medium",
                    STATUS_BADGE_CLASS[status]
                  )}
                >
                  {STATUS_LABEL[status]}
                </Badge>
              ) : !isActivated ? (
                <Badge
                  variant="outline"
                  className="border-slate-300/50 bg-slate-100/40 text-xs text-muted-foreground"
                >
                  לא פעיל בתנאים אלו
                </Badge>
              ) : null}
            </div>
            <ChainTriggerLine chain={chain} />
            {approval?.decidedAt ? (
              <p className="text-xs text-muted-foreground">
                החלטה: {formatDateTime(approval.decidedAt)}
              </p>
            ) : null}
            {approval?.comment ? (
              <p className="mt-1 rounded-md bg-muted/40 p-2 text-xs leading-relaxed">
                <strong className="text-foreground">הערה: </strong>
                {approval.comment}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {isCurrentLevel && approval ? (
        <DecisionPanel
          approvalId={approval.id}
          onDecide={onDecide}
        />
      ) : null}
    </li>
  )
}

function ChainTriggerLine({ chain }: { chain?: ApprovalChainEntry }) {
  if (!chain) return null
  const parts: string[] = []
  if (chain.amountThresholdGross != null) {
    parts.push(`סכום מעל ${formatCurrency.format(chain.amountThresholdGross)}`)
  }
  if (chain.triggerExpr) {
    parts.push(`טריגר: ${chain.triggerExpr}`)
  }
  if (parts.length === 0) return null
  return (
    <p className="font-mono text-xs text-muted-foreground">{parts.join(" · ")}</p>
  )
}

// ============================================================================
// DecisionPanel — APPROVE / REJECT buttons + comment textarea
// ============================================================================

function DecisionPanel({
  approvalId,
  onDecide,
}: {
  approvalId: string
  onDecide: (
    approvalId: string,
    decision: "APPROVE" | "REJECT",
    comment: string | null
  ) => Promise<void>
}) {
  const [comment, setComment] = React.useState("")
  const [busy, setBusy] = React.useState<"APPROVE" | "REJECT" | null>(null)
  const [expanded, setExpanded] = React.useState(false)

  const submit = async (decision: "APPROVE" | "REJECT") => {
    if (decision === "REJECT" && !comment.trim()) {
      toast.error("נדרשת הערה לדחיית אישור")
      return
    }
    setBusy(decision)
    try {
      await onDecide(approvalId, decision, comment.trim() || null)
      setComment("")
      setExpanded(false)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {expanded ? (
          <ChevronUp className="size-3.5" aria-hidden />
        ) : (
          <ChevronDown className="size-3.5" aria-hidden />
        )}
        {expanded ? "הסתר" : "הוסף הערה"}
      </button>
      {expanded ? (
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="הערה אופציונלית באישור / חובה בדחייה"
          disabled={busy != null}
          className="mb-3"
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void submit("REJECT")}
          disabled={busy != null}
          className="gap-1.5 border-rose-300/60 text-rose-700 hover:bg-rose-500/10"
        >
          {busy === "REJECT" ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <XCircle className="size-3.5" aria-hidden />
          )}
          דחה
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void submit("APPROVE")}
          disabled={busy != null}
          className="gap-1.5"
        >
          {busy === "APPROVE" ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <CheckCircle2 className="size-3.5" aria-hidden />
          )}
          אשר
        </Button>
      </div>
    </div>
  )
}
