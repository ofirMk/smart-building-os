import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

import {
  ROLLUP_LABEL_HE,
  type PreConstructionDashboardData,
  type TenderRollupStatus,
  rollupTenderStatus,
} from "@/lib/marker-ofek/pre-construction-dashboard-types"

export async function loadPreConstructionDashboardData(): Promise<PreConstructionDashboardData> {
  const empty: PreConstructionDashboardData = {
    totalTenders: 0,
    pipelineValue: 0,
    activeTenders: 0,
    pendingRfps: 0,
    submittedTenders: 0,
    statusChart: [],
    recentTenders: [],
    loadError: null,
    boqLoadWarning: null,
  }

  try {
    const supabase = await createSupabaseServerAuthClient()

    const [tendersRes, docsRes, boqRes] = await Promise.all([
      supabase
        .from("tenders")
        .select("id, project_name_from_ai, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("tender_documents").select("tender_id, status"),
      supabase.from("tender_boq_items").select("quantity, final_price"),
    ])

    if (tendersRes.error) {
      return { ...empty, loadError: tendersRes.error.message }
    }
    if (docsRes.error) {
      return { ...empty, loadError: docsRes.error.message }
    }

    const tenders = (tendersRes.data ?? []) as Array<{
      id: string
      project_name_from_ai: string | null
      created_at: string
    }>

    const docs = (docsRes.data ?? []) as Array<{
      tender_id: string
      status: string
    }>

    let pipelineValue = 0
    if (!boqRes.error && boqRes.data) {
      for (const row of boqRes.data as Array<{
        quantity: number | string | null
        final_price: number | string | null
      }>) {
        const q = Number(row.quantity) || 0
        const fp =
          row.final_price !== null && row.final_price !== undefined
            ? Number(row.final_price)
            : 0
        if (!Number.isFinite(fp) || !Number.isFinite(q)) continue
        pipelineValue += fp * q
      }
    }

    const byTender = new Map<string, string[]>()
    for (const d of docs) {
      const tid = d.tender_id
      if (!tid) continue
      const arr = byTender.get(tid) ?? []
      arr.push(d.status)
      byTender.set(tid, arr)
    }

    const rollupById = new Map<string, TenderRollupStatus>()
    for (const t of tenders) {
      rollupById.set(
        t.id,
        rollupTenderStatus(byTender.get(t.id) ?? [])
      )
    }

    const counts = new Map<TenderRollupStatus, number>()
    const allStatuses: TenderRollupStatus[] = [
      "to_execution",
      "for_tender",
      "for_review",
      "ai_failed",
      "no_docs",
    ]
    for (const s of allStatuses) counts.set(s, 0)

    for (const t of tenders) {
      const r = rollupById.get(t.id) ?? "no_docs"
      counts.set(r, (counts.get(r) ?? 0) + 1)
    }

    let activeTenders = 0
    let pendingRfps = 0
    let submittedTenders = 0

    for (const t of tenders) {
      const r = rollupById.get(t.id) ?? "no_docs"
      if (r === "for_tender") activeTenders++
      if (r === "to_execution") submittedTenders++
      if (r === "for_review" || r === "no_docs" || r === "ai_failed") {
        pendingRfps++
      }
    }

    const statusChart = allStatuses
      .map((status) => ({
        status,
        label: ROLLUP_LABEL_HE[status],
        count: counts.get(status) ?? 0,
      }))
      .filter((x) => x.count > 0)

    const recentTenders = tenders.slice(0, 5).map((t) => ({
      id: t.id,
      project_name_from_ai: t.project_name_from_ai,
      created_at: t.created_at,
      rollup: rollupById.get(t.id) ?? "no_docs",
    }))

    return {
      totalTenders: tenders.length,
      pipelineValue,
      activeTenders,
      pendingRfps,
      submittedTenders,
      statusChart,
      recentTenders,
      loadError: null,
      boqLoadWarning: boqRes.error ? boqRes.error.message : null,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { ...empty, loadError: msg }
  }
}
