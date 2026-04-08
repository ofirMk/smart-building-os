/**
 * Holden ERP — תרחיש ביצוע A10 (ביצוע · חיוב · מסירה), ממופה לסטטוסי פרויקט וחשבונות חלקיים.
 *
 * שלב ביצוע פרויקט (PPM) — סדר לוגי; `projects.status` נשאר מקור האמת ב-DB,
 * ואבני דרך ב-`erp_project_wbs`. חשבון חלקי: מנוע BPM קיים ב-`lib/bpm-engine.ts`.
 */

/** שלבי מחזור ביצוע → חיוב → מסירה (A10) */
export const PROJECT_EXECUTION_PIPELINE = [
  "ACTIVE_EXECUTION",
  "FIELD_LOGS_SUBMITTED",
  "PARTIAL_ACCOUNT_GENERATED",
  "FINANCE_APPROVED",
  "PAID",
  "PROJECT_HANDOVER",
] as const

export type ProjectExecutionPhase = (typeof PROJECT_EXECUTION_PIPELINE)[number]

/** תואם ל-`BpmPartialAccountState.approved` / DB `approved` — אישור כספי לפני שליחה */
export const EXECUTION_PHASE_FINANCE_APPROVED = "FINANCE_APPROVED" as const

/**
 * מיפוי גס מ-`projects.status` (Marker Ofek) לשלב תצוגה — להדרכה / דשבורד בלבד.
 */
export function mapProjectStatusToExecutionPhase(
  status: string | null | undefined
): ProjectExecutionPhase | null {
  const s = String(status ?? "")
    .trim()
    .toLowerCase()
  if (!s) return null
  if (s === "planning" || s === "on_hold") return "ACTIVE_EXECUTION"
  if (s === "active") return "ACTIVE_EXECUTION"
  if (s === "completed" || s === "done") return "PROJECT_HANDOVER"
  if (s === "cancelled") return null
  return "ACTIVE_EXECUTION"
}

export function isExecutionPipelinePhase(v: string): v is ProjectExecutionPhase {
  return (PROJECT_EXECUTION_PIPELINE as readonly string[]).includes(v)
}
