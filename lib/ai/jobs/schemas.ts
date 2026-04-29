import { z } from "zod"

// =========================================================
// AI Agent Job Contracts — Zod Schema Definitions
//
// כל סוכן AI חיצוני שמתחבר ל-/api/erp/ai/jobs חייב לשלוח
// payload תואם לסכמה של ה-type שלו.
// ה-result שמוחזר ב-ai_jobs.result חייב לתאם ל-ResultSchema.
// =========================================================

// ─────────────────────────────────────────────
// תרחיש 1: gantt_risk_analysis
// זיהוי עיכובים ואיומים על הנתיב הקריטי של הגאנט
// ─────────────────────────────────────────────

/** חומרת הסיכון */
export const RiskSeveritySchema = z.enum(["low", "medium", "high", "critical"])
export type RiskSeverity = z.infer<typeof RiskSeveritySchema>

/** משימה בסיכון — חלק מתוצאת ניתוח הגאנט */
export const GanttTaskAtRiskSchema = z.object({
  task_id: z.string().uuid(),
  task_name: z.string(),
  /** עיכוב חזוי בימי עבודה */
  projected_delay_days: z.number().int().min(0),
  /** מה גורם לעיכוב */
  root_cause: z.string(),
  /** האם המשימה נמצאת על הנתיב הקריטי */
  is_on_critical_path: z.boolean(),
  severity: RiskSeveritySchema,
  /** פעולות המלצות לצמצום הסיכון */
  mitigation_actions: z.array(z.string()).default([]),
})
export type GanttTaskAtRisk = z.infer<typeof GanttTaskAtRiskSchema>

/** Payload שהסוכן שולח בבקשת Job */
export const GanttRiskAnalysisPayloadSchema = z.object({
  project_id: z.string().uuid(),
  /** תאריך ניתוח (ISO 8601) */
  analysis_date: z.string().datetime({ offset: true }).optional(),
  /** רמת חומרה מינימלית לדיווח (ברירת מחדל: medium) */
  min_severity: RiskSeveritySchema.default("medium"),
  /** אם true — כולל גם משימות שאינן על הנתיב הקריטי */
  include_non_critical: z.boolean().default(false),
})
export type GanttRiskAnalysisPayload = z.infer<typeof GanttRiskAnalysisPayloadSchema>

/** Result שהworker יכתוב ל-ai_jobs.result */
export const GanttRiskAnalysisResultSchema = z.object({
  project_id: z.string().uuid(),
  analyzed_at: z.string().datetime({ offset: true }),
  total_tasks_analyzed: z.number().int().min(0),
  tasks_at_risk: z.array(GanttTaskAtRiskSchema),
  /** ציון בריאות כולל של הפרויקט (0–100) */
  project_health_score: z.number().min(0).max(100),
  /** סיכום טקסטואלי בעברית */
  executive_summary_he: z.string(),
  /** המלצה עיקרית אחת */
  top_recommendation: z.string().optional(),
})
export type GanttRiskAnalysisResult = z.infer<typeof GanttRiskAnalysisResultSchema>

// ─────────────────────────────────────────────
// תרחיש 2: contractor_evaluation
// ניתוח בריאות פיננסית וביצועית של קבלן משנה
// ─────────────────────────────────────────────

/** סטטוס בריאות תזרים */
export const CashFlowStatusSchema = z.enum([
  "healthy",
  "watch",        // מגמה מדאיגה אך עדיין יציב
  "at_risk",      // דרושה התערבות
  "critical",     // סכנה ממשית לנתיב הקריטי
])
export type CashFlowStatus = z.infer<typeof CashFlowStatusSchema>

/** מדד ביצועי יחיד */
export const PerformanceMetricSchema = z.object({
  metric: z.string(),
  value: z.number(),
  benchmark: z.number().optional(),
  unit: z.string().optional(),
  trend: z.enum(["improving", "stable", "declining"]).optional(),
})
export type PerformanceMetric = z.infer<typeof PerformanceMetricSchema>

