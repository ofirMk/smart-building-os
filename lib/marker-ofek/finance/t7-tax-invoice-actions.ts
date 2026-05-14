"use server"

/**
 * Sprint T7a — Canonical tax-invoice server actions.
 *
 * Wraps the new `erp_tax_invoices` / `erp_tax_invoice_lines` /
 * `erp_tax_invoice_print_events` SQL surface + the `erp_close_tax_invoice`
 * RPC with auth, validation, threshold awareness, and path revalidation.
 *
 * Reference design: docs/ingested-specs/tax-invoice-reverse-engineering.md §5 + §A.
 */

import { revalidatePath } from "next/cache"

import { canonicalInvoiceHash } from "@/lib/finance/israel-tax-api"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
// Pure sync helpers live in a sibling non-server module so they can also be
// imported by client components (live composer preview). Re-exporting them
// from this Server-Actions file is forbidden by Next.js (every export must
// be an async function), so consumers must import directly from
// `./t7-tax-invoice-helpers`.
import { computeTaxInvoiceTotals } from "./t7-tax-invoice-helpers"

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type TaxInvoiceKind =
  | "TAX_INVOICE"
  | "TAX_RECEIPT"
  | "CREDIT_MEMO"
  | "CONSOLIDATED_INVOICE"

export type TaxInvoiceStatus =
  | "DRAFT"
  | "PENDING_ALLOCATION"
  | "CLOSED"
  | "PRINTED_ORIGINAL"
  | "REPRINTED"
  | "CANCELLED"

export type TaxInvoiceSourceDocKind =
  | "DELIVERY_NOTE"
  | "SALES_ORDER"
  | "PROGRESS_BILL"
  | "CONTRACT_LINE"
  | "MANUAL"

export interface TaxInvoiceLineInput {
  lineNo: number
  sourceDocNumber?: string
  sourceDocKind?: TaxInvoiceSourceDocKind
  itemId?: string
  itemCode?: string
  barcode?: string
  description: string
  unitLabel?: string
  quantity: number
  remainingQty?: number
  unitPriceExcl: number
  discountPct?: number
  freeText?: string
  priceSource?: "SO" | "PB" | "PRICE_LIST" | "MANUAL" | "LAST_SALE"
  warehouseCode?: string
}

export interface CreateTaxInvoiceDraftInput {
  companyId: string
  customerId: string
  kind?: TaxInvoiceKind
  seriesCode?: string
  issueDate?: string
  valueDate?: string
  dueDate?: string
  vatRatePct?: number
  globalDiscountPct?: number
  attentionTo?: string
  shipToAddress?: string
  clientContractId?: string
  clientProgressBillId?: string
  agentId?: string
  agentName?: string
  notes?: string
  lines: TaxInvoiceLineInput[]
}

export type CreateTaxInvoiceDraftResult =
  | { ok: true; invoiceId: string; draftNumber: string }
  | { ok: false; error: string }

export type CloseTaxInvoiceResult =
  | {
      ok: true
      invoiceId: string
      invoiceNumber: number
      invoiceNumberLabel: string
      grandTotal: number
      allocationNumber: string | null
    }
  | { ok: false; error: string; code?: "ALLOCATION_REQUIRED" | "ALREADY_CLOSED" | "DB_ERROR" }

export type RecordPrintEventResult =
  | { ok: true; copyLabel: "מקור" | "העתק"; printCount: number; sha256Snapshot: string | null }
  | { ok: false; error: string }

export type CancelTaxInvoiceResult =
  | { ok: true; creditMemoId: string; creditMemoLabel: string }
  | { ok: false; error: string }

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function requireAuth() {
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return { supabase: null as never, user: null as never, error: "Unauthorized" as const }
  }
  return { supabase, user: data.user, error: null as null }
}

// `computeTaxInvoiceTotals` lives in `./t7-tax-invoice-helpers` (pure sync
// helper; Server-Actions files cannot export non-async functions). It is
// imported above and used internally below.
//
// Stub kept for reference of the result shape:
// {
//    subtotalAmount: number
//    globalDiscountAmount: number
//    subtotalAfterDiscount: number
//    vatAmount: number
// ----------------------------------------------------------------------------
// 1. createTaxInvoiceDraftAction — header + lines + totals
// ----------------------------------------------------------------------------

