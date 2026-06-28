/**
 * PO State Machine — lib/procurement/po-state-machine.ts
 *
 * הגדרת מעברי הסטטוס החוקיים לכל שלב של הזמנת רכש (`erp_purchase_orders`),
 * וולידציה בצד TypeScript לפני הקריאה ל-Supabase.
 *
 * ── Priority-aligned status flow ─────────────────────────────────────────────
 *
 *   DRAFT ──────────────────────────────────────────────────────► CANCELLED
 *     │                                                             ▲   ▲
 *     ▼ SUBMIT                                                      │   │
 *   PENDING_APPROVAL ──────────────────────────────────────────────►│   │
 *     │  │  ▲                                                       │   │
 *     │  │  └─ REVERT ─────────────────────────────────────────────────┤ (back to DRAFT)
 *     │  └──── PROFORMA ──────────────────────────────────────────────►│ (cancel path)
 *     ▼ APPROVE                                                     │   │
 *   APPROVED ───────────────────────────────────────────────────────►   │
 *     │                                                                 │
 *     ▼ SEND                                                            │
 *   SENT_TO_SUPPLIER ──────────────────────────────────────────────────►│
 *     │                                                                 │
 *     ▼ CONFIRM_SHIPMENT                                                │
 *   SHIPMENT_CONFIRMED                                                  │
 *     │                                                                 │
 *     ▼ SHIP                                                            │
 *   ON_SHIP                                                             │
 *     │                                                                 │
 *     ▼ RECEIVE_PARTIAL                                                 │
 *   PARTIALLY_RECEIVED                                                  │
 *     │                                                                 │
 *     ▼ RECEIVE_FULL  (also from SENT_TO_SUPPLIER / ON_SHIP)            │
 *   FULLY_RECEIVED                                                      │
 *     │                                                                 │
 *     ▼ CLOSE                                                           │
 *   CLOSED ◄── REOPEN ── REOPENED                                       │
 *                                                                       │
 *   Any open status ──────────────────────────────────────────────────►CANCELLED
 *
 * DB ENUM: erp_purchase_order_status
 *   DRAFT | PENDING_APPROVAL | APPROVED | PROFORMA |
 *   SENT_TO_SUPPLIER | SENT (legacy) | SHIPMENT_CONFIRMED | ON_SHIP |
 *   PARTIALLY_RECEIVED | FULLY_RECEIVED | CLOSED | REOPENED | CANCELLED |
 *   PENDING_PRICE_APPROVAL (legacy)
 */

import type { SupabaseClient } from "@supabase/supabase-js"

// ─────────────────────────────────────────────
// Types (מקושרים ל-types/erp.ts)
// ─────────────────────────────────────────────

/** סטטוסים Priority-aligned (canonical). legacy = SENT, PENDING_PRICE_APPROVAL */
export type POStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "PROFORMA"
  | "SENT_TO_SUPPLIER"
  | "SENT"                   // legacy alias for SENT_TO_SUPPLIER
  | "SHIPMENT_CONFIRMED"
  | "ON_SHIP"
  | "PARTIALLY_RECEIVED"
  | "FULLY_RECEIVED"
  | "CLOSED"
  | "REOPENED"
  | "CANCELLED"
  | "PENDING_PRICE_APPROVAL" // legacy alias

/** קיצור לסטטוסים "פתוחים" (ניתנים לביטול) */
const OPEN_STATUSES: POStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "PROFORMA",
  "SENT_TO_SUPPLIER",
  "SENT",
  "SHIPMENT_CONFIRMED",
  "ON_SHIP",
  "PARTIALLY_RECEIVED",
  "REOPENED",
]

