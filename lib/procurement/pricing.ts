/**
 * Procurement — Smart Pricing helpers (Phase 7.5)
 *
 * עוטף את ה-RPC functions `erp_compute_price_suggestions` ו-
 * `erp_compute_line_deviation` מהמיגרציה `20260801160000_smart_pricing_engine.sql`.
 *
 * הקבצים האלה הם stateless וניתנים לקריאה הן מ-Next.js (server routes)
 * והן מסוכני Python דרך Supabase RPC (service-role). זוהי נקודת הכניסה
 * היחידה של שכבת הפריסינג — לא לדלג ולקרוא ישירות ל-RPC במקומות אחרים.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type PriceSuggestionSource =
  | "SUPPLIER_PRICELIST"
  | "LAST_PURCHASE"
  | "BEST_OFFER_CROSS"

export type PriceSuggestion = {
  source: PriceSuggestionSource
  supplierId: string
  supplierName: string
  unitPrice: number
  currency: string
  effectiveFrom: string | null
  leadTimeDays: number | null
  poNumber: string | null
  confidence: number
}

export type PriceSuggestionsResult = {
  suggestions: PriceSuggestion[]
  bestAlternative: PriceSuggestion | null
  windowDays: number
}

export type LineDeviation = {
  lowestAltPrice: number | null
  lowestAltSupplierId: string | null
  lowestAltLeadTime: number | null
  deviationPct: number | null
  requiresEscalation: boolean
  exceptionApplied: boolean
  thresholdPct: number
}

// ─────────────────────────────────────────────
// RPC row shapes (snake_case from Postgres)
// ─────────────────────────────────────────────

type SuggestionRow = {
  source: PriceSuggestionSource
  supplier_id: string
  supplier_name: string
  unit_price: number | string
  currency: string
  effective_from: string | null
  lead_time_days: number | null
  po_number: string | null
  confidence: number | string
}

type DeviationRow = {
  lowest_alt_price: number | string | null
  lowest_alt_supplier_id: string | null
  lowest_alt_lead_time: number | null
  deviation_pct: number | string | null
  requires_escalation: boolean
  exception_applied: boolean
  threshold_pct: number | string
}

// ─────────────────────────────────────────────
// API
// ─────────────────────────────────────────────

export async function getPriceSuggestions(
  supabase: SupabaseClient,
  params: {
    companyId: string
    masterItemId: string
    supplierId: string
    quantity?: number
    windowDays?: number
  }
): Promise<PriceSuggestionsResult> {
  const { data, error } = await supabase.rpc("erp_compute_price_suggestions", {
    p_company_id: params.companyId,
    p_master_item_id: params.masterItemId,
    p_supplier_id: params.supplierId,
    p_quantity: params.quantity ?? 1,
    p_window_days: params.windowDays ?? null,
  })

  if (error) throw new Error(`price-suggestions RPC failed: ${error.message}`)

  const rows = (data ?? []) as SuggestionRow[]
  const suggestions: PriceSuggestion[] = rows.map((r) => ({
    source: r.source,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    unitPrice: Number(r.unit_price),
    currency: r.currency,
    effectiveFrom: r.effective_from,
    leadTimeDays: r.lead_time_days,
    poNumber: r.po_number,
    confidence: Number(r.confidence),
  }))

  // bestAlternative = ה-BEST_OFFER_CROSS עם המחיר הנמוך ביותר
  const crossOffers = suggestions.filter((s) => s.source === "BEST_OFFER_CROSS")
  const bestAlternative =
    crossOffers.length > 0
      ? crossOffers.reduce((a, b) => (a.unitPrice <= b.unitPrice ? a : b))
      : null

  return {
    suggestions,
    bestAlternative,
    windowDays: params.windowDays ?? 90,
  }
}

export async function computeLineDeviation(
  supabase: SupabaseClient,
  params: {
    companyId: string
    masterItemId: string
    supplierId: string
    unitPrice: number
    quantity?: number
    projectId?: string | null
  }
): Promise<LineDeviation> {
  const { data, error } = await supabase.rpc("erp_compute_line_deviation", {
    p_company_id: params.companyId,
    p_master_item_id: params.masterItemId,
    p_supplier_id: params.supplierId,
    p_unit_price: params.unitPrice,
    p_quantity: params.quantity ?? 1,
    p_project_id: params.projectId ?? null,
  })

  if (error) throw new Error(`line-deviation RPC failed: ${error.message}`)

  const rows = (data ?? []) as DeviationRow[]
  const row = rows[0]
  if (!row) {
    // ברירת מחדל שמרנית: אין חלופה, לא דורש escalation
    return {
      lowestAltPrice: null,
      lowestAltSupplierId: null,
      lowestAltLeadTime: null,
      deviationPct: null,
      requiresEscalation: false,
      exceptionApplied: false,
      thresholdPct: 3,
    }
  }

  return {
    lowestAltPrice: row.lowest_alt_price != null ? Number(row.lowest_alt_price) : null,
    lowestAltSupplierId: row.lowest_alt_supplier_id,
    lowestAltLeadTime: row.lowest_alt_lead_time,
    deviationPct: row.deviation_pct != null ? Number(row.deviation_pct) : null,
    requiresEscalation: Boolean(row.requires_escalation),
    exceptionApplied: Boolean(row.exception_applied),
    thresholdPct: Number(row.threshold_pct),
  }
}

// ─────────────────────────────────────────────
// Company settings accessor (for PO total threshold)
// ─────────────────────────────────────────────

export type CompanyPricingSettings = {
  maxAllowedLineDeviationPct: number
  maxAllowedPoTotalDeviationPct: number
  crossSupplierPriceWindowDays: number
  urgencyBypassEnabled: boolean
}

export async function getCompanyPricingSettings(
  supabase: SupabaseClient,
  companyId: string
): Promise<CompanyPricingSettings> {
  const { data, error } = await supabase
    .from("erp_md_company_settings")
    .select(
      "max_allowed_line_deviation_pct, max_allowed_po_total_deviation_pct, cross_supplier_price_window_days, urgency_bypass_enabled"
    )
    .eq("company_id", companyId)
    .maybeSingle()

  if (error) throw new Error(`company-settings fetch failed: ${error.message}`)

  // אם לא קיימת רשומה (edge-case, הטריגר auto-create מאכלס אותה) — ברירות מחדל
  return {
    maxAllowedLineDeviationPct: Number(data?.max_allowed_line_deviation_pct ?? 3),
    maxAllowedPoTotalDeviationPct: Number(data?.max_allowed_po_total_deviation_pct ?? 5),
    crossSupplierPriceWindowDays: Number(data?.cross_supplier_price_window_days ?? 90),
    urgencyBypassEnabled: Boolean(data?.urgency_bypass_enabled ?? true),
  }
}
