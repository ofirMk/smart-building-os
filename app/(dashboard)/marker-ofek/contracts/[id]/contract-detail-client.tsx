"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowRight,
  Building2,
  Landmark,
  Loader2,
  Printer,
  Receipt,
  Users,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  MoContextCommentButton,
  useMoCommentPresence,
} from "@/components/marker-ofek/mo-context-comment"
import { IssueClientInvoiceDialog } from "@/components/marker-ofek/issue-client-invoice-dialog"
import { useMarkerOfekWorkspace } from "@/components/marker-ofek/workspace/marker-ofek-workspace-context"
import type {
  ContractWorkspaceInitialPayload,
} from "@/lib/marker-ofek/contract-workspace-initial"
import { COMPANY_PROFILE_COLUMNS } from "@/lib/marker-ofek/supabase-fields"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"
import type { CompanyProfile } from "@/types/marker-ofek"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type EntityEmbed = {
  name: string
  legal_id: string | null
  address: string | null
  deductions_file_number: string | null
}

type ContractRowRaw = {
  id: string
  project_id: string
  entity_id: string
  total_amount: number | null
  retention_pct: number
  insurance_pct: number
  testing_pct?: number | null
  pricing_model?: string | null
  agreement_type: string | null
  contract_type: string
  status: string
  projects:
    | { name: string; internal_project_code: string; address: string | null }
    | { name: string; internal_project_code: string; address: string | null }[]
    | null
  entities: EntityEmbed | EntityEmbed[] | null
}

