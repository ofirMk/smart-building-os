"use server"

import { analyzePlanAgainstWbs } from "@/lib/marker-ofek/ai/projects/plan-vs-wbs-service"

export type { PlanVsWbsEngineResult } from "@/lib/marker-ofek/ai/projects/plan-vs-wbs-service"

/**
 * שירות עליון: תוכנית מול WBS לפי פרויקט (מבנה WBS אחרון או `wbsStructureId`).
 */
export async function analyzePlanAgainstWbsAction(input: {
  projectId: string
  planFile: { base64: string; mimeType: string }
  wbsStructureId?: string
}) {
  return analyzePlanAgainstWbs({
    projectId: input.projectId,
    planFile: input.planFile,
    wbsStructureId: input.wbsStructureId,
    persistJob: true,
  })
}

/** תאימות לאחור — דורש מזהה מבנה מפורש. */
export async function runPlanVsWbsAnalysis(input: {
  projectId: string
  wbsStructureId: string
  pdfBase64: string
  mimeType: string
}) {
  return analyzePlanAgainstWbs({
    projectId: input.projectId,
    planFile: { base64: input.pdfBase64, mimeType: input.mimeType },
    wbsStructureId: input.wbsStructureId,
    persistJob: true,
  })
}
