"use server"

/**
 * Sprint T6 — Finance Module: AR/AP closing-loop server actions.
 *
 * Wraps the new T6 SQL surface (erp_ar_receipts, erp_ar_receipt_lines,
 * triggers, and erp_get_finance_cashflow_forecast RPC) with auth, validation
 * and path revalidation. UI talks to these — never to Supabase directly.
 */

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type ArReceiptMethod =
  | "BANK_TRANSFER"
  | "CHECK"
  | "CASH"
  | "CREDIT_CARD"
  | "OTHER"

export interface CashflowForecastRow {
  weekIndex: number
  weekStart: string
  weekEnd: string
  arInflowPlanned: number
  apOutflowPlanned: number
  netFlow: number
  openingBalance: number
  closingBalance: number
}

export interface AgingRow {
  entityId: string
  entityName: string
  documentId: string
  documentNumber: string | null
  documentDate: string
  dueDate: string
  totalAmount: number
  paidAmount: number
  openAmount: number
  daysPastDue: number
  bucket: "current" | "d1_30" | "d31_60" | "d61_90" | "d91_plus"
}

export interface AgingReport {
  side: "AR" | "AP"
  buckets: Array<{ key: AgingRow["bucket"]; label: string; amount: number }>
  rows: AgingRow[]
  totalOpen: number
}

export type CreateClientReceiptInput = {
  companyId: string
  clientContractId: string
  clientName: string
  receiptDate: string // ISO date (yyyy-mm-dd)
  method: ArReceiptMethod
  reference?: string
  bankAccountId?: string
  notes?: string
  allocations: Array<{ progressBillId: string; amount: number }>
}

export type CreateClientReceiptResult =
  | { ok: true; receiptId: string; receiptNumber: string; totalAmount: number }
  | { ok: false; error: string }

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function bucketFor(daysPastDue: number, dueDate: string, today: string): AgingRow["bucket"] {
  if (dueDate >= today) return "current"
  if (daysPastDue <= 30) return "d1_30"
  if (daysPastDue <= 60) return "d31_60"
  if (daysPastDue <= 90) return "d61_90"
  return "d91_plus"
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function requireAuth() {
  const supabase = await createSupabaseServerAuthClient()
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) {
    return { supabase: null as never, error: "Unauthorized" as const }
  }
  return { supabase, user: userData.user, error: null as null }
}

// ----------------------------------------------------------------------------
// 1. Create a customer receipt (one header + N allocation lines).
// ----------------------------------------------------------------------------

export async function createClientReceiptAction(
  input: CreateClientReceiptInput,
): Promise<CreateClientReceiptResult> {
  const auth = await requireAuth()
  if (auth.error) return { ok: false, error: auth.error }
  const { supabase } = auth

  const total = input.allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0)
  if (total <= 0) {
    return { ok: false, error: "Receipt total must be greater than zero" }
  }

  // Compose a receipt number (RCP-yyyymm-####). Idempotent enough for demo;
  // production can swap for a sequence.
  const ym = input.receiptDate.slice(0, 7).replace("-", "")
  const seq = String(Math.floor(Date.now() / 1000) % 10000).padStart(4, "0")
  const receiptNumber = `RCP-${ym}-${seq}`

  const { data: header, error: hdrErr } = await supabase
    .from("erp_ar_receipts")
    .insert({
      company_id: input.companyId,
      receipt_number: receiptNumber,
      client_contract_id: input.clientContractId,
      client_name: input.clientName,
      receipt_date: input.receiptDate,
      method: input.method,
      status: "RECEIVED",
      total_amount: round2(total),
      reference: input.reference ?? null,
      bank_account_id: input.bankAccountId ?? null,
      notes: input.notes ?? null,
    })
    .select("id, receipt_number, total_amount")
    .single()

  if (hdrErr || !header) {
    return { ok: false, error: hdrErr?.message ?? "Failed to create receipt" }
  }

  const lineRows = input.allocations
    .filter((a) => Number(a.amount) > 0)
    .map((a) => ({
      company_id: input.companyId,
      receipt_id: header.id as string,
      progress_bill_id: a.progressBillId,
      amount: round2(Number(a.amount)),
    }))

  if (lineRows.length === 0) {
    return { ok: false, error: "No allocations provided" }
  }

  const { error: linesErr } = await supabase.from("erp_ar_receipt_lines").insert(lineRows)
  if (linesErr) {
    return { ok: false, error: linesErr.message }
  }

  revalidatePath("/marker-ofek/finance/receipts")
  revalidatePath("/marker-ofek/finance/aging")
  revalidatePath("/marker-ofek/finance/cashflow")

  return {
    ok: true,
    receiptId: header.id as string,
    receiptNumber: header.receipt_number as string,
    totalAmount: Number(header.total_amount) || 0,
  }
}

// ----------------------------------------------------------------------------
// 2. 13-week cashflow forecast.
// ----------------------------------------------------------------------------

