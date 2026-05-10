/**
 * Contract Workspace — Sprint A.3.
 *
 * Server component that loads everything needed to render the 5 tabs:
 *   1. כתב כמויות         (erp_contract_boq_lines)
 *   2. חריגים ותוספות      (erp_contract_amendments)
 *   3. חשבונות מוגשים      (erp_subcontractor_bills + ProgressCertificateBuilder
 *                             on the latest editable bill)
 *   4. עכבונות             (erp_retention_ledger + waterfall summary)
 *   5. קיזוזים              (erp_back_charges)
 *
 * The page itself stays a server component; the tab navigation is a small
 * client wrapper (ContractWorkspaceTabs) so React Tabs state survives.
 */
import Link from "next/link"
import { cookies } from "next/headers"
import { ArrowRightCircle, Briefcase } from "lucide-react"

import { ContractWorkspaceTabs } from "@/components/marker-ofek/contracts/contract-workspace-tabs"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export const dynamic = "force-dynamic"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

type ContractRow = {
  id: string
  contract_number: string
  contract_type: string
  total_amount: number
  retention_pct: number
  insurance_pct: number
  advance_payment_pct: number
  status: string
  signed_at: string | null
  payment_terms: string | null
  notes: string | null
  subcontractor_id: string
  project_id: string
}

type BoqLineRow = {
  id: string
  line_no: number
  section_code: string
  description: string
  uom: string
  quantity: number
  unit_price: number
  total_line_price: number
}

type AmendmentRow = {
  id: string
  amendment_number: number
  amendment_type: string
  description: string
  value_delta: number
  status: string
  signed_at: string | null
  justification: string | null
}

type BillRow = {
  id: string
  bill_number: number
  execution_month: string
  bill_date: string
  cumulative_executed_amount: number
  cumulative_net_amount: number
  retention_deduction_amount: number
  insurance_deduction_amount: number
  amount_to_pay: number
  vat_amount: number
  grand_total_amount: number
  previous_billed_amount: number
  vat_pct: number
  status: string
}

type BillLineRow = {
  bill_id: string
  boq_line_id: string
  cumulative_qty: number
  cumulative_pct: number
  cumulative_amount: number
}

type RetentionRow = {
  id: string
  entry_type: string
  entry_date: string
  amount: number
  milestone: string | null
  notes: string | null
  bill_id: string | null
}

type BackChargeRow = {
  id: string
  charge_number: number
  charge_type: string
  charge_date: string
  amount: number
  description: string
  source_doc_ref: string | null
  status: string
  deducted_in_bill_id: string | null
}

const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "טיוטה", cls: "bg-slate-100 text-slate-800" },
  ACTIVE: { label: "בתוקף", cls: "bg-emerald-100 text-emerald-900" },
  COMPLETED: { label: "הושלם", cls: "bg-indigo-100 text-indigo-900" },
  CANCELLED: { label: "בוטל", cls: "bg-rose-100 text-rose-900" },
}