export async function createTaxInvoiceDraftAction(
  input: CreateTaxInvoiceDraftInput,
): Promise<CreateTaxInvoiceDraftResult> {
  const auth = await requireAuth()
  if (auth.error) return { ok: false, error: auth.error }
  const { supabase } = auth

  if (!input.lines || input.lines.length === 0) {
    return { ok: false, error: "A tax invoice must have at least one line" }
  }

  // Snapshot customer identity at issue.
  const { data: customer, error: custErr } = await supabase
    .from("erp_md_customers")
    .select(
      "id, name, legal_id, vat_id, file_number, customer_internal_code, address, attention_to",
    )
    .eq("id", input.customerId)
    .eq("company_id", input.companyId)
    .maybeSingle()

  if (custErr || !customer) {
    return { ok: false, error: custErr?.message ?? "Customer not found" }
  }

  const vatRatePct = input.vatRatePct ?? 17
  const globalDiscountPct = input.globalDiscountPct ?? 0

  const totals = computeTaxInvoiceTotals({
    lines: input.lines,
    vatRatePct,
    globalDiscountPct,
  })

  const kind: TaxInvoiceKind = input.kind ?? "TAX_INVOICE"
  const seriesCode =
    input.seriesCode ??
    (kind === "CONSOLIDATED_INVOICE"
      ? "MR"
      : kind === "CREDIT_MEMO"
        ? "CR"
        : kind === "TAX_RECEIPT"
          ? "RC"
          : "TI")

  const { data: header, error: hdrErr } = await supabase
    .from("erp_tax_invoices")
    .insert({
      company_id: input.companyId,
      customer_id: customer.id,
      customer_name_at_issue: customer.name,
      customer_legal_id_at_issue: customer.legal_id,
      customer_vat_id_at_issue: customer.vat_id,
      customer_file_number_at_issue: customer.file_number,
      customer_internal_code_at_issue: customer.customer_internal_code,
      customer_address_at_issue: customer.address,
      attention_to: input.attentionTo ?? customer.attention_to ?? null,
      ship_to_address: input.shipToAddress ?? null,
      client_contract_id: input.clientContractId ?? null,
      client_progress_bill_id: input.clientProgressBillId ?? null,
      agent_id: input.agentId ?? null,
      agent_name_at_issue: input.agentName ?? null,
      kind,
      status: "DRAFT",
      series_code: seriesCode,
      issue_date: input.issueDate ?? new Date().toISOString().slice(0, 10),
      value_date: input.valueDate ?? null,
      due_date: input.dueDate ?? null,
      vat_rate_pct: vatRatePct,
      global_discount_pct: globalDiscountPct,
      global_discount_amount: totals.globalDiscountAmount,
      subtotal_amount: totals.subtotalAmount,
      subtotal_after_discount: totals.subtotalAfterDiscount,
      vat_amount: totals.vatAmount,
      grand_total: totals.grandTotal,
      notes: input.notes ?? null,
    })
    .select("id, draft_number")
    .single()

  if (hdrErr || !header) {
    return { ok: false, error: hdrErr?.message ?? "Failed to create invoice header" }
  }

  const lineRows = input.lines.map((ln, idx) => {
    const tl = totals.perLine[idx]
    return {
      company_id: input.companyId,
      invoice_id: header.id as string,
      line_no: ln.lineNo,
      source_doc_number: ln.sourceDocNumber ?? null,
      source_doc_kind: ln.sourceDocKind ?? null,
      item_id: ln.itemId ?? null,
      item_code: ln.itemCode ?? null,
      barcode: ln.barcode ?? null,
      description: ln.description,
      unit_label: ln.unitLabel ?? null,
      quantity: ln.quantity,
      remaining_qty: ln.remainingQty ?? 0,
      unit_price_excl: ln.unitPriceExcl,
      unit_price_incl: tl.unitPriceIncl,
      discount_pct: ln.discountPct ?? 0,
      discount_amount: tl.discountAmount,
      line_total_excl: tl.lineTotalExcl,
      line_total_incl: tl.lineTotalIncl,
      warehouse_code: ln.warehouseCode ?? null,
      price_source: ln.priceSource ?? null,
      free_text: ln.freeText ?? null,
    }
  })

  const { error: linesErr } = await supabase.from("erp_tax_invoice_lines").insert(lineRows)
  if (linesErr) {
    // Best-effort: attempt to clean up the header to avoid orphan rows.
    await supabase.from("erp_tax_invoices").delete().eq("id", header.id as string)
    return { ok: false, error: linesErr.message }
  }

  revalidatePath("/marker-ofek/finance/tax-invoices")

  return {
    ok: true,
    invoiceId: header.id as string,
    draftNumber: header.draft_number as string,
  }
}