export async function fetchCashflowForecastAction(
  companyId: string,
  anchorDate?: string,
): Promise<{ ok: true; rows: CashflowForecastRow[] } | { ok: false; error: string }> {
  const auth = await requireAuth()
  if (auth.error) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { data, error } = await supabase.rpc("erp_get_finance_cashflow_forecast", {
    p_company_id: companyId,
    p_anchor_date: anchorDate ?? new Date().toISOString().slice(0, 10),
  })

  if (error) return { ok: false, error: error.message }

  const rows: CashflowForecastRow[] = (data ?? []).map(
    (r: Record<string, unknown>) => ({
      weekIndex: Number(r.week_index),
      weekStart: String(r.week_start),
      weekEnd: String(r.week_end),
      arInflowPlanned: Number(r.ar_inflow_planned) || 0,
      apOutflowPlanned: Number(r.ap_outflow_planned) || 0,
      netFlow: Number(r.net_flow) || 0,
      openingBalance: Number(r.opening_balance) || 0,
      closingBalance: Number(r.closing_balance) || 0,
    }),
  )

  return { ok: true, rows }
}

// ----------------------------------------------------------------------------
// 3. Canonical aging report (AR or AP) — based on T6 paid_amount columns.
// ----------------------------------------------------------------------------

const BUCKET_LABELS: Array<{ key: AgingRow["bucket"]; label: string }> = [
  { key: "current", label: "במועד / עתידי" },
  { key: "d1_30", label: "1–30 ימים" },
  { key: "d31_60", label: "31–60 ימים" },
  { key: "d61_90", label: "61–90 ימים" },
  { key: "d91_plus", label: "מעל 90 ימים" },
]

export async function fetchCanonicalAgingReportAction(
  companyId: string,
  side: "AR" | "AP",
): Promise<{ ok: true; report: AgingReport } | { ok: false; error: string }> {
  const auth = await requireAuth()
  if (auth.error) return { ok: false, error: auth.error }
  const { supabase } = auth

  const today = new Date().toISOString().slice(0, 10)

  if (side === "AR") {
    // Approved client progress bills not fully paid.
    const { data, error } = await supabase
      .from("erp_client_progress_bills")
      .select(
        `id, bill_number, approved_at, created_at, status, payment_status,
         paid_amount, amount_to_pay, grand_total_amount, indexed_approved_amount,
         approved_total_amount,
         erp_client_contracts!inner ( id, client_name, payment_terms_days )`,
      )
      .eq("company_id", companyId)
      .in("status", ["SUBMITTED", "PARTIALLY_APPROVED", "APPROVED"])
      .neq("payment_status", "PAID")
      .limit(2000)

    if (error) return { ok: false, error: error.message }

    const rows: AgingRow[] = []
    const bucketTotals: Record<AgingRow["bucket"], number> = {
      current: 0,
      d1_30: 0,
      d31_60: 0,
      d61_90: 0,
      d91_plus: 0,
    }

    for (const b of (data ?? []) as Array<Record<string, unknown>>) {
      const contract = (b["erp_client_contracts"] as Record<string, unknown> | null) ?? null
      const total =
        Number(b["amount_to_pay"]) ||
        Number(b["grand_total_amount"]) ||
        Number(b["indexed_approved_amount"]) ||
        Number(b["approved_total_amount"]) ||
        0
      const paid = Number(b["paid_amount"]) || 0
      const open = round2(total - paid)
      if (open <= 0.005) continue
      const issueDate = String(b["approved_at"] ?? b["created_at"] ?? "").slice(0, 10)
      if (!issueDate) continue
      const terms = Number((contract?.["payment_terms_days"] as number | undefined) ?? 30) || 30
      const due = addDays(issueDate, terms)
      const dueMs = new Date(`${due}T12:00:00.000Z`).getTime()
      const todayMs = new Date(`${today}T12:00:00.000Z`).getTime()
      const daysPastDue = Math.max(0, Math.floor((todayMs - dueMs) / 86_400_000))
      const bucket = bucketFor(daysPastDue, due, today)
      bucketTotals[bucket] += open
      rows.push({
        entityId: String(contract?.["id"] ?? ""),
        entityName: String(contract?.["client_name"] ?? "—"),
        documentId: String(b["id"]),
        documentNumber: (b["bill_number"] as string | null) ?? null,
        documentDate: issueDate,
        dueDate: due,
        totalAmount: round2(total),
        paidAmount: round2(paid),
        openAmount: open,
        daysPastDue: due >= today ? 0 : daysPastDue,
        bucket,
      })
    }

    rows.sort((a, b) => b.openAmount - a.openAmount)
    return {
      ok: true,
      report: {
        side: "AR",
        buckets: BUCKET_LABELS.map((b) => ({
          key: b.key,
          label: b.label,
          amount: round2(bucketTotals[b.key]),
        })),
        rows,
        totalOpen: round2(rows.reduce((s, r) => s + r.openAmount, 0)),
      },
    }
  }

  // AP — vendor invoices.
  const { data, error } = await supabase
    .from("erp_vendor_invoices")
    .select(
      `id, invoice_number, invoice_date, status, payment_status, total_amount,
       paid_amount, supplier_id,
       erp_md_suppliers!inner ( id, name )`,
    )
    .eq("company_id", companyId)
    .in("status", ["APPROVED", "READY_FOR_PAYMENT", "MATCHED", "HAS_VARIANCES"])
    .neq("payment_status", "PAID")
    .limit(2000)

  if (error) return { ok: false, error: error.message }

  const rows: AgingRow[] = []
  const bucketTotals: Record<AgingRow["bucket"], number> = {
    current: 0,
    d1_30: 0,
    d31_60: 0,
    d61_90: 0,
    d91_plus: 0,
  }
  const defaultTerms = 30
  for (const v of (data ?? []) as Array<Record<string, unknown>>) {
    const supplier = (v["erp_md_suppliers"] as Record<string, unknown> | null) ?? null
    const total = Number(v["total_amount"]) || 0
    const paid = Number(v["paid_amount"]) || 0
    const open = round2(total - paid)
    if (open <= 0.005) continue
    const issueDate = String(v["invoice_date"] ?? "").slice(0, 10)
    if (!issueDate) continue
    const due = addDays(issueDate, defaultTerms)
    const dueMs = new Date(`${due}T12:00:00.000Z`).getTime()
    const todayMs = new Date(`${today}T12:00:00.000Z`).getTime()
    const daysPastDue = Math.max(0, Math.floor((todayMs - dueMs) / 86_400_000))
    const bucket = bucketFor(daysPastDue, due, today)
    bucketTotals[bucket] += open
    rows.push({
      entityId: String(supplier?.["id"] ?? ""),
      entityName: String(supplier?.["name"] ?? "—"),
      documentId: String(v["id"]),
      documentNumber: (v["invoice_number"] as string | null) ?? null,
      documentDate: issueDate,
      dueDate: due,
      totalAmount: round2(total),
      paidAmount: round2(paid),
      openAmount: open,
      daysPastDue: due >= today ? 0 : daysPastDue,
      bucket,
    })
  }

  rows.sort((a, b) => b.openAmount - a.openAmount)
  return {
    ok: true,
    report: {
      side: "AP",
      buckets: BUCKET_LABELS.map((b) => ({
        key: b.key,
        label: b.label,
        amount: round2(bucketTotals[b.key]),
      })),
      rows,
      totalOpen: round2(rows.reduce((s, r) => s + r.openAmount, 0)),
    },
  }
}

