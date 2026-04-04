import type { SupabaseClient } from "@supabase/supabase-js"

import { poRowCountsTowardCommittedSpend } from "@/lib/marker-ofek/procurement/po-cost-policy"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** שורת תזרים לפרויקט עם חוזה ראשי פעיל (מצב „זכייה“ / ביצוע). */
export type MasterPortfolioProjectRow = {
  projectId: string
  projectName: string
  internalCode: string
  mainContractId: string
  contractValue: number
  procurementActual: number
  recognizedCumulative: number
  collectedPaid: number
}

/**
 * אגרגציה למרכז החיוב: ערך חוזה, הוצאת רכש (PO), הכרה מצטברת מאושרת, גבייה (חשבוניות ששולמו).
 */
export async function fetchMasterPortfolioProjectRows(
  supabase: SupabaseClient
): Promise<MasterPortfolioProjectRow[]> {
  const { data: contractRows, error: cErr } = await supabase
    .from("contracts")
    .select(
      `
      id,
      project_id,
      total_amount,
      status,
      contract_type,
      is_deleted,
      projects ( id, name, internal_project_code, status )
    `
    )
    .eq("contract_type", "main_contract")
    .eq("is_deleted", false)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(300)

  if (cErr || !contractRows?.length) {
    return []
  }

  type CRow = {
    id: string
    project_id: string
    total_amount: number | null
    projects:
      | { id: string; name: string; internal_project_code: string; status?: string }
      | { id: string; name: string; internal_project_code: string; status?: string }[]
      | null
  }

  const byProject = new Map<
    string,
    {
      mainContractId: string
      contractValue: number
      projectName: string
      internalCode: string
    }
  >()

  for (const raw of contractRows as CRow[]) {
    const pr = raw.projects
    const p = Array.isArray(pr) ? pr[0] : pr
    if (!p?.id) continue
    if (byProject.has(p.id)) continue
    byProject.set(p.id, {
      mainContractId: raw.id,
      contractValue: Number(raw.total_amount ?? 0),
      projectName: p.name ?? "—",
      internalCode: p.internal_project_code ?? "—",
    })
  }

  const projectIds = [...byProject.keys()]
  if (projectIds.length === 0) return []

  const contractIds = [...new Set([...byProject.values()].map((x) => x.mainContractId))]

  const { data: pas } = await supabase
    .from("partial_accounts")
    .select("contract_id, account_number, total_cumulative_amount, status")
    .in("contract_id", contractIds)
    .eq("is_deleted", false)
    .in("status", ["approved", "paid"])

  const bestPartial = new Map<
    string,
    { account_number: number; total_cumulative_amount: number }
  >()
  for (const row of pas ?? []) {
    const r = row as {
      contract_id: string
      account_number: number
      total_cumulative_amount: number | null
    }
    const cur = bestPartial.get(r.contract_id)
    const n = Number(r.account_number) || 0
    const cum = Number(r.total_cumulative_amount ?? 0)
    if (!cur || n > cur.account_number) {
      bestPartial.set(r.contract_id, {
        account_number: n,
        total_cumulative_amount: cum,
      })
    }
  }

  const contractToProject = new Map<string, string>()
  for (const [pid, meta] of byProject) {
    contractToProject.set(meta.mainContractId, pid)
  }

  const recognizedByProject = new Map<string, number>()
  for (const [cid, snap] of bestPartial) {
    const pid = contractToProject.get(cid)
    if (!pid) continue
    recognizedByProject.set(pid, roundMoney(snap.total_cumulative_amount))
  }

  const { data: pos } = await supabase
    .from("purchase_orders")
    .select("id, project_id, is_deleted, status, is_ceo_approved")
    .in("project_id", projectIds)
    .eq("is_deleted", false)

  const eligiblePo = ((pos ?? []) as Array<{
    id: string
    project_id: string
    status: string
    is_ceo_approved?: boolean | null
  }>).filter((r) => poRowCountsTowardCommittedSpend(r))

  const poIds = eligiblePo.map((x) => x.id)

  const spendByProject = new Map<string, number>()
  if (poIds.length > 0) {
    const { data: lines } = await supabase
      .from("po_line_items")
      .select("po_id, total_price")
      .in("po_id", poIds)

    const poToProject = new Map(
      eligiblePo.map((p) => [p.id, p.project_id])
    )

    for (const row of lines ?? []) {
      const li = row as { po_id: string; total_price: number | null }
      const pid = poToProject.get(li.po_id)
      if (!pid) continue
      const add = Number(li.total_price ?? 0)
      spendByProject.set(pid, roundMoney((spendByProject.get(pid) ?? 0) + add))
    }
  }

  const collectedByProject = new Map<string, number>()
  const invRes = await supabase
    .from("mo_invoices")
    .select("project_id, grand_total, status")
    .eq("status", "paid")
    .in("project_id", projectIds)

  if (!invRes.error && invRes.data) {
    for (const row of invRes.data) {
      const r = row as { project_id: string; grand_total: number | null }
      const pid = r.project_id
      const add = Number(r.grand_total ?? 0)
      collectedByProject.set(pid, roundMoney((collectedByProject.get(pid) ?? 0) + add))
    }
  }

  const out: MasterPortfolioProjectRow[] = []
  for (const [projectId, meta] of byProject) {
    out.push({
      projectId,
      projectName: meta.projectName,
      internalCode: meta.internalCode,
      mainContractId: meta.mainContractId,
      contractValue: roundMoney(meta.contractValue),
      procurementActual: roundMoney(spendByProject.get(projectId) ?? 0),
      recognizedCumulative: roundMoney(recognizedByProject.get(projectId) ?? 0),
      collectedPaid: roundMoney(collectedByProject.get(projectId) ?? 0),
    })
  }

  out.sort((a, b) => a.projectName.localeCompare(b.projectName, "he"))
  return out
}