// ----------------------------------------------------------------------------
// 2. createConsolidatedTaxInvoiceAction — aggregate multiple source docs
// ----------------------------------------------------------------------------

export interface ConsolidatedSourceDocLine {
  sourceDocNumber: string
  sourceDocKind: TaxInvoiceSourceDocKind
  description: string
  quantity: number
  unitPriceExcl: number
  unitLabel?: string
  itemCode?: string
  barcode?: string
  discountPct?: number
}

export async function createConsolidatedTaxInvoiceAction(input: {
  companyId: string
  customerId: string
  issueDate?: string
  globalDiscountPct?: number
  vatRatePct?: number
  lines: ConsolidatedSourceDocLine[]
  notes?: string
}): Promise<CreateTaxInvoiceDraftResult> {
  const linesWithNo: TaxInvoiceLineInput[] = input.lines.map((ln, idx) => ({
    lineNo: idx + 1,
    sourceDocNumber: ln.sourceDocNumber,
    sourceDocKind: ln.sourceDocKind,
    description: ln.description,
    quantity: ln.quantity,
    unitPriceExcl: ln.unitPriceExcl,
    unitLabel: ln.unitLabel,
    itemCode: ln.itemCode,
    barcode: ln.barcode,
    discountPct: ln.discountPct,
  }))

  return createTaxInvoiceDraftAction({
    companyId: input.companyId,
    customerId: input.customerId,
    kind: "CONSOLIDATED_INVOICE",
    seriesCode: "MR",
    issueDate: input.issueDate,
    vatRatePct: input.vatRatePct,
    globalDiscountPct: input.globalDiscountPct,
    notes: input.notes,
    lines: linesWithNo,
  })
}

// ----------------------------------------------------------------------------
// 3. closeTaxInvoiceAction — calls the RPC + snapshots the digital signature
// ----------------------------------------------------------------------------

