"use server"

/**
 * Sprint T7c — Canonical server actions for the ITA-allocation flow + the
 * receipt-to-tax-invoice closing loop.
 *
 * Why a separate file:
 *   T7a (`t7-tax-invoice-actions.ts`) owns the canonical create/close/cancel
 *   flow and stays untouched per the additive-only iron-dome policy. T7c
 *   layers three new capabilities on top:
 *     1. ITA allocation simulation + manual submission for invoices stuck in
 *        PENDING_ALLOCATION (above the NIS 25,000 threshold).
 *     2. Customer-receipt → tax-invoice allocation (writes to the new
 *        `erp_ar_receipt_tax_invoice_allocations` table from the T7c migration;
 *        a trigger keeps `paid_amount` + `payment_status` in sync).
 *     3. Read helpers for the "גבייה" tab on the invoice show page + the
 *        reprint flow that mirrors the existing `recordPrintEventAction`.
 */

import { revalidatePath } from "next/cache"

import { closeTaxInvoiceAction } from "@/lib/marker-ofek/finance/t7-tax-invoice-actions"
import type {
  TaxInvoiceStatus,
} from "@/lib/marker-ofek/finance/t7-tax-invoice-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

// ---------------------------------------------------------------------------
// Local auth helper — mirrors `requireAuth` from T7a (kept private there).
// ---------------------------------------------------------------------------

async function requireAuth() {
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return { supabase: null as never, user: null as never, error: "Unauthorized" as const }
  }
  return { supabase, user: data.user, error: null as null }
}

// ---------------------------------------------------------------------------
// ITA allocation regex — 12 digits per רשות המסים פסקה ר9 (simulation only).
// ---------------------------------------------------------------------------

const ITA_ALLOCATION_REGEX = /^\d{12}$/

function generateAllocationNumber(): string {
  // 12 digits, leading digit forced to 1-9 (never 0) to mimic the prefix
  // structure of real ITA allocation numbers.
  const first = Math.floor(Math.random() * 9) + 1
  let tail = ""
  for (let i = 0; i < 11; i++) tail += Math.floor(Math.random() * 10).toString()
  return `${first}${tail}`
}

// ===========================================================================
// 1. ITA Allocation actions
// ===========================================================================

export type AllocationResult =
  | {
      ok: true
      invoiceId: string
      allocationNumber: string
      invoiceNumberLabel: string | null
      transitionedToClosed: boolean
    }
  | { ok: false; error: string; code?: "INVALID_FORMAT" | "NOT_PENDING" | "DB_ERROR" }

async function persistAllocationAndFinalize(
  invoiceId: string,
  allocationNumber: string,
): Promise<AllocationResult> {
  const auth = await requireAuth()
  if (auth.error) return { ok: false, error: auth.error, code: "DB_ERROR" }
  const { supabase } = auth

  const { data: inv, error: fetchErr } = await supabase
    .from("erp_tax_invoices")
    .select("id, status, invoice_number_label")
    .eq("id", invoiceId)
    .maybeSingle()

  if (fetchErr || !inv) {
    return { ok: false, error: fetchErr?.message ?? "Invoice not found", code: "DB_ERROR" }
  }

  const status = inv.status as TaxInvoiceStatus
  if (status !== "PENDING_ALLOCATION") {
    return {
      ok: false,
      error: `החשבונית בסטטוס ${status}, לא ממתינה להקצאה.`,
      code: "NOT_PENDING",
    }
  }

  const { error: upErr } = await supabase
    .from("erp_tax_invoices")
    .update({ allocation_number: allocationNumber })
    .eq("id", invoiceId)

  if (upErr) return { ok: false, error: upErr.message, code: "DB_ERROR" }

  // Once the allocation is stamped on the row, the closeTaxInvoiceAction RPC
  // will no longer raise ALLOCATION_REQUIRED and will transition the invoice
  // → CLOSED, assign the final invoice_number, and post the GL JE.
  const closed = await closeTaxInvoiceAction(invoiceId)
  if (!closed.ok) {
    return { ok: false, error: closed.error, code: "DB_ERROR" }
  }

  revalidatePath("/marker-ofek/finance/tax-invoices")
  revalidatePath(`/marker-ofek/finance/tax-invoices/${invoiceId}`)

  return {
    ok: true,
    invoiceId,
    allocationNumber,
    invoiceNumberLabel: closed.invoiceNumberLabel,
    transitionedToClosed: true,
  }
}

