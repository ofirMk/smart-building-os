"use server"

/**
 * Subcontractor Partial Bill server actions — Sprint A.3.
 *
 * Lifecycle (existing schema):
 *   DRAFT → SUBMITTED → APPROVED → PAID
 *   ↘ REJECTED
 *
 * Surfaces used by the live ProgressCertificateBuilder:
 *
 *   updateCumulativeLine(billId, boqLineId, cumulativeQty, cumulativePct,
 *                         cumulativeAmount)
 *     UPSERTs a single bill line's cumulative values. Used as the user types.
 *
 *   recomputeBillTotals(billId)
 *     Recomputes header waterfall: cumulative_executed_amount,
 *     retention_deduction_amount, insurance_deduction_amount, amount_to_pay,
 *     vat_amount, grand_total_amount — given the current set of lines plus
 *     contract retention_pct/insurance_pct + back_charges DEDUCTED for this bill.
 *
 *   submitBillForApproval(billId)
 *     DRAFT → SUBMITTED.
 *
 *   approveSubcontractorBill(billId)
 *     SUBMITTED → APPROVED. Then:
 *       (a) Posts the GL entry via postSubcontractorBillToGL (existing).
 *       (b) Auto-creates an APPROVED erp_vendor_invoices row for the next
 *           AP Payment Run (Sprint A.2 integration).
 *       (c) Marks any APPROVED back-charges referenced via deducted_in_bill_id
 *           as DEDUCTED.
 *
 * All actions enforce company_id via cookie context.
 */
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { postSubcontractorBillToGL } from "@/lib/erp/gl-posting"
import { getSystemParameterNumber } from "@/lib/erp/system-parameters"
import { formatError } from "@/lib/format-error"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function getCompanyId(): Promise<string | null> {
  const cookieStore = await cookies()
  return resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
}

// ---------------------------------------------------------------------------
// updateCumulativeLine — UPSERT one bill line during live editing
// ---------------------------------------------------------------------------

const updateLineSchema = z.object({
  billId: z.string().uuid(),
  boqLineId: z.string().uuid(),
  cumulativeQty: z.number().min(0),
  cumulativePct: z.number().min(0).max(100),
  cumulativeAmount: z.number().min(0),
})

export async function updateCumulativeLine(
  input: z.input<typeof updateLineSchema>,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const parsed = updateLineSchema.parse(input)
    const companyId = await getCompanyId()
    if (!companyId) return { ok: false, error: "חסר הקשר חברה" }

    const supabase = await createSupabaseServerAuthClient()
    const { error } = await supabase.from("erp_subcontractor_bill_lines").upsert(
      {
        company_id: companyId,
        bill_id: parsed.billId,
        boq_line_id: parsed.boqLineId,
        cumulative_qty: parsed.cumulativeQty,
        cumulative_pct: parsed.cumulativePct,
        cumulative_amount: parsed.cumulativeAmount,
      },
      { onConflict: "company_id,bill_id,boq_line_id" },
    )
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: { ok: true } }
  } catch (err) {
    return { ok: false, error: formatError(err) }
  }
}

// ---------------------------------------------------------------------------
// recomputeBillTotals — header waterfall recomputation
// ---------------------------------------------------------------------------

type BillSnapshot = {
  cumulative_executed_amount: number
  retention_deduction_amount: number
  insurance_deduction_amount: number
  cumulative_net_amount: number
  previous_billed_amount: number
  amount_to_pay: number
  vat_amount: number
  grand_total_amount: number
  back_charges_total: number
}