export async function closeTaxInvoiceAction(
  invoiceId: string,
): Promise<CloseTaxInvoiceResult> {
  const auth = await requireAuth()
  if (auth.error) return { ok: false, error: auth.error, code: "DB_ERROR" }
  const { supabase } = auth

  // Fetch current state for signature payload + checks.
  const { data: inv, error: fetchErr } = await supabase
    .from("erp_tax_invoices")
    .select(
      `id, company_id, status, customer_vat_id_at_issue, issue_date,
       grand_total, subtotal_amount, vat_amount, allocation_number, invoice_number_label`,
    )
    .eq("id", invoiceId)
    .maybeSingle()

  if (fetchErr || !inv) {
    return { ok: false, error: fetchErr?.message ?? "Invoice not found", code: "DB_ERROR" }
  }

  const status = inv.status as TaxInvoiceStatus
  if (status === "CLOSED" || status === "PRINTED_ORIGINAL" || status === "REPRINTED") {
    return {
      ok: true,
      invoiceId: inv.id as string,
      invoiceNumber: 0,
      invoiceNumberLabel: (inv.invoice_number_label as string) ?? "",
      grandTotal: Number(inv.grand_total) || 0,
      allocationNumber: (inv.allocation_number as string | null) ?? null,
    }
  }

  // Fetch lines for the signature payload.
  const { data: lines } = await supabase
    .from("erp_tax_invoice_lines")
    .select("line_no, description, quantity, unit_price_excl, line_total_excl")
    .eq("invoice_id", invoiceId)
    .order("line_no", { ascending: true })

  const { data: company } = await supabase
    .from("erp_companies")
    .select("vat_registration_number, legal_id")
    .eq("id", inv.company_id as string)
    .maybeSingle()

  const issuerTaxId =
    (company?.vat_registration_number as string | null) ??
    (company?.legal_id as string | null) ??
    ""

  const hash = canonicalInvoiceHash({
    invoiceId: inv.id as string,
    issuerTaxId,
    customerTaxId: (inv.customer_vat_id_at_issue as string | null) ?? null,
    lines: (lines ?? []).map((l) => ({
      n: l.line_no,
      d: l.description,
      q: l.quantity,
      u: l.unit_price_excl,
      t: l.line_total_excl,
    })),
    totals: {
      subtotal: Number(inv.subtotal_amount) || 0,
      vat: Number(inv.vat_amount) || 0,
      total: Number(inv.grand_total) || 0,
    },
    issueDate: String(inv.issue_date).slice(0, 10),
  })

  // Persist the signature BEFORE the RPC so the closed-snapshot is complete.
  await supabase
    .from("erp_tax_invoices")
    .update({ digital_signature_sha256: hash })
    .eq("id", invoiceId)

  // Call the RPC — it assigns number, sets status=CLOSED, posts JE.
  const { data: labelData, error: rpcErr } = await supabase.rpc("erp_close_tax_invoice", {
    p_invoice_id: invoiceId,
  })

  if (rpcErr) {
    if (String(rpcErr.message).includes("PENDING_ALLOCATION")) {
      return { ok: false, error: rpcErr.message, code: "ALLOCATION_REQUIRED" }
    }
    return { ok: false, error: rpcErr.message, code: "DB_ERROR" }
  }

  const label = typeof labelData === "string" ? labelData : String(labelData ?? "")

  // Re-read to get the assigned invoice_number.
  const { data: closed } = await supabase
    .from("erp_tax_invoices")
    .select("invoice_number, invoice_number_label, grand_total, allocation_number")
    .eq("id", invoiceId)
    .maybeSingle()

  revalidatePath("/marker-ofek/finance/tax-invoices")
  revalidatePath("/marker-ofek/finance/aging")

  return {
    ok: true,
    invoiceId,
    invoiceNumber: Number(closed?.invoice_number) || 0,
    invoiceNumberLabel: (closed?.invoice_number_label as string) ?? label,
    grandTotal: Number(closed?.grand_total) || 0,
    allocationNumber: (closed?.allocation_number as string | null) ?? null,
  }
}

// ----------------------------------------------------------------------------
// 4. recordPrintEventAction — append-only audit + auto copy label (R9)
// ----------------------------------------------------------------------------

export async function recordPrintEventAction(input: {
  invoiceId: string
  userAgent?: string
}): Promise<RecordPrintEventResult> {
  const auth = await requireAuth()
  if (auth.error) return { ok: false, error: auth.error }
  const { supabase, user } = auth

  const { data: inv, error: fetchErr } = await supabase
    .from("erp_tax_invoices")
    .select(
      "id, company_id, status, print_count, printed_at_first, digital_signature_sha256",
    )
    .eq("id", input.invoiceId)
    .maybeSingle()

  if (fetchErr || !inv) {
    return { ok: false, error: fetchErr?.message ?? "Invoice not found" }
  }

  const status = inv.status as TaxInvoiceStatus
  if (status === "DRAFT" || status === "PENDING_ALLOCATION") {
    return { ok: false, error: "Invoice must be CLOSED before printing" }
  }
  if (status === "CANCELLED") {
    return { ok: false, error: "Invoice was cancelled — reprint disabled" }
  }

  const currentCount = Number(inv.print_count) || 0
  const copyLabel: "מקור" | "העתק" = currentCount === 0 ? "מקור" : "העתק"
  const now = new Date()
  const printedAtFirst = (inv.printed_at_first as string | null) ?? now.toISOString()

  const { error: evErr } = await supabase.from("erp_tax_invoice_print_events").insert({
    company_id: inv.company_id,
    invoice_id: input.invoiceId,
    copy_label: copyLabel,
    rendered_by: user.id,
    user_agent: input.userAgent ?? null,
    sha256_snapshot: (inv.digital_signature_sha256 as string | null) ?? null,
  })

  if (evErr) return { ok: false, error: evErr.message }

  const { error: upErr } = await supabase
    .from("erp_tax_invoices")
    .update({
      print_count: currentCount + 1,
      printed_at_first: printedAtFirst,
      print_date: now.toISOString().slice(0, 10),
      print_time: now.toISOString().slice(11, 19),
      status: copyLabel === "מקור" ? "PRINTED_ORIGINAL" : "REPRINTED",
    })
    .eq("id", input.invoiceId)

  if (upErr) return { ok: false, error: upErr.message }

  return {
    ok: true,
    copyLabel,
    printCount: currentCount + 1,
    sha256Snapshot: (inv.digital_signature_sha256 as string | null) ?? null,
  }
}

