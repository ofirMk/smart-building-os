/**
 * Phase 10.6 — ContractFinanceSummary
 *
 * Server component. Accepts pre-loaded aggregate data and renders
 * the financial health KPI strip for a contract (billings, retention, advance).
 * Designed to be embedded in any contract detail page.
 */

import { TrendingUp, TrendingDown, Landmark, Wallet, ReceiptText } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ─── Data shape ───────────────────────────────────────────────────────────────

export type ContractFinanceSummaryData = {
  contractAmount: number
  // billing
  totalSubmitted: number       // sum of submitted_total_amount across all bills
  totalApproved: number        // sum of approved bills' approved_total_amount
  totalPaid: number            // placeholder until payment table exists
  // deductions
  totalRetentionHeld: number   // sum of retention_deducted_amount across approved bills
  totalAdvanceRecovered: number // sum of advance_repayment_amount across approved bills
  // advance
  advanceGiven: number         // contract.advance_payment_amount
  // counts
  billCount: number
  draftCount: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ils(n: number) {
  return n.toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function pctOfContract(amount: number, total: number): number {
  if (total === 0) return 0
  return Math.round((amount / total) * 1000) / 10
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  color: "emerald" | "amber" | "blue" | "rose" | "slate"
}) {
  const colorMap = {
    emerald: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
    amber: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
    blue: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
    rose: "text-rose-600 bg-rose-50 dark:bg-rose-950/30",
    slate: "text-slate-600 bg-slate-50 dark:bg-slate-950/30",
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      <div className={cn("rounded-md p-2", colorMap[color])}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1" dir="rtl">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ContractFinanceSummary({
  data,
  kind = "client",
}: {
  data: ContractFinanceSummaryData
  kind?: "client" | "subcontractor"
}) {
  const balance = data.contractAmount - data.totalApproved
  const completionPct = pctOfContract(data.totalApproved, data.contractAmount)
  const advanceBalance = data.advanceGiven - data.totalAdvanceRecovered
  const retentionBalance = data.totalRetentionHeld // simplified; release tracked separately

  return (
    <Card dir="rtl">
      <CardContent className="pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {kind === "client" ? "מצב פיננסי — חוזה מזמין" : "מצב פיננסי — קבלן משנה"}
          </h3>
          <div className="flex items-center gap-2">
            {data.draftCount > 0 && (
              <Badge variant="outline" className="text-[11px]">
                {data.draftCount} טיוטה
              </Badge>
            )}
            <Badge variant="secondary" className="text-[11px]">
              {data.billCount} חשבונות
            </Badge>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4 space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>התקדמות אישורים</span>
            <span className="tabular-nums">{completionPct}% מערך החוזה</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, completionPct)}%` }}
            />
          </div>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <KpiTile
            label={kind === "client" ? "סה״כ הוגש" : "סה״כ הוגש"}
            value={ils(data.totalSubmitted)}
            sub={`${pctOfContract(data.totalSubmitted, data.contractAmount)}% מהחוזה`}
            icon={ReceiptText}
            color="blue"
          />
          <KpiTile
            label="אושר לתשלום"
            value={ils(data.totalApproved)}
            sub={`${pctOfContract(data.totalApproved, data.contractAmount)}% מהחוזה`}
            icon={TrendingUp}
            color="emerald"
          />
          <KpiTile
            label="יתרת חוזה"
            value={ils(Math.max(0, balance))}
            sub={balance < 0 ? "חריגה מהחוזה!" : undefined}
            icon={Wallet}
            color={balance < 0 ? "rose" : "slate"}
          />
          <KpiTile
            label="עכבון נצבר"
            value={ils(retentionBalance)}
            sub="טרם שוחרר"
            icon={Landmark}
            color="amber"
          />
          <KpiTile
            label="מקדמה שניתנה"
            value={ils(data.advanceGiven)}
            sub={
              data.advanceGiven > 0
                ? `נוכה ${ils(data.totalAdvanceRecovered)} · יתרה ${ils(Math.max(0, advanceBalance))}`
                : "ללא מקדמה"
            }
            icon={TrendingDown}
            color="rose"
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Data loader helper (for server components) ───────────────────────────────

/**
 * Aggregate billing KPIs from `erp_client_progress_bills`.
 * Call this from a server component and pass the result to <ContractFinanceSummary />.
 */
export async function loadClientContractFinanceSummary(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server-auth")["createSupabaseServerAuthClient"]>>,
  companyId: string,
  contractId: string,
  contractAmount: number,
  advanceGiven: number
): Promise<ContractFinanceSummaryData> {
  const { data: bills } = await supabase
    .from("erp_client_progress_bills")
    .select(
      "id, status, submitted_total_amount, approved_total_amount, retention_deducted_amount, advance_repayment_amount"
    )
    .eq("company_id", companyId)
    .eq("client_contract_id", contractId)

  const rows = (bills ?? []) as Array<{
    status: string
    submitted_total_amount: number | null
    approved_total_amount: number | null
    retention_deducted_amount: number | null
    advance_repayment_amount: number | null
  }>

  const totalSubmitted = rows.reduce((s, r) => s + Number(r.submitted_total_amount ?? 0), 0)
  const approvedRows = rows.filter((r) => r.status === "APPROVED")
  const totalApproved = approvedRows.reduce((s, r) => s + Number(r.approved_total_amount ?? 0), 0)
  const totalRetentionHeld = approvedRows.reduce(
    (s, r) => s + Number(r.retention_deducted_amount ?? 0),
    0
  )
  const totalAdvanceRecovered = approvedRows.reduce(
    (s, r) => s + Number(r.advance_repayment_amount ?? 0),
    0
  )

  return {
    contractAmount,
    totalSubmitted,
    totalApproved,
    totalPaid: 0, // linked payment table not yet wired
    totalRetentionHeld,
    totalAdvanceRecovered,
    advanceGiven,
    billCount: rows.length,
    draftCount: rows.filter((r) => r.status === "DRAFT").length,
  }
}

/**
 * Aggregate billing KPIs from `erp_subcontractor_bills`.
 */
export async function loadSubcontractorContractFinanceSummary(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server-auth")["createSupabaseServerAuthClient"]>>,
  companyId: string,
  contractId: string,
  contractAmount: number,
  advanceGiven: number
): Promise<ContractFinanceSummaryData> {
  const { data: bills } = await supabase
    .from("erp_subcontractor_bills")
    .select(
      "id, status, submitted_amount, approved_amount, retention_amount, advance_recovery_amount"
    )
    .eq("company_id", companyId)
    .eq("subcontractor_contract_id", contractId)

  const rows = (bills ?? []) as Array<{
    status: string
    submitted_amount: number | null
    approved_amount: number | null
    retention_amount: number | null
    advance_recovery_amount: number | null
  }>

  const totalSubmitted = rows.reduce((s, r) => s + Number(r.submitted_amount ?? 0), 0)
  const approvedRows = rows.filter((r) => r.status === "APPROVED" || r.status === "PAID")
  const totalApproved = approvedRows.reduce((s, r) => s + Number(r.approved_amount ?? 0), 0)
  const totalRetentionHeld = approvedRows.reduce(
    (s, r) => s + Number(r.retention_amount ?? 0),
    0
  )
  const totalAdvanceRecovered = approvedRows.reduce(
    (s, r) => s + Number(r.advance_recovery_amount ?? 0),
    0
  )

  return {
    contractAmount,
    totalSubmitted,
    totalApproved,
    totalPaid: 0,
    totalRetentionHeld,
    totalAdvanceRecovered,
    advanceGiven,
    billCount: rows.length,
    draftCount: rows.filter((r) => r.status === "DRAFT").length,
  }
}