export default async function ContractWorkspacePage({
  params,
}: {
  params: Promise<{ id: string; contractId: string }>
}) {
  const { id: projectId, contractId } = await params

  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(
    cookieStore.get(COMPANY_COOKIE_KEY)?.value,
  )
  if (!companyId) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-700">
        לא נמצא הקשר חברה פעיל.
      </div>
    )
  }

  const supabase = await createSupabaseServerAuthClient()
  const { data: contract, error: cErr } = await supabase
    .from("erp_subcontractor_contracts")
    .select(
      "id, contract_number, contract_type, total_amount, retention_pct, insurance_pct, advance_payment_pct, status, signed_at, payment_terms, notes, subcontractor_id, project_id",
    )
    .eq("id", contractId)
    .eq("company_id", companyId)
    .maybeSingle<ContractRow>()
  if (cErr || !contract) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-700">
        חוזה לא נמצא או לא נגיש.
      </div>
    )
  }

  const [
    boqRes,
    amendRes,
    billsRes,
    billLinesRes,
    retentionRes,
    backChargesRes,
    supplierRes,
    projectRes,
  ] = await Promise.all([
    supabase
      .from("erp_contract_boq_lines")
      .select(
        "id, line_no, section_code, description, uom, quantity, unit_price, total_line_price",
      )
      .eq("company_id", companyId)
      .eq("contract_id", contractId)
      .order("line_no", { ascending: true }),
    supabase
      .from("erp_contract_amendments")
      .select(
        "id, amendment_number, amendment_type, description, value_delta, status, signed_at, justification",
      )
      .eq("company_id", companyId)
      .eq("contract_id", contractId)
      .order("amendment_number", { ascending: true }),
    supabase
      .from("erp_subcontractor_bills")
      .select(
        "id, bill_number, execution_month, bill_date, cumulative_executed_amount, cumulative_net_amount, retention_deduction_amount, insurance_deduction_amount, amount_to_pay, vat_amount, grand_total_amount, previous_billed_amount, vat_pct, status",
      )
      .eq("company_id", companyId)
      .eq("contract_id", contractId)
      .order("bill_number", { ascending: false }),
    supabase
      .from("erp_subcontractor_bill_lines")
      .select(
        "bill_id, boq_line_id, cumulative_qty, cumulative_pct, cumulative_amount",
      )
      .eq("company_id", companyId),
    supabase
      .from("erp_retention_ledger")
      .select(
        "id, entry_type, entry_date, amount, milestone, notes, bill_id",
      )
      .eq("company_id", companyId)
      .eq("contract_id", contractId)
      .order("entry_date", { ascending: false }),
    supabase
      .from("erp_back_charges")
      .select(
        "id, charge_number, charge_type, charge_date, amount, description, source_doc_ref, status, deducted_in_bill_id",
      )
      .eq("company_id", companyId)
      .eq("contract_id", contractId)
      .order("charge_number", { ascending: true }),
    supabase
      .from("erp_md_suppliers")
      .select("id, name, supplier_number")
      .eq("id", contract.subcontractor_id)
      .maybeSingle<{ id: string; name: string; supplier_number: string }>(),
    supabase
      .from("erp_proj_projects")
      .select("id, name, project_number")
      .eq("id", contract.project_id)
      .maybeSingle<{ id: string; name: string; project_number: string }>(),
  ])

  const boqLines = (boqRes.data ?? []) as BoqLineRow[]
  const amendments = (amendRes.data ?? []) as AmendmentRow[]
  const bills = (billsRes.data ?? []) as BillRow[]
  const allBillLines = (billLinesRes.data ?? []) as BillLineRow[]
  const retention = (retentionRes.data ?? []) as RetentionRow[]
  const backCharges = (backChargesRes.data ?? []) as BackChargeRow[]
  const supplier = supplierRes.data
  const project = projectRes.data

  // Derived header KPIs
  const approvedDelta = amendments
    .filter((a) => a.status === "APPROVED")
    .reduce((s, a) => s + Number(a.value_delta), 0)
  const pendingDelta = amendments
    .filter((a) => a.status === "PENDING_APPROVAL")
    .reduce((s, a) => s + Number(a.value_delta), 0)
  const original = Number(contract.total_amount)
  const currentValue = original + approvedDelta
  const latestBill = bills[0]
  const cumulativeExec = latestBill
    ? Number(latestBill.cumulative_executed_amount)
    : 0
  const remaining = Math.max(0, currentValue - cumulativeExec)

  const retentionHeld = retention
    .filter((r) => r.entry_type === "HOLD")
    .reduce((s, r) => s + Number(r.amount), 0)
  const retentionReleased = retention
    .filter((r) => r.entry_type === "RELEASE")
    .reduce((s, r) => s + Number(r.amount), 0)
  const retentionForfeited = retention
    .filter((r) => r.entry_type === "FORFEITURE")
    .reduce((s, r) => s + Number(r.amount), 0)
  const retentionNet = retentionHeld - retentionReleased - retentionForfeited

  const status = CONTRACT_STATUS[contract.status] ?? {
    label: contract.status,
    cls: "bg-slate-100 text-slate-800",
  }

  // Pick the latest editable bill (DRAFT/SUBMITTED/REJECTED).
  const editable = bills.find((b) =>
    ["DRAFT", "SUBMITTED", "REJECTED"].includes(b.status),
  )
  const editableLines = editable
    ? allBillLines.filter((l) => l.bill_id === editable.id)
    : []

  return (
    <div dir="rtl" className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <Link
        href={`/marker-ofek/projects/${projectId}/contracts`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline"
      >
        <ArrowRightCircle className="size-3.5" aria-hidden />
        חזרה לרשימת החוזים
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700">
            <Briefcase className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-[10px] font-mono text-slate-500">
              {project?.name ?? "—"} · {project?.project_number ?? "—"}
            </p>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              חוזה {contract.contract_number} — {supplier?.name ?? "—"}
            </h1>
            <p className="text-xs text-slate-700">
              סוג: {contract.contract_type} · עכבון: {contract.retention_pct}% ·
              ביטוח: {contract.insurance_pct}% · מקדמה:{" "}
              {contract.advance_payment_pct}%
            </p>
          </div>
        </div>
        <Badge className={status.cls}>{status.label}</Badge>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="ערך נוכחי" value={ILS.format(currentValue)} hint={`מקורי ${ILS.format(original)} + תוספות ${ILS.format(approvedDelta)}`} />
        <Kpi label="בוצע מצטבר" value={ILS.format(cumulativeExec)} hint={latestBill ? `חשבון #${latestBill.bill_number}` : "אין חשבון מאושר"} />
        <Kpi label="יתרת ביצוע" value={ILS.format(remaining)} hint={`${currentValue > 0 ? Math.round((cumulativeExec / currentValue) * 1000) / 10 : 0}% מבוצע`} />
        <Kpi label="עכבון נטו" value={ILS.format(retentionNet)} hint={`הוחזק ${ILS.format(retentionHeld)} · שוחרר ${ILS.format(retentionReleased)}`} />
      </div>

      {pendingDelta > 0 ? (
        <Card className="border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>שים לב:</strong> {amendments.filter((a) => a.status === "PENDING_APPROVAL").length} תוספות ממתינות לאישור בסך {ILS.format(pendingDelta)} — לא שוקפות בערך הנוכחי.
        </Card>
      ) : null}

      <ContractWorkspaceTabs
        boqLines={boqLines}
        amendments={amendments}
        bills={bills}
        retention={retention}
        backCharges={backCharges}
        editableBill={
          editable
            ? {
                id: editable.id,
                billNumber: editable.bill_number,
                status: editable.status,
                previousBilled: Number(editable.previous_billed_amount),
                vatPct: Number(editable.vat_pct ?? 17),
                retentionPct: Number(contract.retention_pct),
                insurancePct: Number(contract.insurance_pct),
                initialLines: Object.fromEntries(
                  editableLines.map((l) => [
                    l.boq_line_id,
                    {
                      cumulativeQty: Number(l.cumulative_qty),
                      cumulativePct: Number(l.cumulative_pct),
                      cumulativeAmount: Number(l.cumulative_amount),
                    },
                  ]),
                ),
                initialTotals: {
                  cumulative_executed_amount: Number(
                    editable.cumulative_executed_amount,
                  ),
                  retention_deduction_amount: Number(
                    editable.retention_deduction_amount,
                  ),
                  insurance_deduction_amount: Number(
                    editable.insurance_deduction_amount,
                  ),
                  cumulative_net_amount: Number(editable.cumulative_net_amount),
                  previous_billed_amount: Number(editable.previous_billed_amount),
                  amount_to_pay: Number(editable.amount_to_pay),
                  vat_amount: Number(editable.vat_amount),
                  grand_total_amount: Number(editable.grand_total_amount),
                  back_charges_total: 0,
                },
                boqLines: boqLines.map((b) => ({
                  id: b.id,
                  lineNo: b.line_no,
                  description: b.description,
                  uom: b.uom,
                  contractedQty: Number(b.quantity),
                  unitPrice: Number(b.unit_price),
                  contractedTotal: Number(b.total_line_price),
                })),
              }
            : null
        }
      />
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card className="p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums">{value}</p>
      {hint ? <p className="text-[10px] text-slate-500">{hint}</p> : null}
    </Card>
  )
}
