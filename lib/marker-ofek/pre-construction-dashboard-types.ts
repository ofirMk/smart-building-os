/** סטטוס מגובה מ־tender_documents (לכל מכרז נבחר הסטטוס „הגבוה” ביותר בפייפליין). */
export type TenderRollupStatus =
  | "to_execution"
  | "for_tender"
  | "for_review"
  | "ai_failed"
  | "no_docs"

const STATUS_PRIORITY: Record<string, number> = {
  to_execution: 4,
  for_tender: 3,
  for_review: 2,
  ai_failed: 1,
}

export function rollupTenderStatus(
  docStatuses: string[]
): TenderRollupStatus {
  if (docStatuses.length === 0) return "no_docs"
  let best: TenderRollupStatus = "for_review"
  let bestP = -1
  for (const s of docStatuses) {
    const p = STATUS_PRIORITY[s] ?? 0
    if (p > bestP) {
      bestP = p
      best = (s in STATUS_PRIORITY ? s : "for_review") as TenderRollupStatus
    }
  }
  if (bestP < 0) return "for_review"
  return best
}

export const ROLLUP_LABEL_HE: Record<TenderRollupStatus, string> = {
  to_execution: "הוגשו / ביצוע",
  for_tender: "במכרז פעיל",
  for_review: "בבדיקה",
  ai_failed: "כשל בניתוח AI",
  no_docs: "ללא מסמכים",
}

export type PreConstructionDashboardData = {
  totalTenders: number
  pipelineValue: number
  activeTenders: number
  pendingRfps: number
  submittedTenders: number
  statusChart: { status: TenderRollupStatus; label: string; count: number }[]
  recentTenders: Array<{
    id: string
    project_name_from_ai: string | null
    created_at: string
    rollup: TenderRollupStatus
  }>
  loadError: string | null
  /** טעינת BoQ נכשלה — שאר הנתונים עשויים להיות תקינים */
  boqLoadWarning: string | null
}