// ----------------------------------------------------------------------------
// 5. cancelTaxInvoiceAction — issue a linked credit memo (R14)
// ----------------------------------------------------------------------------

export async function cancelTaxInvoiceAction(input: {
  invoiceId: string
  reason: string
}): Promise<CancelTaxInvoiceResult> {
  const auth = await requireAuth()
  if (auth.error) return { ok: false, error: auth.error }
  const { supabase } = auth

  // Fetch original invoice with all lines.
  const { data: inv, error: fetchErr } = await supabase
    .from("erp_tax_invoices")
    .select(
      `id, company_id, customer_id, status, vat_rate_pct, global_discount_pct,
       attention_to, ship_to_address, client_contract_id, client_progress_bill_id,
       invoice_number_label`,
    )
    .eq("id", input.invoiceId)
    .maybeSingle()

  if (fetchErr || !inv) {
    return { ok: false, error: fetchErr?.message ?? "Invoice not found" }
  }

  const status = inv.status as TaxInvoiceStatus
  if (status === "DRAFT" || status === "PENDING_ALLOCATION") {
    return { ok: false, error: "Draft invoices should be deleted, not credited" }
  }
  if (status === "CANCELLED") {
    return { ok: false, error: "Invoice already cancelled" }
  }

  const { data: lines, error: linesErr } = await supabase
    .from("erp_tax_invoice_lines")
    .select(
      `line_no, description, quantity, unit_price_excl, discount_pct,
       item_id, item_code, barcode, unit_label, warehouse_code`,
    )
    .eq("invoice_id", input.invoiceId)
    .order("line_no", { ascending: true })

  if (linesErr || !lines) {
    return { ok: false, error: linesErr?.message ?? "Failed to load lines" }
  }

  // Create credit memo — NEGATE quantities (preserves per-unit prices).
  const creditLines: TaxInvoiceLineInput[] = lines.map((ln) => ({
    lineNo: ln.line_no as number,
    description: `זיכוי: ${ln.description as string} (${inv.invoice_number_label ?? ""})`,
    quantity: -(Number(ln.quantity) || 0),
    unitPriceExcl: Number(ln.unit_price_excl) || 0,
    discountPct: Number(ln.discount_pct) || 0,
    itemId: (ln.item_id as string | null) ?? undefined,
    itemCode: (ln.item_code as string | null) ?? undefined,
    barcode: (ln.barcode as string | null) ?? undefined,
    unitLabel: (ln.unit_label as string | null) ?? undefined,
    warehouseCode: (ln.warehouse_code as string | null) ?? undefined,
  }))

  const draft = await createTaxInvoiceDraftAction({
    companyId: inv.company_id as string,
    customerId: inv.customer_id as string,
    kind: "CREDIT_MEMO",
    seriesCode: "CR",
    vatRatePct: Number(inv.vat_rate_pct) || 17,
    globalDiscountPct: Number(inv.global_discount_pct) || 0,
    attentionTo: (inv.attention_to as string | null) ?? undefined,
    shipToAddress: (inv.ship_to_address as string | null) ?? undefined,
    clientContractId: (inv.client_contract_id as string | null) ?? undefined,
    clientProgressBillId: (inv.client_progress_bill_id as string | null) ?? undefined,
    notes: input.reason,
    lines: creditLines,
  })

  if (!draft.ok) return { ok: false, error: draft.error }

  // Link the credit memo to the cancelled invoice.
  await supabase
    .from("erp_tax_invoices")
    .update({ cancels_invoice_id: input.invoiceId })
    .eq("id", draft.invoiceId)

  // Close the credit memo + mark original as CANCELLED.
  const closed = await closeTaxInvoiceAction(draft.invoiceId)
  if (!closed.ok) return { ok: false, error: closed.error }

  await supabase
    .from("erp_tax_invoices")
    .update({ status: "CANCELLED", cancelled_at: new Date().toISOString() })
    .eq("id", input.invoiceId)

  revalidatePath("/marker-ofek/finance/tax-invoices")

  return {
    ok: true,
    creditMemoId: draft.invoiceId,
    creditMemoLabel: closed.invoiceNumberLabel,
  }
}

