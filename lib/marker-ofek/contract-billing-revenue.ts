import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Contract-level recognized revenue (aligns with partner income: invoices + approved partials not yet on an invoice).
 */
export async function getContractRecognizedTotals(
  supabase: SupabaseClient,
  contractId: string
): Promise<{
  fromInvoices: number
  fromApprovedPartialsNotInvoiced: number
  totalRecognized: number
}> {
  const cid = contractId.trim()
  if (!cid) {
    return { fromInvoices: 0, fromApprovedPartialsNotInvoiced: 0, totalRecognized: 0 }
  }

  const [{ data: invRows }, { data: paRows }, { data: invPartialLinks }] = await Promise.all([
    supabase
      .from("mo_invoices")
      .select("grand_total")
      .eq("contract_id", cid)
      .in("status", ["approved", "paid"]),
    supabase
      .from("partial_accounts")
      .select("id, payment_due")
      .eq("contract_id", cid)
      .eq("status", "approved")
      .eq("is_deleted", false),
    supabase
      .from("mo_invoices")
      .select("linked_partial_account_id")
      .eq("contract_id", cid)
      .not("linked_partial_account_id", "is", null),
  ])

  const fromInvoices = (invRows ?? []).reduce(
    (s, r) => s + Number((r as { grand_total: number }).grand_total ?? 0),
    0
  )

  const linkedPartialIds = new Set<string>()
  for (const row of invPartialLinks ?? []) {
    const id = (row as { linked_partial_account_id: string | null }).linked_partial_account_id
    if (id) linkedPartialIds.add(id)
  }

  let fromPartials = 0
  for (const r of paRows ?? []) {
    const row = r as { id: string; payment_due: number }
    if (linkedPartialIds.has(row.id)) continue
    fromPartials += Number(row.payment_due ?? 0)
  }

  return {
    fromInvoices,
    fromApprovedPartialsNotInvoiced: fromPartials,
    totalRecognized: fromInvoices + fromPartials,
  }
}
