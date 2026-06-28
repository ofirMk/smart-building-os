import { notFound } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Suspense } from "react"

import {
  SubcontractorBillWizard,
  type BoqLineForWizard,
  type ContractForWizard,
} from "@/components/erp/contracts/subcontractor-bill-wizard"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { cookies } from "next/headers"

// ─── Local query-row shapes (avoids dependency on stale generated types) ─────

interface ContractQueryRow {
  id: string
  contract_number: string
  retention_pct: number | null
  insurance_pct: number | null
  advance_payment_amount: number | null
  advance_recovery_method: string | null
  advance_recovery_pct: number | null
  raw_material_offset_commission_pct: number | null
  status: string
}

interface BoqQueryRow {
  id: string
  line_no: number | null
  section_code: string | null
  description: string | null
  uom: string | null
  quantity: number | null
  unit_price: number | null
  total_line_price: number | null
}

// ─── Data loader ─────────────────────────────────────────────────────────────

async function loadWizardData(contractId: string): Promise<{
  contract: ContractForWizard
  boqLines: BoqLineForWizard[]
} | null> {
  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
  if (!companyId) return null

  const supabase = await createSupabaseServerAuthClient()

  // Load contract header
  const { data: contractRow, error: contractErr } = await supabase
    .from("erp_subcontractor_contracts")
    .select(
      [
        "id",
        "contract_number",
        "retention_pct",
        "insurance_pct",
        "advance_payment_amount",
        "advance_recovery_method",
        "advance_recovery_pct",
        "raw_material_offset_commission_pct",
        "status",
      ].join(", ")
    )
    .eq("company_id", companyId)
    .eq("id", contractId)
    .maybeSingle()

  if (contractErr || !contractRow) return null
  // Cast through unknown to bypass stale generated types (status added in Phase 10.1 migration)
  const crow = contractRow as unknown as ContractQueryRow
  if (crow.status === "CANCELLED") return null

  // Load BOQ lines
  const { data: boqRows, error: boqErr } = await supabase
    .from("erp_contract_boq_lines")
    .select(
      "id, line_no, section_code, description, uom, quantity, unit_price, total_line_price"
    )
    .eq("company_id", companyId)
    .eq("contract_id", contractId)
    .order("line_no", { ascending: true })

  if (boqErr) return null

  const contract: ContractForWizard = {
    id: crow.id,
    contractNumber: crow.contract_number,
    retentionPct: Number(crow.retention_pct ?? 0),
    insurancePct: Number(crow.insurance_pct ?? 0),
    advancePaymentAmount: Number(crow.advance_payment_amount ?? 0),
    advanceRecoveryMethod: crow.advance_recovery_method ?? null,
    advanceRecoveryPct: Number(crow.advance_recovery_pct ?? 0),
    rawMaterialOffsetCommissionPct: Number(
      crow.raw_material_offset_commission_pct ?? 0
    ),
    vatPct: 17,
  }

  const boqLines: BoqLineForWizard[] = (boqRows ?? []).map((r) => {
    const br = r as unknown as BoqQueryRow
    return {
      id: br.id,
      lineNo: Number(br.line_no),
      sectionCode: br.section_code ?? "",
      description: br.description ?? "",
      uom: br.uom ?? "",
      quantity: Number(br.quantity ?? 0),
      unitPrice: Number(br.unit_price ?? 0),
      totalLinePrice: Number(br.total_line_price ?? 0),
    }
  })

  return { contract, boqLines }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function WizardBody({ id }: { id: string }) {
  const data = await loadWizardData(id)
  if (!data) notFound()

  if (data.boqLines.length === 0) {
    return (
      <div
        className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground"
        dir="rtl"
      >
        <p className="text-sm font-medium">לחוזה זה אין שורות כתב כמויות.</p>
        <p className="text-xs">הוסף שורות BOQ לפני יצירת חשבון חלקי.</p>
      </div>
    )
  }

  return (
    <SubcontractorBillWizard
      contractId={id}
      contract={data.contract}
      boqLines={data.boqLines}
    />
  )
}

export default async function NewSubcontractorBillPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolved = await Promise.resolve(params)
  const id = typeof resolved.id === "string" ? resolved.id.trim() : ""
  if (!id) notFound()

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" dir="rtl">
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <WizardBody id={id} />
      </Suspense>
    </div>
  )
}