// ----------------------------------------------------------------------------
// 6. fetchTaxInvoiceAction — single-row read with lines for rendering
// ----------------------------------------------------------------------------

export type FetchedTaxInvoiceHeader = {
  id: string
  companyId: string
  kind: TaxInvoiceKind
  status: TaxInvoiceStatus
  seriesCode: string
  invoiceNumberLabel: string | null
  issueDate: string
  issueTime: string
  valueDate: string | null
  dueDate: string | null
  printDate: string | null
  customerName: string
  customerLegalId: string | null
  customerVatId: string | null
  customerFileNumber: string | null
  customerInternalCode: string | null
  customerAddress: string | null
  attentionTo: string | null
  shipToAddress: string | null
  agentName: string | null
  vatRatePct: number
  subtotalAmount: number
  globalDiscountPct: number
  globalDiscountAmount: number
  subtotalAfterDiscount: number
  vatAmount: number
  grandTotal: number
  paidAmount: number
  paymentStatus: string
  allocationNumber: string | null
  digitalSignatureSha256: string | null
  printCount: number
  notes: string | null
}

export type FetchedTaxInvoiceLine = {
  lineNo: number
  sourceDocNumber: string | null
  sourceDocKind: TaxInvoiceSourceDocKind | null
  itemCode: string | null
  barcode: string | null
  description: string
  unitLabel: string | null
  quantity: number
  unitPriceExcl: number
  unitPriceIncl: number
  discountPct: number
  discountAmount: number
  lineTotalExcl: number
  lineTotalIncl: number
}

export async function fetchTaxInvoiceAction(invoiceId: string): Promise<
  | {
      ok: true
      header: FetchedTaxInvoiceHeader
      lines: FetchedTaxInvoiceLine[]
    }
  | { ok: false; error: string }