/**
 * Generates a random 12-digit allocation number (simulation of the ITA
 * web-service call) and finalizes the invoice. Used by the amber panel's
 * "בקש מספר הקצאה (סימולציה)" button.
 */
export async function requestItaAllocationSimulationAction(
  invoiceId: string,
): Promise<AllocationResult> {
  const allocationNumber = generateAllocationNumber()
  return persistAllocationAndFinalize(invoiceId, allocationNumber)
}

/**
 * Submits a user-typed allocation number. Used by the manual input fallback
 * in the amber panel when the operator has the real ITA number in hand.
 */
export async function submitItaAllocationAction(input: {
  invoiceId: string
  allocationNumber: string
}): Promise<AllocationResult> {
  const trimmed = input.allocationNumber.trim()
  if (!ITA_ALLOCATION_REGEX.test(trimmed)) {
    return {
      ok: false,
      error: "מספר הקצאה חייב להיות בדיוק 12 ספרות.",
      code: "INVALID_FORMAT",
    }
  }
  return persistAllocationAndFinalize(input.invoiceId, trimmed)
}

// ===========================================================================
// 2. Reprint flow — adds an audit row + bumps the status to REPRINTED.
//    Wraps recordPrintEventAction so the index "הדפס מחדש" button has a
//    single-purpose entry point that revalidates the index path explicitly.
// ===========================================================================

export type ReprintResult =
  | { ok: true; printCount: number; copyLabel: "מקור" | "העתק" }
  | { ok: false; error: string }

export async function reprintTaxInvoiceAction(invoiceId: string): Promise<ReprintResult> {
  // Lazy import to avoid a hard server↔server cycle with t7-tax-invoice-actions.
  const { recordPrintEventAction } = await import(
    "@/lib/marker-ofek/finance/t7-tax-invoice-actions"
  )
  const res = await recordPrintEventAction({
    invoiceId,
    userAgent: "Reprint (index)",
  })
  if (!res.ok) return { ok: false, error: res.error }
  revalidatePath("/marker-ofek/finance/tax-invoices")
  revalidatePath(`/marker-ofek/finance/tax-invoices/${invoiceId}`)
  return { ok: true, printCount: res.printCount, copyLabel: res.copyLabel }
}

// ===========================================================================
// 3. Receipt-to-TaxInvoice allocations
// ===========================================================================

export type OpenTaxInvoiceForReceipt = {
  id: string
  invoiceNumberLabel: string | null
  issueDate: string
  grandTotal: number
  paidAmount: number
  openAmount: number
}

/**
 * Returns CLOSED-family tax invoices for the given customer that still have
 * an outstanding balance. Used by the inline receipt composer on the show
 * page and the global receipts tab.
 */
export async function listOpenTaxInvoicesForCustomerAction(input: {
  companyId: string
  customerId: string
}): Promise<
  | { ok: true; rows: OpenTaxInvoiceForReceipt[] }
  | { ok: false; error: string }
> {
  const auth = await requireAuth()
  if (auth.error) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { data, error } = await supabase
    .from("erp_tax_invoices")
    .select(
      "id, invoice_number_label, issue_date, grand_total, paid_amount, payment_status, status",
    )
    .eq("company_id", input.companyId)
    .eq("customer_id", input.customerId)
    .in("status", ["CLOSED", "PRINTED_ORIGINAL", "REPRINTED"])
    .neq("payment_status", "PAID")
    .order("issue_date", { ascending: false })
    .limit(200)

  if (error) return { ok: false, error: error.message }

  const rows = (data ?? []).map((r) => {
    const grand = Number(r.grand_total) || 0
    const paid = Number(r.paid_amount) || 0
    return {
      id: String(r.id),
      invoiceNumberLabel: (r.invoice_number_label as string | null) ?? null,
      issueDate: String(r.issue_date),
      grandTotal: grand,
      paidAmount: paid,
      openAmount: Math.max(0, Math.round((grand - paid) * 100) / 100),
    }
  })

  return { ok: true, rows }
}