type ContractRow = Omit<ContractRowRaw, "projects" | "entities"> & {
  projects: {
    name: string
    internal_project_code: string
    address: string | null
  } | null
  entities: EntityEmbed | null
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

export type MilestoneWorkspaceRow = {
  id: string
  name: string
  amount: number
  weight_percentage: number | null
  sort_order: number
}

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function parsePct(raw: string): number {
  const n = parseFloat(String(raw).replace(",", "."))
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

const VAT_RATE = 0.17

export function MarkerOfekContractDetailClient({
  contractId,
  initialPayload,
}: {
  contractId: string
  initialPayload: ContractWorkspaceInitialPayload | null
}) {
  const id = contractId
  const serverSeed =
    initialPayload?.contractId === id && id.length > 0 ? initialPayload : null

  const { setContextProjectId } = useMarkerOfekWorkspace()

  const [contract, setContract] = React.useState<ContractRow | null>(
    () => (serverSeed ? (serverSeed.contract as ContractRow) : null)
  )
  const [milestones, setMilestones] = React.useState<MilestoneWorkspaceRow[]>(
    () => serverSeed?.milestones ?? []
  )
  const [submittedPct, setSubmittedPct] = React.useState<Record<string, string>>(
    () => serverSeed?.submittedPct ?? {}
  )
  const [approvedPct, setApprovedPct] = React.useState<Record<string, string>>(
    () => serverSeed?.approvedPct ?? {}
  )

  const [loading, setLoading] = React.useState(
    () => Boolean(id) && !serverSeed
  )
  const [error, setError] = React.useState<string | null>(null)
  const [companyProfile, setCompanyProfile] =
    React.useState<CompanyProfile | null>(() => serverSeed?.companyProfile ?? null)
  const [savingPartialAccount, setSavingPartialAccount] = React.useState(false)
  const [lastPartialAccountNumber, setLastPartialAccountNumber] = React.useState<
    number | null
  >(null)
  const [priorContractPaymentsSum, setPriorContractPaymentsSum] =
    React.useState(() => serverSeed?.priorContractPaymentsSum ?? 0)
  const [priorProjectPaymentsSum, setPriorProjectPaymentsSum] =
    React.useState(() => serverSeed?.priorProjectPaymentsSum ?? 0)
  const [previousSameContractCumulative, setPreviousSameContractCumulative] =
    React.useState(() => serverSeed?.previousSameContractCumulative ?? 0)
  const [issueInvoiceOpen, setIssueInvoiceOpen] = React.useState(false)

  const milestoneIds = React.useMemo(
    () => milestones.map((m) => m.id),
    [milestones]
  )
  const { hasComment } = useMoCommentPresence(
    contract?.project_id ?? null,
    "contract_item",
    milestoneIds
  )

  React.useEffect(() => {
    setContextProjectId(contract?.project_id ?? null)
    return () => setContextProjectId(null)
  }, [contract?.project_id, setContextProjectId])

  React.useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }

    if (initialPayload?.contractId === id) {
      setContract(initialPayload.contract as ContractRow)
      setMilestones(initialPayload.milestones)
      setCompanyProfile(initialPayload.companyProfile)
      setPriorContractPaymentsSum(initialPayload.priorContractPaymentsSum)
      setPriorProjectPaymentsSum(initialPayload.priorProjectPaymentsSum)
      setPreviousSameContractCumulative(
        initialPayload.previousSameContractCumulative
      )
      setSubmittedPct(initialPayload.submittedPct)
      setApprovedPct(initialPayload.approvedPct)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()

        const [cRes, profileRes] = await Promise.all([
          supabase
            .from("contracts")
            .select(
              `
            id,
            project_id,
            entity_id,
            total_amount,
            retention_pct,
            insurance_pct,
            testing_pct,
            pricing_model,
            agreement_type,
            contract_type,
            status,
            projects ( name, internal_project_code, address ),
            entities ( name, legal_id, address, deductions_file_number ),
            contract_milestones (
              id,
              name,
              amount,
              weight_percentage,
              sort_order
            )
          `
            )
            .eq("id", id)
            .eq("is_deleted", false)
            .maybeSingle(),
          supabase
            .from("company_profile")
            .select(COMPANY_PROFILE_COLUMNS)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ])

        if (cRes.error) throw cRes.error
        if (!cRes.data) {
          if (!cancelled) {
            setContract(null)
            setMilestones([])
            setCompanyProfile(null)
            setError("החוזה לא נמצא")
          }
          return
        }

        const rawContract = cRes.data as ContractRowRaw & {
          contract_milestones?: Record<string, unknown>[] | null
        }
        const { contract_milestones: nestedMs, ...crOnly } = rawContract
        const cr = crOnly as ContractRowRaw
        const msRaw = Array.isArray(nestedMs)
          ? nestedMs
          : nestedMs
            ? [nestedMs]
            : []
        const msSorted = [...msRaw].sort(
          (a, b) =>
            Number((a as { sort_order?: number }).sort_order) -
            Number((b as { sort_order?: number }).sort_order)
        )

        const mapped: MilestoneWorkspaceRow[] = msSorted.map((row) => {
          const r = row as {
            id: string
            name: string
            amount: number | string | null
            weight_percentage: number | string | null
            sort_order: number | null
          }
          const amt = Number(r.amount)
          const wp = r.weight_percentage
          return {
            id: r.id,
            name: String(r.name ?? ""),
            amount: Number.isFinite(amt) ? amt : 0,
            weight_percentage:
              wp === null || wp === undefined || wp === ""
                ? null
                : Number(wp),
            sort_order: Number(r.sort_order) || 0,
          }
        })

        if (!cancelled) {
          setContract({
            ...cr,
            projects: embedOne(cr.projects),
            entities: embedOne(cr.entities),
          })
          setCompanyProfile(
            profileRes.data ? (profileRes.data as CompanyProfile) : null
          )
          setMilestones(mapped)

          const subInit: Record<string, string> = {}
          const appInit: Record<string, string> = {}
          for (const m of mapped) {
            subInit[m.id] = ""
            appInit[m.id] = ""
          }

          const projectId = cr.project_id
          const { data: siblingContracts } = await supabase
            .from("contracts")
            .select("id")
            .eq("project_id", projectId)
            .eq("is_deleted", false)
            .order("created_at", { ascending: false })
          const siblingIds = (siblingContracts ?? [])
            .map((c: { id: string }) => c.id)
            .filter(Boolean)
          const projectContractIds =
            siblingIds.length > 0 ? siblingIds : [id]

          const partialStatus = ["submitted", "approved", "paid"] as const

          const [lastProjPaRes, paPayRes, lastSameRes] = await Promise.all([
            supabase
              .from("partial_accounts")
              .select("id")
              .in("contract_id", projectContractIds)
              .eq("is_deleted", false)
              .in("status", [...partialStatus])
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from("partial_accounts")
              .select("payment_due, contract_id")
              .in("contract_id", projectContractIds)
              .eq("is_deleted", false)
              .in("status", [...partialStatus])
              .order("created_at", { ascending: false }),
            supabase
              .from("partial_accounts")
              .select("total_cumulative_amount")
              .eq("contract_id", id)
              .eq("is_deleted", false)
              .in("status", [...partialStatus])
              .order("account_number", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ])

          if (lastProjPaRes.error) throw lastProjPaRes.error
          if (paPayRes.error) throw paPayRes.error
          if (lastSameRes.error) throw lastSameRes.error

          const lastProjPa = lastProjPaRes.data as { id: string } | null
          if (lastProjPa?.id) {
            const { data: paliRows } = await supabase
              .from("partial_account_line_items")
              .select("contract_milestone_id, approved_percentage")
              .eq("partial_account_id", lastProjPa.id)

            const msIdSet = new Set(mapped.map((m) => m.id))
            for (const pr of paliRows ?? []) {
              const row = pr as {
                contract_milestone_id: string | null
                approved_percentage: number
              }
              const mid = row.contract_milestone_id
              if (mid && msIdSet.has(mid)) {
                appInit[mid] = String(Number(row.approved_percentage))
              }
            }
          }

          const paPayRows = (paPayRes.data ?? []) as {
            payment_due: number
            contract_id: string
          }[]
          const pcSum = roundMoney(
            paPayRows
              .filter((r) => r.contract_id === id)
              .reduce((s, r) => s + Number(r.payment_due), 0)
          )
          const ppSum = roundMoney(
            paPayRows.reduce((s, r) => s + Number(r.payment_due), 0)
          )

          const lastSame = lastSameRes.data as {
            total_cumulative_amount?: number
          } | null
          const prevSame = Number(lastSame?.total_cumulative_amount)

          if (!cancelled) {
            setPriorContractPaymentsSum(pcSum)
            setPriorProjectPaymentsSum(ppSum)
            setPreviousSameContractCumulative(
              Number.isFinite(prevSame) ? roundMoney(prevSame) : 0
            )
            setSubmittedPct(subInit)
            setApprovedPct(appInit)
          }
        }
      } catch (e) {
        if (!cancelled) {
          setContract(null)
          setMilestones([])
          setCompanyProfile(null)
          setError(formatError(e))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [id, initialPayload])

  const totals = React.useMemo(() => {
    let totalSubmitted = 0
    let totalApproved = 0
    for (const m of milestones) {
      const base = m.amount
      const sub = parsePct(submittedPct[m.id] ?? "")
      const app = parsePct(approvedPct[m.id] ?? "")
      totalSubmitted += base * (sub / 100)
      totalApproved += base * (app / 100)
    }

    const retentionPct = Number(contract?.retention_pct) || 0
    const insurancePct = Number(contract?.insurance_pct) || 0
    const retentionAmount = totalApproved * (retentionPct / 100)
    const insuranceAmount = totalApproved * (insurancePct / 100)
    const finalPayout = totalApproved - retentionAmount - insuranceAmount

    return {
      totalSubmitted,
      totalApproved,
      retentionAmount,
      insuranceAmount,
      finalPayout,
      retentionPct,
      insurancePct,
    }
  }, [milestones, submittedPct, approvedPct, contract])

  const printTotals = React.useMemo(() => {
    const totalBases = milestones.reduce((s, m) => s + m.amount, 0)
    const submittedWeightedPct =
      totalBases > 0 ? (totals.totalSubmitted / totalBases) * 100 : 0
    const approvedWeightedPct =
      totalBases > 0 ? (totals.totalApproved / totalBases) * 100 : 0
    const paymentBeforeVat = roundMoney(totals.finalPayout)
    const vatAmount = roundMoney(paymentBeforeVat * VAT_RATE)
    const grandTotal = roundMoney(paymentBeforeVat + vatAmount)
    return {
      totalBases,
      submittedWeightedPct,
      approvedWeightedPct,
      paymentBeforeVat,
      vatAmount,
      grandTotal,
    }
  }, [milestones, totals])

  const grandFinancialSummary = React.useMemo(() => {
    const totalProjectScope = roundMoney(
      milestones.reduce((s, m) => s + m.amount, 0)
    )
    const currentPaymentDueNet = roundMoney(
      Math.max(0, totals.finalPayout - priorContractPaymentsSum)
    )
    return {
      totalProjectScope,
      totalApprovedToDate: roundMoney(totals.totalApproved),
      priorPayments: priorContractPaymentsSum,
      currentPaymentDueNet,
    }
  }, [milestones, totals, priorContractPaymentsSum])

  async function handleGeneratePartialAccount() {
    const supabase = createSupabaseBrowserClient()
    setSavingPartialAccount(true)

    try {
      const withActivity = milestones
        .map((m) => {
          const base = m.amount
          const s = parsePct(submittedPct[m.id] ?? "")
          const a = parsePct(approvedPct[m.id] ?? "")
          return {
            m,
            s,
            a,
            subAmt: roundMoney(base * (s / 100)),
            appAmt: roundMoney(base * (a / 100)),
          }
        })
        .filter((x) => x.s > 0 || x.a > 0)

      if (withActivity.length === 0) {
        toast.error("יש להזין אחוז מוגש או מאושר גדול מ-0 בלפחות אבן דרך אחת")
        return
      }

      let totalSubmitted = 0
      let totalApproved = 0
      for (const m of milestones) {
        const base = m.amount
        totalSubmitted +=
          base * (parsePct(submittedPct[m.id] ?? "") / 100)
        totalApproved += base * (parsePct(approvedPct[m.id] ?? "") / 100)
      }

      const retentionPct = Number(contract?.retention_pct) || 0
      const insurancePct = Number(contract?.insurance_pct) || 0
      const retentionAmount = totalApproved * (retentionPct / 100)
      const insuranceAmount = totalApproved * (insurancePct / 100)
      const finalPayout = totalApproved - retentionAmount - insuranceAmount

      const snapshotPayload = {
        generated_at: new Date().toISOString(),
        contract_id: id,
        project_id: contract?.project_id ?? null,
        milestones: milestones.map((m) => ({
          id: m.id,
          name: m.name,
          base_amount: m.amount,
          submitted_pct: submittedPct[m.id] ?? "",
          approved_pct: approvedPct[m.id] ?? "",
        })),
        totals: {
          total_submitted: roundMoney(totalSubmitted),
          total_approved: roundMoney(totalApproved),
          retention_deduction: roundMoney(retentionAmount),
          insurance_deduction: roundMoney(insuranceAmount),
          payment_due: roundMoney(finalPayout),
        },
      }

      const { data: partialRow, error: paErr } = await supabase
        .from("partial_accounts")
        .insert({
          contract_id: id,
          status: "submitted",
          total_cumulative_amount: roundMoney(totalApproved),
          retention_deduction: roundMoney(retentionAmount),
          insurance_deduction: roundMoney(insuranceAmount),
          payment_due: roundMoney(finalPayout),
          snapshot_payload: snapshotPayload,
          previous_cumulative_approved: previousSameContractCumulative,
          project_id: contract?.project_id ?? null,
        })
        .select("id, account_number")
        .single()

      if (paErr) throw paErr
      if (!partialRow?.id) throw new Error("לא נשמר מזהה חשבון חלקי")
      const acctNum = (partialRow as { account_number?: number }).account_number
      if (typeof acctNum === "number") setLastPartialAccountNumber(acctNum)

      const lineInserts = withActivity.map(({ m, s, a, subAmt, appAmt }) => ({
        partial_account_id: partialRow.id,
        contract_milestone_id: m.id,
        execution_percentage: a,
        cumulative_amount: appAmt,
        submitted_percentage: s,
        submitted_amount: subAmt,
        approved_percentage: a,
        approved_amount: appAmt,
      }))

      const { error: liErr } = await supabase
        .from("partial_account_line_items")
        .insert(lineInserts)

      if (liErr) {
        await supabase.from("partial_accounts").delete().eq("id", partialRow.id)
        throw liErr
      }

      setPreviousSameContractCumulative(roundMoney(totalApproved))

      const { data: pcAfter } = await supabase
        .from("partial_accounts")
        .select("payment_due")
        .eq("contract_id", id)
        .eq("is_deleted", false)
        .in("status", ["submitted", "approved", "paid"])
      setPriorContractPaymentsSum(
        roundMoney(
          (pcAfter ?? []).reduce(
            (s: number, r: { payment_due: number }) =>
              s + Number(r.payment_due),
            0
          )
        )
      )

      const pid = contract?.project_id
      if (pid) {
        const { data: sibs } = await supabase
          .from("contracts")
          .select("id")
          .eq("project_id", pid)
          .eq("is_deleted", false)
        const sibIds = (sibs ?? []).map((c: { id: string }) => c.id)
        if (sibIds.length > 0) {
          const { data: ppAfter } = await supabase
            .from("partial_accounts")
            .select("payment_due")
            .in("contract_id", sibIds)
            .eq("is_deleted", false)
            .in("status", ["submitted", "approved", "paid"])
          setPriorProjectPaymentsSum(
            roundMoney(
              (ppAfter ?? []).reduce(
                (s: number, r: { payment_due: number }) =>
                  s + Number(r.payment_due),
                0
              )
            )
          )
        }
      }

      toast.success("חשבון חלקי הופק ונשמר בהצלחה!")
    } catch (e) {
      console.error("[Marker Ofek] שמירת חשבון חלקי נכשלה", e)
      toast.error(`שמירת החשבון החלקי נכשלה: ${formatError(e)}`)
    } finally {
      setSavingPartialAccount(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <p className="text-sm">טוען פרטי חוזה…</p>
      </div>
    )
  }

  if (error || !contract) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <p className="text-destructive">{error ?? "לא ניתן לטעון את החוזה"}</p>
        <Button
          variant="outline"
          render={<Link href="/marker-ofek/contracts" />}
        >
          חזרה לרשימת חוזים
        </Button>
      </div>
    )
  }

  const projectName = contract.projects?.name ?? "—"
  const entityName = contract.entities?.name ?? "—"
  const contractTotal =
    contract.total_amount != null
      ? currencyFormatter.format(Number(contract.total_amount))
      : "—"
  const pricingModel = contract.pricing_model?.trim()
  const agreementLabel =
    pricingModel === "boq"
      ? "כתב כמויות"
      : pricingModel === "paushal"
        ? "פאושלי"
        : contract.agreement_type?.trim() || "—"

  return (
    <>
      <div
        className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-12 print:hidden"
        dir="rtl"
      >
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/marker-ofek/contracts"
            className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowRight className="size-4 rotate-180" aria-hidden />
            חזרה לרשימת חוזים
          </Link>
          <Link
            href={`/marker-ofek/contracts/${id}/edit`}
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-cyan-600 transition-colors hover:text-cyan-500 dark:text-cyan-400"
          >
            עריכת פרטי חוזה ואבני דרך
          </Link>
          <Link
            href={`/marker-ofek/finance/contracts/${id}`}
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-500"
          >
            <Landmark className="size-4 shrink-0" aria-hidden />
            מרכז חוזים וחיוב
          </Link>
        </div>

        <header className="pharmacy-hero-card p-6 md:p-8">
          <div
            className="pointer-events-none absolute -start-20 -top-20 size-64 rounded-full bg-cyan-500/15 blur-3xl"
            aria-hidden
          />
          <div className="relative grid gap-6 md:grid-cols-3">
            <div className="flex items-start gap-3 md:col-span-1">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-600">
                <Building2 className="size-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-cyan-600/90">שם פרויקט</p>
                <p className="text-lg font-semibold text-[#1e293b]">{projectName}</p>
                {contract.projects?.internal_project_code ? (
                  <p className="mt-0.5 font-mono text-xs text-slate-400">
                    {contract.projects.internal_project_code}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-start gap-3 md:col-span-1">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-600">
                <Users className="size-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-violet-600/90">שם ישות</p>
                <p className="text-lg font-semibold text-[#1e293b]">{entityName}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 md:col-span-1">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700">
                <Receipt className="size-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-amber-700/90">
                  סכום חוזה כולל
                </p>
                <p className="font-currency-mono text-xl font-bold tabular-nums text-[#1e293b]">
                  {contractTotal}
                </p>
                <p className="mt-1 text-xs text-slate-400">{agreementLabel}</p>
              </div>
            </div>
          </div>
        </header>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/20">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-400">
                <Wallet className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle>מצב חשבונאי (אבני דרך)</CardTitle>
                <CardDescription>
                  אחוז מוגש ומאושר לכל אבן דרך. ניכויי עכבון וביטוח מחושבים על
                  בסיס סה״כ מאושר.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/25 p-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    מצטבר מאושר קודם (חוזה זה)
                  </p>
                  <p className="font-semibold tabular-nums">
                    {currencyFormatter.format(previousSameContractCumulative)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    תשלומים בחשבונות (חוזה)
                  </p>
                  <p className="font-semibold tabular-nums">
                    {currencyFormatter.format(priorContractPaymentsSum)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    תשלומים בפרויקט (כל החוזים)
                  </p>
                  <p className="font-semibold tabular-nums">
                    {currencyFormatter.format(priorProjectPaymentsSum)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => void handleGeneratePartialAccount()}
                disabled={savingPartialAccount || milestones.length === 0}
              >
                {savingPartialAccount ? (
                  <>
                    <Loader2 className="ms-2 size-4 animate-spin" aria-hidden />
                    שומר…
                  </>
                ) : (
                  "הפקת חשבון חלקי"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIssueInvoiceOpen(true)}
              >
                הפקת חשבונית ללקוח
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.print()}
              >
                <Printer className="ms-2 size-4" aria-hidden />
                הדפסה
              </Button>
              {lastPartialAccountNumber != null ? (
                <span className="text-sm text-muted-foreground">
                  חשבון אחרון: #{lastPartialAccountNumber}
                </span>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  סה״כ מוגש (שווי)
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {currencyFormatter.format(totals.totalSubmitted)}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  סה״כ מאושר (שווי)
                </p>
                <p className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {currencyFormatter.format(totals.totalApproved)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>אבני דרך</CardTitle>
            <CardDescription>
              {milestones.length === 0
                ? "אין אבני דרך — הוסיפו בעריכת החוזה."
                : "הזינו אחוז מוגש ומאושר לכל שורה."}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[36px]" />
                  <TableHead>תיאור</TableHead>
                  <TableHead className="text-end">סכום שורה</TableHead>
                  <TableHead className="text-end">משקל %</TableHead>
                  <TableHead className="text-end">מוגש %</TableHead>
                  <TableHead className="text-end">מאושר %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {milestones.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="align-middle">
                      {contract.project_id ? (
                        <MoContextCommentButton
                          projectId={contract.project_id}
                          projectName={
                            contract.projects?.name?.trim() || "פרויקט"
                          }
                          contextType="contract_item"
                          contextId={m.id}
                          contextLabel={m.name.slice(0, 120)}
                          hasComment={hasComment(m.id)}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[280px] whitespace-normal text-sm">
                      {m.name}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {currencyFormatter.format(m.amount)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums text-muted-foreground">
                      {m.weight_percentage != null &&
                      Number.isFinite(m.weight_percentage)
                        ? `${roundMoney(m.weight_percentage)}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <Input
                        className="ms-auto w-20 text-end"
                        inputMode="decimal"
                        value={submittedPct[m.id] ?? ""}
                        onChange={(e) =>
                          setSubmittedPct((prev) => ({
                            ...prev,
                            [m.id]: e.target.value,
                          }))
                        }
                        aria-label={`אחוז מוגש — ${m.name}`}
                      />
                    </TableCell>
                    <TableCell className="text-end">
                      <Input
                        className="ms-auto w-20 text-end"
                        inputMode="decimal"
                        value={approvedPct[m.id] ?? ""}
                        onChange={(e) =>
                          setApprovedPct((prev) => ({
                            ...prev,
                            [m.id]: e.target.value,
                          }))
                        }
                        aria-label={`אחוז מאושר — ${m.name}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="hidden print:block print:p-8" dir="rtl">
        {companyProfile ? (
          <header className="mb-6 border-b pb-4">
            <p className="text-lg font-bold">{companyProfile.company_name}</p>
            <p className="text-xs text-neutral-600">
              {[
                companyProfile.address,
                companyProfile.phone,
                companyProfile.email,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </header>
        ) : null}
        <h1 className="mb-4 text-xl font-bold">ריכוז חשבון — {projectName}</h1>
        <p className="mb-6 text-sm">ישות: {entityName}</p>
        <table className="mb-6 w-full border-collapse border border-black text-sm">
          <thead>
            <tr className="bg-neutral-100">
              <th className="border border-black p-2 text-start">סעיף</th>
              <th className="border border-black p-2 text-end">סכום</th>
              <th className="border border-black p-2 text-end">מוגש %</th>
              <th className="border border-black p-2 text-end">מאושר %</th>
            </tr>
          </thead>
          <tbody>
            {milestones.map((m) => (
              <tr key={m.id}>
                <td className="border border-black p-2">{m.name}</td>
                <td className="border border-black p-2 text-end tabular-nums">
                  {currencyFormatter.format(m.amount)}
                </td>
                <td className="border border-black p-2 text-end">
                  {submittedPct[m.id] ?? ""}
                </td>
                <td className="border border-black p-2 text-end">
                  {approvedPct[m.id] ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm">
          לתשלום נטו (לפני מע״מ):{" "}
          <strong>{currencyFormatter.format(printTotals.paymentBeforeVat)}</strong>
        </p>
        <p className="text-sm">
          מע״מ ({VAT_RATE * 100}%):{" "}
          <strong>{currencyFormatter.format(printTotals.vatAmount)}</strong>
        </p>
        <p className="text-sm font-bold">
          סה״כ כולל מע״מ:{" "}
          {currencyFormatter.format(printTotals.grandTotal)}
        </p>
        <table className="mt-8 w-full max-w-lg border-collapse border border-black text-xs">
          <tbody>
            <tr>
              <td className="border p-2">היקף חוזה (אבני דרך)</td>
              <td className="border p-2 text-end">
                {currencyFormatter.format(grandFinancialSummary.totalProjectScope)}
              </td>
            </tr>
            <tr>
              <td className="border p-2">מאושר למועד</td>
              <td className="border p-2 text-end">
                {currencyFormatter.format(grandFinancialSummary.totalApprovedToDate)}
              </td>
            </tr>
            <tr>
              <td className="border p-2">תשלומים קודמים (חוזה)</td>
              <td className="border p-2 text-end">
                {currencyFormatter.format(grandFinancialSummary.priorPayments)}
              </td>
            </tr>
            <tr>
              <td className="border p-2 font-semibold">לתשלום נוכחי (נטו)</td>
              <td className="border p-2 text-end font-semibold">
                {currencyFormatter.format(grandFinancialSummary.currentPaymentDueNet)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <IssueClientInvoiceDialog
        open={issueInvoiceOpen}
        onOpenChange={setIssueInvoiceOpen}
        contractId={contract.id}
        projectId={contract.project_id}
        defaultSubtotal={totals.finalPayout}
        onIssued={(invId) => {
          window.open(
            `/marker-ofek/finance/invoices/${invId}/print`,
            "_blank",
            "noopener,noreferrer"
          )
        }}
      />
    </>
  )
}
