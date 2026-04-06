"use server"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type FinanceCustomerRow = {
  id: string
  name: string
  legal_id: string | null
  company_id: string | null
  payment_terms_days: number
  billing_address: string | null
  contact_info: Record<string, unknown>
}

export async function fetchFinanceCustomers(): Promise<FinanceCustomerRow[]> {
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .from("entities")
    .select(
      "id, name, legal_id, company_id, payment_terms_days, billing_address, contact_info, is_deleted, type"
    )
    .eq("type", "client")
    .or("is_deleted.is.null,is_deleted.eq.false")
    .order("name", { ascending: true })

  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    legal_id: r.legal_id == null ? null : String(r.legal_id),
    company_id: r.company_id == null ? null : String(r.company_id),
    payment_terms_days: Number(r.payment_terms_days ?? 30) || 30,
    billing_address: r.billing_address == null ? null : String(r.billing_address),
    contact_info:
      r.contact_info && typeof r.contact_info === "object"
        ? (r.contact_info as Record<string, unknown>)
        : {},
  }))
}

export type CustomerInvoiceRow = {
  id: string
  invoice_number: number | null
  issue_date: string | null
  grand_total: number
  status: string | null
  allocated: number
  open_amount: number
}

export type CustomerReceiptRow = {
  id: string
  receipt_date: string
  amount: number
  payment_method: string
  reference: string | null
}

export async function fetchCustomer360(entityId: string): Promise<{
  customer: FinanceCustomerRow | null
  invoices: CustomerInvoiceRow[]
  receipts: CustomerReceiptRow[]
  openBalance: number
} | null> {
  const id = String(entityId ?? "").trim()
  if (!id) return null

  const supabase = await createSupabaseServerAuthClient()

  const { data: ent, error: eErr } = await supabase
    .from("entities")
    .select(
      "id, name, legal_id, company_id, payment_terms_days, billing_address, contact_info, type, is_deleted"
    )
    .eq("id", id)
    .maybeSingle()

  if (eErr) throw new Error(eErr.message)
  if (
    !ent ||
    (ent as { is_deleted?: boolean | null }).is_deleted === true
  ) {
    return { customer: null, invoices: [], receipts: [], openBalance: 0 }
  }
  if (String((ent as { type?: string }).type) !== "client") {
    return { customer: null, invoices: [], receipts: [], openBalance: 0 }
  }

  const customer: FinanceCustomerRow = {
    id: String((ent as { id: string }).id),
    name: String((ent as { name?: string }).name ?? ""),
    legal_id:
      (ent as { legal_id?: string | null }).legal_id == null
        ? null
        : String((ent as { legal_id?: string | null }).legal_id),
    company_id:
      (ent as { company_id?: string | null }).company_id == null
        ? null
        : String((ent as { company_id?: string | null }).company_id),
    payment_terms_days: Number((ent as { payment_terms_days?: number }).payment_terms_days ?? 30) || 30,
    billing_address:
      (ent as { billing_address?: string | null }).billing_address == null
        ? null
        : String((ent as { billing_address?: string | null }).billing_address),
    contact_info:
      (ent as { contact_info?: unknown }).contact_info &&
      typeof (ent as { contact_info?: unknown }).contact_info === "object"
        ? ((ent as { contact_info: Record<string, unknown> }).contact_info)
        : {},
  }

  const { data: invRows, error: iErr } = await supabase
    .from("mo_invoices")
    .select("id, invoice_number, issue_date, grand_total, status, entity_id")
    .eq("entity_id", id)
    .order("issue_date", { ascending: false })
    .limit(200)

  if (iErr) throw new Error(iErr.message)

  const invoiceIds = ((invRows ?? []) as { id: string }[]).map((r) => r.id)
  let allocByInvoice = new Map<string, number>()
  if (invoiceIds.length > 0) {
    const { data: allocRows, error: aErr } = await supabase
      .from("mo_receipt_allocations")
      .select("invoice_id, amount")
      .in("invoice_id", invoiceIds)
    if (aErr) throw new Error(aErr.message)
    for (const row of allocRows ?? []) {
      const invId = String((row as { invoice_id: string }).invoice_id)
      const amt = Number((row as { amount: number }).amount) || 0
      allocByInvoice.set(invId, (allocByInvoice.get(invId) ?? 0) + amt)
    }
  }

  const invoices: CustomerInvoiceRow[] = (invRows ?? []).map((raw) => {
    const r = raw as {
      id: string
      invoice_number: number | null
      issue_date: string | null
      grand_total: number | null
      status: string | null
    }
    const gt = Number(r.grand_total ?? 0) || 0
    const allocated = allocByInvoice.get(r.id) ?? 0
    return {
      id: r.id,
      invoice_number: r.invoice_number,
      issue_date: r.issue_date,
      grand_total: gt,
      status: r.status,
      allocated,
      open_amount: Math.max(0, round2(gt - allocated)),
    }
  })

  const { data: recRows, error: rErr } = await supabase
    .from("mo_receipts")
    .select("id, receipt_date, amount, payment_method, reference")
    .eq("entity_id", id)
    .order("receipt_date", { ascending: false })
    .limit(100)

  if (rErr) throw new Error(rErr.message)

  const receipts: CustomerReceiptRow[] = (recRows ?? []).map((raw) => {
    const r = raw as CustomerReceiptRow
    return {
      id: r.id,
      receipt_date: String(r.receipt_date),
      amount: Number(r.amount) || 0,
      payment_method: String(r.payment_method),
      reference: r.reference == null ? null : String(r.reference),
    }
  })

  const openBalance = round2(
    invoices.reduce((s, x) => s + x.open_amount, 0)
  )

  return { customer, invoices, receipts, openBalance }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
