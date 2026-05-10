"use server"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type AgingBucketKey = "current" | "d1_30" | "d31_60" | "d61_90" | "d91_plus"

export type AgingBucket = {
  key: AgingBucketKey
  label: string
  amount: number
}

export type AgingInvoiceRow = {
  invoice_id: string
  invoice_number: number | null
  issue_date: string
  due_date: string
  entity_name: string
  entity_id: string
  open_amount: number
  days_past_due: number
  bucket: AgingBucketKey
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function fetchAgingReport(): Promise<{
  buckets: AgingBucket[]
  rows: AgingInvoiceRow[]
  totalOpen: number
}> {
  const supabase = await createSupabaseServerAuthClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: invoices, error: iErr } = await supabase
    .from("mo_invoices")
    .select(
      "id, invoice_number, issue_date, grand_total, entity_id, status, is_finalized"
    )
    .eq("is_finalized", true)
    .order("issue_date", { ascending: true })
    .limit(5000)

  if (iErr) throw new Error(iErr.message)

  const invList = (invoices ?? []) as Array<{
    id: string
    invoice_number: number | null
    issue_date: string | null
    grand_total: number | null
    entity_id: string | null
    status: string | null
  }>

  const entityIds = [
    ...new Set(
      invList.map((i) => i.entity_id).filter((x): x is string => Boolean(x))
    ),
  ]

  const termsByEntity = new Map<string, number>()
  const nameByEntity = new Map<string, string>()
  if (entityIds.length > 0) {
    const { data: ents, error: eErr } = await supabase
      .from("entities")
      .select("id, payment_terms_days, name")
      .in("id", entityIds)
    if (eErr) throw new Error(eErr.message)
    for (const e of ents ?? []) {
      const id = String((e as { id: string }).id)
      termsByEntity.set(
        id,
        Number((e as { payment_terms_days?: number }).payment_terms_days ?? 30) || 30
      )
      nameByEntity.set(id, String((e as { name?: string }).name ?? "—"))
    }
  }

  const invoiceIds = invList.map((i) => i.id)
  const allocByInvoice = new Map<string, number>()
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

  const bucketAmounts: Record<AgingBucketKey, number> = {
    current: 0,
    d1_30: 0,
    d31_60: 0,
    d61_90: 0,
    d91_plus: 0,
  }

  const rows: AgingInvoiceRow[] = []

  for (const inv of invList) {
    const gt = Number(inv.grand_total ?? 0) || 0
    const allocated = allocByInvoice.get(inv.id) ?? 0
    const open = round2(gt - allocated)
    if (open <= 0.005) continue

    const issue = String(inv.issue_date ?? "").slice(0, 10)
    if (!issue) continue

    const entId = String(inv.entity_id ?? "")
    const terms = termsByEntity.get(entId) ?? 30
    const due = addDays(issue, terms)

    const dueMs = new Date(`${due}T12:00:00.000Z`).getTime()
    const todayMs = new Date(`${today}T12:00:00.000Z`).getTime()
    const daysPastDue = Math.max(
      0,
      Math.floor((todayMs - dueMs) / (24 * 60 * 60 * 1000))
    )

    let bucket: AgingBucketKey
    if (due >= today) {
      bucket = "current"
    } else if (daysPastDue <= 30) {
      bucket = "d1_30"
    } else if (daysPastDue <= 60) {
      bucket = "d31_60"
    } else if (daysPastDue <= 90) {
      bucket = "d61_90"
    } else {
      bucket = "d91_plus"
    }

    bucketAmounts[bucket] += open

    const name = nameByEntity.get(entId) ?? "—"

    rows.push({
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      issue_date: issue,
      due_date: due,
      entity_name: name || "—",
      entity_id: entId,
      open_amount: open,
      days_past_due: due >= today ? 0 : daysPastDue,
      bucket,
    })
  }

  const buckets: AgingBucket[] = [
    { key: "current", label: "במועד / עתידי", amount: round2(bucketAmounts.current) },
    { key: "d1_30", label: "1–30 ימים", amount: round2(bucketAmounts.d1_30) },
    { key: "d31_60", label: "31–60 ימים", amount: round2(bucketAmounts.d31_60) },
    { key: "d61_90", label: "61–90 ימים", amount: round2(bucketAmounts.d61_90) },
    { key: "d91_plus", label: "מעל 90 ימים", amount: round2(bucketAmounts.d91_plus) },
  ]

  const totalOpen = round2(buckets.reduce((s, b) => s + b.amount, 0))

  rows.sort((a, b) => b.open_amount - a.open_amount)

  return { buckets, rows, totalOpen }
}