/**
 * Records a customer receipt scoped to a single tax invoice. Designed for
 * the inline "+ הוסף קבלה" form on the show page — minimal surface, no UI
 * coupling to the T6 progress-bill receipt composer.
 *
 * Writes:
 *   1. `erp_ar_receipts` (header, status=DRAFT, no journal entry — the T7c
 *      receipt is an allocation memo only; finance teams reconcile via T6's
 *      richer flow if they need GL posting).
 *   2. `erp_ar_receipt_tax_invoice_allocations` (the allocation row — the
 *      trigger from the T7c migration recomputes paid_amount + payment_status).
 */
export type RecordTaxInvoiceReceiptResult =
  | { ok: true; receiptId: string }
  | { ok: false; error: string }

export async function recordTaxInvoiceReceiptAction(input: {
  invoiceId: string
  receiptDate: string
  amount: number
  method: "BANK_TRANSFER" | "CHECK" | "CASH" | "CREDIT_CARD" | "OTHER"
  reference?: string
  notes?: string
}): Promise<RecordTaxInvoiceReceiptResult> {
  const auth = await requireAuth()
  if (auth.error) return { ok: false, error: auth.error }
  const { supabase } = auth

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "סכום הקבלה חייב להיות חיובי" }
  }

  // Pull the invoice to validate + grab company_id + customer details.
  const { data: inv, error: invErr } = await supabase
    .from("erp_tax_invoices")
    .select(
      "id, company_id, customer_id, customer_name_at_issue, status, grand_total, paid_amount, payment_status",
    )
    .eq("id", input.invoiceId)
    .maybeSingle()

  if (invErr || !inv) {
    return { ok: false, error: invErr?.message ?? "Invoice not found" }
  }

  const status = inv.status as TaxInvoiceStatus
  if (status === "DRAFT" || status === "PENDING_ALLOCATION" || status === "CANCELLED") {
    return {
      ok: false,
      error: `לא ניתן לקלוט קבלה לחשבונית בסטטוס ${status}`,
    }
  }

  // T7c receipts don't need a contract — but the T6 erp_ar_receipts table has
  // a NOT NULL constraint on client_contract_id. We attempt to use the
  // invoice's client_contract_id if present, otherwise we fall back to a
  // dedicated sentinel UUID (the trigger doesn't touch progress bills, so
  // an "orphan" receipt is harmless).
  const { data: invFull } = await supabase
    .from("erp_tax_invoices")
    .select("client_contract_id")
    .eq("id", input.invoiceId)
    .maybeSingle()
  const clientContractId =
    (invFull?.client_contract_id as string | null) ??
    "00000000-0000-0000-0000-000000000000"

  // Receipt number: simple human-friendly format (RC-YYYYMM-NNNN). Since the
  // erp_ar_receipts UNIQUE constraint is per (company_id, receipt_number), we
  // probe via count.
  const ymd = new Date(input.receiptDate)
  const yymm = `${ymd.getFullYear()}${String(ymd.getMonth() + 1).padStart(2, "0")}`
  const { count } = await supabase
    .from("erp_ar_receipts")
    .select("id", { count: "exact", head: true })
    .eq("company_id", inv.company_id as string)
  const receiptNumber = `RC-${yymm}-${String((count ?? 0) + 1).padStart(4, "0")}`

  const { data: receipt, error: rcptErr } = await supabase
    .from("erp_ar_receipts")
    .insert({
      company_id: inv.company_id as string,
      receipt_number: receiptNumber,
      client_contract_id: clientContractId,
      client_name: inv.customer_name_at_issue,
      receipt_date: input.receiptDate,
      method: input.method,
      status: "DRAFT",
      total_amount: input.amount,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single()

  if (rcptErr || !receipt?.id) {
    return { ok: false, error: rcptErr?.message ?? "שמירת קבלה נכשלה" }
  }

  // Allocation row — trigger recomputes paid_amount + payment_status.
  const { error: allocErr } = await supabase
    .from("erp_ar_receipt_tax_invoice_allocations")
    .insert({
      company_id: inv.company_id as string,
      receipt_id: receipt.id as string,
      tax_invoice_id: input.invoiceId,
      amount: input.amount,
      notes: input.notes?.trim() || null,
    })

  if (allocErr) {
    // Roll back the receipt header if the allocation fails — keeps the table
    // tidy and surfaces the migration-missing case cleanly.
    await supabase.from("erp_ar_receipts").delete().eq("id", receipt.id as string)
    return {
      ok: false,
      error: allocErr.message.includes("does not exist")
        ? "טבלת erp_ar_receipt_tax_invoice_allocations חסרה — הרץ את ההגירה 20260514130000_t7c_tax_invoice_receipt_allocations.sql"
        : allocErr.message,
    }
  }

  revalidatePath(`/marker-ofek/finance/tax-invoices/${input.invoiceId}`)
  revalidatePath("/marker-ofek/finance/tax-invoices")

  return { ok: true, receiptId: receipt.id as string }
}

// ===========================================================================
// 4. Read helper for the "גבייה" tab
// ===========================================================================

export type InvoiceReceiptRow = {
  receiptId: string
  receiptNumber: string
  receiptDate: string
  method: string
  reference: string | null
  allocatedAmount: number
  notes: string | null
}

export async function listReceiptsForTaxInvoiceAction(invoiceId: string): Promise<
  | { ok: true; rows: InvoiceReceiptRow[]; totalAllocated: number }
  | { ok: false; error: string }
> {
  const auth = await requireAuth()
  if (auth.error) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { data, error } = await supabase
    .from("erp_ar_receipt_tax_invoice_allocations")
    .select(
      `id, amount, notes,
       receipt:erp_ar_receipts!erp_ar_recta_company_receipt_fk(
         id, receipt_number, receipt_date, method, reference
       )`,
    )
    .eq("tax_invoice_id", invoiceId)
    .order("created_at", { ascending: false })

  if (error) {
    // Soft-fail: if the table doesn't exist yet (migration not applied) we
    // return an empty list rather than crashing the show page.
    if (error.message.includes("does not exist") || error.message.includes("relation")) {
      return { ok: true, rows: [], totalAllocated: 0 }
    }
    return { ok: false, error: error.message }
  }

  const rows: InvoiceReceiptRow[] = (data ?? []).map((r) => {
    const rec = (r as { receipt: unknown }).receipt as
      | {
          id: string
          receipt_number: string
          receipt_date: string
          method: string
          reference: string | null
        }
      | Array<{
          id: string
          receipt_number: string
          receipt_date: string
          method: string
          reference: string | null
        }>
      | null
    const flat = Array.isArray(rec) ? rec[0] : rec
    return {
      receiptId: String(flat?.id ?? ""),
      receiptNumber: String(flat?.receipt_number ?? ""),
      receiptDate: String(flat?.receipt_date ?? ""),
      method: String(flat?.method ?? "OTHER"),
      reference: (flat?.reference as string | null) ?? null,
      allocatedAmount: Number((r as { amount: number }).amount) || 0,
      notes: ((r as { notes: string | null }).notes as string | null) ?? null,
    }
  })

  const totalAllocated = rows.reduce((s, r) => s + r.allocatedAmount, 0)
  return { ok: true, rows, totalAllocated: Math.round(totalAllocated * 100) / 100 }
}

// ===========================================================================
// 5. Constants surfaced to the UI
// ===========================================================================

export type T7cConstants = { itaAllocationThresholdNis: number }

/** Re-export the canonical threshold so client components don't have to
 * import directly from `@/lib/finance/israel-tax-api` (server-only). */
export async function getT7cConstantsAction(): Promise<T7cConstants> {
  const mod = await import("@/lib/finance/israel-tax-api")
  return { itaAllocationThresholdNis: mod.ALLOCATION_REQUIRED_ABOVE_NIS }
}