export type POTransition =
  // ── submission & approval ─────────────────────────────
  | "SUBMIT"            // DRAFT → PENDING_APPROVAL
  | "APPROVE"           // PENDING_APPROVAL → APPROVED
  | "REVERT"            // PENDING_APPROVAL → DRAFT
  // ── shipping path ────────────────────────────────────
  | "PROFORMA"          // PENDING_APPROVAL|APPROVED → PROFORMA
  | "SEND"              // APPROVED|PROFORMA → SENT_TO_SUPPLIER
  | "CONFIRM_SHIPMENT"  // SENT_TO_SUPPLIER → SHIPMENT_CONFIRMED
  | "SHIP"              // SHIPMENT_CONFIRMED → ON_SHIP
  // ── receiving ────────────────────────────────────────
  | "RECEIVE_PARTIAL"   // SENT_TO_SUPPLIER|SHIPMENT_CONFIRMED|ON_SHIP → PARTIALLY_RECEIVED
  | "RECEIVE_FULL"      // PARTIALLY_RECEIVED|SENT_TO_SUPPLIER|SHIPMENT_CONFIRMED|ON_SHIP → FULLY_RECEIVED
  // ── close / reopen ───────────────────────────────────
  | "CLOSE"             // FULLY_RECEIVED|ON_SHIP|SENT_TO_SUPPLIER → CLOSED
  | "REOPEN"            // CLOSED → REOPENED
  | "RESTORE"           // REOPENED → APPROVED (פתיחה חוזרת מחזירה לאושרה)
  // ── cancel ───────────────────────────────────────────
  | "CANCEL"            // כל סטטוס פתוח → CANCELLED

export type POTransitionResult =
  | { ok: true; newStatus: POStatus }
  | { ok: false; error: string }

// ─────────────────────────────────────────────
// Transition table
// ─────────────────────────────────────────────

type TransitionRule = {
  from: POStatus[]
  to: POStatus
  labelHe: string
}

const TRANSITION_RULES: Record<POTransition, TransitionRule> = {
  SUBMIT:           { from: ["DRAFT"],                                                                              to: "PENDING_APPROVAL",   labelHe: "שלח לאישור" },
  APPROVE:          { from: ["PENDING_APPROVAL"],                                                                   to: "APPROVED",           labelHe: "אשר הזמנה" },
  REVERT:           { from: ["PENDING_APPROVAL"],                                                                   to: "DRAFT",              labelHe: "החזר לטיוטה" },
  PROFORMA:         { from: ["PENDING_APPROVAL", "APPROVED"],                                                       to: "PROFORMA",           labelHe: "פרופורמה" },
  SEND:             { from: ["APPROVED", "PROFORMA"],                                                               to: "SENT_TO_SUPPLIER",   labelHe: "שלח לספק" },
  CONFIRM_SHIPMENT: { from: ["SENT_TO_SUPPLIER", "SENT"],                                                          to: "SHIPMENT_CONFIRMED", labelHe: "אשר משלוח" },
  SHIP:             { from: ["SHIPMENT_CONFIRMED"],                                                                 to: "ON_SHIP",            labelHe: "בדרך (באוניה)" },
  RECEIVE_PARTIAL:  { from: ["SENT_TO_SUPPLIER", "SENT", "SHIPMENT_CONFIRMED", "ON_SHIP"],                         to: "PARTIALLY_RECEIVED", labelHe: "קבל חלקית" },
  RECEIVE_FULL:     { from: ["PARTIALLY_RECEIVED", "SENT_TO_SUPPLIER", "SENT", "SHIPMENT_CONFIRMED", "ON_SHIP"],   to: "FULLY_RECEIVED",     labelHe: "קבל מלא" },
  CLOSE:            { from: ["FULLY_RECEIVED", "ON_SHIP", "SENT_TO_SUPPLIER", "SENT", "PARTIALLY_RECEIVED"],       to: "CLOSED",             labelHe: "סגור הזמנה" },
  REOPEN:           { from: ["CLOSED"],                                                                             to: "REOPENED",           labelHe: "פתח מחדש" },
  RESTORE:          { from: ["REOPENED"],                                                                           to: "APPROVED",           labelHe: "שחזר לאושרה" },
  CANCEL:           { from: OPEN_STATUSES,                                                                          to: "CANCELLED",          labelHe: "בטל הזמנה" },
}

// ─────────────────────────────────────────────
// Guards (pure helpers)
// ─────────────────────────────────────────────

