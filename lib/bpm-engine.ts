/**
 * Holden ERP — BPM state machine for financial documents (partial accounts / subcontractor bills).
 * Maps UI/BPM labels to persisted `mo_partial_account_status` where applicable.
 */

export const BPM_PARTIAL_ACCOUNT_STATES = [
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "paid",
] as const

export type BpmPartialAccountState = (typeof BPM_PARTIAL_ACCOUNT_STATES)[number]

/** Persisted enum on `partial_accounts.status` (Supabase). */
export type DbPartialAccountStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "sent"
  | "paid"

export function dbStatusToBpm(status: DbPartialAccountStatus): BpmPartialAccountState {
  if (status === "submitted") return "pending_approval"
  return status as BpmPartialAccountState
}

export function bpmStatusToDb(bpm: BpmPartialAccountState): DbPartialAccountStatus {
  if (bpm === "pending_approval") return "submitted"
  return bpm as DbPartialAccountStatus
}

/** Allowed single-step transitions (forward / controlled return). */
const EDGES: ReadonlyArray<[BpmPartialAccountState, BpmPartialAccountState]> = [
  ["draft", "pending_approval"],
  ["pending_approval", "approved"],
  ["pending_approval", "draft"],
  ["approved", "sent"],
  ["sent", "paid"],
  ["approved", "pending_approval"],
]

const EDGE_SET = new Set(EDGES.map(([a, b]) => `${a}->${b}`))

export function canTransitionPartialAccount(
  from: BpmPartialAccountState,
  to: BpmPartialAccountState
): boolean {
  if (from === to) return true
  return EDGE_SET.has(`${from}->${to}`)
}

export function assertTransitionOrder(
  from: BpmPartialAccountState,
  to: BpmPartialAccountState
): { ok: true } | { ok: false; error: string } {
  if (!canTransitionPartialAccount(from, to)) {
    return {
      ok: false,
      error: `מעבר סטטוס לא חוקי: ${from} → ${to}`,
    }
  }
  return { ok: true }
}

/**
 * אישור חשבון חלקי מותר רק אם אין חריגה מכמות/אחוז כתב כמויות ללא הוראת שינוי מאושרת.
 * מודל V1: `quantity_current` הוא אחוז ביצוע מצטבר 0–100 לשורה; מעל 100% דורש VO מאושר.
 */
export function validatePartialAccountApprovalAgainstBoq(input: {
  lineCumulativePercents: number[]
  hasApprovedChangeOrder: boolean
}): { ok: true } | { ok: false; error: string } {
  for (let i = 0; i < input.lineCumulativePercents.length; i++) {
    const p = Number(input.lineCumulativePercents[i])
    if (!Number.isFinite(p) || p < 0) {
      return { ok: false, error: `שורה ${i + 1}: אחוז ביצוע לא חוקי` }
    }
    if (p > 100 && !input.hasApprovedChangeOrder) {
      return {
        ok: false,
        error:
          "לא ניתן לאשר: אחוז ביצוע מצטבר חורג מ־100% ללא הוראת שינוי (VO) מאושרת בחוזה",
      }
    }
  }
  return { ok: true }
}

/** עיכבון ברירת מחדל 5% — ערך אחוז לשימוש ב-contract_deduction_rules / חישובים */
export const DEFAULT_RETAINAGE_PERCENT = 5
