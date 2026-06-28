"use client"

/**
 * ApprovalTrackPanel — Phase 14 UI
 *
 * Displays the approval instance for a PO as an animated stepper.
 * Supports Approve / Reject / Delegate actions inline.
 *
 * Usage:
 *   <ApprovalTrackPanel poId="..." companyId="..." currentUserId="..." />
 */

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalLevel = {
  level: number
  role?: string
  user_id?: string
  label?: string
}

type Decision = {
  id: string
  level: number
  approver_user_id: string | null
  decision: "APPROVED" | "REJECTED" | "DELEGATED"
  comment: string | null
  decided_at: string
  delegated_to_user_id: string | null
}

type ApprovalInstance = {
  id: string
  purchase_order_id: string
  matrix_rule_id: string | null
  current_level: number
  total_levels: number
  status: string
  resolved_approvers_json: ApprovalLevel[]
  decisions: Decision[]
}

type Props = {
  poId: string
}

const STATUS_COLORS: Record<string, string> = {
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  CANCELLED: "bg-slate-100 text-slate-600 border-slate-200",
}

const DECISION_ICONS: Record<string, string> = {
  APPROVED: "✓",
  REJECTED: "✗",
  DELEGATED: "→",
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ApprovalTrackPanel({ poId }: Props) {
  const [instance, setInstance] = useState<ApprovalInstance | null>(null)
  const [loading, setLoading] = useState(true)
  const [decideOpen, setDecideOpen] = useState(false)
  const [decideKind, setDecideKind] = useState<"APPROVED" | "REJECTED" | "DELEGATED">("APPROVED")
  const [comment, setComment] = useState("")
  const [delegateTo, setDelegateTo] = useState("")
  const [deciding, setDeciding] = useState(false)
  const [startingMatrix, setStartingMatrix] = useState(false)

  async function loadInstance() {
    setLoading(true)
    try {
      const statusRes = await fetch(`/api/procurement/orders/${poId}/approvals`)
      if (!statusRes.ok) {
        setInstance(null)
        return
      }
      const json = (await statusRes.json()) as {
        data?: { matrixInstance?: ApprovalInstance | null }
      }
      setInstance(json.data?.matrixInstance ?? null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInstance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId])

  async function handleStartMatrix() {
    setStartingMatrix(true)
    try {
      const res = await fetch(`/api/procurement/orders/${poId}/approvals/matrix-start`, {
        method: "POST",
      })
      const json = (await res.json()) as { data?: { instanceId: string; matchedRule: { rule_name: string } }; error?: string }
      if (!res.ok) {
        toast.error(json.error ?? "שגיאה בהפעלת תהליך אישור")
        return
      }
      toast.success(`תהליך אישור הופעל — כלל: ${json.data?.matchedRule.rule_name ?? ""}`)
      await loadInstance()
    } finally {
      setStartingMatrix(false)
    }
  }

  async function handleDecide() {
    if (!instance) return
    setDeciding(true)
    try {
      const body: { decision: string; comment?: string; delegated_to_user_id?: string } = {
        decision: decideKind,
      }
      if (comment.trim()) body.comment = comment.trim()
      if (decideKind === "DELEGATED" && delegateTo.trim()) {
        body.delegated_to_user_id = delegateTo.trim()
      }

      const res = await fetch(`/api/procurement/orders/${poId}/approvals/matrix-decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { data?: { instanceStatus: string; advanced: boolean }; error?: string }
      if (!res.ok) {
        toast.error(json.error ?? "שגיאה ברישום החלטה")
        return
      }

      const newStatus = json.data?.instanceStatus
      if (newStatus === "APPROVED") toast.success("ההזמנה אושרה!")
      else if (newStatus === "REJECTED") toast.error("ההזמנה נדחתה")
      else if (json.data?.advanced) toast.success("עבר לרמת אישור הבאה")
      else toast.success("הועבר לממלא מקום")

      setDecideOpen(false)
      setComment("")
      setDelegateTo("")
      await loadInstance()
    } finally {
      setDeciding(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        טוען מידע אישורים...
      </div>
    )
  }

  if (!instance) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center" dir="rtl">
        <p className="text-sm text-muted-foreground">
          לא קיים תהליך אישור פעיל להזמנה זו.
        </p>
        <Button
          size="sm"
          onClick={() => void handleStartMatrix()}
          disabled={startingMatrix}
        >
          {startingMatrix ? "מפעיל..." : "הפעל תהליך אישור (מטריצה)"}
        </Button>
      </div>
    )
  }

  const levels: ApprovalLevel[] = instance.resolved_approvers_json ?? []
  const decisions = instance.decisions ?? []

  return (
    <div className="space-y-4 py-1" dir="rtl">
      {/* Instance header */}
      <div className="flex items-center gap-3">
        <Badge
          className={cn("border", STATUS_COLORS[instance.status] ?? STATUS_COLORS.PENDING)}
        >
          {instance.status === "PENDING"
            ? `ממתין — רמה ${instance.current_level} מתוך ${instance.total_levels}`
            : instance.status === "APPROVED"
            ? "אושר"
            : instance.status === "REJECTED"
            ? "נדחה"
            : instance.status}
        </Badge>
      </div>

      {/* Stepper */}
      <div className="relative">
        {levels.map((level, idx) => {
          const decision = decisions.find((d) => d.level === level.level)
          const isCurrentLevel = level.level === instance.current_level && instance.status === "PENDING"
          const isCompleted = !!decision && decision.decision !== "DELEGATED"
          const isPending = !decision && level.level < instance.current_level

          return (
            <div key={level.level} className="flex gap-3">
              {/* Connector line */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold",
                    isCompleted && decision?.decision === "APPROVED"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : isCompleted && decision?.decision === "REJECTED"
                      ? "border-red-500 bg-red-50 text-red-700"
                      : isCompleted && decision?.decision === "DELEGATED"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : isCurrentLevel
                      ? "border-amber-500 bg-amber-50 text-amber-700 animate-pulse"
                      : "border-slate-200 bg-white text-slate-400"
                  )}
                >
                  {decision ? DECISION_ICONS[decision.decision] : level.level}
                </div>
                {idx < levels.length - 1 && (
                  <div
                    className={cn(
                      "w-0.5 flex-1 my-1",
                      isCompleted ? "bg-emerald-300" : "bg-slate-200"
                    )}
                    style={{ minHeight: 24 }}
                  />
                )}
              </div>

              {/* Level content */}
              <div className="pb-4 flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm">
                      {level.label ?? level.role ?? `רמה ${level.level}`}
                    </p>
                    {decision && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {decision.decision === "APPROVED" && "אושר"}
                        {decision.decision === "REJECTED" && "נדחה"}
                        {decision.decision === "DELEGATED" && "הועבר לממלא מקום"}
                        {decision.comment && ` — ${decision.comment}`}
                        {" · "}
                        {new Date(decision.decided_at).toLocaleDateString("he-IL")}
                      </p>
                    )}
                    {!decision && isCurrentLevel && (
                      <p className="text-xs text-amber-600 mt-0.5">ממתין לאישור</p>
                    )}
                    {!decision && isPending && (
                      <p className="text-xs text-muted-foreground mt-0.5">טרם הגיע</p>
                    )}
                  </div>

                  {/* Action buttons for current level */}
                  {isCurrentLevel && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => {
                          setDecideKind("APPROVED")
                          setDecideOpen(true)
                        }}
                      >
                        אשר
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs"
                        onClick={() => {
                          setDecideKind("REJECTED")
                          setDecideOpen(true)
                        }}
                      >
                        דחה
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          setDecideKind("DELEGATED")
                          setDecideOpen(true)
                        }}
                      >
                        האצל
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Decision Dialog */}
      <Dialog open={decideOpen} onOpenChange={setDecideOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decideKind === "APPROVED" && "אישור הזמנה"}
              {decideKind === "REJECTED" && "דחיית הזמנה"}
              {decideKind === "DELEGATED" && "האצלת אישור"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {decideKind === "DELEGATED" && (
              <div className="space-y-1">
                <Label>מזהה המשתמש הממלא מקום *</Label>
                <Input
                  value={delegateTo}
                  onChange={(e) => setDelegateTo(e.target.value)}
                  placeholder="UUID של המשתמש"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground">
                  הכנס UUID של המשתמש שאליו מאצילים את האישור
                </p>
              </div>
            )}
            <div className="space-y-1">
              <Label>הערה {decideKind === "REJECTED" ? "(מומלץ)" : "(אופציונלי)"}</Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="הוסף הערה לתיעוד..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDecideOpen(false)}>
              ביטול
            </Button>
            <Button
              onClick={() => void handleDecide()}
              disabled={deciding || (decideKind === "DELEGATED" && !delegateTo.trim())}
              variant={decideKind === "REJECTED" ? "destructive" : "default"}
              className={decideKind === "APPROVED" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            >
              {deciding
                ? "שומר..."
                : decideKind === "APPROVED"
                ? "אשר הזמנה"
                : decideKind === "REJECTED"
                ? "דחה הזמנה"
                : "האצל"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
