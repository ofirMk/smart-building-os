import {
  BillingHubClient,
  type BillingHubCashFlow,
  type BillingHubContractRow,
  type BillingHubPartialRow,
} from "./billing-hub-client"
import { fetchMasterPortfolioProjectRows } from "@/lib/marker-ofek/billing-master-hub-data"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export default async function FinanceBillingHubPage() {
  const supabase = await createSupabaseServerAuthClient()

  const portfolioProjects = await fetchMasterPortfolioProjectRows(supabase)

  const { data: contractRows } = await supabase
    .from("contracts")
    .select(
      `
      id,
      total_amount,
      status,
      contract_type,
      is_deleted,
      projects ( name, internal_project_code ),
      entities ( name )
    `
    )
    .eq("contract_type", "main_contract")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(200)

  const contracts: BillingHubContractRow[] = (contractRows ?? []).map((raw) => {
    const r = raw as {
      id: string
      total_amount: number | null
      status: string
      projects:
        | { name: string; internal_project_code: string }
        | { name: string; internal_project_code: string }[]
        | null
      entities: { name: string } | { name: string }[] | null
    }
    const p = Array.isArray(r.projects) ? r.projects[0] : r.projects
    const e = Array.isArray(r.entities) ? r.entities[0] : r.entities
    return {
      id: r.id,
      total_amount: r.total_amount,
      status: r.status,
      projectName: p?.name ?? "—",
      internalCode: p?.internal_project_code ?? "—",
      entityName: e?.name ?? "—",
    }
  })

  const { data: partialRows } = await supabase
    .from("partial_accounts")
    .select(
      `
      id,
      account_number,
      status,
      payment_due,
      contract_id,
      created_at,
      is_deleted,
      contracts (
        project_id,
        projects ( name, internal_project_code )
      )
    `
    )
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(150)

  const partials: BillingHubPartialRow[] = (partialRows ?? []).map((raw) => {
    const r = raw as {
      id: string
      account_number: number
      status: string
      payment_due: number
      contract_id: string
      created_at: string
      contracts:
        | {
            projects:
              | { name: string; internal_project_code: string }
              | { name: string; internal_project_code: string }[]
              | null
          }
        | {
            projects:
              | { name: string; internal_project_code: string }
              | { name: string; internal_project_code: string }[]
              | null
          }[]
        | null
    }
    const c = Array.isArray(r.contracts) ? r.contracts[0] : r.contracts
    const pr = c?.projects
    const p = Array.isArray(pr) ? pr[0] : pr
    return {
      id: r.id,
      account_number: r.account_number,
      status: r.status,
      payment_due: Number(r.payment_due ?? 0),
      contract_id: r.contract_id,
      projectName: p?.name ?? "—",
      internalCode: p?.internal_project_code ?? "—",
      created_at: r.created_at,
    }
  })

  const invResult = await supabase
    .from("mo_invoices")
    .select("status, grand_total")
  const invRows = invResult.error ? [] : invResult.data

  let invoicesApproved = 0
  let invoicesPaid = 0
  let invoicesIssuedOnly = 0
  for (const row of invRows ?? []) {
    const r = row as { status: string; grand_total: number | null }
    const gt = Number(r.grand_total ?? 0)
    if (r.status === "cancelled") continue
    if (r.status === "issued") invoicesIssuedOnly += gt
    if (r.status === "approved") invoicesApproved += gt
    if (r.status === "paid") invoicesPaid += gt
  }

  const { data: paCash } = await supabase
    .from("partial_accounts")
    .select("status, payment_due")
    .eq("is_deleted", false)

  let partialsSubmitted = 0
  let partialsApproved = 0
  let partialsPaid = 0
  let partialDraftPaymentExposure = 0
  for (const row of paCash ?? []) {
    const r = row as { status: string; payment_due: number | null }
    const pd = Number(r.payment_due ?? 0)
    if (r.status === "submitted") partialsSubmitted += pd
    if (r.status === "approved") partialsApproved += pd
    if (r.status === "paid") partialsPaid += pd
    if (r.status === "draft") partialDraftPaymentExposure += pd
  }

  const cashFlow: BillingHubCashFlow = {
    invoicesApproved,
    invoicesPaid,
    invoicesIssuedOnly,
    partialsSubmitted,
    partialsApproved,
    partialsPaid,
    partialDraftPaymentExposure,
  }

  return (
    <BillingHubClient
      contracts={contracts}
      partials={partials}
      cashFlow={cashFlow}
      portfolioProjects={portfolioProjects}
    />
  )
}
