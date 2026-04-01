"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import {
  ArrowRight,
  ClipboardList,
  FileEdit,
  Loader2,
  Receipt,
  Sparkles,
  TrendingUp,
} from "lucide-react"
import { toast } from "sonner"

import { buildContractAndBaselineAI } from "@/app/(dashboard)/marker-ofek/projects/actions/project-ai-actions"
import { saveProgressReport } from "../actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cleanDescription } from "@/lib/marker-ofek/clean-milestone-description"
import {
  chapterHeaderLabel,
  sortChapterPrefixes,
  wbsChapterPrefix,
} from "@/lib/marker-ofek/wbs-chapter"
import {
  decodeMilestoneDisplayName,
  decodeMilestoneStoredName,
} from "@/lib/marker-ofek/milestone-name-codec"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"

type ContractOption = {
  id: string
  project_id: string
  total_amount: number | null
  status: string
  contract_type: string
  contract_number: string | null
  name: string | null
  projects:
    | { internal_project_code: string; name: string }
    | { internal_project_code: string; name: string }[]
    | null
  entities: { name: string } | { name: string }[] | null
}

type MilestoneRow = {
  id: string
  name: string
  amount: number
  sort_order: number
}

/** מצב תצוגת שלב 2 אחרי בחירת חוזה */
type ContractFlowState = "idle" | "loading" | "empty" | "has_baseline"

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function currentMonthIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function parseDecimal(s: string): number {
  const n = parseFloat(String(s).replace(",", ".").trim())
  return Number.isFinite(n) ? n : 0
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function calcCurrentAmount(
  totalPrice: number,
  selectedPctRaw: number,
  previousPctRaw: number | null | undefined
): { deltaPct: number; currentAmount: number; cumulativeValue: number } {
  const previousPct = clampPct(Number(previousPctRaw ?? 0))
  const selectedPct = clampPct(Number(selectedPctRaw))
  const selectedBps = Math.round(selectedPct * 100)
  const previousBps = Math.round(previousPct * 100)
  const deltaBps = selectedBps - previousBps
  const deltaPct = roundMoney(deltaBps / 100)
  const currentAmount = roundMoney((totalPrice * deltaBps) / 10000)
  const cumulativeValue = roundMoney((totalPrice * selectedBps) / 10000)
  return { deltaPct, currentAmount, cumulativeValue }
}

function contractLabel(c: ContractOption): string {
  const primary =
    (c.contract_number?.trim() ? `${c.contract_number.trim()} - ` : "") +
    (c.name?.trim() ?? "")
  const p = embedOne(c.projects)
  const e = embedOne(c.entities)
  const code = p?.internal_project_code?.trim() ?? ""
  const ent = e?.name?.trim() ?? ""
  const amt =
    c.total_amount != null ? currencyFormatter.format(Number(c.total_amount)) : ""
  const tail = [code, ent, amt].filter(Boolean).join(" · ")
  const main = primary.trim()
  if (main && tail) return `${main} · ${tail}`
  if (main) return main
  if (tail) return tail
  return `חוזה ${c.id.slice(0, 8)}…`
}

function milestoneSectionLabel(m: MilestoneRow, index: number): string {
  const s = decodeMilestoneStoredName(m.name).sectionCode.trim()
  if (s) return s
  const legacy = decodeMilestoneDisplayName(m.name).sectionCode.trim()
  if (legacy) return legacy
  return String(index + 1)
}

function milestoneDescriptionText(m: MilestoneRow): string {
  const d = decodeMilestoneStoredName(m.name)
  return cleanDescription(d.description || d.sectionCode)
}

function groupMilestonesByWbsChapter(rows: MilestoneRow[]): {
  orderedPrefixes: string[]
  byPrefix: Map<string, MilestoneRow[]>
} {
  const byPrefix = new Map<string, MilestoneRow[]>()
  for (const m of rows) {
    const code = decodeMilestoneStoredName(m.name).sectionCode
    const prefix = wbsChapterPrefix(code)
    const list = byPrefix.get(prefix) ?? []
    list.push(m)
    byPrefix.set(prefix, list)
  }
  for (const list of byPrefix.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order)
  }
  const orderedPrefixes = sortChapterPrefixes([...byPrefix.keys()])
  return { orderedPrefixes, byPrefix }
}

function NewProgressReportPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filterProjectId = searchParams.get("projectId")?.trim() ?? ""

  const [contracts, setContracts] = React.useState<ContractOption[]>([])
  const [loadingContracts, setLoadingContracts] = React.useState(true)
  const [contractsLoadError, setContractsLoadError] = React.useState<
    string | null
  >(null)

  const [selectedContractId, setSelectedContractId] =
    React.useState<string>("")
  const [reportMonth, setReportMonth] = React.useState<string>(() =>
    currentMonthIso()
  )

  const [milestones, setMilestones] = React.useState<MilestoneRow[]>([])
  const [loadingMilestones, setLoadingMilestones] = React.useState(false)
  const [milestoneReloadToken, setMilestoneReloadToken] = React.useState(0)
  const [hasProgressReportHistory, setHasProgressReportHistory] =
    React.useState(false)
  const [baselineMeta, setBaselineMeta] = React.useState<{
    reportMonth: string
    status: string
  } | null>(null)

  const [buildBaselinePending, startBuildBaselineTransition] =
    React.useTransition()
  const [saveReportPending, startSaveReportTransition] = React.useTransition()

  const [previousPctByLine, setPreviousPctByLine] = React.useState<
    Record<string, string>
  >({})
  const [currentPctByLine, setCurrentPctByLine] = React.useState<
    Record<string, string>
  >({})

  const [indexation, setIndexation] = React.useState("")
  const [retentionPercent, setRetentionPercent] = React.useState("5")
  const [deductions, setDeductions] = React.useState("")
  const [previousBilled, setPreviousBilled] = React.useState("")

  const [savingAs, setSavingAs] = React.useState<"draft" | "submitted" | null>(
    null
  )
  const restoredDraftKeyRef = React.useRef<string | null>(null)

  const contractState = React.useMemo<ContractFlowState>(() => {
    if (!selectedContractId.trim()) return "idle"
    if (loadingMilestones) return "loading"
    if (milestones.length === 0) return "empty"
    return "has_baseline"
  }, [selectedContractId, loadingMilestones, milestones.length])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingContracts(true)
      setContractsLoadError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        let q = supabase
          .from("contracts")
          .select(
            `
            id,
            name,
            contract_number,
            project_id,
            total_amount,
            status,
            contract_type,
            projects ( internal_project_code, name ),
            entities ( name )
          `
          )
          .eq("is_deleted", false)
        if (filterProjectId) {
          q = q.eq("project_id", filterProjectId)
        }
        const { data, error } = await q.order("created_at", {
          ascending: false,
        })
        if (error) throw error
        if (!cancelled) setContracts((data ?? []) as ContractOption[])
      } catch (e) {
        if (!cancelled) {
          const msg = formatError(e)
          setContractsLoadError(msg)
          toast.error(msg)
        }
      } finally {
        if (!cancelled) setLoadingContracts(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [filterProjectId])

  React.useEffect(() => {
    if (!selectedContractId.trim()) {
      setMilestones([])
      setPreviousPctByLine({})
      setCurrentPctByLine({})
      setHasProgressReportHistory(false)
      setBaselineMeta(null)
      return
    }
    let cancelled = false
    void (async () => {
      setLoadingMilestones(true)
      setBaselineMeta(null)
      try {
        const supabase = createSupabaseBrowserClient()

        const { data: msData, error: msError } = await supabase
          .from("contract_milestones")
          .select("id, name, amount, sort_order")
          .eq("contract_id", selectedContractId)
          .order("sort_order", { ascending: true })

        if (msError) throw msError
        const rows = (msData ?? []) as Array<{
          id: string
          name: string
          amount: number | string
          sort_order: number
        }>
        const mapped: MilestoneRow[] = rows.map((r) => ({
          id: r.id,
          name: r.name,
          amount: Number(r.amount) || 0,
          sort_order: r.sort_order,
        }))

        const prevByMilestone: Record<string, number> = {}

        const { count: historyCount, error: histErr } = await supabase
          .from("project_progress_reports")
          .select("id", { count: "exact", head: true })
          .eq("contract_id", selectedContractId)
          .eq("status", "approved")

        const hasHistory =
          !histErr && historyCount != null && historyCount > 0

        const { data: lastRep, error: repErr } = await supabase
          .from("project_progress_reports")
          .select("id, report_month, status, created_at")
          .eq("contract_id", selectedContractId)
          .eq("status", "approved")
          .order("report_month", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        let nextBaseline: { reportMonth: string; status: string } | null = null
        if (!repErr && lastRep) {
          const lr = lastRep as {
            id: string
            report_month: string | null
            status: string | null
          }
          if (lr.report_month && lr.status) {
            nextBaseline = { reportMonth: lr.report_month, status: lr.status }
          }
          const { data: itemRows, error: itemsErr } = await supabase
            .from("project_progress_items")
            .select(
              "contract_milestone_id, quantity_contract, quantity_previous_cumulative, quantity_current_cumulative"
            )
            .eq("progress_report_id", lr.id)

          if (!itemsErr && itemRows?.length) {
            for (const it of itemRows) {
              const row = it as {
                contract_milestone_id: string
                quantity_contract: number | string | null
                quantity_previous_cumulative: number | string | null
                quantity_current_cumulative: number | string | null
              }
              const mid = row.contract_milestone_id
              const qcc = Number(row.quantity_current_cumulative)
              if (Number.isFinite(qcc)) {
                prevByMilestone[mid] = clampPct(qcc)
                continue
              }
              const qPrev = Number(row.quantity_previous_cumulative)
              if (Number.isFinite(qPrev)) {
                prevByMilestone[mid] = clampPct(qPrev)
              }
            }
          }
        }

        const prev: Record<string, string> = {}
        const curr: Record<string, string> = {}
        for (const m of mapped) {
          const p = roundMoney(prevByMilestone[m.id] ?? 0)
          const s = String(p)
          prev[m.id] = s
          curr[m.id] = s
        }

        if (cancelled) return
        setMilestones(mapped)
        setPreviousPctByLine(prev)
        setCurrentPctByLine(curr)
        setHasProgressReportHistory(hasHistory)
        setBaselineMeta(nextBaseline)
      } catch (e) {
        if (!cancelled) {
          const msg = formatError(e)
          toast.error(msg)
          setMilestones([])
          setPreviousPctByLine({})
          setCurrentPctByLine({})
          setHasProgressReportHistory(false)
          setBaselineMeta(null)
        }
      } finally {
        if (!cancelled) setLoadingMilestones(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedContractId, milestoneReloadToken])

  function onBuildContractBaseline() {
    if (!selectedContractId.trim()) {
      toast.error("נא לבחור חוזה")
      return
    }
    const input = document.getElementById(
      "baseline-pdf-build"
    ) as HTMLInputElement | null
    const file = input?.files?.[0]
    if (!file || file.size === 0) {
      toast.error("נא לבחור קובץ PDF")
      return
    }
    startBuildBaselineTransition(async () => {
      try {
        const fd = new FormData()
        fd.set("contract_id", selectedContractId)
        fd.set("build_pdf", file)
        const res = await buildContractAndBaselineAI(fd)
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        toast.success(
          `נוצרו ${res.milestonesCreated} סעיפים ודוח בסיס מאושר — ניתן לעדכן התקדמות נוכחית`
        )
        if (input) input.value = ""
        router.refresh()
        setMilestoneReloadToken((t) => t + 1)
      } catch (e) {
        toast.error(formatError(e))
      }
    })
  }

  const lineDerived = React.useMemo(() => {
    const byId: Record<
      string,
      {
        deltaPct: number
        approvedThisBill: number
        cumulativeValue: number
      }
    > = {}
    let sumApprovedThisBill = 0
    let sumCumulativeValue = 0
    for (const m of milestones) {
      const prev = parseDecimal(previousPctByLine[m.id] ?? "0")
      const curr = parseDecimal(currentPctByLine[m.id] ?? "0")
      const calc = calcCurrentAmount(m.amount, curr, prev)
      const deltaPct = calc.deltaPct
      const approvedThisBill = calc.currentAmount
      const cumulativeValue = calc.cumulativeValue
      byId[m.id] = { deltaPct, approvedThisBill, cumulativeValue }
      sumApprovedThisBill += approvedThisBill
      sumCumulativeValue += cumulativeValue
    }
    return {
      byId,
      sumApprovedThisBill: roundMoney(sumApprovedThisBill),
      sumCumulativeValue: roundMoney(sumCumulativeValue),
    }
  }, [milestones, previousPctByLine, currentPctByLine])

  const wbsGroups = React.useMemo(
    () => groupMilestonesByWbsChapter(milestones),
    [milestones]
  )

  const previousQtyByLine = React.useMemo(() => {
    const out: Record<string, string> = {}
    for (const m of milestones) {
      const dec = decodeMilestoneStoredName(m.name)
      const qc = parseDecimal(dec.quantity)
      const prev = parseDecimal(previousPctByLine[m.id] ?? "0")
      if (qc > 0) {
        out[m.id] = String(roundMoney((prev / 100) * qc))
      }
    }
    return out
  }, [milestones, previousPctByLine])

  const autosaveKey = React.useMemo(
    () =>
      selectedContractId.trim()
        ? `mo-progress-report-draft:${selectedContractId.trim()}:${reportMonth}`
        : "",
    [selectedContractId, reportMonth]
  )

  React.useEffect(() => {
    if (!autosaveKey || milestones.length === 0) return
    if (restoredDraftKeyRef.current === autosaveKey) return
    restoredDraftKeyRef.current = autosaveKey
    try {
      const raw = window.localStorage.getItem(autosaveKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        currentPctByLine?: Record<string, string>
        indexation?: string
        retentionPercent?: string
        deductions?: string
        previousBilled?: string
      }
      if (parsed.currentPctByLine && typeof parsed.currentPctByLine === "object") {
        setCurrentPctByLine((prev) => ({ ...prev, ...parsed.currentPctByLine }))
      }
      if (typeof parsed.indexation === "string") setIndexation(parsed.indexation)
      if (typeof parsed.retentionPercent === "string") {
        setRetentionPercent(parsed.retentionPercent)
      }
      if (typeof parsed.deductions === "string") setDeductions(parsed.deductions)
      if (typeof parsed.previousBilled === "string") {
        setPreviousBilled(parsed.previousBilled)
      }
      toast.message("טיוטת אחוזים שוחזרה אוטומטית")
    } catch {
      // Ignore broken local draft payload.
    }
  }, [autosaveKey, milestones.length])

  React.useEffect(() => {
    if (!autosaveKey || milestones.length === 0) return
    try {
      window.localStorage.setItem(
        autosaveKey,
        JSON.stringify({
          currentPctByLine,
          indexation,
          retentionPercent,
          deductions,
          previousBilled,
        })
      )
    } catch {
      // Storage quota or browser limitation.
    }
  }, [
    autosaveKey,
    milestones.length,
    currentPctByLine,
    indexation,
    retentionPercent,
    deductions,
    previousBilled,
  ])

  const indexationN = parseDecimal(indexation)
  const retentionPN = parseDecimal(retentionPercent)
  const deductionsN = parseDecimal(deductions)
  const previousBilledN = parseDecimal(previousBilled)

  const baseForRetention =
    Math.round((lineDerived.sumApprovedThisBill + indexationN) * 100) / 100
  const retentionAmount =
    Math.round(((baseForRetention * retentionPN) / 100) * 100) / 100
  const totalPayable =
    Math.round(
      (baseForRetention - retentionAmount - deductionsN - previousBilledN) *
        100
    ) / 100

  function resetForm() {
    if (autosaveKey) {
      try {
        window.localStorage.removeItem(autosaveKey)
      } catch {
        // Ignore.
      }
    }
    setSelectedContractId("")
    setReportMonth(currentMonthIso())
    setMilestones([])
    setPreviousPctByLine({})
    setCurrentPctByLine({})
    setIndexation("")
    setRetentionPercent("5")
    setDeductions("")
    setPreviousBilled("")
    setBaselineMeta(null)
  }

  function saveReport(reportStatus: "draft" | "submitted") {
    if (!selectedContractId.trim()) {
      toast.error("נא לבחור חוזה")
      return
    }
    setSavingAs(reportStatus)
    startSaveReportTransition(async () => {
      try {
        const lines = milestones.map((m) => ({
          contractMilestoneId: m.id,
          pctPreviousCumulative: parseDecimal(previousPctByLine[m.id] ?? "0"),
          pctCurrentCumulative: parseDecimal(currentPctByLine[m.id] ?? "0"),
        }))
        const res = await saveProgressReport({
          contractId: selectedContractId,
          reportMonth,
          reportStatus,
          indexationAmount: indexationN,
          retentionPercent: retentionPN,
          deductionsAmount: deductionsN,
          previousBilledAmount: previousBilledN,
          lines,
        })
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        toast.success(
          reportStatus === "draft"
            ? "הדוח נשמר כטיוטה"
            : "החשבון החלקי הופק והדוח הועבר לסטטוס מוגש"
        )
        resetForm()
      } catch (err) {
        toast.error(formatError(err))
      } finally {
        setSavingAs(null)
      }
    })
  }

  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-1 pb-16 pt-2 sm:px-0"
    >
      <Link
        href="/marker-ofek/field-execution"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לביצוע בשטח
      </Link>

      <header className="space-y-2 text-start">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-900 dark:text-sky-200">
            <TrendingUp className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              מודול 3.2 · ביצוע בשטח
            </p>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              דיווח התקדמות / חשבונות חלקיים
            </h1>
          </div>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          זרימה מובנית: בחירת חוזה → הקמת אבני דרך (אם חסר) → מילוי אחוזים והפקת
          חשבון חלקי.
        </p>
      </header>

      <form
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col gap-5"
      >
        {/* ——— שלב 1: בחירת חוזה ——— */}
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2 text-start">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-mono text-xs">
                  שלב 1
                </Badge>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ClipboardList
                    className="size-5 text-muted-foreground"
                    aria-hidden
                  />
                  בחירת חוזה וחודש דיווח
                </CardTitle>
              </div>
              <CardDescription>
                לאחר בחירת חוזה נטענות אבני הדרך (לפי סדר) ונשלף בסיס מהדוח
                המאושר האחרון אם קיים (חשבון 21).
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {contractsLoadError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">
                {contractsLoadError}
              </p>
            ) : null}
            {contracts.length === 0 && !loadingContracts ? (
              <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground sm:col-span-2">
                אין חוזים במערכת. צרו חוזה תחילה.
              </p>
            ) : null}
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="pr-contract">חוזה</Label>
              <Select
                value={selectedContractId || ""}
                onValueChange={(v) => setSelectedContractId(v ?? "")}
                disabled={loadingContracts || contracts.length === 0}
              >
                <SelectTrigger id="pr-contract" className="min-h-11 w-full">
                  <SelectValue placeholder="בחרו חוזה…" />
                </SelectTrigger>
                <SelectContent>
                  {contracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {contractLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-month">חודש הדיווח</Label>
              <Input
                id="pr-month"
                type="month"
                className="min-h-11"
                value={reportMonth || ""}
                onChange={(e) => setReportMonth(e.target.value)}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* ——— שלב 2: סניף לפי מצב החוזה ——— */}
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2 text-start">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-mono text-xs">
                שלב 2
              </Badge>
              <CardTitle className="text-lg">אבני דרך וחישוב חשבון</CardTitle>
              {selectedContractId ? (
                <Badge variant="outline" className="text-xs font-normal">
                  מצב:{" "}
                  {contractState === "loading"
                    ? "טוען…"
                    : contractState === "empty"
                      ? "חוזה ללא אבני דרך"
                      : contractState === "has_baseline"
                        ? "מוכן לדיווח"
                        : "ממתין"}
                </Badge>
              ) : null}
            </div>
            <CardDescription>
              {contractState === "idle" && "בחרו חוזה בשלב 1."}
              {contractState === "loading" && "טוען אבני דרך ובסיס מאושר…"}
              {contractState === "empty" &&
                "אין אבני דרך — יש להקים אותן לפני מילוי חשבון חלקי."}
              {contractState === "has_baseline" &&
                (baselineMeta
                  ? `בסיס שחולץ מהדוח האחרון (${baselineMeta.reportMonth} · ${baselineMeta.status}).`
                  : "אין דוח מאושר קודם — אחוז קודם יוצג כ־0 עד שייווצר דוח מאושר.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-2">
            {contractState === "idle" ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                בחרו חוזה בשלב 1 כדי להמשיך.
              </p>
            ) : contractState === "loading" ? (
              <div className="flex items-center justify-center gap-2 py-14 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden />
                טוען אבני דרך…
              </div>
            ) : contractState === "empty" ? (
              <div className="space-y-4 px-4 py-6 sm:px-6">
                {hasProgressReportHistory ? (
                  <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-start text-sm text-amber-950 dark:text-amber-100">
                    <p className="font-medium">שימו לב</p>
                    <p className="mt-1 text-muted-foreground dark:text-amber-200/90">
                      לחוזה זה קיימת היסטוריית דוחות, אך אין כרגע אבני דרך במערכת.
                      יש לשחזר או להגדיר סעיפים מחדש.
                    </p>
                  </div>
                ) : null}

                <Card className="border-primary/25 bg-muted/20 shadow-sm">
                  <CardHeader className="text-start pb-2">
                    <CardTitle className="text-base">
                      לא נמצאו אבני דרך לחוזה זה. בחרו שיטת הקמה:
                    </CardTitle>
                    <CardDescription>
                      נדרשות אבני דרך לחישוב אחוזים וסכומי חשבון חלקי.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-6 sm:grid-cols-2">
                    <Card className="border-violet-500/40 bg-violet-950/20 dark:bg-violet-950/35">
                      <CardHeader className="pb-2 text-start">
                        <div className="flex items-center gap-2">
                          <Sparkles
                            className="size-5 text-violet-300"
                            aria-hidden
                          />
                          <CardTitle className="text-sm text-violet-50">
                            א׳ סריקת חשבון קודם (AI)
                          </CardTitle>
                        </div>
                        <CardDescription className="text-violet-200/85">
                          העלאת PDF — המערכת תייצר אבני דרך ודוח בסיס מאושר.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <div className="space-y-2 text-start">
                          <Label htmlFor="baseline-pdf-build">קובץ PDF</Label>
                          <Input
                            id="baseline-pdf-build"
                            type="file"
                            accept="application/pdf,.pdf"
                            className="min-h-11 cursor-pointer bg-background/80"
                            disabled={buildBaselinePending}
                          />
                        </div>
                        <Button
                          type="button"
                          className="w-full gap-2 bg-violet-600 hover:bg-violet-700"
                          disabled={buildBaselinePending}
                          onClick={() => onBuildContractBaseline()}
                        >
                          {buildBaselinePending ? (
                            <>
                              <Loader2
                                className="size-4 animate-spin"
                                aria-hidden
                              />
                              סורק…
                            </>
                          ) : (
                            <>
                              <Sparkles className="size-4" aria-hidden />
                              סרוק והקם אבני דרך
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>

                    <Card className="border-border/80 bg-card">
                      <CardHeader className="pb-2 text-start">
                        <div className="flex items-center gap-2">
                          <FileEdit
                            className="size-5 text-muted-foreground"
                            aria-hidden
                          />
                          <CardTitle className="text-sm">
                            ב׳ יצירת אבני דרך ידנית
                          </CardTitle>
                        </div>
                        <CardDescription>
                          עברו למסך עריכת החוזה והזינו סעיפים (כתב כמויות / פאושלי).
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <p className="text-start text-sm text-muted-foreground">
                          במסך החוזה ניתן להגדיר שורות ואבני דרך, ואז לחזור לכאן
                          לדיווח.
                        </p>
                        {selectedContractId.trim() ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full gap-2"
                            render={
                              <Link
                                href={`/marker-ofek/contracts/${selectedContractId.trim()}/edit`}
                              />
                            }
                          >
                            <FileEdit className="size-4" aria-hidden />
                            עבור למסך החוזה להזנת סעיפים
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full gap-2"
                            disabled
                          >
                            <FileEdit className="size-4" aria-hidden />
                            עבור למסך החוזה להזנת סעיפים
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="space-y-4 px-2 pb-4 sm:px-4">
                {baselineMeta ? (
                  <div className="flex flex-wrap items-center gap-2 px-2">
                    <Badge className="bg-emerald-600/90 text-white hover:bg-emerald-600">
                      בסיס פעיל
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      דוח אחרון: חודש {baselineMeta.reportMonth} ·{" "}
                      {baselineMeta.status}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 px-2">
                    <Badge variant="secondary">ללא דוח מאושר קודם</Badge>
                    <span className="text-sm text-muted-foreground">
                      אחוז קודם לכל סעיף: 0% (ניתן לעדכן אחרי דוח מאושר ראשון)
                    </span>
                  </div>
                )}

                <div className="overflow-x-auto rounded-md border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[5rem] text-start">
                          סעיף
                        </TableHead>
                        <TableHead className="min-w-[12rem] text-start">
                          תיאור
                        </TableHead>
                        <TableHead className="w-[7rem] text-start">
                          סכום אבן דרך
                        </TableHead>
                        <TableHead className="w-[6.5rem] text-start">
                          אחוז קודם
                        </TableHead>
                        <TableHead className="w-[7.5rem] text-start">
                          אחוז נוכחי מצטבר
                        </TableHead>
                        <TableHead className="w-[6rem] text-start">
                          אחוז חודש
                        </TableHead>
                        <TableHead className="min-w-[6.5rem] text-start">
                          לתשלום חודש
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wbsGroups.orderedPrefixes.map((prefix) => {
                        const chapterRows = wbsGroups.byPrefix.get(prefix) ?? []
                        return (
                          <React.Fragment key={prefix}>
                            <TableRow className="border-y-2 border-primary/20 bg-muted/50 hover:bg-muted/50">
                              <TableCell
                                colSpan={7}
                                className="text-right font-bold text-primary"
                              >
                                {chapterHeaderLabel(prefix)}
                              </TableCell>
                            </TableRow>
                            {chapterRows.map((m, idx) => {
                              const d = lineDerived.byId[m.id]
                              const approved = d?.approvedThisBill ?? 0
                              const monthPct = d?.deltaPct ?? 0
                              const prevPct = roundMoney(
                                parseDecimal(previousPctByLine[m.id] ?? "0")
                              )
                              const prevQty = previousQtyByLine[m.id]
                              return (
                                <TableRow key={m.id}>
                                  <TableCell className="font-mono text-sm text-muted-foreground">
                                    {milestoneSectionLabel(m, idx)}
                                  </TableCell>
                                  <TableCell className="max-w-[280px] text-start text-sm leading-snug">
                                    {milestoneDescriptionText(m)}
                                  </TableCell>
                                  <TableCell className="tabular-nums text-sm">
                                    {currencyFormatter.format(m.amount)}
                                  </TableCell>
                                  <TableCell>
                                    <div
                                      className="flex min-h-9 min-w-[4.5rem] flex-col justify-center rounded-md border border-transparent bg-muted/50 px-2 tabular-nums text-sm"
                                      title={
                                        prevQty
                                          ? `מצב מדוח מאושר/מוגש אחרון · כמות מצטברת משוערת: ${prevQty}`
                                          : "מדוח מאושר/מוגש אחרון"
                                      }
                                    >
                                      <span>{prevPct}</span>
                                      {prevQty ? (
                                        <span className="text-[11px] text-muted-foreground">
                                          כמ׳ {prevQty}
                                        </span>
                                      ) : null}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      min={0}
                                      max={100}
                                      step="any"
                                      className="h-9 min-w-[5.5rem] tabular-nums"
                                      value={currentPctByLine[m.id] ?? "0"}
                                      onChange={(e) =>
                                        setCurrentPctByLine((prev) => ({
                                          ...prev,
                                          [m.id]: e.target.value,
                                        }))
                                      }
                                      aria-label="אחוז נוכחי מצטבר"
                                    />
                                  </TableCell>
                                  <TableCell className="tabular-nums text-sm text-muted-foreground">
                                    {roundMoney(monthPct)}
                                  </TableCell>
                                  <TableCell className="font-medium tabular-nums">
                                    {currencyFormatter.format(approved)}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </React.Fragment>
                        )
                      })}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell
                          colSpan={5}
                          className="text-start font-semibold"
                        >
                          סה״כ ערך מצטבר (מול אבני דרך)
                        </TableCell>
                        <TableCell
                          colSpan={2}
                          className="text-start font-bold tabular-nums"
                        >
                          {currencyFormatter.format(
                            lineDerived.sumCumulativeValue
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell
                          colSpan={5}
                          className="text-start font-semibold"
                        >
                          סה״כ לתשלום בחודש (₪)
                        </TableCell>
                        <TableCell
                          colSpan={2}
                          className="text-start font-bold tabular-nums"
                        >
                          {currencyFormatter.format(
                            lineDerived.sumApprovedThisBill
                          )}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {contractState === "has_baseline" ? (
          <>
            <Card className="border-border/80 shadow-sm">
              <CardHeader className="text-start pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Receipt className="size-5 text-muted-foreground" aria-hidden />
                  סיכום כספי לחשבון
                </CardTitle>
                <CardDescription>
                  בסיס עכבון ומדד על סכום לתשלום לפי אבני דרך בחודש זה (לפני מדד)
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1 rounded-lg border border-border/70 bg-muted/30 px-3 py-3 sm:col-span-2">
                  <p className="text-sm text-muted-foreground">
                    סה״כ לתשלום בחודש לפי אבני דרך (לפני מדד)
                  </p>
                  <p className="text-lg font-bold tabular-nums">
                    {currencyFormatter.format(lineDerived.sumApprovedThisBill)}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pr-index">תוספת התייקרות / מדד</Label>
                  <Input
                    id="pr-index"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    className="min-h-11"
                    placeholder="0"
                    value={indexation || ""}
                    onChange={(e) => setIndexation(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pr-retention">עכבון (%)</Label>
                  <Input
                    id="pr-retention"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="any"
                    className="min-h-11"
                    placeholder="5"
                    value={retentionPercent || ""}
                    onChange={(e) => setRetentionPercent(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    סכום עכבון:{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {currencyFormatter.format(retentionAmount)}
                    </span>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pr-deduct">קיזוזים / הפחתות</Label>
                  <Input
                    id="pr-deduct"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    className="min-h-11"
                    placeholder="0"
                    value={deductions || ""}
                    onChange={(e) => setDeductions(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pr-prev-billed">
                    חויב בחשבונות קודמים (מצטבר)
                  </Label>
                  <Input
                    id="pr-prev-billed"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    className="min-h-11"
                    placeholder="0"
                    value={previousBilled || ""}
                    onChange={(e) => setPreviousBilled(e.target.value)}
                  />
                </div>

                <Separator className="sm:col-span-2" />

                <div className="space-y-1 rounded-lg border border-primary/25 bg-primary/5 px-3 py-3 sm:col-span-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    סה״כ לתשלום בחשבון זה
                  </p>
                  <p className="text-xl font-bold tabular-nums text-primary">
                    {currencyFormatter.format(totalPayable)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    (אושר בחשבון + מדד − עכבון − קיזוזים − חויב קודם)
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex w-full flex-col gap-3 sm:max-w-2xl sm:self-center">
              <Button
                type="button"
                size="lg"
                className="min-h-12 w-full gap-2 text-base"
                disabled={
                  savingAs !== null ||
                  saveReportPending ||
                  buildBaselinePending ||
                  loadingContracts ||
                  !selectedContractId.trim() ||
                  loadingMilestones ||
                  contracts.length === 0
                }
                onClick={() => saveReport("submitted")}
              >
                {savingAs === "submitted" ? (
                  <>
                    <Loader2
                      className="size-5 shrink-0 animate-spin"
                      aria-hidden
                    />
                    מעבד…
                  </>
                ) : (
                  <>
                    <Receipt className="size-5 shrink-0" aria-hidden />
                    הפק חשבון חלקי והעבר לסטטוס מוגש
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-h-11 w-full gap-2"
                disabled={
                  savingAs !== null ||
                  saveReportPending ||
                  buildBaselinePending ||
                  loadingContracts ||
                  !selectedContractId.trim() ||
                  loadingMilestones ||
                  contracts.length === 0
                }
                onClick={() => saveReport("draft")}
              >
                {savingAs === "draft" ? (
                  <>
                    <Loader2
                      className="size-4 shrink-0 animate-spin"
                      aria-hidden
                    />
                    שומר טיוטה…
                  </>
                ) : (
                  "שמור כטיוטה בלבד"
                )}
              </Button>
            </div>
          </>
        ) : null}
      </form>
    </div>
  )
}

export default function NewProgressReportPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          טוען…
        </div>
      }
    >
      <NewProgressReportPageInner />
    </React.Suspense>
  )
}
