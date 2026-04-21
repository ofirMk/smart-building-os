"use client"

import * as React from "react"
import {
  BarChart3,
  ClipboardList,
  Loader2,
  PanelRightOpen,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { poRowCountsTowardCommittedSpend } from "@/lib/marker-ofek/procurement/po-cost-policy"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"

import { useMarkerOfekWorkspace } from "./marker-ofek-workspace-context"

type ProjectOption = { id: string; name: string; internal_project_code: string }

const currency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function MarkerOfekProjectDrawerTrigger({
  className,
}: {
  className?: string
}) {
  const { openProjectDrawer } = useMarkerOfekWorkspace()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "gap-2 border-cyan-500/30 bg-cyan-500/5 shadow-sm hover:bg-cyan-500/10",
        className
      )}
      onClick={openProjectDrawer}
    >
      <PanelRightOpen className="size-4" aria-hidden />
      הקשר פרויקט
    </Button>
  )
}

export function MarkerOfekProjectDrawer() {
  const {
    projectDrawerOpen,
    setProjectDrawerOpen,
    contextProjectId,
    setContextProjectId,
  } = useMarkerOfekWorkspace()

  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [localProjectId, setLocalProjectId] = React.useState("")
  const [loadingList, setLoadingList] = React.useState(false)
  const [loadingStats, setLoadingStats] = React.useState(false)
  const [planned, setPlanned] = React.useState<number | null>(null)
  const [actualCost, setActualCost] = React.useState<number | null>(null)
  const [pendingTasks, setPendingTasks] = React.useState<number | null>(null)
  const [err, setErr] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!projectDrawerOpen) return
    let c = false
    async function loadProjects() {
      setLoadingList(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error: q } = await supabase
          .from("projects")
          .select("id, name, internal_project_code")
          .eq("is_deleted", false)
          .order("name", { ascending: true })
        if (q) throw q
        if (!c) {
          const list = (data as ProjectOption[]) ?? []
          setProjects(list)
          const preferred =
            contextProjectId && list.some((p) => p.id === contextProjectId)
              ? contextProjectId
              : list[0]?.id ?? ""
          setLocalProjectId(preferred)
        }
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!c) setLoadingList(false)
      }
    }
    void loadProjects()
    return () => {
      c = true
    }
  }, [projectDrawerOpen, contextProjectId])

  React.useEffect(() => {
    if (!projectDrawerOpen || !localProjectId) {
      setPlanned(null)
      setActualCost(null)
      setPendingTasks(null)
      return
    }
    let c = false
    async function loadStats() {
      setLoadingStats(true)
      setErr(null)
      try {
        const supabase = createSupabaseBrowserClient()

        const { data: contracts, error: cErr } = await supabase
          .from("contracts")
          .select("id")
          .eq("project_id", localProjectId)
          .eq("is_deleted", false)
        if (cErr) throw cErr
        const cids = ((contracts ?? []) as { id: string }[]).map((x) => x.id)
        let plannedSum = 0
        if (cids.length > 0) {
          const { data: ms, error: lErr } = await supabase
            .from("contract_milestones")
            .select("amount")
            .in("contract_id", cids)
          if (lErr) throw lErr
          for (const row of ms ?? []) {
            const a = Number((row as { amount: number | null }).amount) || 0
            plannedSum += roundMoney(a)
          }
        }

        const { data: pos, error: pErr } = await supabase
          .from("purchase_orders")
          .select("id, status, is_ceo_approved")
          .eq("project_id", localProjectId)
          .eq("is_deleted", false)
        if (pErr) throw pErr
        const poIds = ((pos ?? []) as {
          id: string
          status: string
          is_ceo_approved?: boolean | null
        }[])
          .filter((x) => poRowCountsTowardCommittedSpend(x))
          .map((x) => x.id)
        let costSum = 0
        if (poIds.length > 0) {
          const { data: poli, error: poliErr } = await supabase
            .from("po_line_items")
            .select("total_price")
            .in("po_id", poIds)
          if (poliErr) throw poliErr
          for (const row of poli ?? []) {
            costSum += Number((row as { total_price: number }).total_price) || 0
          }
        }

        let taskPending = 0
        const { count, error: tErr } = await supabase
          .from("project_tasks")
          .select("id", { count: "exact", head: true })
          .eq("project_id", localProjectId)
          .neq("status", "done")
        if (!tErr && typeof count === "number") taskPending = count

        if (!c) {
          setPlanned(plannedSum)
          setActualCost(costSum)
          setPendingTasks(taskPending)
        }
      } catch (e) {
        if (!c) {
          setPlanned(null)
          setActualCost(null)
          setPendingTasks(null)
          setErr(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!c) setLoadingStats(false)
      }
    }
    void loadStats()
    return () => {
      c = true
    }
  }, [projectDrawerOpen, localProjectId])

  const variance =
    planned != null && actualCost != null
      ? roundMoney(planned - actualCost)
      : null

  return (
    <Sheet open={projectDrawerOpen} onOpenChange={setProjectDrawerOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-border/70 bg-background/95 p-0 sm:max-w-md"
        dir="rtl"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-4 text-start">
          <SheetTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-5 text-cyan-500" aria-hidden />
            תמונת מצב — פרויקט
          </SheetTitle>
          <SheetDescription className="text-start">
            תקציב מתוכנן מול עלות רכש (הזמנות), ומשימות פתוחות בלוח הזמנים.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">פרויקט</Label>
            <Select
              value={localProjectId || ""}
              onValueChange={(v) => {
                const id = v ?? ""
                setLocalProjectId(id)
                setContextProjectId(id || null)
              }}
              disabled={loadingList || projects.length === 0}
            >
              <SelectTrigger className="border-border/70">
                <SelectValue placeholder="בחרו פרויקט" />
              </SelectTrigger>
              <SelectContent diamondEntity="projects">
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{" "}
                    <span className="text-muted-foreground">
                      ({p.internal_project_code})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {err ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-2 text-xs text-destructive">
              {err}
            </p>
          ) : null}

          {loadingStats ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              טוען נתונים…
            </div>
          ) : localProjectId ? (
            <div className="grid gap-3">
              <div className="rounded-xl border border-slate-100 bg-card p-4 shadow-sm">
                <p className="text-xs font-medium text-muted-foreground">
                  תכנון (BoQ) לעומת עלות רכש
                </p>
                <dl className="mt-3 grid gap-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">מתוכנן (שורות חוזה)</dt>
                    <dd className="font-semibold tabular-nums">
                      {planned != null ? currency.format(planned) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">עלות רכש (הזמנות)</dt>
                    <dd className="font-semibold tabular-nums text-amber-700">
                      {actualCost != null ? currency.format(actualCost) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-border/50 pt-2">
                    <dt className="font-medium">פער (תכנון − רכש)</dt>
                    <dd
                      className={cn(
                        "font-bold tabular-nums",
                        variance != null && variance < 0
                          ? "text-destructive"
                          : "text-emerald-600"
                      )}
                    >
                      {variance != null ? currency.format(variance) : "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
                <ClipboardList className="mt-0.5 size-5 shrink-0 text-violet-600" />
                <div>
                  <p className="text-sm font-medium">משימות פתוחות</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-violet-700">
                    {pendingTasks ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    סטטוס שאינו &quot;הושלם&quot; בלוח הזמנים (אם הטבלה קיימת).
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">אין פרויקטים לבחירה.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