/** Payload שהסוכן שולח בבקשת Job */
export const ContractorEvaluationPayloadSchema = z.object({
  subcontractor_id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  /** תקופת הניתוח */
  period_start: z.string().datetime({ offset: true }).optional(),
  period_end: z.string().datetime({ offset: true }).optional(),
  /** אם true — מכלול כל הפרויקטים שבהם הקבלן עובד */
  cross_project: z.boolean().default(false),
})
export type ContractorEvaluationPayload = z.infer<typeof ContractorEvaluationPayloadSchema>

/** Result שהworker יכתוב ל-ai_jobs.result */
export const ContractorEvaluationResultSchema = z.object({
  subcontractor_id: z.string().uuid(),
  subcontractor_name: z.string(),
  evaluated_at: z.string().datetime({ offset: true }),
  cash_flow_status: CashFlowStatusSchema,
  /** יתרת חשבוניות פתוחות בש"ח */
  outstanding_invoices_ils: z.number().min(0),
  /** ממוצע ימי איחור בקבלת תשלום */
  avg_payment_delay_days: z.number().min(0),
  performance_metrics: z.array(PerformanceMetricSchema).default([]),
  /** אחוז עמידה בלוחות זמנים (0–100) */
  schedule_adherence_pct: z.number().min(0).max(100),
  /** האם הקבלן מסכן את הנתיב הקריטי */
  threatens_critical_path: z.boolean(),
  /** פעולות מומלצות (ממוינות לפי דחיפות) */
  recommended_interventions: z.array(
    z.object({
      action: z.string(),
      urgency: z.enum(["immediate", "within_week", "monitor"]),
      estimated_impact: z.string().optional(),
    })
  ).default([]),
  /** סיכום בעברית */
  summary_he: z.string(),
})
export type ContractorEvaluationResult = z.infer<typeof ContractorEvaluationResultSchema>

// ─────────────────────────────────────────────
// Union — כל סוגי ה-Jobs המוכרים
// ─────────────────────────────────────────────

export const AI_JOB_TYPE = {
  GANTT_RISK: "gantt_risk_analysis",
  CONTRACTOR_EVAL: "contractor_evaluation",
} as const

export type AiJobType = (typeof AI_JOB_TYPE)[keyof typeof AI_JOB_TYPE]

/** מפת payload schemas לפי type */
export const AI_JOB_PAYLOAD_SCHEMAS = {
  [AI_JOB_TYPE.GANTT_RISK]: GanttRiskAnalysisPayloadSchema,
  [AI_JOB_TYPE.CONTRACTOR_EVAL]: ContractorEvaluationPayloadSchema,
} as const

/** מפת result schemas לפי type */
export const AI_JOB_RESULT_SCHEMAS = {
  [AI_JOB_TYPE.GANTT_RISK]: GanttRiskAnalysisResultSchema,
  [AI_JOB_TYPE.CONTRACTOR_EVAL]: ContractorEvaluationResultSchema,
} as const

/** בדיקת payload לפי type */
export function validateAiJobPayload(
  type: string,
  payload: unknown
):
  | { ok: true; data: GanttRiskAnalysisPayload | ContractorEvaluationPayload }
  | { ok: false; errors: z.ZodIssue[] } {
  const schema = AI_JOB_PAYLOAD_SCHEMAS[type as AiJobType]
  if (!schema) {
    return {
      ok: false,
      errors: [
        {
          code: z.ZodIssueCode.custom,
          message: `Unknown job type: ${type}`,
          path: ["type"],
        },
      ],
    }
  }
  const result = schema.safeParse(payload)
  if (!result.success) return { ok: false, errors: result.error.issues }
  return { ok: true, data: result.data as GanttRiskAnalysisPayload | ContractorEvaluationPayload }
}
