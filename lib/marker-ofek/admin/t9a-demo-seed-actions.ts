"use server"

/**
 * Sprint T9a — Executive Demo Data Seeder.
 *
 * Server actions that populate the financial-cockpit dashboard with
 * realistic construction-industry mock data:
 *   - 5 customers          (DEMO-T9A-CUST-*)
 *   - 3 active projects    (DEMO-T9A-PROJ-*)
 *   - 3 suppliers          (DEMO-T9A-SUP-*)
 *   - 1 client contract    (DEMO-T9A-CONTRACT-01) — required as FK target
 *                            for receipts (erp_ar_receipts.client_contract_id
 *                            is NOT NULL with a real FK).
 *   - 15 tax invoices      (mix: CLOSED+PAID / CLOSED+PARTIAL / CLOSED+OVERDUE
 *                            / PENDING_ALLOCATION) spread over the last 90 days
 *   - 10 receipts          (linked to the demo contract; allocated to closed
 *                            invoices to create positive cash flow)
 *   - 5 vendor invoices    (3 open + 2 paid)
 *   - 1 payment run        with 5 EXECUTED ap_payments (negative cash flow)
 *   - 3 open POs           (status SENT_TO_SUPPLIER, count as AP fallback)
 *
 * **Iron Dome**: every row carries the sentinel marker `[T9A_DEMO_SEED]` in
 * its `notes` column (or its number column prefix) so `clearDemoDataAction`
 * can scrub demo data without touching production records.
 *
 * Service-role only — bypasses RLS so the seeder works in a fresh tenant.
 */

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { createSupabaseServiceRoleClientSafe } from "@/lib/supabase/service-role"

// ---------------------------------------------------------------------------
// Sentinel markers
// ---------------------------------------------------------------------------

const SEED_NOTES_MARKER = "[T9A_DEMO_SEED]"
const SEED_PREFIX = "DEMO-T9A-"

export type SeedSummary = {
  customers: number
  projects: number
  suppliers: number
  contracts: number
  taxInvoices: number
  receipts: number
  vendorInvoices: number
  paymentRuns: number
  apPayments: number
  purchaseOrders: number
}

export type SeedResult =
  | { ok: true; summary: SeedSummary; alreadySeeded: boolean }
  | { ok: false; error: string; partial?: Partial<SeedSummary> }

export type ClearResult =
  | { ok: true; deleted: SeedSummary }
  | { ok: false; error: string; partial?: Partial<SeedSummary> }

// ---------------------------------------------------------------------------
// Auth gate: must be logged in (any user) before we'll seed.
// ---------------------------------------------------------------------------

