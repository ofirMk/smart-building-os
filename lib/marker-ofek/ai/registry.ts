/**
 * מפתחות מודול עליון ל-AI — תואם מבנה המוצר (רכש, מכרזים, פרויקטים, …).
 */
export const AI_MODULES = {
  procurement: "procurement",
  tenders: "tenders",
  projects: "projects",
  billing: "billing",
  finance: "finance",
  meetings: "meetings",
} as const

export type AiModuleId = (typeof AI_MODULES)[keyof typeof AI_MODULES]

export const AI_ACTION_KINDS = {
  planVsWbs: "plan_vs_wbs",
  invoiceVsPo: "invoice_vs_po",
  meetingMinutes: "meeting_minutes",
  takeoffBoq: "takeoff_boq",
} as const

export type AiActionKind =
  (typeof AI_ACTION_KINDS)[keyof typeof AI_ACTION_KINDS]

/**
 * מפת עתידי AI לפי מודול הורה — נקודת כניסה אחת לצוותים ולעוזר.
 * רכש: סריקת חשבונית↔PO; מכרזים: טייקאוף; ישיבות: תמלול ופרוטוקול.
 */
export const AI_FEATURE_ENTRY_BY_MODULE: Record<
  AiModuleId,
  readonly { actionKind: AiActionKind | string; entry: string; label: string }[]
> = {
  procurement: [
    {
      actionKind: AI_ACTION_KINDS.invoiceVsPo,
      entry: "lib/marker-ofek/ai/procurement/invoice-po-actions",
      label: "Invoice-to-PO Scanner",
    },
  ],
  tenders: [
    {
      actionKind: AI_ACTION_KINDS.takeoffBoq,
      entry: "lib/marker-ofek/ai/tenders/takeoff-actions",
      label: "AI Takeoff (BoQ / תוכניות)",
    },
  ],
  meetings: [
    {
      actionKind: AI_ACTION_KINDS.meetingMinutes,
      entry: "lib/marker-ofek/ai/meetings/meeting-intel-actions",
      label: "Transcription & Minutes",
    },
  ],
  projects: [
    {
      actionKind: AI_ACTION_KINDS.planVsWbs,
      entry: "lib/marker-ofek/ai/projects/plan-vs-wbs-actions",
      label: "Plan vs WBS",
    },
  ],
  billing: [],
  finance: [],
}
