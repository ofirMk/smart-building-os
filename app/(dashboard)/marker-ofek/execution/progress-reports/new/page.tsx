"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  Clock3,
  FileEdit,
  Loader2,
  PanelRightOpen,
  Receipt,
  Sparkles,
  TrendingUp,
} from "lucide-react"
import { toast } from "sonner"

import { buildContractAndBaselineAI } from "@/app/(dashboard)/marker-ofek/projects/actions/project-ai-actions"
import { saveProgressReport } from "../actions"
import {
  fetchCurrenciesAction,
  fetchUnitsOfMeasureAction,
} from "@/lib/holden-erp/master-data-actions"
import type {
  MasterDataCurrencyRow,
  MasterDataUomRow,
} from "@/types/master-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { MasterDetailWorkspace } from "@/components/layout/MasterDetailWorkspace"
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BentoSmartList, type BentoSmartListColumn } from "@/components/ui/bento-smart-list"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cleanDescription } from "@/lib/marker-ofek/clean-milestone-description"
import {
  chapterHeaderLabel,
  wbsChapterPrefix,
} from "@/lib/marker-ofek/wbs-chapter"
import {
  calcCurrentAmountProgressLine,
  clampPct,
  roundMoney,
} from "@/lib/marker-ofek/progress-report-line-calc"
import {
  decodeMilestoneDisplayName,
  decodeMilestoneStoredName,
} from "@/lib/marker-ofek/milestone-name-codec"
import { useDiamondNavigation } from "@/hooks/use-diamond-navigation"
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

type BoqListRow = {
  milestone: MilestoneRow
  sectionLabel: string
  chapterLabel: string
  description: string
}

type MatchedContractLine = {
  id: string
  lineNumber: number | null
  boqRef: string | null
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  expectedUnitCost: number | null
  expectedTotalCost: number | null
  supplier: {
    id: string
    supplierNumber: string | null
    supplierName: string | null
    supplierType: string | null
  } | null
}

