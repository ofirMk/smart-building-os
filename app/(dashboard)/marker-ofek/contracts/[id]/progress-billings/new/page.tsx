import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

import {
  ClientProgressBillWizard,
  type ClientContractForWizard,
  type ContractLineForWizard,
} from "@/components/erp/contracts/client-progress-bill-wizard"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { cookies } from "next/headers"

// ─── Query-row interfaces (bypass stale generated types) ─────────────────────

interface ClientContractRow {
  id: string
  contract_number: string
  client_name: string | null
  total_amount: number | null
  retention_pct: number | null
  advance_repayment_pct: number | null
  indexation_pct: number | null
  advance_payment_amount: number | null
  status: string
}

interface ClientContractLineRow {
  id: string
  line_number: number | null
  boq_ref: string | null
  description: string | null
  quantity: number | null
  unit_price: number | null
  total_price: number | null
  last_approved_pct: number | null
  last_approved_amount: number | null
  retainage_exempt: boolean | null
}

// ─── Data loader ──────────────────────────────────────────────────────────────

async function loadWizardData(contractId: string): Promise<{
  contract: ClientContractForWizard
  contractLines: ContractLineForWizard[]
} | null> {
  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
  if (!companyId) return null

  const supabase = await createSupabaseServerAuthClient()

  const { data: contractRow, error: contractErr } = await supabase
    .from("erp_client_contracts")
    .select(
      [
        "id",
        "contract_number",
        "client_name",
        "total_amount",
        "retention_pct",
        "advance_repayment_pct",
        "indexation_pct",
        "advance_payment_amount",
        "status",
      ].join(", ")
    )
    .eq("company_id", companyId)
    .eq("id", contractId)
    .maybeSingle()

  if (contractErr || !contractRow) return null

  const crow = contractRow as unknown as ClientContractRow
  if (crow.status === "CANCELLED" || crow.status === "CLOSED") return null

  const { data: lineRows, error: lineErr } = await supabase
    .from("erp_client_contract_lines")
    .select(
      [
        "id",
        "line_number",
        "boq_ref",
        "description",
        "quantity",
        "unit_price",
        "total_price",
        "last_approved_pct",
        "last_approved_amount",
        "retainage_exempt",
      ].join(", ")
    )
    .eq("company_id", companyId)
    .eq("client_contract_id", contractId)
    .order("line_number", { ascending: true })

  if (lineErr) return null

  const contract: ClientContractForWizard = {
    id: crow.id,
    contractNumber: crow.contract_number,
    clientName: crow.client_name ?? "—",
    totalAmount: Number(crow.total_amount ?? 0),
    retentionPct: Number(crow.retention_pct ?? 0),
    advanceRepaymentPct: Number(crow.advance_repayment_pct ?? 0),
    indexationPct: Number(crow.indexation_pct ?? 0),
    advancePaymentAmount: Number(crow.advance_payment_amount ?? 0),
  }

  const contractLines: ContractLineForWizard[] = (lineRows ?? []).map((r) => {
    const lr = r as unknown as ClientContractLineRow
    return {
      id: lr.id,
      lineNumber: Number(lr.line_number ?? 0),
      boqRef: lr.boq_ref ?? null,
      description: lr.description ?? "",
      quantity: Number(lr.quantity ?? 0),
      unitPrice: Number(lr.unit_price ?? 0),
      totalPrice: Number(lr.total_price ?? 0),
      lastApprovedPct: Number(lr.last_approved_pct ?? 0),
      lastApprovedAmount: Number(lr.last_approved_amount ?? 0),
      retainageExempt: lr.retainage_exempt === true,
    }
  })

  return { contract, contractLines }
}

// ─── Page body ────────────────────────────────────────────────────────────────

async function WizardBody({ id }: { id: string }) {
  const data = await loadWizardData(id)
  if (!data) notFound()

  if (data.contractLines.length === 0) {
    return (
      <div
        className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground"
        dir="rtl"
      >
        <p className="text-base font-medium">אין שורות חוזה</p>
        <p className="text-sm">יש להוסיף שורות לחוזה לפני יצירת חשבון התקדמות.</p>
      </div>
    )
  }

  return (
    <ClientProgressBillWizard
      contractId={id}
      contract={data.contract}
      contractLines={data.contractLines}
    />
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function ClientProgressBillNewPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolved = await Promise.resolve(params)
  const id = typeof resolved.id === "string" ? resolved.id : ""
  if (!id) notFound()

  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground"
          dir="rtl"
        >
          <Loader2 className="size-9 animate-spin" />
          <p className="text-sm">טוען נתוני חוזה…</p>
        </div>
      }
    >
      <WizardBody id={id} />
    </Suspense>
  )
}
