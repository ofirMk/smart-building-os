import { insertMoAiJobResult } from "@/lib/marker-ofek/ai/mo-ai-job-results-actions"
import { analyzeElectricalPlanAgainstWbs } from "@/lib/marker-ofek/ai/projects/plan-vs-wbs-gemini"
import {
  buildPlanVsWbsDiscrepancyReport,
  type PlanWbsDiscrepancyRow,
} from "@/lib/marker-ofek/ai/projects/plan-vs-wbs-discrepancy"
import { AI_ACTION_KINDS, AI_MODULES } from "@/lib/marker-ofek/ai/registry"
import {
  getWbsNodes,
  type WbsStructureRow,
} from "@/lib/marker-ofek/wbs-structure-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

export type PlanVsWbsEngineResult = {
  projectId: string
  wbsStructureId: string
  gemini: Awaited<ReturnType<typeof analyzeElectricalPlanAgainstWbs>>
  discrepancies: PlanWbsDiscrepancyRow[]
  summary: {
    lines_compared: number
    quantity_gaps_significant: number
    unmatched_plan_items: number
  }
}

async function resolveWbsStructureIdForProject(
  projectId: string,
  explicitStructureId?: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const pid = projectId.trim()
  if (explicitStructureId?.trim()) {
    const sid = explicitStructureId.trim()
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .schema("public")
      .from("wbs_structures")
      .select("id, project_id")
      .eq("id", sid)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    const row = data as Pick<WbsStructureRow, "id" | "project_id"> | null
    if (!row) return { ok: false, error: "מבנה WBS לא נמצא" }
    if (row.project_id !== pid) {
      return { ok: false, error: "מבנה WBS אינו משויך לפרויקט זה" }
    }
    return { ok: true, id: sid }
  }

  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("wbs_structures")
    .select("id")
    .eq("project_id", pid)
    .eq("is_template", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  const row = data as { id: string } | null
  if (!row?.id) {
    return {
      ok: false,
      error: "לא נמצא מבנה WBS לפרויקט — צרו מבנה או העבירו wbsStructureId",
    }
  }
  return { ok: true, id: row.id }
}

/**
 * ליבת המנוע: תוכנית (PDF) מול צמתי WBS פעילים + דוח פערי כמויות.
 */
export async function analyzePlanAgainstWbs(input: {
  projectId: string
  planFile: { base64: string; mimeType: string }
  wbsStructureId?: string
  /** כש-false לא נשמרת שורה ב-mo_ai_job_results */
  persistJob?: boolean
}): Promise<
  | { ok: true; data: PlanVsWbsEngineResult; jobId: string | null }
  | { ok: false; error: string }
> {
  const pid = input.projectId.trim()
  const mime = input.planFile.mimeType.trim() || "application/pdf"
  if (!pid) return { ok: false, error: "חסר מזהה פרויקט" }
  if (!input.planFile.base64?.trim()) {
    return { ok: false, error: "חסר קובץ תוכנית" }
  }

  try {
    const resolved = await resolveWbsStructureIdForProject(
      pid,
      input.wbsStructureId
    )
    if (!resolved.ok) return resolved

    const nodes = await getWbsNodes(resolved.id)
    if (nodes.length === 0) {
      return { ok: false, error: "אין צמתי WBS במבנה שנבחר" }
    }

    const gemini = await analyzeElectricalPlanAgainstWbs({
      pdfBase64: input.planFile.base64,
      mimeType: mime,
      wbsNodes: nodes,
    })

    const discrepancies = buildPlanVsWbsDiscrepancyReport(gemini, nodes)
    const quantityGaps = discrepancies.filter(
      (d) =>
        d.gap != null &&
        d.gap !== 0 &&
        (d.severity === "warn" || d.severity === "critical")
    ).length

    const data: PlanVsWbsEngineResult = {
      projectId: pid,
      wbsStructureId: resolved.id,
      gemini,
      discrepancies,
      summary: {
        lines_compared: discrepancies.length,
        quantity_gaps_significant: quantityGaps,
        unmatched_plan_items: gemini.missing_in_wbs.length,
      },
    }

    let jobId: string | null = null
    if (input.persistJob !== false) {
      const persisted = await insertMoAiJobResult({
        module: AI_MODULES.projects,
        actionKind: AI_ACTION_KINDS.planVsWbs,
        projectId: pid,
        referenceId: resolved.id,
        referenceLabel: "wbs_structure",
        inputSummary: {
          wbs_structure_id: resolved.id,
          node_count: nodes.length,
          mime_type: mime,
        },
        resultJson: {
          ...data,
          gemini,
        } as unknown as Record<string, unknown>,
        status: "completed",
      })
      if (!persisted.ok) return persisted
      jobId = persisted.id
    }

    return { ok: true, data, jobId }
  } catch (e) {
    const err = formatError(e)
    await insertMoAiJobResult({
      module: AI_MODULES.projects,
      actionKind: AI_ACTION_KINDS.planVsWbs,
      projectId: pid,
      inputSummary: { mime_type: mime },
      resultJson: {},
      status: "failed",
      errorMessage: err,
    }).catch(() => {})
    return { ok: false, error: err }
  }
}