type ContractLineBillHistory = {
  id: string
  billNumber: string | null
  status: string | null
  periodStart: string | null
  periodEnd: string | null
  createdAt: string | null
  submittedQty: number
  submittedAmount: number
  approvedQty: number
  approvedAmount: number
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

function extractFirstPositiveInt(text: string): number | null {
  const match = text.match(/\d+/)
  if (!match) return null
  const value = Number.parseInt(match[0], 10)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
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

function NewProgressReportPageInner() {
  const router = useRouter()
  useDiamondNavigation("contracts")
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

  const [savingAs, setSavingAs] = React.useState<
    "draft" | "submitted" | "approved" | null
  >(null)
  const restoredDraftKeyRef = React.useRef<string | null>(null)

  const [masterCurrencies, setMasterCurrencies] = React.useState<
    MasterDataCurrencyRow[]
  >([])
  const [masterUom, setMasterUom] = React.useState<MasterDataUomRow[]>([])
  const [refCurrencyId, setRefCurrencyId] = React.useState("")
  const [refUomId, setRefUomId] = React.useState("")
  const [selectedMilestoneId, setSelectedMilestoneId] =
    React.useState<string | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [detailError, setDetailError] = React.useState<string | null>(null)
  const [detailLine, setDetailLine] = React.useState<MatchedContractLine | null>(
    null
  )
  const [detailHistory, setDetailHistory] = React.useState<
    ContractLineBillHistory[]
  >([])
  const detailRequestIdRef = React.useRef(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const [c, u] = await Promise.all([
        fetchCurrenciesAction(),
        fetchUnitsOfMeasureAction(),
      ])
      if (cancelled) return
      if (c.ok) setMasterCurrencies(c.data)
      if (u.ok) setMasterUom(u.data)
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
      setSelectedMilestoneId(null)
      setDetailOpen(false)
      setDetailLine(null)
      setDetailHistory([])
      setDetailError(null)
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
      const calc = calcCurrentAmountProgressLine(m.amount, curr, prev)
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

  const boqRows = React.useMemo<BoqListRow[]>(
    () =>
      milestones.map((m, index) => {
        const sectionLabel = milestoneSectionLabel(m, index)
        return {
          milestone: m,
          sectionLabel,
          chapterLabel: chapterHeaderLabel(wbsChapterPrefix(sectionLabel)),
          description: milestoneDescriptionText(m),
        }
      }),
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

  const selectedMilestone = React.useMemo(
    () => milestones.find((m) => m.id === selectedMilestoneId) ?? null,
    [milestones, selectedMilestoneId]
  )

  const boqColumns = React.useMemo<BentoSmartListColumn<BoqListRow>[]>(
    () => [
      {
        key: "section",
        title: "סעיף",
        className: "w-[9.5rem]",
        render: (row) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-xs text-slate-700">{row.sectionLabel}</span>
            <span className="text-[11px] text-slate-500">{row.chapterLabel}</span>
          </div>
        ),
      },
      {
        key: "description",
        title: "תיאור",
        className: "min-w-[17rem]",
        render: (row) => (
          <span className="line-clamp-2 text-xs leading-snug text-slate-700">
            {row.description}
          </span>
        ),
      },
      {
        key: "amount",
        title: "סכום אבן דרך",
        className: "w-[8rem] tabular-nums",
        render: (row) => currencyFormatter.format(row.milestone.amount),
      },
      {
        key: "previous",
        title: "אחוז קודם",
        className: "w-[7.5rem]",
        render: (row) => {
          const prevPct = roundMoney(
            parseDecimal(previousPctByLine[row.milestone.id] ?? "0")
          )
          const prevQty = previousQtyByLine[row.milestone.id]
          return (
            <div className="flex min-h-8 min-w-[5rem] flex-col justify-center rounded-md bg-background px-1.5 tabular-nums">
              <span className="text-xs">{prevPct}</span>
              {prevQty ? (
                <span className="text-[10px] text-slate-500">כמ׳ {prevQty}</span>
              ) : null}
            </div>
          )
        },
      },
      {
        key: "current",
        title: "אחוז נוכחי מצטבר",
        className: "w-[8rem]",
        render: (row) => (
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="any"
            className="h-8 min-w-[6rem] px-2 py-1 text-xs tabular-nums"
            value={currentPctByLine[row.milestone.id] ?? "0"}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              setCurrentPctByLine((prev) => ({
                ...prev,
                [row.milestone.id]: event.target.value,
              }))
            }
            aria-label="אחוז נוכחי מצטבר"
          />
        ),
      },
      {
        key: "month",
        title: "אחוז חודש",
        className: "w-[6.5rem] tabular-nums text-slate-500",
        render: (row) =>
          roundMoney(lineDerived.byId[row.milestone.id]?.deltaPct ?? 0),
      },
      {
        key: "payable",
        title: "לתשלום חודש",
        className: "w-[8.5rem] tabular-nums font-semibold",
        render: (row) =>
          currencyFormatter.format(
            lineDerived.byId[row.milestone.id]?.approvedThisBill ?? 0
          ),
      },
    ],
    [currentPctByLine, lineDerived.byId, previousPctByLine, previousQtyByLine]
  )

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

  async function openMilestoneDetail(row: BoqListRow) {
    const requestId = detailRequestIdRef.current + 1
    detailRequestIdRef.current = requestId
    setSelectedMilestoneId(row.milestone.id)
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailError(null)
    setDetailLine(null)
    setDetailHistory([])

    if (!selectedContractId.trim()) {
      setDetailLoading(false)
      setDetailError("לא נבחר חוזה להצגת פירוט.")
      return
    }

    try {
      const supabase = createSupabaseBrowserClient()
      const { data: rawLines, error: lineError } = await supabase
        .from("erp_client_contract_lines")
        .select(
          "id,line_number,boq_ref,description,quantity,unit_price,total_price,expected_unit_cost,expected_total_cost,supplier_id,erp_md_suppliers(id,supplier_number,supplier_name,supplier_type)"
        )
        .eq("client_contract_id", selectedContractId)
        .order("line_number", { ascending: true })

      if (lineError) throw lineError
      if (detailRequestIdRef.current !== requestId) return

      const lines = ((rawLines ?? []) as Array<Record<string, unknown>>).map(
        (line) => {
          const supplierRaw = embedOne(
            line.erp_md_suppliers as
              | {
                  id: string
                  supplier_number: string | null
                  supplier_name: string | null
                  supplier_type: string | null
                }
              | {
                  id: string
                  supplier_number: string | null
                  supplier_name: string | null
                  supplier_type: string | null
                }[]
              | null
          )
          return {
            id: String(line.id),
            lineNumber:
              line.line_number == null ? null : Number(line.line_number) || null,
            boqRef:
              line.boq_ref == null ? null : String(line.boq_ref).trim() || null,
            description: String(line.description ?? ""),
            quantity: Number(line.quantity) || 0,
            unitPrice: Number(line.unit_price) || 0,
            totalPrice: Number(line.total_price) || 0,
            expectedUnitCost:
              line.expected_unit_cost == null
                ? null
                : Number(line.expected_unit_cost),
            expectedTotalCost:
              line.expected_total_cost == null
                ? null
                : Number(line.expected_total_cost),
            supplier: supplierRaw
              ? {
                  id: String(supplierRaw.id),
                  supplierNumber: supplierRaw.supplier_number,
                  supplierName: supplierRaw.supplier_name,
                  supplierType: supplierRaw.supplier_type,
                }
              : null,
          } satisfies MatchedContractLine
        }
      )

      const sectionCode = decodeMilestoneStoredName(row.milestone.name).sectionCode
      const fallbackCode = decodeMilestoneDisplayName(row.milestone.name).sectionCode
      const effectiveSectionCode = sectionCode || fallbackCode
      const sectionLineNumber = extractFirstPositiveInt(effectiveSectionCode)
      const normalizedDescription = row.description.trim().toLowerCase()

      const matchedLine =
        lines.find(
          (line) =>
            sectionLineNumber != null && line.lineNumber === sectionLineNumber
        ) ??
        lines.find(
          (line) =>
            !!line.boqRef &&
            !!effectiveSectionCode &&
            line.boqRef.trim() === effectiveSectionCode.trim()
        ) ??
        lines.find((line) => {
          const lineDescription = line.description.trim().toLowerCase()
          return (
            normalizedDescription.length >= 6 &&
            (lineDescription.includes(normalizedDescription) ||
              normalizedDescription.includes(lineDescription))
          )
        }) ??
        null

      if (!matchedLine) {
        setDetailError(
          "לא נמצאה שורת כתב כמויות תואמת ב־client_contract_lines לסעיף זה."
        )
        setDetailLoading(false)
        return
      }

      setDetailLine(matchedLine)

      const { data: rawHistory, error: historyError } = await supabase
        .from("erp_client_progress_bill_lines")
        .select(
          "id,submitted_qty,submitted_amount,approved_qty,approved_amount,erp_client_progress_bills!inner(id,bill_number,status,period_start,period_end,created_at)"
        )
        .eq("contract_line_id", matchedLine.id)

      if (historyError) throw historyError
      if (detailRequestIdRef.current !== requestId) return

      const mappedHistory: ContractLineBillHistory[] = (
        (rawHistory ?? []) as Array<Record<string, unknown>>
      )
        .map((entry) => {
          const bill = embedOne(
            entry.erp_client_progress_bills as
              | {
                  id: string
                  bill_number: string | null
                  status: string | null
                  period_start: string | null
                  period_end: string | null
                  created_at: string | null
                }
              | {
                  id: string
                  bill_number: string | null
                  status: string | null
                  period_start: string | null
                  period_end: string | null
                  created_at: string | null
                }[]
              | null
          )

          return {
            id: String(entry.id),
            billNumber: bill?.bill_number ?? null,
            status: bill?.status ?? null,
            periodStart: bill?.period_start ?? null,
            periodEnd: bill?.period_end ?? null,
            createdAt: bill?.created_at ?? null,
            submittedQty: Number(entry.submitted_qty) || 0,
            submittedAmount: Number(entry.submitted_amount) || 0,
            approvedQty: Number(entry.approved_qty) || 0,
            approvedAmount: Number(entry.approved_amount) || 0,
          }
        })
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
          return bTime - aTime
        })

      setDetailHistory(mappedHistory)
      if (mappedHistory.length === 0) {
        setDetailError("אין היסטוריית חשבונות קודמת עבור סעיף זה.")
      }
    } catch (error) {
      if (detailRequestIdRef.current !== requestId) return
      setDetailError(formatError(error))
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setDetailLoading(false)
      }
    }
  }

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
    setSelectedMilestoneId(null)
    setDetailOpen(false)
    setDetailLine(null)
    setDetailHistory([])
    setDetailError(null)
  }

  function saveReport(reportStatus: "draft" | "submitted" | "approved") {
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
        if (reportStatus === "draft") {
          toast.success("הדוח נשמר כטיוטה")
        } else if (reportStatus === "submitted") {
          toast.success("החשבון החלקי הופק והדוח הועבר לסטטוס מוגש")
        } else {
          toast.success("החשבון אושר ופקודת יומן טיוטה נוצרה בהצלחה")
        }
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
      className="flex h-full w-full max-w-none flex-col gap-4 px-3 pb-8 pt-2 lg:px-4"
    >
      <Link
        href="/marker-ofek/projects"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לפרויקטים
      </Link>

      <header className="space-y-2 text-start">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-900">
            <TrendingUp className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              מודול 3.2 · פרויקטים
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
                <SelectContent diamondEntity="contracts">
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
            {(masterCurrencies.length > 0 || masterUom.length > 0) ? (
              <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-emerald-900">
                    מטבע ויחידת מידה (מנתוני מאסטר)
                  </p>
                  <Link
                    href="/marker-ofek/master-data?tab=suppliers"
                    className="text-xs font-medium text-blue-600 underline-offset-2 hover:underline"
                  >
                    ניהול מאסטר
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {masterCurrencies.length > 0 ? (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        מטבע התייחסות
                      </Label>
                      <select
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={refCurrencyId}
                        onChange={(e) => setRefCurrencyId(e.target.value)}
                      >
                        <option value="">—</option>
                        {masterCurrencies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} {c.symbol}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {masterUom.length > 0 ? (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        יחידת מידה לכמויות
                      </Label>
                      <select
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={refUomId}
                        onChange={(e) => setRefUomId(e.target.value)}
                      >
                        <option value="">—</option>
                        {masterUom.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.code} · {u.description_he}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  השדות לעיל לתיעוד עסקי בלבד — אינם נשמרים בדוח (ניתן לקשר לשדות
                  DB בעתיד).
                </p>
              </div>
            ) : null}
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
                  <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-start text-sm text-amber-950">
                    <p className="font-medium">שימו לב</p>
                    <p className="mt-1 text-muted-foreground">
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
                    <Card className="border-violet-500/40 bg-violet-950/20">
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
              <MasterDetailWorkspace
                title="מרחב אב-בן לדיווח התקדמות"
                description="תצורת 70/30: פאנל אב לרשימת סעיפי BOQ ופאנל בן לחישוב, ניכויים ואישור."
                locale="he"
                className="bg-transparent p-2"
                masterLabel={{
                  key: "progress_report_master",
                  en: "BOQ Master",
                  he: "סעיפי BOQ (אב)",
                }}
                detailLabel={{
                  key: "progress_report_detail",
                  en: "Billing Detail",
                  he: "חישוב ואישור חשבון (בן)",
                }}
                master={
                  <div className="space-y-2">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      {baselineMeta ? (
                        <>
                          <Badge className="bg-emerald-600/90 text-white hover:bg-emerald-600">
                            בסיס פעיל
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            דוח אחרון: חודש {baselineMeta.reportMonth} ·{" "}
                            {baselineMeta.status}
                          </span>
                        </>
                      ) : (
                        <>
                          <Badge variant="secondary">ללא דוח מאושר קודם</Badge>
                          <span className="text-sm text-muted-foreground">
                            אחוז קודם לכל סעיף: 0% (ניתן לעדכן אחרי דוח מאושר ראשון)
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-background/80 px-3 py-2">
                      <div className="text-xs text-slate-600">
                        לחיצה על שורה פותחת מסך בן עם היסטוריית חיובים וקבלן מבצע.
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        BOQ / BentoSmartList
                      </Badge>
                    </div>
                    <BentoSmartList
                      items={boqRows}
                      columns={boqColumns}
                      rowKey={(row) => row.milestone.id}
                      selectedRowKey={selectedMilestoneId}
                      onRowClick={(row) => void openMilestoneDetail(row)}
                      emptyState="אין סעיפים להצגה"
                    />
                  </div>
                }
                detail={
                  <div className="space-y-3">
                    <div className="rounded-md border border-slate-200 bg-background p-2">
                      <p className="text-xs text-muted-foreground">
                        לתשלום בחודש לפי BOQ
                      </p>
                      <p className="text-base font-semibold tabular-nums">
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
                        className="h-9"
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
                        className="h-9"
                        placeholder="5"
                        value={retentionPercent || ""}
                        onChange={(e) => setRetentionPercent(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-deduct">קיזוזים / הפחתות</Label>
                      <Input
                        id="pr-deduct"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        className="h-9"
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
                        className="h-9"
                        placeholder="0"
                        value={previousBilled || ""}
                        onChange={(e) => setPreviousBilled(e.target.value)}
                      />
                    </div>

                    <Separator />

                    <div className="rounded-md border border-primary/25 bg-primary/5 p-2">
                      <p className="text-xs text-muted-foreground">
                        Sandbox projection (לתשלום סופי)
                      </p>
                      <p className="text-lg font-bold tabular-nums text-primary">
                        {currencyFormatter.format(totalPayable)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        (אושר + מדד − עכבון − קיזוזים − חויב קודם)
                      </p>
                    </div>

                    <div className="grid gap-2 pt-1">
                      <Button
                        type="button"
                        className="h-10 gap-2 border border-emerald-600/40 bg-emerald-700 text-white hover:bg-emerald-600"
                        disabled={
                          savingAs !== null ||
                          saveReportPending ||
                          buildBaselinePending ||
                          loadingContracts ||
                          !selectedContractId.trim() ||
                          loadingMilestones ||
                          contracts.length === 0
                        }
                        onClick={() => saveReport("approved")}
                      >
                        {savingAs === "approved" ? (
                          <>
                            <Loader2 className="size-4 shrink-0 animate-spin" />
                            מאשר…
                          </>
                        ) : (
                          <>
                            <BookOpen className="size-4 shrink-0" />
                            אשר וצור יומן
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        className="h-10 gap-2"
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
                            <Loader2 className="size-4 shrink-0 animate-spin" />
                            מעבד…
                          </>
                        ) : (
                          <>
                            <Receipt className="size-4 shrink-0" />
                            הפק חשבון חלקי
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
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
                            <Loader2 className="size-4 shrink-0 animate-spin" />
                            שומר…
                          </>
                        ) : (
                          "שמור כטיוטה"
                        )}
                      </Button>
                    </div>
                  </div>
                }
              />
            )}
          </CardContent>
        </Card>

      </form>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent
          side="left"
          className="w-[min(94vw,980px)] max-w-[980px] p-0 sm:max-w-[980px]"
        >
          <SheetHeader className="border-b border-border bg-card">
            <SheetTitle className="text-right">
              מסך בן · פירוט סעיף BOQ
            </SheetTitle>
            <SheetDescription className="text-right">
              {selectedMilestone
                ? `${milestoneSectionLabel(
                    selectedMilestone,
                    milestones.findIndex((m) => m.id === selectedMilestone.id)
                  )} · ${milestoneDescriptionText(selectedMilestone)}`
                : "בחרו שורת סעיף להצגת פירוט"}
            </SheetDescription>
          </SheetHeader>

          <div className="h-full overflow-y-auto bg-background p-4">
            {detailLoading ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-slate-200 bg-card shadow-sm">
                <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  טוען היסטוריית חיובים וקבלן מבצע…
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="pb-2 text-start">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <PanelRightOpen className="size-4 text-slate-500" />
                      פירוט שורת client_contract_lines
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {detailLine ? (
                      <>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <p>
                            <span className="text-muted-foreground">שורה:</span>{" "}
                            <span className="font-mono">{detailLine.lineNumber ?? "—"}</span>
                          </p>
                          <p>
                            <span className="text-muted-foreground">BOQ Ref:</span>{" "}
                            <span className="font-mono">{detailLine.boqRef ?? "—"}</span>
                          </p>
                          <p>
                            <span className="text-muted-foreground">כמות חוזית:</span>{" "}
                            <span className="tabular-nums">{detailLine.quantity}</span>
                          </p>
                          <p>
                            <span className="text-muted-foreground">מחיר יח׳:</span>{" "}
                            <span className="tabular-nums">
                              {currencyFormatter.format(detailLine.unitPrice)}
                            </span>
                          </p>
                          <p className="sm:col-span-2">
                            <span className="text-muted-foreground">תיאור:</span>{" "}
                            {detailLine.description}
                          </p>
                        </div>
                        <div className="rounded-md border border-slate-200 bg-background px-2 py-1.5 text-xs">
                          עלות צפויה מבסיס ספק:{" "}
                          <span className="font-medium tabular-nums">
                            {detailLine.expectedTotalCost != null
                              ? currencyFormatter.format(detailLine.expectedTotalCost)
                              : "—"}
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        אין שורת כתב כמויות תואמת עבור הסעיף שנבחר.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="pb-2 text-start">
                    <CardTitle className="text-base">קבלן מבצע מקושר</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {detailLine?.supplier ? (
                      <div className="grid gap-1">
                        <p>
                          <span className="text-muted-foreground">שם:</span>{" "}
                          {detailLine.supplier.supplierName ?? "—"}
                        </p>
                        <p>
                          <span className="text-muted-foreground">מספר ספק:</span>{" "}
                          <span className="font-mono">
                            {detailLine.supplier.supplierNumber ?? "—"}
                          </span>
                        </p>
                        <p>
                          <span className="text-muted-foreground">סוג:</span>{" "}
                          {detailLine.supplier.supplierType ?? "—"}
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">
                        לא נמצא קבלן משנה מקושר לשורה זו.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="pb-2 text-start">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Clock3 className="size-4 text-slate-500" />
                      היסטוריית חשבונות קודמים לסעיף
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {detailHistory.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        אין היסטוריית חיובים עבור סעיף זה.
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border border-slate-200 bg-card">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-right">חשבון</TableHead>
                              <TableHead className="text-right">תקופה</TableHead>
                              <TableHead className="text-right">כמות מבוקשת</TableHead>
                              <TableHead className="text-right">סכום מבוקש</TableHead>
                              <TableHead className="text-right">כמות מאושרת</TableHead>
                              <TableHead className="text-right">סכום מאושר</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {detailHistory.map((entry) => (
                              <TableRow key={entry.id}>
                                <TableCell className="font-medium">
                                  חשבון {entry.billNumber ?? "—"} · {entry.status ?? "—"}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {entry.periodStart ?? "—"} עד {entry.periodEnd ?? "—"}
                                </TableCell>
                                <TableCell>{entry.submittedQty}</TableCell>
                                <TableCell>{currencyFormatter.format(entry.submittedAmount)}</TableCell>
                                <TableCell>{entry.approvedQty}</TableCell>
                                <TableCell>{currencyFormatter.format(entry.approvedAmount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {detailError ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {detailError}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
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