export async function recomputeBillTotals(
  billId: string,
): Promise<ActionResult<BillSnapshot>> {
  try {
    const companyId = await getCompanyId()
    if (!companyId) return { ok: false, error: "חסר הקשר חברה" }

    const supabase = await createSupabaseServerAuthClient()

    const { data: bill, error: bErr } = await supabase
      .from("erp_subcontractor_bills")
      .select(
        "id, contract_id, previous_billed_amount, vat_pct",
      )
      .eq("id", billId)
      .eq("company_id", companyId)
      .maybeSingle<{
        id: string
        contract_id: string
        previous_billed_amount: number
        vat_pct: number
      }>()
    if (bErr || !bill) return { ok: false, error: bErr?.message ?? "חשבון לא נמצא" }

    const [linesRes, contractRes, backChargesRes] = await Promise.all([
      supabase
        .from("erp_subcontractor_bill_lines")
        .select("cumulative_amount")
        .eq("bill_id", billId)
        .eq("company_id", companyId),
      supabase
        .from("erp_subcontractor_contracts")
        .select("retention_pct, insurance_pct")
        .eq("id", bill.contract_id)
        .maybeSingle<{ retention_pct: number; insurance_pct: number }>(),
      supabase
        .from("erp_back_charges")
        .select("amount, status")
        .eq("contract_id", bill.contract_id)
        .eq("company_id", companyId)
        .eq("deducted_in_bill_id", billId),
    ])
    if (linesRes.error) return { ok: false, error: linesRes.error.message }
    if (contractRes.error || !contractRes.data) {
      return { ok: false, error: contractRes.error?.message ?? "חוזה חסר" }
    }

    const lines = (linesRes.data ?? []) as { cumulative_amount: number }[]
    const cumulativeExec = lines.reduce(
      (s, l) => s + Number(l.cumulative_amount),
      0,
    )
    const retentionPct = Number(contractRes.data.retention_pct)
    const insurancePct = Number(contractRes.data.insurance_pct)
    const retentionDeduction = round2(cumulativeExec * (retentionPct / 100))
    const insuranceDeduction = round2(cumulativeExec * (insurancePct / 100))
    const cumulativeNet = round2(
      cumulativeExec - retentionDeduction - insuranceDeduction,
    )
    const previousBilled = Number(bill.previous_billed_amount)
    const backChargesTotal = round2(
      ((backChargesRes.data ?? []) as { amount: number; status: string }[])
        .filter((b) => b.status === "DEDUCTED")
        .reduce((s, b) => s + Number(b.amount), 0),
    )
    const amountToPay = round2(cumulativeNet - previousBilled - backChargesTotal)
    /**
     * VAT precedence: per-bill override (bill.vat_pct) → system parameter
     * DEFAULT_VAT_PCT → hardcoded 17. Migrated from hardcoded 17 fallback as
     * part of the System Parameters resolver migration (Sprint W2 Stage 4).
     */
    const vatPct =
      bill.vat_pct != null
        ? Number(bill.vat_pct)
        : await getSystemParameterNumber(companyId, "DEFAULT_VAT_PCT")
    const vatAmount = round2((amountToPay * vatPct) / 100)
    const grandTotal = round2(amountToPay + vatAmount)

    const { error: upErr } = await supabase
      .from("erp_subcontractor_bills")
      .update({
        cumulative_executed_amount: cumulativeExec,
        retention_deduction_amount: retentionDeduction,
        insurance_deduction_amount: insuranceDeduction,
        amount_to_pay: amountToPay,
        vat_amount: vatAmount,
        grand_total_amount: grandTotal,
      })
      .eq("id", billId)
      .eq("company_id", companyId)
    if (upErr) return { ok: false, error: upErr.message }

    return {
      ok: true,
      data: {
        cumulative_executed_amount: cumulativeExec,
        retention_deduction_amount: retentionDeduction,
        insurance_deduction_amount: insuranceDeduction,
        cumulative_net_amount: cumulativeNet,
        previous_billed_amount: previousBilled,
        amount_to_pay: amountToPay,
        vat_amount: vatAmount,
        grand_total_amount: grandTotal,
        back_charges_total: backChargesTotal,
      },
    }
  } catch (err) {
    return { ok: false, error: formatError(err) }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------
// submitBillForApproval
// ---------------------------------------------------------------------------

export async function submitBillForApproval(
  billId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const companyId = await getCompanyId()
    if (!companyId) return { ok: false, error: "חסר הקשר חברה" }

    const supabase = await createSupabaseServerAuthClient()
    const { error } = await supabase
      .from("erp_subcontractor_bills")
      .update({ status: "SUBMITTED" })
      .eq("id", billId)
      .eq("company_id", companyId)
      .in("status", ["DRAFT", "REJECTED"])
    if (error) return { ok: false, error: error.message }
    revalidatePath(`/marker-ofek/projects`)
    return { ok: true, data: { id: billId } }
  } catch (err) {
    return { ok: false, error: formatError(err) }
  }
}

// ---------------------------------------------------------------------------
// approveSubcontractorBill — flips to APPROVED + posts GL + creates AP invoice
// ---------------------------------------------------------------------------

export async function approveSubcontractorBill(billId: string): Promise<
  ActionResult<{
    id: string
    journalEntryId: string | null
    vendorInvoiceId: string | null
    backChargesDeducted: number
  }>
> {
  try {
    const companyId = await getCompanyId()
    if (!companyId) return { ok: false, error: "חסר הקשר חברה" }

    const supabase = await createSupabaseServerAuthClient()

    // Always recompute totals before approval to guarantee consistency.
    const totals = await recomputeBillTotals(billId)
    if (!totals.ok) return totals

    // Flip status.
    const { data: bill, error: bErr } = await supabase
      .from("erp_subcontractor_bills")
      .update({ status: "APPROVED", approved_at: new Date().toISOString() })
      .eq("id", billId)
      .eq("company_id", companyId)
      .in("status", ["DRAFT", "SUBMITTED"])
      .select(
        "id, contract_id, bill_number, grand_total_amount, bill_date",
      )
      .maybeSingle<{
        id: string
        contract_id: string
        bill_number: number
        grand_total_amount: number
        bill_date: string
      }>()
    if (bErr) return { ok: false, error: bErr.message }
    if (!bill)
      return { ok: false, error: "החשבון אינו במצב שניתן לאשר ממנו" }

    // Post to GL (idempotent).
    const post = await postSubcontractorBillToGL(supabase, billId)
    const journalEntryId = post.ok ? post.journalEntryId : null

    // Auto-create vendor invoice (APPROVED) so it's eligible for next Payment Run.
    const { data: contract, error: cErr } = await supabase
      .from("erp_subcontractor_contracts")
      .select("subcontractor_id, contract_number")
      .eq("id", bill.contract_id)
      .eq("company_id", companyId)
      .maybeSingle<{ subcontractor_id: string; contract_number: string }>()
    if (cErr || !contract) {
      return { ok: false, error: cErr?.message ?? "חוזה לא נמצא" }
    }

    const invoiceNumber = `SUBINV-${contract.contract_number}-${String(bill.bill_number).padStart(3, "0")}`
    let vendorInvoiceId: string | null = null
    const { data: existingInv } = await supabase
      .from("erp_vendor_invoices")
      .select("id")
      .eq("company_id", companyId)
      .eq("invoice_number", invoiceNumber)
      .maybeSingle<{ id: string }>()
    if (existingInv?.id) {
      vendorInvoiceId = existingInv.id
    } else {
      const { data: newInv, error: invErr } = await supabase
        .from("erp_vendor_invoices")
        .insert({
          company_id: companyId,
          supplier_id: contract.subcontractor_id,
          invoice_number: invoiceNumber,
          status: "APPROVED",
          invoice_date: bill.bill_date,
          total_amount: Number(bill.grand_total_amount),
          notes: `נוצר אוטומטית מאישור חשבון חלקי #${bill.bill_number} (${contract.contract_number}).`,
        })
        .select("id")
        .maybeSingle<{ id: string }>()
      if (invErr) return { ok: false, error: invErr.message }
      vendorInvoiceId = newInv?.id ?? null
    }

    // Mark approved back-charges (linked to this bill) as DEDUCTED.
    const { data: deductedRows, error: bcErr } = await supabase
      .from("erp_back_charges")
      .update({ status: "DEDUCTED", deducted_in_bill_id: billId })
      .eq("contract_id", bill.contract_id)
      .eq("company_id", companyId)
      .eq("status", "APPROVED")
      .select("id")
    if (bcErr) return { ok: false, error: bcErr.message }
    const backChargesDeducted = (deductedRows ?? []).length

    revalidatePath(`/marker-ofek/projects`)
    revalidatePath(`/marker-ofek/finance/payments/runs`)

    return {
      ok: true,
      data: {
        id: billId,
        journalEntryId,
        vendorInvoiceId,
        backChargesDeducted: backChargesDeducted ?? 0,
      },
    }
  } catch (err) {
    return { ok: false, error: formatError(err) }
  }
}

// ---------------------------------------------------------------------------
// createDraftBill — start a new bill (#N+1) with empty line scaffolding
// ---------------------------------------------------------------------------

const createDraftSchema = z.object({
  contractId: z.string().uuid(),
  executionMonth: z.string().regex(/^\d{2}\/\d{2}$/, "פורמט חודש: MM/YY"),
})

export async function createDraftBill(
  input: z.input<typeof createDraftSchema>,
): Promise<ActionResult<{ id: string; billNumber: number }>> {
  try {
    const parsed = createDraftSchema.parse(input)
    const companyId = await getCompanyId()
    if (!companyId) return { ok: false, error: "חסר הקשר חברה" }

    const supabase = await createSupabaseServerAuthClient()

    const { data: contract, error: cErr } = await supabase
      .from("erp_subcontractor_contracts")
      .select("project_id")
      .eq("id", parsed.contractId)
      .eq("company_id", companyId)
      .maybeSingle<{ project_id: string }>()
    if (cErr || !contract) {
      return { ok: false, error: cErr?.message ?? "חוזה לא נמצא" }
    }

    // Next bill number for this contract.
    const { data: maxRows } = await supabase
      .from("erp_subcontractor_bills")
      .select("bill_number")
      .eq("contract_id", parsed.contractId)
      .eq("company_id", companyId)
      .order("bill_number", { ascending: false })
      .limit(1)
    const lastBillNo =
      (maxRows?.[0] as { bill_number?: number } | undefined)?.bill_number ?? 0
    const nextBillNo = lastBillNo + 1

    // Previous billed amount = sum of cumulative_net of the last APPROVED bill.
    const { data: lastApproved } = await supabase
      .from("erp_subcontractor_bills")
      .select("cumulative_net_amount")
      .eq("contract_id", parsed.contractId)
      .eq("company_id", companyId)
      .in("status", ["APPROVED", "PAID"])
      .order("bill_number", { ascending: false })
      .limit(1)
    const previous =
      (lastApproved?.[0] as { cumulative_net_amount?: number } | undefined)
        ?.cumulative_net_amount ?? 0

    const { data: newBill, error: insErr } = await supabase
      .from("erp_subcontractor_bills")
      .insert({
        company_id: companyId,
        project_id: contract.project_id,
        contract_id: parsed.contractId,
        bill_number: nextBillNo,
        execution_month: parsed.executionMonth,
        previous_billed_amount: Number(previous),
        status: "DRAFT",
      })
      .select("id, bill_number")
      .single<{ id: string; bill_number: number }>()
    if (insErr || !newBill) {
      return { ok: false, error: insErr?.message ?? "יצירת חשבון נכשלה" }
    }

    revalidatePath(`/marker-ofek/projects`)
    return { ok: true, data: { id: newBill.id, billNumber: newBill.bill_number } }
  } catch (err) {
    return { ok: false, error: formatError(err) }
  }
}
