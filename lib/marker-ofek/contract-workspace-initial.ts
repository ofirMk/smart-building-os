import { COMPANY_PROFILE_COLUMNS } from "@/lib/marker-ofek/supabase-fields"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { CompanyProfile } from "@/types/marker-ofek"

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

type EntityEmbed = {
  name: string
  legal_id: string | null
  address: string | null
  deductions_file_number: string | null
}

export type ContractRowRaw = {
  id: string
  project_id: string
  entity_id: string
  total_amount: number | null
  retention_pct: number
  insurance_pct: number
  testing_pct?: number | null
  pricing_model?: string | null
  agreement_type: string | null
  contract_type: string
  status: string
  projects:
    | { name: string; internal_project_code: string; address: string | null }
    | { name: string; internal_project_code: string; address: string | null }[]
    | null
  entities: EntityEmbed | EntityEmbed[] | null
}

export type ContractRowForWorkspace = Omit<
  ContractRowRaw,
  "projects" | "entities"
> & {
  projects: {
    name: string
    internal_project_code: string
    address: string | null
  } | null
  entities: EntityEmbed | null
}

export type ContractMilestoneRowPayload = {
  id: string
  name: string
  amount: number
  weight_percentage: number | null
  sort_order: number
}

export type ContractWorkspaceInitialPayload = {
  contractId: string
  contract: ContractRowForWorkspace
  milestones: ContractMilestoneRowPayload[]
  companyProfile: CompanyProfile | null
  priorContractPaymentsSum: number
  priorProjectPaymentsSum: number
  previousSameContractCumulative: number
  submittedPct: Record<string, string>
  approvedPct: Record<string, string>
}

/**
 * Server-side initial payload for the contract workspace (אבני דרך בלבד).
 */
export async function loadContractWorkspaceInitial(
  contractId: string
): Promise<ContractWorkspaceInitialPayload | null> {
  const id = contractId?.trim()
  if (!id) return null

  const supabase = await createSupabaseServerAuthClient()

  const [cRes, profileRes] = await Promise.all([
    supabase
      .from("contracts")
      .select(
        `
            id,
            project_id,
            entity_id,
            total_amount,
            retention_pct,
            insurance_pct,
            testing_pct,
            pricing_model,
            agreement_type,
            contract_type,
            status,
            projects ( name, internal_project_code, address ),
            entities ( name, legal_id, address, deductions_file_number ),
            contract_milestones (
              id,
              name,
              amount,
              weight_percentage,
              sort_order
            )
          `
      )
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle(),
    supabase
      .from("company_profile")
      .select(COMPANY_PROFILE_COLUMNS)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  if (cRes.error || !cRes.data) return null

  const rawContract = cRes.data as ContractRowRaw & {
    contract_milestones?: Record<string, unknown>[] | null
  }
  const { contract_milestones: nestedMs, ...crOnly } = rawContract
  const cr = crOnly as ContractRowRaw
  const msRaw = Array.isArray(nestedMs)
    ? nestedMs
    : nestedMs
      ? [nestedMs]
      : []
  const msSorted = [...msRaw].sort(
    (a, b) =>
      Number((a as { sort_order?: number }).sort_order) -
      Number((b as { sort_order?: number }).sort_order)
  )

  const contract: ContractRowForWorkspace = {
    ...cr,
    projects: embedOne(cr.projects),
    entities: embedOne(cr.entities),
  }

  const milestones: ContractMilestoneRowPayload[] = msSorted.map((row) => {
    const r = row as {
      id: string
      name: string
      amount: number | string | null
      weight_percentage: number | string | null
      sort_order: number | null
    }
    const amt = Number(r.amount)
    const wp = r.weight_percentage
    return {
      id: r.id,
      name: String(r.name ?? ""),
      amount: Number.isFinite(amt) ? amt : 0,
      weight_percentage:
        wp === null || wp === undefined || wp === ""
          ? null
          : Number(wp),
      sort_order: Number(r.sort_order) || 0,
    }
  })

  const subInit: Record<string, string> = {}
  const appInit: Record<string, string> = {}
  for (const m of milestones) {
    subInit[m.id] = ""
    appInit[m.id] = ""
  }

  const projectId = cr.project_id
  const { data: siblingContracts } = await supabase
    .from("contracts")
    .select("id")
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })

  const siblingIds = (siblingContracts ?? [])
    .map((c) => (c as { id: string }).id)
    .filter(Boolean)
  const projectContractIds = siblingIds.length > 0 ? siblingIds : [id]

  const partialStatus = ["submitted", "approved", "paid"] as const

  const [lastProjPaRes, paPayRes, lastSameRes] = await Promise.all([
    supabase
      .from("partial_accounts")
      .select("id")
      .in("contract_id", projectContractIds)
      .eq("is_deleted", false)
      .in("status", [...partialStatus])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("partial_accounts")
      .select("payment_due, contract_id")
      .in("contract_id", projectContractIds)
      .eq("is_deleted", false)
      .in("status", [...partialStatus])
      .order("created_at", { ascending: false }),
    supabase
      .from("partial_accounts")
      .select("total_cumulative_amount")
      .eq("contract_id", id)
      .eq("is_deleted", false)
      .in("status", [...partialStatus])
      .order("account_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (lastProjPaRes.error || paPayRes.error || lastSameRes.error) return null

  const lastProjPa = lastProjPaRes.data as { id: string } | null
  if (lastProjPa?.id) {
    const { data: paliRows } = await supabase
      .from("partial_account_line_items")
      .select("contract_milestone_id, approved_percentage")
      .eq("partial_account_id", lastProjPa.id)

    const milestoneIdSet = new Set(milestones.map((m) => m.id))
    for (const pr of paliRows ?? []) {
      const row = pr as {
        contract_milestone_id: string | null
        approved_percentage: number
      }
      const mid = row.contract_milestone_id
      if (mid && milestoneIdSet.has(mid)) {
        appInit[mid] = String(Number(row.approved_percentage))
      }
    }
  }

  const paPayRows = (paPayRes.data ?? []) as {
    payment_due: number
    contract_id: string
  }[]
  const pcSum = roundMoney(
    paPayRows
      .filter((r) => r.contract_id === id)
      .reduce((s, r) => s + Number(r.payment_due), 0)
  )
  const ppSum = roundMoney(
    paPayRows.reduce((s, r) => s + Number(r.payment_due), 0)
  )

  const lastSame = lastSameRes.data as {
    total_cumulative_amount?: number
  } | null
  const prevSame = Number(lastSame?.total_cumulative_amount)

  return {
    contractId: id,
    contract,
    milestones,
    companyProfile: profileRes.data
      ? (profileRes.data as CompanyProfile)
      : null,
    priorContractPaymentsSum: pcSum,
    priorProjectPaymentsSum: ppSum,
    previousSameContractCumulative: Number.isFinite(prevSame)
      ? roundMoney(prevSame)
      : 0,
    submittedPct: subInit,
    approvedPct: appInit,
  }
}
