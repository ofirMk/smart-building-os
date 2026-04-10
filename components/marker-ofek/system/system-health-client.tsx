"use client"

import * as React from "react"
import { Activity, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  fetchSystemHealthAction,
  retrySystemSyncLogAction,
} from "@/lib/holden-erp/finance-actions"
import { cn } from "@/lib/utils"

type HealthPayload = {
  pending: number
  failed: number
  synced: number
  recent: Array<{
    id: string
    status: string
    sourceModule: string
    targetModule: string
    retryCount: number
    updatedAt: string
    errorMessage: string | null
  }>
}

type Props = {
  initial: HealthPayload | null
  loadError: string | null
}

export function SystemHealthClient({ initial, loadError }: Props) {
  const [data, setData] = React.useState<HealthPayload | null>(initial)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)

  React.useEffect(() => {
    setData(initial)
  }, [initial])

  async function refresh() {
    setRefreshing(true)
    const res = await fetchSystemHealthAction()
    setRefreshing(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setData({
      pending: res.pending,
      failed: res.failed,
      synced: res.synced,
      recent: res.recent,
    })
  }

  async function retryOne(id: string) {
    setBusyId(id)
    const res = await retrySystemSyncLogAction(id)
    setBusyId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("סנכרון הושלם")
    void refresh()
  }

  const pulseOk =
    data != null && data.pending === 0 && data.failed === 0

  return (
    <div dir="rtl" className="mx-auto max-w-5xl space-y-8 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "relative flex size-12 items-center justify-center rounded-2xl ring-2",
              pulseOk
                ? "bg-emerald-500/20 ring-emerald-400/50"
                : "bg-red-500/20 ring-red-400/50"
            )}
          >
            <span
              className={cn(
                "absolute inset-0 animate-ping rounded-2xl opacity-40",
                pulseOk ? "bg-emerald-400/30" : "bg-red-400/30"
              )}
            />
            <Activity
              className={cn(
                "relative size-6",
                pulseOk ? "text-emerald-300" : "text-red-300"
              )}
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">בריאות מערכת</h1>
            <p className="text-sm text-slate-400">
              יומן סנכרון — ניסיון חוזר לתור מס״ב
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-white/15 bg-white/5"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          <span className="ms-2">רענן</span>
        </Button>
      </header>

      {loadError ? (
        <p className="text-sm text-red-400">{loadError}</p>
      ) : null}

      {data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="ממתינים" value={data.pending} tone="amber" />
          <Stat label="כשלונות" value={data.failed} tone="red" />
          <Stat label="סונכרנו" value={data.synced} tone="emerald" />
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          רשומות אחרונות
        </h2>
        <div className="space-y-2">
          {(data?.recent ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">אין רשומות</p>
          ) : null}
          {(data?.recent ?? []).map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/30 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-mono text-xs text-slate-500">{r.id.slice(0, 8)}</p>
                <p className="text-slate-200">
                  {r.sourceModule} → {r.targetModule}{" "}
                  <span
                    className={cn(
                      "ms-2 rounded px-2 py-0.5 text-[10px] font-semibold uppercase",
                      r.status === "synced"
                        ? "bg-emerald-500/20 text-emerald-200"
                        : r.status === "failed"
                          ? "bg-red-500/20 text-red-200"
                          : "bg-amber-500/20 text-amber-100"
                    )}
                  >
                    {r.status}
                  </span>
                </p>
                {r.errorMessage ? (
                  <p className="mt-1 text-xs text-red-300/90">{r.errorMessage}</p>
                ) : null}
              </div>
              {(r.status === "pending" || r.status === "failed") &&
              r.targetModule === "masav_queue" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="bg-emerald-600/30 text-white hover:bg-emerald-600/50"
                  disabled={busyId === r.id}
                  onClick={() => void retryOne(r.id)}
                >
                  {busyId === r.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  <span className="ms-1">סנכרן ידנית</span>
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "amber" | "red" | "emerald"
}) {
  const cls = {
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-100",
    red: "border-red-500/30 bg-red-500/10 text-red-100",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  }[tone]
  return (
    <div className={cn("rounded-2xl border px-4 py-5", cls)}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-80">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
    </div>
  )
}
