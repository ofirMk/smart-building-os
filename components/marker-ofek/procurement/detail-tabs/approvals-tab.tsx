"use client"

/**
 * POs Master/Detail → Detail tab: שרשרת אישורים.
 *
 * פותח את `/api/procurement/orders/[id]/approvals` (Phase 7.13.1.C) —
 * משלב chain תיאורטי (מהפונקציה `erp_resolve_approval_chain`) עם רשומות
 * ה-approvals בפועל.
 *
 * ערך עסקי: המשתמש רואה מי צריך לאשר, מי כבר אישר, מי שוהה — בלי להיכנס
 * לכרטיס הפרט. לאחראים על זירת הרכש זו המפה היומית של ה-bottlenecks.
 */

import * as React from "react"
import { CheckCircle2, Clock, XCircle } from "lucide-react"

import {
  BentoSmartList,
  type BentoSmartListColumn,
} from "@/components/ui/bento-smart-list"
import {
  MasterDetailTabEmpty,
  MasterDetailTabError,
  MasterDetailTabLoading,
} from "@/components/infrastructure/master-detail/master-detail-shell"
import { masterDataFetch } from "@/lib/erp/master-data-browser"

type ChainEntry = {
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

type ApprovalsResp = {
  poId: string
  currentStatus: string
  currentApprovalLevel: number
  hasPoType: boolean
  chain: ChainEntry[]
  approvals: ApprovalRecord[]
}

/**
 * שורה מאוחדת — ממזגת chain + approvals לרשימה אחת אחר סוג. עבור
 * כל level בשרשרת: אם יש רשומת approval → נשתמש בה; אם לא (והוא activated)
 * → נוסיף placeholder PENDING.
 */
type UnifiedRow = {
  rowKey: string
  level: number
  requiredRole: string | null
  amountThresholdGross: number | null
  status: ApprovalRecord["status"] | "NOT_YET"
  comment: string | null
  decidedAt: string | null
  createdAt: string | null
  activated: boolean
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
})

const ROLE_LABEL: Record<string, string> = {
  PROCUREMENT_MANAGER: "מנהל רכש",
  FINANCE_MANAGER: "מנהל כספים",
  CEO: "מנכ״ל",
  PROJECT_MANAGER: "מנהל פרויקט",
  CFO: "סמנכ״ל כספים",
}