// ----------------------------------------------------------------------------
// 4. Helper — list open AR bills for receipt allocation UI.
// ----------------------------------------------------------------------------

export interface OpenClientBill {
  id: string
  billNumber: string | null
  contractId: string
  clientName: string
  approvedAt: string | null
  totalAmount: number
  paidAmount: number
  openAmount: number
}

export async function listOpenClientBillsAction(
  companyId: string,
): Promise<{ ok: true; bills: OpenClientBill[] } | { ok: false; error: string }> {
  const auth = await requireAuth()
  if (auth.error) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { data, error } = await supabase
    .from("erp_client_progress_bills")
    .select(
      `id, bill_number, approved_at, paid_amount, amount_to_pay, grand_total_amount,
       indexed_approved_amount, approved_total_amount, client_contract_id,
       erp_client_contracts!inner ( id, client_name )`,
    )
    .eq("company_id", companyId)
    .in("status", ["SUBMITTED", "PARTIALLY_APPROVED", "APPROVED"])
    .neq("payment_status", "PAID")
    .order("approved_at", { ascending: false, nullsFirst: false })
    .limit(200)

  if (error) return { ok: false, error: error.message }

  const bills: OpenClientBill[] = []
  for (const b of (data ?? []) as Array<Record<string, unknown>>) {
    const contract = (b["erp_client_contracts"] as Record<string, unknown> | null) ?? null
    const total =
      Number(b["amount_to_pay"]) ||
      Number(b["grand_total_amount"]) ||
      Number(b["indexed_approved_amount"]) ||
      Number(b["approved_total_amount"]) ||
      0
    const paid = Number(b["paid_amount"]) || 0
    const open = round2(total - paid)
    if (open <= 0.005) continue
    bills.push({
      id: String(b["id"]),
      billNumber: (b["bill_number"] as string | null) ?? null,
      contractId: String(b["client_contract_id"]),
      clientName: String(contract?.["client_name"] ?? "—"),
      approvedAt: (b["approved_at"] as string | null) ?? null,
      totalAmount: round2(total),
      paidAmount: round2(paid),
      openAmount: open,
    })
  }

  return { ok: true, bills }
}
