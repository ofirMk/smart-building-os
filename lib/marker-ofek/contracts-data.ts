import { cookies } from "next/headers"

import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { formatError } from "@/lib/format-error"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { ContractRow } from "@/components/marker-ofek/contracts/contracts-entity-workspace-scaffold"

export type ContractProjectOption = {
  id: string
  code: string
  name: string
}

export type ContractPartnerOption = {
  id: string
  name: string
}

type LoadContractsResult = {
  rows: ContractRow[]
  projects: ContractProjectOption[]
  partners: ContractPartnerOption[]
  error: string | null
}

type ContractDbRow = {
  id: string
  contract_number: string
  title: string
  total_amount: number | null
  retention_percent: number | null
  status: "DRAFT" | "ACTIVE" | "APPROVED" | "CLOSED"
  pbc_project_id: string | null
  project_id: string | null
  business_partner_id: string | null
}

type ProjectOptionDbRow = {
  id: string
  project_code: string
  name: string
}

type PartnerDbRow = {
  id: string
  name: string
}

export async function loadContractsWorkspaceData(): Promise<LoadContractsResult> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
      return {
        rows: [],
        projects: [],
        partners: [],
        error: "נדרשת התחברות כדי לצפות בנתוני חוזים.",
      }
    }

    const cookieStore = await cookies()
    const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
    if (!companyId) {
      return {
        rows: [],
        projects: [],
        partners: [],
        error: "חסר הקשר חברה בסשן.",
      }
    }

    const [projectsRes, partnersRes, contractsRes] = await Promise.all([
      supabase
        .from("pbc_projects")
        .select("id, project_code, name")
        .eq("company_id", companyId)
        .order("name", { ascending: true }),
      supabase
        .from("erp_master_business_partners")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name", { ascending: true }),
      supabase
        .from("ctr_contracts")
        .select(
          "id, contract_number, title, total_amount, retention_percent, status, pbc_project_id, project_id, business_partner_id"
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ])

    if (projectsRes.error) {
      return { rows: [], projects: [], partners: [], error: projectsRes.error.message }
    }
    if (partnersRes.error) {
      return { rows: [], projects: [], partners: [], error: partnersRes.error.message }
    }
    if (contractsRes.error) {
      return { rows: [], projects: [], partners: [], error: contractsRes.error.message }
    }

    const projects = ((projectsRes.data ?? []) as ProjectOptionDbRow[]).map((row) => ({
      id: row.id,
      code: row.project_code,
      name: row.name,
    }))
    const partners = ((partnersRes.data ?? []) as PartnerDbRow[]).map((row) => ({
      id: row.id,
      name: row.name,
    }))

    const contracts = (contractsRes.data ?? []) as ContractDbRow[]
    const projectById = new Map(projects.map((row) => [row.id, row]))
    const partnerById = new Map(partners.map((row) => [row.id, row]))

    const rows: ContractRow[] = contracts.map((row) => {
      const project =
        (row.pbc_project_id ? projectById.get(row.pbc_project_id) : null) ??
        (row.project_id ? projectById.get(row.project_id) : null)
      const partner = row.business_partner_id
        ? partnerById.get(row.business_partner_id)
        : null
      const projectLabel = project ? `${project.code} · ${project.name}` : "ללא פרויקט"
      const subcontractor = partner?.name || "ללא שותף עסקי"

      return {
        id: row.id,
        contractNumber: row.contract_number,
        projectLabel,
        subcontractor,
        totalAmount: Number(row.total_amount ?? 0),
        retentionPct: Number(row.retention_percent ?? 0),
        status: row.status ?? "DRAFT",
      }
    })

    return { rows, projects, partners, error: null }
  } catch (error) {
    return { rows: [], projects: [], partners: [], error: formatError(error) }
  }
}
