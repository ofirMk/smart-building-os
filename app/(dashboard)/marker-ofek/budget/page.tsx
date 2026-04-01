"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import * as React from "react"
import {
  ArrowRight,
  Gauge,
  Loader2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"

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
import { decodeMilestoneDisplayName } from "@/lib/marker-ofek/milestone-name-codec"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"

type ProjectOption = { id: string; name: string; internal_project_code: string }

type ContractMilestoneBudgetRow = {
  id: string
  contract_id: string
  name: string
  amount: number | string | null
}

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function milestonePlannedAmount(m: ContractMilestoneBudgetRow): number {
  const a = Number(m.amount)
  return roundMoney(Number.isFinite(a) ? a : 0)
}

function MarkerOfekBudgetPageInner() {
  const searchParams = useSearchParams()
  const projectFromUrl = searchParams.get("project")
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [projectId, setProjectId] = React.useState<string>("")
  const [loadingProjects, setLoadingProjects] = React.useState(true)
  const [loadingBudget, setLoadingBudget] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [plannedTotal, setPlannedTotal] = React.useState(0)
  const [costTotal, setCostTotal] = React.useState(0)
  const [revenueTotal, setRevenueTotal] = React.useState(0)
  const [varianceRows, setVarianceRows] = React.useState<
    {
      sectionKey: string
      label: string
      planned: number
      actualCost: number
      revenue: number
      utilizationPct: number | null
      status: "ok" | "over" | "no_budget"
    }[]
  >([])

  React.useEffect(() => {
    let cancelled = false
    async function loadProjects() {
      setLoadingProjects(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error: qErr } = await supabase
          .from("projects")
          .select("id, name, internal_project_code")
          .eq("is_deleted", false)
          .order("name", { ascending: true })

        if (qErr) throw qErr
        const list = (data as ProjectOption[]) ?? []
        if (!cancelled) {
          setProjects(list)
          setProjectId((prev) => {
            if (prev && list.some((p) => p.id === prev)) return prev
            if (
              projectFromUrl &&
              list.some((p) => p.id === projectFromUrl)
            ) {
              return projectFromUrl
            }
            return list[0]?.id ?? ""
          })
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e))
          setProjects([])
        }
      } finally {
        if (!cancelled) setLoadingProjects(false)
      }
    }
    void loadProjects()
    return () => {
      cancelled = true
    }
  }, [projectFromUrl])

  React.useEffect(() => {
    if (!projectId) {
      setPlannedTotal(0)
      setCostTotal(0)
      setRevenueTotal(0)
      setVarianceRows([])
      return
    }

    let cancelled = false

    async function loadBudget() {
      setLoadingBudget(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()

        const { data: contracts, error: cErr } = await supabase
          .from("contracts")
          .select("id")
          .eq("project_id", projectId)
          .eq("is_deleted", false)

        if (cErr) throw cErr
        const contractIds = ((contracts ?? []) as { id: string }[]).map(
          (c) => c.id
        )

        if (contractIds.length === 0) {
          if (!cancelled) {
            setPlannedTotal(0)
            setCostTotal(0)
            setRevenueTotal(0)
            setVarianceRows([])
          }
          return
        }

        const { data: msRows, error: lErr } = await supabase
          .from("contract_milestones")
          .select("id, contract_id, name, amount")
          .in("contract_id", contractIds)

        if (lErr) throw lErr
        const milestoneRows = (msRows ?? []) as ContractMilestoneBudgetRow[]

        const { data: pasApproved, error: paErr } = await supabase
          .from("partial_accounts")
          .select("id")
          .in("contract_id", contractIds)
          .eq("is_deleted", false)
          .in("status", ["approved", "paid"])

        if (paErr) throw paErr
        const paIds = ((pasApproved ?? []) as { id: string }[]).map((p) => p.id)

        const revenueByMilestoneId = new Map<string, number>()
        if (paIds.length > 0) {
          const { data: pali, error: pErr } = await supabase
            .from("partial_account_line_items")
            .select("approved_amount, contract_milestone_id")
            .in("partial_account_id", paIds)

          if (pErr) throw pErr
          for (const row of (pali ?? []) as {
            approved_amount: number
            contract_milestone_id: string | null
          }[]) {
            const mid = row.contract_milestone_id
            if (!mid) continue
            const amt = Number(row.approved_amount) || 0
            revenueByMilestoneId.set(
              mid,
              roundMoney((revenueByMilestoneId.get(mid) ?? 0) + amt)
            )
          }
        }

        const { data: pos, error: poErr } = await supabase
          .from("purchase_orders")
          .select("id")
          .eq("project_id", projectId)
          .eq("is_deleted", false)

        if (poErr) throw poErr
        const poIds = ((pos ?? []) as { id: string }[]).map((p) => p.id)

        let totalPoActual = 0
        if (poIds.length > 0) {
          const { data: poli, error: poliErr } = await supabase
            .from("po_line_items")
            .select("id, quantity, unit_price, total_price, po_id")
            .in("po_id", poIds)

          if (poliErr) throw poliErr

          const { data: receipts, error: rErr } = await supabase
            .from("goods_receipts")
            .select("id")
            .in("po_id", poIds)

          if (rErr) throw rErr
          const receiptIds = ((receipts ?? []) as { id: string }[]).map(
            (r) => r.id
          )

          const receivedByLine = new Map<string, number>()
          if (receiptIds.length > 0) {
            const { data: gri, error: griErr } = await supabase
              .from("goods_receipt_items")
              .select("po_line_item_id, quantity_received")
              .in("goods_receipt_id", receiptIds)

            if (griErr) throw griErr
            for (const g of (gri ?? []) as {
              po_line_item_id: string
              quantity_received: number
            }[]) {
              const lid = g.po_line_item_id
              const q = Number(g.quantity_received) || 0
              receivedByLine.set(
                lid,
                roundMoney((receivedByLine.get(lid) ?? 0) + q)
              )
            }
          }

          for (const pl of (poli ?? []) as {
            id: string
            quantity: number
            unit_price: number
            total_price: number
          }[]) {
            const ordered = Number(pl.quantity) || 0
            const unit = Number(pl.unit_price) || 0
            const recv = Math.min(
              ordered,
              receivedByLine.get(pl.id) ?? 0
            )
            totalPoActual = roundMoney(totalPoActual + recv * unit)
          }
        }

        const plannedBySection = new Map<string, number>()
        const revenueBySection = new Map<string, number>()
        const labelBySection = new Map<string, string>()

        for (const m of milestoneRows) {
          const sec =
            decodeMilestoneDisplayName(String(m.name ?? "")).sectionCode.trim() ||
            "—"
          const desc =
            decodeMilestoneDisplayName(String(m.name ?? "")).description.trim()
          const label = `${sec} — ${desc.slice(0, 48) || m.name?.slice(0, 48) || ""}`
          if (!labelBySection.has(sec)) labelBySection.set(sec, label)

          const base = milestonePlannedAmount(m)
          plannedBySection.set(
            sec,
            roundMoney((plannedBySection.get(sec) ?? 0) + base)
          )

          const rev = revenueByMilestoneId.get(m.id) ?? 0
          if (rev > 0) {
            revenueBySection.set(
              sec,
              roundMoney((revenueBySection.get(sec) ?? 0) + rev)
            )
          }
        }

        const sectionKeys = new Set<string>([
          ...plannedBySection.keys(),
          ...revenueBySection.keys(),
        ])

        let sumPlanned = 0
        for (const v of plannedBySection.values()) sumPlanned = roundMoney(sumPlanned + v)

        let sumRevenue = 0
        for (const v of revenueBySection.values()) sumRevenue = roundMoney(sumRevenue + v)

        const rows: (typeof varianceRows)[number][] = []
        for (const sec of sectionKeys) {
          const planned = plannedBySection.get(sec) ?? 0
          const revenue = revenueBySection.get(sec) ?? 0
          const share = sumPlanned > 0 ? planned / sumPlanned : 0
          const actualCost =
            sumPlanned > 0 ? roundMoney(totalPoActual * share) : 0

          let utilizationPct: number | null = null
          let status: "ok" | "over" | "no_budget" = "no_budget"
          if (planned > 0.01) {
            utilizationPct = roundMoney((actualCost / planned) * 100)
            status = utilizationPct > 100 + 0.5 ? "over" : "ok"
          } else if (actualCost > 0.01 || revenue > 0.01) {
            status = "no_budget"
          }

          rows.push({
            sectionKey: sec,
            label: labelBySection.get(sec) ?? sec,
            planned,
            actualCost,
            revenue,
            utilizationPct,
            status,
          })
        }

        rows.sort((a, b) =>
          a.sectionKey.localeCompare(b.sectionKey, "he", { numeric: true })
        )

        if (
          totalPoActual > 0.02 &&
          sumPlanned < 0.01 &&
          rows.length === 0
        ) {
          rows.push({
            sectionKey: "_po",
            label: "רכש (ללא תקציב מתוכנן בסעיפים)",
            planned: 0,
            actualCost: totalPoActual,
            revenue: 0,
            utilizationPct: null,
            status: "no_budget",
          })
        }

        if (!cancelled) {
          setPlannedTotal(sumPlanned)
          setCostTotal(totalPoActual)
          setRevenueTotal(sumRevenue)
          setVarianceRows(rows)
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e))
          setPlannedTotal(0)
          setCostTotal(0)
          setRevenueTotal(0)
          setVarianceRows([])
        }
      } finally {
        if (!cancelled) setLoadingBudget(false)
      }
    }

    void loadBudget()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const profitLoss = roundMoney(revenueTotal - costTotal)

  return (
    <div
      dir="rtl"
      lang="he"
      className="flex min-h-0 flex-1 flex-col gap-8 pb-12"
    >
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח הבקרה
      </Link>

      <header className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950/40 p-6 shadow-xl ring-1 ring-white/5 sm:p-8">
        <div
          className="pointer-events-none absolute -start-24 top-0 size-72 rounded-full bg-teal-500/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-teal-200">
              <Gauge className="size-7" aria-hidden />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-300/90">
                מרקר אופק
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                בקרה תקציבית
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
                תכנון מול ביצוע — כתב כמויות מול הכנסות מאושרות ועלות רכש בפועל
                (מבוסס קבלות). חלוקת עלות רכש לפי סעיף היא יחסית לתקציב המתוכנן
                בסעיף.
              </p>
            </div>
          </div>

          <div className="w-full min-w-[min(100%,16rem)] space-y-2 md:max-w-xs">
            <label
              htmlFor="budget-project"
              className="text-xs font-medium text-slate-300"
            >
              פרויקט
            </label>
            <Select
              value={projectId || "none"}
              onValueChange={(v) => {
                const x = v ?? ""
                setProjectId(x === "none" ? "" : x)
              }}
              disabled={loadingProjects || projects.length === 0}
            >
              <SelectTrigger
                id="budget-project"
                className="h-11 border-white/15 bg-white/10 text-white backdrop-blur-sm [&_svg]:text-white"
              >
                <SelectValue placeholder="בחרו פרויקט" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="none">—</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.internal_project_code
                      ? ` · ${p.internal_project_code}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {error ? (
        <div
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="מדדי תקציב"
      >
        <BudgetKpi
          title='סה״כ תקציב מתוכנן'
          subtitle="כת״ם — סעיפי מקור בלבד"
          value={loadingBudget ? null : currencyFormatter.format(plannedTotal)}
          icon={Wallet}
          tone="slate"
        />
        <BudgetKpi
          title='סה״כ הוצאות בפועל'
          subtitle="רכש לפי קבלות (פרויקט)"
          value={loadingBudget ? null : currencyFormatter.format(costTotal)}
          icon={TrendingDown}
          tone="rose"
        />
        <BudgetKpi
          title='סה״כ הכנסות מאושרות'
          subtitle="חשבוניות חלקיים — מאושר/שולם"
          value={loadingBudget ? null : currencyFormatter.format(revenueTotal)}
          icon={TrendingUp}
          tone="emerald"
        />
        <BudgetKpi
          title="צפי רווח / הפסד"
          subtitle="הכנסות מאושרות פחות עלות רכש"
          value={
            loadingBudget
              ? null
              : `${profitLoss >= 0 ? "+" : ""}${currencyFormatter.format(profitLoss)}`
          }
          icon={Gauge}
          tone={profitLoss >= 0 ? "teal" : "amber"}
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border/50 pb-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
              תכנון מול ביצוע לפי סעיף
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              ניצול תקציב = עלות בפועל (יחסית) ÷ תקציב מתוכנן לסעיף
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/90 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
          {loadingBudget ? (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              טוען נתונים…
            </div>
          ) : !projectId ? (
            <p className="px-4 py-14 text-center text-sm text-muted-foreground">
              בחרו פרויקט.
            </p>
          ) : varianceRows.length === 0 ? (
            <p className="px-4 py-14 text-center text-sm text-muted-foreground">
              אין סעיפים או נתונים להצגה לפרויקט זה.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="min-w-[12rem] font-semibold">
                      סעיף / תת־פרק
                    </TableHead>
                    <TableHead className="min-w-[7rem] text-end font-semibold">
                      תקציב מתוכנן
                    </TableHead>
                    <TableHead className="min-w-[7rem] text-end font-semibold">
                      עלות בפועל
                    </TableHead>
                    <TableHead className="min-w-[10rem] font-semibold">
                      ניצול תקציב
                    </TableHead>
                    <TableHead className="min-w-[8rem] font-semibold">
                      סטטוס
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {varianceRows.map((row) => (
                    <TableRow
                      key={row.sectionKey}
                      className="border-border/50"
                    >
                      <TableCell className="align-top text-sm font-medium leading-snug">
                        {row.label}
                      </TableCell>
                      <TableCell className="text-end font-mono text-sm tabular-nums">
                        {currencyFormatter.format(row.planned)}
                      </TableCell>
                      <TableCell className="text-end font-mono text-sm tabular-nums">
                        {currencyFormatter.format(row.actualCost)}
                      </TableCell>
                      <TableCell className="align-middle">
                        <UtilizationBar
                          pct={row.utilizationPct}
                          status={row.status}
                        />
                      </TableCell>
                      <TableCell className="text-sm">
                        <VarianceBadge status={row.status} pct={row.utilizationPct} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </section>

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        עלות רכש מחושבת לפי כמויות שקולטו מול מחיר יחידה בהזמנה. חלוקה לסעיפים
        היא פרופורציונלית לתקציב המתוכנן כאשר אין מיפוי ישיר בין שורות רכש לכת״ם.
      </p>
    </div>
  )
}

function BudgetKpi({
  title,
  subtitle,
  value,
  icon: Icon,
  tone,
}: {
  title: string
  subtitle: string
  value: string | null
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  tone: "slate" | "rose" | "emerald" | "teal" | "amber"
}) {
  const tones = {
    slate: "from-slate-500/20 text-slate-700 dark:text-slate-200",
    rose: "from-rose-500/20 text-rose-700 dark:text-rose-300",
    emerald: "from-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    teal: "from-teal-500/20 text-teal-800 dark:text-teal-300",
    amber: "from-amber-500/20 text-amber-800 dark:text-amber-300",
  }
  return (
    <article className="rounded-2xl border border-border/60 bg-card/95 p-5 shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.03]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-[13px] font-semibold leading-tight text-foreground">
            {title}
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br to-transparent",
            tones[tone]
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-xl font-bold tabular-nums tracking-tight text-foreground sm:text-2xl">
        {value === null ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          value
        )}
      </p>
    </article>
  )
}

function UtilizationBar({
  pct,
  status,
}: {
  pct: number | null
  status: "ok" | "over" | "no_budget"
}) {
  if (pct == null || status === "no_budget") {
    return (
      <div className="flex flex-col gap-1">
        <div className="h-2 w-full max-w-[180px] rounded-full bg-muted/80 ms-auto sm:ms-0" />
        <span className="text-[10px] text-muted-foreground">—</span>
      </div>
    )
  }

  const display = Math.min(Math.round(pct), 999)
  const fillWidth = Math.min(pct, 100)
  const over = pct > 100
  return (
    <div className="flex max-w-[200px] flex-col gap-1">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/70 ring-1 ring-border/40">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            over
              ? "bg-gradient-to-l from-red-600 to-red-500"
              : "bg-gradient-to-l from-emerald-600 to-emerald-500"
          )}
          style={{ width: `${fillWidth}%` }}
        />
      </div>
      <span
        className={cn(
          "text-[11px] font-semibold tabular-nums",
          over ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
        )}
      >
        {display}%
      </span>
    </div>
  )
}

export default function MarkerOfekBudgetPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          טוען תקציב…
        </div>
      }
    >
      <MarkerOfekBudgetPageInner />
    </React.Suspense>
  )
}

function VarianceBadge({
  status,
  pct,
}: {
  status: "ok" | "over" | "no_budget"
  pct: number | null
}) {
  if (status === "no_budget" || pct == null) {
    return (
      <span className="inline-flex rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
        ללא תקציב מתוכנן
      </span>
    )
  }
  if (status === "over") {
    return (
      <span className="inline-flex rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-800 dark:text-red-300">
        חריגת עלות
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
      במסגרת
    </span>
  )
}