async function requireAuth(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return { ok: false, error: "Unauthorized" }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Mock data palette — Israeli construction industry
// ---------------------------------------------------------------------------

const CUSTOMER_PALETTE = [
  { name: "מרקר אופק נדל\"ן בע\"מ", legalId: "514876301", vatId: "514876301", attention: "מר אבי כהן" },
  { name: "אורבן פלוס פיתוח עירוני", legalId: "515992330", vatId: "515992330", attention: "גב' שירה לוי" },
  { name: "סקייליין מגדלים בע\"מ", legalId: "513400188", vatId: "513400188", attention: "מר רן ישראלי" },
  { name: "ירוק עירוני יזמות", legalId: "516701224", vatId: "516701224", attention: "מר יואב פרידמן" },
  { name: "מצפה הים — קבוצת רכישה", legalId: "517884412", vatId: "517884412", attention: "גב' מאיה עמיר" },
] as const

const PROJECT_PALETTE = [
  { name: "מגדל יואל — תל אביב, יגאל אלון 95", manager: "אדריכל דורון בן-יוסף" },
  { name: "פרויקט הרכס — רעננה, רחוב הברוש", manager: "מהנדס יהונתן ברק" },
  { name: "מקבץ דיור עירוני — באר שבע פלח 14", manager: "אדריכלית ליאת רוזנברג" },
] as const

const SUPPLIER_PALETTE = [
  { name: "בטון מוכן הצפון בע\"מ", vat: "510884221" },
  { name: "פלדה ישראלית — תיל וברזל", vat: "511990047" },
  { name: "הנדסת קונסטרוקציה ש.כהן בע\"מ", vat: "513702188" },
] as const

const INVOICE_DESCRIPTIONS = [
  "חשבון חלקי #1 — יסודות וביצוע מרתפים",
  "חשבון חלקי #2 — שלד עליון קומות 1-4",
  "חשבון חלקי #3 — שלד עליון קומות 5-8",
  "חשבון חלקי #4 — מעטפת חיצונית וחיפויים",
  "חשבון חלקי #5 — מערכות מיזוג ואינסטלציה",
  "חשבון גמר — עבודות פיתוח חוץ וגינון",
] as const

const PO_TITLES = [
  "הזמנה: ברזל זיון פלדה 12-25 ממ", 
  "הזמנה: בטון B-30 משלוחים שבועיים",
  "הזמנה: ייעוץ הנדסי וקונסטרוקציה Q1",
  "הזמנה: חלונות אלומיניום וזכוכית בטיחות",
  "הזמנה: מערכות מיזוג VRF + מתקנים",
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ymd(d: Date): string {
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${d.getFullYear()}-${m < 10 ? "0" : ""}${m}-${day < 10 ? "0" : ""}${day}`
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Deterministic-ish pseudo-random for repeatable demos (seeded by date).
function pseudoRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return (s & 0xffff) / 0x10000
  }
}

// ===========================================================================
// SEED ACTION
// ===========================================================================

export async function seedDemoDataAction(input: {
  companyId: string
}): Promise<SeedResult> {
  const auth = await requireAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  const guard = createSupabaseServiceRoleClientSafe()
  if (!guard.ok) return { ok: false, error: guard.error }
  const sb = guard.client
  const companyId = input.companyId
  const rand = pseudoRandom(20260514)

  const summary: SeedSummary = {
    customers: 0,
    projects: 0,
    suppliers: 0,
    contracts: 0,
    taxInvoices: 0,
    receipts: 0,
    vendorInvoices: 0,
    paymentRuns: 0,
    apPayments: 0,
    purchaseOrders: 0,
  }

  // ---- Idempotency check ----------------------------------------------------
  const { data: existingCust } = await sb
    .from("erp_md_customers")
    .select("id")
    .eq("company_id", companyId)
    .like("customer_number", `${SEED_PREFIX}%`)
    .limit(1)
  if (existingCust && existingCust.length > 0) {
    return { ok: true, summary, alreadySeeded: true }
  }

  // ===========================================================================
  // 1. Customers (5)
  // ===========================================================================
  const customerIds: string[] = []
  for (let i = 0; i < CUSTOMER_PALETTE.length; i++) {
    const c = CUSTOMER_PALETTE[i]
    const code = String(i + 1).padStart(2, "0")
    const { data, error } = await sb
      .from("erp_md_customers")
      .insert({
        company_id: companyId,
        customer_number: `${SEED_PREFIX}CUST-${code}`,
        customer_internal_code: `${5300000 + i * 13}`,
        name: c.name,
        legal_id: c.legalId,
        vat_id: c.vatId,
        attention_to: c.attention,
        payment_terms_days: 30,
        default_vat_rate_pct: 17,
        notes: SEED_NOTES_MARKER,
      })
      .select("id")
      .single()
    if (error || !data) {
      return { ok: false, error: `customers: ${error?.message}`, partial: summary }
    }
    customerIds.push(data.id as string)
    summary.customers += 1
  }

  // ===========================================================================
  // 2. Projects (3) — no `notes` column; identify via project_number prefix.
  // ===========================================================================
  const projectIds: string[] = []
  for (let i = 0; i < PROJECT_PALETTE.length; i++) {
    const p = PROJECT_PALETTE[i]
    const code = String(i + 1).padStart(2, "0")
    const startDt = daysAgo(180 + i * 30)
    const { data, error } = await sb
      .from("erp_proj_projects")
      .insert({
        company_id: companyId,
        project_number: `${SEED_PREFIX}PROJ-${code}`,
        name: p.name,
        status: "ACTIVE",
        start_date: ymd(startDt),
      })
      .select("id")
      .single()
    if (error || !data) {
      return { ok: false, error: `projects: ${error?.message}`, partial: summary }
    }
    projectIds.push(data.id as string)
    summary.projects += 1
  }

  // ===========================================================================
  // 3. Suppliers (3) — no `notes` column; identify via supplier_number prefix.
  // ===========================================================================
  const supplierIds: string[] = []
  for (let i = 0; i < SUPPLIER_PALETTE.length; i++) {
    const s = SUPPLIER_PALETTE[i]
    const code = String(i + 1).padStart(2, "0")
    const { data, error } = await sb
      .from("erp_md_suppliers")
      .insert({
        company_id: companyId,
        supplier_number: `${SEED_PREFIX}SUP-${code}`,
        supplier_kind: "supplier",
        name: s.name,
        tax_vat_id: s.vat,
      })
      .select("id")
      .single()
    if (error || !data) {
      return { ok: false, error: `suppliers: ${error?.message}`, partial: summary }
    }
    supplierIds.push(data.id as string)
    summary.suppliers += 1
  }

  // ===========================================================================
  // 4. Client contract (1) — required FK target for receipts.
  // ===========================================================================
  const { data: contract, error: contractErr } = await sb
    .from("erp_client_contracts")
    .insert({
      company_id: companyId,
      project_id: projectIds[0],
      contract_number: `${SEED_PREFIX}CONTRACT-01`,
      client_name: CUSTOMER_PALETTE[0].name,
      title: "חוזה דמו — סלע אבן יואל (חבילת מצגת)",
      status: "ACTIVE",
      total_amount: 5_500_000,
      start_date: ymd(daysAgo(120)),
    })
    .select("id")
    .single()
  if (contractErr || !contract) {
    return { ok: false, error: `contracts: ${contractErr?.message}`, partial: summary }
  }
  const contractId = contract.id as string
  summary.contracts += 1

  // ===========================================================================
  // 5. Tax invoices (15) — mixed states for a vibrant cockpit.
  // ===========================================================================
  // Distribution:
  //   5 × CLOSED + PAID     (paid_amount = grand_total, payment_status=PAID)
  //   4 × CLOSED + OVERDUE  (due_date in past, paid_amount = 0)
  //   3 × CLOSED + PARTIAL  (paid_amount ≈ 50% of grand_total)
  //   3 × PENDING_ALLOCATION (above NIS 25K threshold simulation)
  // Spread issue_date across the last 90 days.

  type InvoiceCohort = "PAID" | "OVERDUE" | "PARTIAL" | "PENDING"
  const invoiceMix: InvoiceCohort[] = [
    "PAID", "PAID", "PAID", "PAID", "PAID",
    "OVERDUE", "OVERDUE", "OVERDUE", "OVERDUE",
    "PARTIAL", "PARTIAL", "PARTIAL",
    "PENDING", "PENDING", "PENDING",
  ]

  const taxInvoiceIds: { id: string; grandTotal: number; cohort: InvoiceCohort }[] = []

  for (let i = 0; i < invoiceMix.length; i++) {
    const cohort = invoiceMix[i]
    const customerIdx = i % customerIds.length
    const customerId = customerIds[customerIdx]
    const customer = CUSTOMER_PALETTE[customerIdx]
    const description = INVOICE_DESCRIPTIONS[i % INVOICE_DESCRIPTIONS.length]
    const issueOffset = Math.floor((i / invoiceMix.length) * 88) + 1
    const issueDt = daysAgo(issueOffset)
    const dueDt = new Date(issueDt)
    dueDt.setDate(dueDt.getDate() + 30)
    if (cohort === "OVERDUE") {
      // Force due date well in the past (45+ days ago)
      dueDt.setTime(daysAgo(45 + i).getTime())
    }

    // Realistic invoice sizing
    const baseAmount =
      cohort === "PENDING"
        ? 80_000 + rand() * 250_000 // above the 25K threshold
        : 8_000 + rand() * 95_000
    const lineQty = 1
    const unitPriceExcl = round2(baseAmount)
    const lineTotalExcl = round2(unitPriceExcl * lineQty)
    const vatRate = 17
    const vatAmount = round2((lineTotalExcl * vatRate) / 100)
    const grandTotal = round2(lineTotalExcl + vatAmount)
    const lineTotalIncl = grandTotal

    const isClosed = cohort !== "PENDING"
    const status: string = cohort === "PENDING" ? "PENDING_ALLOCATION" : "CLOSED"

    let paidAmount = 0
    let paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID" = "UNPAID"
    if (cohort === "PAID") {
      paidAmount = grandTotal
      paymentStatus = "PAID"
    } else if (cohort === "PARTIAL") {
      paidAmount = round2(grandTotal * 0.5)
      paymentStatus = "PARTIALLY_PAID"
    }

    // Closed invoices need invoice_number + invoice_number_label.
    // Use a dedicated demo series 'DEMO' to avoid colliding with the real
    // TI/MR/CR sequences. Numbers start at 900000 + i to stay deterministic.
    const invoiceNumber = isClosed ? 900000 + i : null
    const seriesCode = "DEMO"
    const issueYY = String(issueDt.getFullYear()).slice(-2)
    const invoiceLabel = isClosed
      ? `${seriesCode}${issueYY}${String(invoiceNumber).padStart(7, "0")}`
      : null

    const { data: inv, error: invErr } = await sb
      .from("erp_tax_invoices")
      .insert({
        company_id: companyId,
        series_code: seriesCode,
        invoice_number: invoiceNumber,
        invoice_number_label: invoiceLabel,
        kind: "TAX_INVOICE",
        status,
        customer_id: customerId,
        customer_name_at_issue: customer.name,
        customer_legal_id_at_issue: customer.legalId,
        customer_vat_id_at_issue: customer.vatId,
        attention_to: customer.attention,
        client_contract_id: contractId,
        issue_date: ymd(issueDt),
        due_date: ymd(dueDt),
        vat_rate_pct: vatRate,
        subtotal_amount: lineTotalExcl,
        subtotal_after_discount: lineTotalExcl,
        vat_amount: vatAmount,
        grand_total: grandTotal,
        paid_amount: paidAmount,
        payment_status: paymentStatus,
        closed_at: isClosed ? issueDt.toISOString() : null,
        notes: SEED_NOTES_MARKER,
      })
      .select("id")
      .single()

    if (invErr || !inv) {
      return { ok: false, error: `tax_invoices: ${invErr?.message}`, partial: summary }
    }

    // Line
    const { error: lineErr } = await sb.from("erp_tax_invoice_lines").insert({
      company_id: companyId,
      invoice_id: inv.id as string,
      line_no: 1,
      description,
      quantity: lineQty,
      unit_price_excl: unitPriceExcl,
      unit_price_incl: round2(unitPriceExcl * (1 + vatRate / 100)),
      line_total_excl: lineTotalExcl,
      line_total_incl: lineTotalIncl,
      free_text: SEED_NOTES_MARKER,
    })
    if (lineErr) {
      return { ok: false, error: `tax_invoice_lines: ${lineErr.message}`, partial: summary }
    }

    taxInvoiceIds.push({ id: inv.id as string, grandTotal, cohort })
    summary.taxInvoices += 1
  }

  // ===========================================================================
  // 6. Receipts (10) — allocated to PAID + PARTIAL invoices for cash inflow.
  // ===========================================================================
  const allocatableInvoices = taxInvoiceIds.filter(
    (t) => t.cohort === "PAID" || t.cohort === "PARTIAL",
  )

  for (let i = 0; i < 10; i++) {
    const target = allocatableInvoices[i % allocatableInvoices.length]
    const allocAmount =
      target.cohort === "PAID"
        ? round2(target.grandTotal)
        : round2(target.grandTotal * 0.5)
    const receiptDt = daysAgo(Math.floor((i / 10) * 85) + 2)

    const receiptNumber = `${SEED_PREFIX}RC-${String(i + 1).padStart(4, "0")}`
    const { data: rcpt, error: rcptErr } = await sb
      .from("erp_ar_receipts")
      .insert({
        company_id: companyId,
        receipt_number: receiptNumber,
        client_contract_id: contractId,
        client_name: CUSTOMER_PALETTE[i % CUSTOMER_PALETTE.length].name,
        receipt_date: ymd(receiptDt),
        method: "BANK_TRANSFER",
        status: "RECEIVED",
        total_amount: allocAmount,
        notes: SEED_NOTES_MARKER,
      })
      .select("id")
      .single()
    if (rcptErr || !rcpt) {
      return { ok: false, error: `receipts: ${rcptErr?.message}`, partial: summary }
    }

    // Allocation — trigger will recompute paid_amount/payment_status, but we
    // already wrote the expected values; the trigger will just confirm them
    // (no-op for PAID, may upgrade PARTIAL → PAID, which is fine demo-wise).
    const { error: allocErr } = await sb
      .from("erp_ar_receipt_tax_invoice_allocations")
      .insert({
        company_id: companyId,
        receipt_id: rcpt.id as string,
        tax_invoice_id: target.id,
        amount: allocAmount,
        notes: SEED_NOTES_MARKER,
      })
    // Allocation table may not exist on older deployments — non-fatal.
    if (allocErr && !allocErr.message.includes("does not exist")) {
      console.warn("[t9a] allocation insert failed (non-fatal):", allocErr.message)
    }
    summary.receipts += 1
  }

  // ===========================================================================
  // 7. Vendor invoices (5) — 3 open + 2 paid (paid ones are targets for AP
  //    payments below).
  // ===========================================================================
  const vendorInvoiceIds: { id: string; supplierId: string; total: number }[] = []
  for (let i = 0; i < 5; i++) {
    const supplierIdx = i % supplierIds.length
    const supplierId = supplierIds[supplierIdx]
    const supplier = SUPPLIER_PALETTE[supplierIdx]
    const invDt = daysAgo(15 + i * 12)
    const totalAmount = round2(40_000 + rand() * 280_000)
    const isPaid = i >= 3 // last 2 are paid

    const { data: vinv, error: vinvErr } = await sb
      .from("erp_vendor_invoices")
      .insert({
        company_id: companyId,
        supplier_id: supplierId,
        invoice_number: `${SEED_PREFIX}VINV-${String(i + 1).padStart(4, "0")}`,
        status: isPaid ? "PAID" : "READY_FOR_PAYMENT",
        invoice_date: ymd(invDt),
        total_amount: totalAmount,
        paid_amount: isPaid ? totalAmount : 0,
        payment_status: isPaid ? "PAID" : "UNPAID",
        notes: `${SEED_NOTES_MARKER} ספק: ${supplier.name}`,
      })
      .select("id")
      .single()
    if (vinvErr || !vinv) {
      return { ok: false, error: `vendor_invoices: ${vinvErr?.message}`, partial: summary }
    }
    vendorInvoiceIds.push({ id: vinv.id as string, supplierId, total: totalAmount })
    summary.vendorInvoices += 1
  }

  // ===========================================================================
  // 8. Payment run + 5 EXECUTED ap_payments (negative cash flow).
  // ===========================================================================
  // Strategy: insert run in DRAFT first (trigger only checks when status ≥
  // APPROVED), insert all 5 payments, then promote run → EXECUTED. The
  // erp_ap_assert_run_total trigger fires on each payment insert; since the
  // run is still DRAFT it returns null early — so we don't have to maintain
  // a running total during the inserts.

  // Need 5 vendor invoices to satisfy the FK on ap_payments.vendor_invoice_id.
  // We already have 5 — reuse all of them as payment targets (even the open
  // ones; in demo data, "payment" simply represents cash outflow).
  const paymentAmounts: number[] = []
  for (let i = 0; i < 5; i++) {
    const amt = round2(30_000 + rand() * 180_000)
    paymentAmounts.push(amt)
  }
  const runTotal = round2(paymentAmounts.reduce((s, n) => s + n, 0))

  // Payment runs require a bank_account_id FK. Look up any existing bank
  // account for this company; if none exists, skip the AP payment cohort
  // gracefully (vendor invoices + POs already feed the AP-side KPIs).
  const { data: bankAcct } = await sb
    .from("erp_bank_accounts")
    .select("id")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle()

  let run: { id: string } | null = null
  let runErr: { message: string } | null = null
  if (!bankAcct?.id) {
    console.warn(
      "[t9a] skipping payment_run cohort — no erp_bank_accounts row exists for company",
    )
  } else {
    const res = await sb
      .from("erp_ap_payment_runs")
      .insert({
        company_id: companyId,
        run_number: `${SEED_PREFIX}RUN-001`,
        run_date: ymd(daysAgo(10)),
        payment_method: "WIRE",
        bank_account_id: bankAcct.id,
        status: "DRAFT",
        total_amount: runTotal,
        notes: SEED_NOTES_MARKER,
      })
      .select("id")
      .single()
    run = (res.data as { id: string } | null) ?? null
    runErr = res.error
      ? { message: res.error.message }
      : null
  }

  if (runErr && !runErr.message.includes("does not exist")) {
    // Payment runs table missing → skip AP payments (non-fatal).
    console.warn("[t9a] payment_runs insert failed:", runErr.message)
  } else if (run) {
    summary.paymentRuns += 1
    for (let i = 0; i < paymentAmounts.length; i++) {
      const vi = vendorInvoiceIds[i % vendorInvoiceIds.length]
      const payDt = daysAgo(Math.floor((i / paymentAmounts.length) * 80) + 5)
      const { error: payErr } = await sb.from("erp_ap_payments").insert({
        company_id: companyId,
        run_id: run.id as string,
        vendor_invoice_id: vi.id,
        supplier_id: vi.supplierId,
        amount: paymentAmounts[i],
        payment_date: ymd(payDt),
        status: "EXECUTED",
        reference: `${SEED_PREFIX}PAY-${String(i + 1).padStart(4, "0")}`,
      })
      if (payErr) {
        console.warn(`[t9a] ap_payment ${i + 1} insert failed:`, payErr.message)
      } else {
        summary.apPayments += 1
      }
    }
    // Promote run → EXECUTED (trigger on payments table, not on this update,
    // so this is safe even if sums differ from the original total_amount).
    await sb
      .from("erp_ap_payment_runs")
      .update({ status: "EXECUTED", total_amount: runTotal })
      .eq("id", run.id as string)
  }

  // ===========================================================================
  // 9. Open purchase orders (3) — counted as AP fallback in t8 actions.
  // ===========================================================================
  for (let i = 0; i < 3; i++) {
    const supplierIdx = i % supplierIds.length
    const projectIdx = i % projectIds.length
    const totalAmount = round2(95_000 + rand() * 310_000)
    const { error: poErr } = await sb.from("erp_purchase_orders").insert({
      company_id: companyId,
      project_id: projectIds[projectIdx],
      supplier_id: supplierIds[supplierIdx],
      po_number: `${SEED_PREFIX}PO-${String(i + 1).padStart(4, "0")}`,
      title: PO_TITLES[i % PO_TITLES.length],
      status: "SENT_TO_SUPPLIER",
      total_amount: totalAmount,
      issued_at: ymd(daysAgo(20 + i * 5)),
      notes: SEED_NOTES_MARKER,
    })
    if (poErr) {
      console.warn(`[t9a] purchase_order ${i + 1} insert failed:`, poErr.message)
    } else {
      summary.purchaseOrders += 1
    }
  }

  return { ok: true, summary, alreadySeeded: false }
}

// ===========================================================================
// CLEAR ACTION
// ===========================================================================

export async function clearDemoDataAction(input: {
  companyId: string
}): Promise<ClearResult> {
  const auth = await requireAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  const guard = createSupabaseServiceRoleClientSafe()
  if (!guard.ok) return { ok: false, error: guard.error }
  const sb = guard.client
  const companyId = input.companyId

  const deleted: SeedSummary = {
    customers: 0,
    projects: 0,
    suppliers: 0,
    contracts: 0,
    taxInvoices: 0,
    receipts: 0,
    vendorInvoices: 0,
    paymentRuns: 0,
    apPayments: 0,
    purchaseOrders: 0,
  }

  // Deletion order respects FKs:
  //   ap_payments → payment_runs → vendor_invoices → POs (lines cascade)
  //   allocations → receipts
  //   tax_invoice_lines cascade with tax_invoices
  //   tax_invoices → client_contracts → projects + customers + suppliers

  // 1. Cancel payment run first so payments-delete trigger doesn't blow up.
  await sb
    .from("erp_ap_payment_runs")
    .update({ status: "CANCELLED" })
    .eq("company_id", companyId)
    .like("run_number", `${SEED_PREFIX}%`)

  // 2. Delete ap_payments (run is CANCELLED → trigger returns null).
  {
    const { data, error } = await sb
      .from("erp_ap_payments")
      .delete()
      .eq("company_id", companyId)
      .like("reference", `${SEED_PREFIX}%`)
      .select("id")
    if (!error) deleted.apPayments = data?.length ?? 0
  }

  // 3. Delete payment_runs.
  {
    const { data, error } = await sb
      .from("erp_ap_payment_runs")
      .delete()
      .eq("company_id", companyId)
      .like("run_number", `${SEED_PREFIX}%`)
      .select("id")
    if (!error) deleted.paymentRuns = data?.length ?? 0
  }

  // 4. Delete vendor_invoices (notes prefix marker).
  {
    const { data, error } = await sb
      .from("erp_vendor_invoices")
      .delete()
      .eq("company_id", companyId)
      .like("invoice_number", `${SEED_PREFIX}%`)
      .select("id")
    if (!error) deleted.vendorInvoices = data?.length ?? 0
  }

  // 5. Delete open POs (lines cascade).
  {
    const { data, error } = await sb
      .from("erp_purchase_orders")
      .delete()
      .eq("company_id", companyId)
      .like("po_number", `${SEED_PREFIX}%`)
      .select("id")
    if (!error) deleted.purchaseOrders = data?.length ?? 0
  }

  // 6. Delete receipt allocations (best-effort; cascade may handle some).
  await sb
    .from("erp_ar_receipt_tax_invoice_allocations")
    .delete()
    .eq("company_id", companyId)
    .eq("notes", SEED_NOTES_MARKER)

  // 7. Delete receipts.
  {
    const { data, error } = await sb
      .from("erp_ar_receipts")
      .delete()
      .eq("company_id", companyId)
      .like("receipt_number", `${SEED_PREFIX}%`)
      .select("id")
    if (!error) deleted.receipts = data?.length ?? 0
  }

  // 8. Delete tax invoices (lines cascade).
  {
    const { data, error } = await sb
      .from("erp_tax_invoices")
      .delete()
      .eq("company_id", companyId)
      .eq("series_code", "DEMO")
      .select("id")
    if (!error) deleted.taxInvoices = data?.length ?? 0
  }

  // 9. Delete client contracts.
  {
    const { data, error } = await sb
      .from("erp_client_contracts")
      .delete()
      .eq("company_id", companyId)
      .like("contract_number", `${SEED_PREFIX}%`)
      .select("id")
    if (!error) deleted.contracts = data?.length ?? 0
  }

  // 10. Delete projects.
  {
    const { data, error } = await sb
      .from("erp_proj_projects")
      .delete()
      .eq("company_id", companyId)
      .like("project_number", `${SEED_PREFIX}%`)
      .select("id")
    if (!error) deleted.projects = data?.length ?? 0
  }

  // 11. Delete suppliers.
  {
    const { data, error } = await sb
      .from("erp_md_suppliers")
      .delete()
      .eq("company_id", companyId)
      .like("supplier_number", `${SEED_PREFIX}%`)
      .select("id")
    if (!error) deleted.suppliers = data?.length ?? 0
  }

  // 12. Delete customers.
  {
    const { data, error } = await sb
      .from("erp_md_customers")
      .delete()
      .eq("company_id", companyId)
      .like("customer_number", `${SEED_PREFIX}%`)
      .select("id")
    if (!error) deleted.customers = data?.length ?? 0
  }

  return { ok: true, deleted }
}
