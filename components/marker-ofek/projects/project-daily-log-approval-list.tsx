"use client"

import * as React from "react"
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { setDailyLogFieldApproval } from "@/lib/marker-ofek/project-execution-actions"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn, formatError } from "@/lib/utils"

export type DailyLogApprovalRow = {
  id: string
  log_date: string
  field_approval_status: string
  field_approved_at?: string | null
}

export function ProjectDailyLogApprovalList({
  initialLogs,
}: {
  initialLogs: DailyLogApprovalRow[]
}) {
  const [logs, setLogs] = React.useState(initialLogs)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  React.useEffect(() => {
    setLogs(initialLogs)
  }, [initialLogs])

  async function setStatus(logId: string, status: "draft" | "approved") {
    setBusyId(logId)
    try {
      const res = await setDailyLogFieldApproval({ logId, status })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setLogs((prev) =>
        prev.map((l) =>
          l.id === logId
            ? {
                ...l,
                field_approval_status: status,
                field_approved_at:
                  status === "approved" ? new Date().toISOString() : null,
              }
            : l
        )
      )
      toast.success(
        status === "approved"
          ? "היומן אושר לחיוב"
          : "היומן הוחזר לטיוטה (חיוב)"
      )
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusyId(null)
    }
  }

  if (logs.length === 0) return null

  return (
    <section
      className="mx-auto mt-8 max-w-lg space-y-3 rounded-xl border border-slate-100 bg-slate-50/40 p-4"
      dir="rtl"
    >
      <h2 className="text-sm font-semibold text-[#1e293b]">
        אישור יומנים לחיוב
      </h2>
      <p className="text-xs text-slate-500">
        רק יומנים במצב ״מאושר לחיוב״ נכללים בכפתור ״משוך נתוני שדה״ בחשבון החלקי.
      </p>
      <ul className="space-y-2">
        {logs.map((l) => {
          const approved = l.field_approval_status === "approved"
          return (
            <li
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2"
            >
              <span className="font-currency-mono text-sm text-slate-700">
                {l.log_date}
              </span>
              <span className="text-xs text-slate-500">
                {approved ? (
                  <>
                    מאושר לחיוב
                    {l.field_approved_at ? (
                      <span className="mt-0.5 block font-mono text-[10px] text-slate-400">
                        {new Date(l.field_approved_at).toLocaleString("he-IL")}
                      </span>
                    ) : null}
                  </>
                ) : (
                  "טיוטה"
                )}
              </span>
              <div className="flex gap-2">
                {approved ? (
                  <button
                    type="button"
                    disabled={busyId === l.id}
                    onClick={() => void setStatus(l.id, "draft")}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "gap-1 border-slate-200"
                    )}
                  >
                    {busyId === l.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <RotateCcw className="size-3.5" aria-hidden />
                    )}
                    ביטול אישור
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === l.id}
                    onClick={() => void setStatus(l.id, "approved")}
                    className={cn(
                      buttonVariants({ variant: "default", size: "sm" }),
                      "gap-1 border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                    )}
                  >
                    {busyId === l.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <CheckCircle2 className="size-3.5" aria-hidden />
                    )}
                    אשר לחיוב
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