/**
 * מחזיר את רשימת המעברים החוקיים מסטטוס נתון.
 */
export function getAvailableTransitions(status: POStatus): POTransition[] {
  return (Object.entries(TRANSITION_RULES) as [POTransition, TransitionRule][])
    .filter(([, rule]) => rule.from.includes(status))
    .map(([transition]) => transition)
}

/**
 * מחזיר label בעברית למעבר.
 */
export function getTransitionLabel(transition: POTransition): string {
  return TRANSITION_RULES[transition].labelHe
}

/**
 * בדיקה טהורה — האם המעבר חוקי מסטטוס נתון?
 */
export function isTransitionAllowed(
  currentStatus: POStatus,
  transition: POTransition
): boolean {
  return TRANSITION_RULES[transition].from.includes(currentStatus)
}

/**
 * מחשב את הסטטוס היעד ללא שום I/O.
 * מחזיר שגיאה אם המעבר אינו חוקי.
 */
export function resolveNextStatus(
  currentStatus: POStatus,
  transition: POTransition
): POTransitionResult {
  if (!isTransitionAllowed(currentStatus, transition)) {
    const allowed = TRANSITION_RULES[transition].from.join(", ")
    return {
      ok: false,
      error: `מעבר "${transition}" לא חוקי מסטטוס "${currentStatus}". סטטוסים מותרים: ${allowed}.`,
    }
  }
  return { ok: true, newStatus: TRANSITION_RULES[transition].to }
}

// ─────────────────────────────────────────────
// DB Actions
// ─────────────────────────────────────────────

export type ApplyTransitionParams = {
  supabase: SupabaseClient
  companyId: string
  poId: string
  transition: POTransition
  /** מחייב העברה — לא מסתמך רק על הנחה לגבי הסטטוס הנוכחי. */
  currentStatus: POStatus
  /** מגיב כאשר ה-DB trigger חוסם (APPROVED/SENT guard). */
  notes?: string | null
}

/**
 * מבצע מעבר סטטוס ל-PO ב-Supabase.
 *
 * הפונקציה:
 *  1. מוודאת שהמעבר חוקי בצד TypeScript (fail-fast).
 *  2. כותבת את הסטטוס החדש לשורה המבוקשת.
 *  3. מעדכנת `issued_at` כאשר המעבר הוא ISSUE (→ SENT).
 *
 * ה-DB trigger `erp_purchase_orders_lock_mutation` ו-`erp_po_status_event`
 * יספקו את שכבת ה-audit trail ואת החסימה בצד DB.
 */
export async function applyPOTransition(
  params: ApplyTransitionParams
): Promise<POTransitionResult> {
  const { supabase, companyId, poId, transition, currentStatus, notes } = params

  const resolved = resolveNextStatus(currentStatus, transition)
  if (!resolved.ok) return resolved

  const patch: Record<string, unknown> = {
    status: resolved.newStatus,
    updated_at: new Date().toISOString(),
  }

  if (transition === "SEND") {
    patch.issued_at = new Date().toISOString().split("T")[0]
  }

  if (notes !== undefined && notes !== null) {
    patch.notes = notes
  }

  const { error } = await supabase
    .from("erp_purchase_orders")
    .update(patch)
    .eq("id", poId)
    .eq("company_id", companyId)
    .eq("status", currentStatus) // optimistic lock — prevent races

  if (error) {
    return {
      ok: false,
      error: `DB update failed: ${error.message}`,
    }
  }

  return { ok: true, newStatus: resolved.newStatus }
}

/**
 * קורא את הסטטוס הנוכחי של PO ישירות מה-DB.
 * שימושי ב-server actions שלא מחזיקים cache.
 */
export async function fetchPOStatus(
  supabase: SupabaseClient,
  companyId: string,
  poId: string
): Promise<POStatus | null> {
  const { data, error } = await supabase
    .from("erp_purchase_orders")
    .select("status")
    .eq("id", poId)
    .eq("company_id", companyId)
    .single()

  if (error || !data) return null
  return data.status as POStatus
}
