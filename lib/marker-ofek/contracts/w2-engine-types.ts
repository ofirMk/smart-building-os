/**
 * Sprint W2 — MedaTech Contracts Engine type definitions.
 *
 * Spec source: docs/ingested-specs/medatech-contracts-module.md (Chapter 3).
 * Migration: supabase/migrations/20260911100000_w2_contracts_engine_foundation.sql.
 *
 * These types are the single source of truth for the contracts engine UI
 * (workspace, waterfall, breakdown ribbons). They mirror the SQL enum values
 * exactly — keep the enums in sync if the migration evolves.
 */

export type PricingMethod = "BOQ" | "LUMP_SUM" | "COST_PLUS"

export type AdvanceRecoveryMethod =
  | "PROPORTIONAL"
  | "FIXED_AMOUNT"
  | "FIXED_PCT"

export type BillEntryMode = "DETAILED" | "AGGREGATE"

export type RawMaterialOffsetTrigger =
  | "PURCHASE_ORDER"
  | "GOODS_RECEIPT"
  | "VENDOR_INVOICE"

export type RawMaterialOffsetSource =
  | "PURCHASE_ORDER"
  | "GOODS_RECEIPT"
  | "VENDOR_INVOICE"
  | "MANUAL"

export type WaterfallSummary = {
  bill_id: string
  cumulative_executed: number
  escalation: number
  retention_this_bill: number
  insurance_this_bill: number
  advance_recovery: number
  raw_material_offset: number
  raw_material_commission: number
  previous_billed: number
  amount_to_pay: number
  vat: number
  grand_total: number
  computed_at: string
  pricing_method: PricingMethod
}

export type WaterfallStep = {
  id: string
  label: string
  hebrewLabel: string
  /** Positive = increases payable; negative = deduction. */
  amount: number
  /** Reference to MedaTech spec section. */
  specRef: string
  tone: "positive" | "negative" | "neutral" | "total"
}

/**
 * Build a 10-step waterfall narrative from the RPC summary. Used by the UI
 * canvas to render the cascade visually.
 */
export function buildWaterfallSteps(s: WaterfallSummary): WaterfallStep[] {
  return [
    {
      id: "cumulative_executed",
      label: "Cumulative executed",
      hebrewLabel: "מצטבר מבוצע",
      amount: s.cumulative_executed,
      specRef: "§3.2.2",
      tone: "positive",
    },
    {
      id: "escalation",
      label: "+ Escalation",
      hebrewLabel: "+ הצמדה",
      amount: s.escalation,
      specRef: "§3.2.1 הצמדה",
      tone: "positive",
    },
    {
      id: "retention",
      label: "− Retention (this bill)",
      hebrewLabel: "− עכבון (חשבון זה)",
      amount: -s.retention_this_bill,
      specRef: "§3.2.1 עכבון",
      tone: "negative",
    },
    {
      id: "insurance",
      label: "− Insurance",
      hebrewLabel: "− ביטוח",
      amount: -s.insurance_this_bill,
      specRef: "§3.2.1 קיזוזים",
      tone: "negative",
    },
    {
      id: "advance",
      label: "− Advance recovery",
      hebrewLabel: "− החזר מקדמה",
      amount: -s.advance_recovery,
      specRef: "§3.2.1 מקדמה",
      tone: "negative",
    },
    {
      id: "rm_offset",
      label: "− Raw-material offset",
      hebrewLabel: "− קיזוז חומר גלם",
      amount: -s.raw_material_offset,
      specRef: "§3.3",
      tone: "negative",
    },
    {
      id: "rm_commission",
      label: "− Procurement commission",
      hebrewLabel: "− עמלת רכש",
      amount: -s.raw_material_commission,
      specRef: "§3.3 commission",
      tone: "negative",
    },
    {
      id: "previous_billed",
      label: "− Previous billed",
      hebrewLabel: "− שולם בחשבונות קודמים",
      amount: -s.previous_billed,
      specRef: "§3.2.2 (cumulative)",
      tone: "negative",
    },
    {
      id: "amount_to_pay",
      label: "Amount to pay (pre-VAT)",
      hebrewLabel: "סכום לתשלום (לפני מע״מ)",
      amount: s.amount_to_pay,
      specRef: "§3.2.2",
      tone: "total",
    },
    {
      id: "vat",
      label: "+ VAT",
      hebrewLabel: "+ מע״מ",
      amount: s.vat,
      specRef: "§3.2.3 (חשבונית)",
      tone: "positive",
    },
    {
      id: "grand_total",
      label: "Grand total",
      hebrewLabel: "סה״כ כולל מע״מ",
      amount: s.grand_total,
      specRef: "§3.2.3",
      tone: "total",
    },
  ]
}
