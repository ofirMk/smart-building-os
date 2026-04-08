/**
 * Diamond Standard V1.0 — automated alert / agent orchestration (server-safe, no I/O here).
 * Wire cron jobs, webhooks, or `generateObject` calls to these pure functions for consistent behavior.
 */

import { buildProjectWallClassificationPrompt } from "@/lib/ai/prompts"

/** Mirrors `public.project_wall_ai_category` — keep aligned with DB enum. */
export type ProjectWallAiCategory = "technical" | "safety" | "delay" | "finance"

export type AlertSeverity = "info" | "warning" | "critical"

export type ProjectSignalKind =
  | "schedule_slip"
  | "budget_overrun"
  | "safety_incident"
  | "document_gap"
  | "custom"

export type AgentAlertSignal = {
  kind: ProjectSignalKind
  severity: AlertSeverity
  projectId: string | null
  titleHe: string
  detailHe: string
  suggestedActionsHe: string[]
  /** Optional correlation for deduplication */
  dedupeKey?: string
}

/**
 * Normalize raw inputs (metrics, log lines) into a prompt bundle for LLM or rules engine.
 * The model route is implemented elsewhere; this stays deterministic and testable.
 */
export function buildAlertEvaluationContext(input: {
  source: string
  projectId: string | null
  payloadSummary: string
}): string {
  return [
    `source=${input.source}`,
    input.projectId ? `project_id=${input.projectId}` : "project_id=unknown",
    "",
    input.payloadSummary,
  ].join("\n")
}

/**
 * Reuse the same classification framing as project wall posts for cross-module consistency.
 */
export function buildSharedClassificationUserPrompt(block: string): string {
  return buildProjectWallClassificationPrompt(block.trim())
}

/**
 * Placeholder ranking: deterministic severity from keywords (extend with DB thresholds later).
 */
export function severityFromKeywords(text: string): AlertSeverity {
  const t = text.toLowerCase()
  if (/חירום|קריטי|עצירת|נפילה|התמוטטות|אסון/i.test(t)) return "critical"
  if (/חריג|עיכוב|סיכון|עצירה|ליקוי|אזהרה/i.test(t)) return "warning"
  return "info"
}

/**
 * Deterministic triage when the LLM is unavailable — Hebrew + English cues from the field.
 */
export function classifyProjectWallCategoryFromKeywords(text: string): ProjectWallAiCategory {
  const t = text.toLowerCase()
  if (/בטיחות|safety|ppe|נפילה|הרחקה|תאונה|incident|permit/i.test(t)) return "safety"
  if (/עיכוב|delay|לוח\s*זמנים|מועד|איחור|critical\s*path|schedule\s*slip/i.test(t)) return "delay"
  if (
    /חיוב\s*חוזר|back[\s-]*charge|קיזוז|תשלום|חשבונית|תקציב|כספים|invoice|budget|variation/i.test(
      t
    )
  )
    return "finance"
  return "technical"
}
