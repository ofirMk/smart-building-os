"use client"

/**
 * AutoMatchButton — Sprint A.2.
 *
 * One-click "auto-match all >0.95" trigger for a single bank reconciliation.
 * Calls the `autoMatchBankReconciliation` server action, then refreshes the
 * page so the matched/unmatched counters re-render server-side.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, Wand2 } from "lucide-react"

import { autoMatchBankReconciliation } from "@/app/actions/ap-payments"
import { Button } from "@/components/ui/button"

export function AutoMatchButton({ reconId }: { reconId: string }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)

  async function run(): Promise<void> {
    setBusy(true)
    setMsg(null)
    const res = await autoMatchBankReconciliation(reconId)
    setBusy(false)
    if (!res.ok) {
      setMsg(res.error)
      return
    }
    setMsg(
      res.data.autoConfirmed > 0
        ? `אושרו אוטומטית ${res.data.autoConfirmed} התאמות (מתוך ${res.data.candidatesEvaluated} מועמדים).`
        : `אין הצעות מעל סף 0.95 (${res.data.candidatesEvaluated} מועמדים נבדקו).`,
    )
    router.refresh()
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
        onClick={run}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Wand2 className="size-4" aria-hidden />
        )}
        התאמה אוטומטית
      </Button>
      {msg ? (
        <p className="text-[10px] text-slate-600">{msg}</p>
      ) : null}
    </div>
  )
}