function formatAmount(value: number | null): string {
  if (value == null) return "—"
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${value.toLocaleString("he-IL")} ILS`
  }
}

export function ApprovalsTab({ poId }: { poId: string | null }) {
  const [resp, setResp] = React.useState<ApprovalsResp | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!poId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    masterDataFetch<ApprovalsResp>(
      `/api/procurement/orders/${encodeURIComponent(poId)}/approvals`,
    )
      .then((data) => {
        if (cancelled) return
        setResp(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "טעינת אישורים נכשלה")
        setResp(null)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [poId])

  const rows = React.useMemo<UnifiedRow[]>(() => {
    if (!resp) return []
    const approvalsByLevel = new Map<number, ApprovalRecord>()
    for (const a of resp.approvals) {
      // אם יש כמה באותו level (היסטורי), ניקח את האחרון שהוכרע או הפעיל.
      const existing = approvalsByLevel.get(a.level)
      if (!existing) approvalsByLevel.set(a.level, a)
      else if (new Date(a.createdAt) > new Date(existing.createdAt)) {
        approvalsByLevel.set(a.level, a)
      }
    }
    // מיזוג: לכל level בשרשרת → rowַ; אם אין בשרשרת (chain ריק), נשתמש ברשומות האישורים.
    const levels = new Set<number>()
    for (const c of resp.chain) levels.add(c.level)
    for (const a of resp.approvals) levels.add(a.level)
    const sorted = Array.from(levels).sort((a, b) => a - b)

    return sorted.map<UnifiedRow>((level) => {
      const chainEntry = resp.chain.find((c) => c.level === level)
      const record = approvalsByLevel.get(level)
      return {
        rowKey: record?.id ?? `chain-${level}`,
        level,
        requiredRole: record?.requiredRole ?? chainEntry?.requiredRole ?? null,
        amountThresholdGross: chainEntry?.amountThresholdGross ?? null,
        status: record?.status ?? "NOT_YET",
        comment: record?.comment ?? null,
        decidedAt: record?.decidedAt ?? null,
        createdAt: record?.createdAt ?? null,
        activated: chainEntry?.activated ?? Boolean(record),
      }
    })
  }, [resp])

  const columns = React.useMemo<BentoSmartListColumn<UnifiedRow>[]>(
    () => [
      {
        key: "level",
        title: "שלב",
        className: "w-[4rem] text-center text-xs font-semibold tabular-nums",
        render: (r) => `#${r.level}`,
      },
      {
        key: "role",
        title: "תפקיד נדרש",
        className: "min-w-[9rem] text-xs",
        render: (r) =>
          r.requiredRole ? ROLE_LABEL[r.requiredRole] ?? r.requiredRole : "—",
      },
      {
        key: "threshold",
        title: "סף סכום",
        className: "w-[8rem] text-xs tabular-nums",
        render: (r) => formatAmount(r.amountThresholdGross),
      },
      {
        key: "status",
        title: "מצב",
        className: "w-[8rem]",
        render: (r) => {
          if (r.status === "APPROVED") {
            return (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-2.5" aria-hidden />
                אושר
              </span>
            )
          }
          if (r.status === "REJECTED") {
            return (
              <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-700 dark:text-rose-400">
                <XCircle className="size-2.5" aria-hidden />
                נדחה
              </span>
            )
          }
          if (r.status === "PENDING") {
            return (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                <Clock className="size-2.5" aria-hidden />
                ממתין
              </span>
            )
          }
          if (r.status === "BYPASSED") {
            return (
              <span className="inline-flex items-center gap-1 rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] text-slate-700 dark:text-slate-300">
                דולג
              </span>
            )
          }
          if (r.status === "CANCELLED") {
            return (
              <span className="inline-flex items-center gap-1 rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] text-slate-700 dark:text-slate-300">
                בוטל
              </span>
            )
          }
          // NOT_YET — שלב שטרם הופעל
          return (
            <span className="inline-flex items-center gap-1 rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] text-slate-500">
              טרם הופעל
            </span>
          )
        },
      },
      {
        key: "decidedAt",
        title: "תאריך החלטה",
        className: "w-[10rem] text-[11px]",
        render: (r) =>
          r.decidedAt ? dateFormatter.format(new Date(r.decidedAt)) : "—",
      },
      {
        key: "comment",
        title: "הערה",
        className: "min-w-[10rem] text-xs text-muted-foreground",
        render: (r) =>
          r.comment ? (
            <span className="block truncate" title={r.comment}>
              {r.comment}
            </span>
          ) : (
            "—"
          ),
      },
    ],
    [],
  )

  if (!poId) {
    return (
      <MasterDetailTabEmpty>
        בחר הזמנה במסך האב כדי לראות את שרשרת האישורים שלה.
      </MasterDetailTabEmpty>
    )
  }
  if (loading) return <MasterDetailTabLoading>טוען אישורים…</MasterDetailTabLoading>
  if (error) return <MasterDetailTabError>{error}</MasterDetailTabError>

  if (resp && !resp.hasPoType) {
    return (
      <MasterDetailTabEmpty>
        להזמנה זו לא הוגדר סוג PO, ולכן אין שרשרת אישורים מחושבת. הגדר סוג
        PO בכרטיס הפרט.
      </MasterDetailTabEmpty>
    )
  }

  return (
    <BentoSmartList<UnifiedRow>
      items={rows}
      columns={columns}
      rowKey={(r) => r.rowKey}
      emptyState="אין שלבי אישור להזמנה זו."
    />
  )
}