> {
  const auth = await requireAuth()
  if (auth.error) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { data: hdr, error: hdrErr } = await supabase
    .from("erp_tax_invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle()

  if (hdrErr || !hdr) return { ok: false, error: hdrErr?.message ?? "Not found" }

  const { data: lines, error: lnErr } = await supabase
    .from("erp_tax_invoice_lines")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("line_no", { ascending: true })

  if (lnErr) return { ok: false, error: lnErr.message }

  const header: FetchedTaxInvoiceHeader = {
    id: String(hdr.id),
    companyId: String(hdr.company_id),
    kind: hdr.kind as TaxInvoiceKind,
    status: hdr.status as TaxInvoiceStatus,
    seriesCode: String(hdr.series_code),
    invoiceNumberLabel: (hdr.invoice_number_label as string | null) ?? null,
    issueDate: String(hdr.issue_date),
    issueTime: String(hdr.issue_time ?? "00:00:00"),
    valueDate: (hdr.value_date as string | null) ?? null,
    dueDate: (hdr.due_date as string | null) ?? null,
    printDate: (hdr.print_date as string | null) ?? null,
    customerName: String(hdr.customer_name_at_issue),
    customerLegalId: (hdr.customer_legal_id_at_issue as string | null) ?? null,
    customerVatId: (hdr.customer_vat_id_at_issue as string | null) ?? null,
    customerFileNumber: (hdr.customer_file_number_at_issue as string | null) ?? null,
    customerInternalCode: (hdr.customer_internal_code_at_issue as string | null) ?? null,
    customerAddress: (hdr.customer_address_at_issue as string | null) ?? null,
    attentionTo: (hdr.attention_to as string | null) ?? null,
    shipToAddress: (hdr.ship_to_address as string | null) ?? null,
    agentName: (hdr.agent_name_at_issue as string | null) ?? null,
    vatRatePct: Number(hdr.vat_rate_pct) || 0,
    subtotalAmount: Number(hdr.subtotal_amount) || 0,
    globalDiscountPct: Number(hdr.global_discount_pct) || 0,
    globalDiscountAmount: Number(hdr.global_discount_amount) || 0,
    subtotalAfterDiscount: Number(hdr.subtotal_after_discount) || 0,
    vatAmount: Number(hdr.vat_amount) || 0,
    grandTotal: Number(hdr.grand_total) || 0,
    paidAmount: Number(hdr.paid_amount) || 0,
    paymentStatus: String(hdr.payment_status ?? "UNPAID"),
    allocationNumber: (hdr.allocation_number as string | null) ?? null,
    digitalSignatureSha256: (hdr.digital_signature_sha256 as string | null) ?? null,
    printCount: Number(hdr.print_count) || 0,
    notes: (hdr.notes as string | null) ?? null,
  }

  const mapped: FetchedTaxInvoiceLine[] = (lines ?? []).map((l) => ({
    lineNo: Number(l.line_no) || 0,
    sourceDocNumber: (l.source_doc_number as string | null) ?? null,
    sourceDocKind: (l.source_doc_kind as TaxInvoiceSourceDocKind | null) ?? null,
    itemCode: (l.item_code as string | null) ?? null,
    barcode: (l.barcode as string | null) ?? null,
    description: String(l.description),
    unitLabel: (l.unit_label as string | null) ?? null,
    quantity: Number(l.quantity) || 0,
    unitPriceExcl: Number(l.unit_price_excl) || 0,
    unitPriceIncl: Number(l.unit_price_incl) || 0,
    discountPct: Number(l.discount_pct) || 0,
    discountAmount: Number(l.discount_amount) || 0,
    lineTotalExcl: Number(l.line_total_excl) || 0,
    lineTotalIncl: Number(l.line_total_incl) || 0,
  }))

  return { ok: true, header, lines: mapped }
}

// ----------------------------------------------------------------------------
// 7. listTaxInvoicesAction — index page data source
// ----------------------------------------------------------------------------

export interface TaxInvoiceListRow {
  id: string
  invoiceNumberLabel: string | null
  customerName: string
  kind: TaxInvoiceKind
  status: TaxInvoiceStatus
  issueDate: string
  grandTotal: number
  paidAmount: number
  paymentStatus: string
  allocationNumber: string | null
  /** T7c — added so the index can render the "מס׳ הדפסות" column and
   * decide whether the ״הדפס מחדש״ button should be enabled. */
  printCount: number
}

export async function listTaxInvoicesAction(
  companyId: string,
  limit: number = 200,
): Promise<{ ok: true; rows: TaxInvoiceListRow[] } | { ok: false; error: string }> {
  const auth = await requireAuth()
  if (auth.error) return { ok: false, error: auth.error }
  const { supabase } = auth

  const { data, error } = await supabase
    .from("erp_tax_invoices")
    .select(
      `id, invoice_number_label, customer_name_at_issue, kind, status,
       issue_date, grand_total, paid_amount, payment_status, allocation_number,
       print_count`,
    )
    .eq("company_id", companyId)
    .order("issue_date", { ascending: false })
    .limit(limit)

  if (error) return { ok: false, error: error.message }

  const rows: TaxInvoiceListRow[] = (data ?? []).map((r) => ({
    id: String(r.id),
    invoiceNumberLabel: (r.invoice_number_label as string | null) ?? null,
    customerName: String(r.customer_name_at_issue),
    kind: r.kind as TaxInvoiceKind,
    status: r.status as TaxInvoiceStatus,
    issueDate: String(r.issue_date),
    grandTotal: Number(r.grand_total) || 0,
    paidAmount: Number(r.paid_amount) || 0,
    paymentStatus: String(r.payment_status ?? "UNPAID"),
    allocationNumber: (r.allocation_number as string | null) ?? null,
    printCount: Number(r.print_count) || 0,
  }))

  return { ok: true, rows }
}

// ----------------------------------------------------------------------------
// 8. Compatibility note: `sha256Hex` lives in `./t7-tax-invoice-helpers` and
//    is imported at the top of this file. Server-Actions modules cannot
//    export non-async functions, so UI callers must import it directly from
//    the helpers module (`@/lib/marker-ofek/finance/t7-tax-invoice-helpers`).
// ----------------------------------------------------------------------------
