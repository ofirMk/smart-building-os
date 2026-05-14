"use server"

/**
 * Latest-document resolver for the centralized Pitch Lobby print buttons.
 *
 * Each operational print template lives under `/print/<kind>/<id>`. When the
 * lobby has no specific record in hand (one-click demo), it needs to resolve
 * the MOST RECENTLY CREATED row of that kind — and fall back to a deterministic
 * seed UUID when the DB is empty (demo environment, fresh tenant, etc).
 *
 * All queries are cheap single-row `order(created_at desc).limit(1)` selects
 * with RLS applied from the authenticated server client.
 */

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import {
  DEMO_AP_PAYMENT_RUN_ID,
  DEMO_BANK_RECONCILIATION_ID,
  DEMO_PURCHASE_ORDER_ID,
  DEMO_SUBCONTRACTOR_BILL_ID,
  DEMO_SUBCONTRACTOR_CONTRACT_ID,
} from "@/types/erp"

// ---------------------------------------------------------------------------
// Kinds — each one maps 1:1 to an `/print/<kind>/[id]` route segment.
// ---------------------------------------------------------------------------

export type PrintDocumentKind =
  | "contracts"
  | "purchase-orders"
  | "bills" // subcontractor partial bill
  | "client-bills" // client (owner) partial bill
  | "bank-reconciliations"
  | "payment-runs"
  | "tax-invoices" // חשבונית מס — canonical T7 entity

export type ResolvedPrintTarget = {
  /** The `/print/<kind>/<id>` URL the caller should open. */
  href: string
  /** True when we had to fall back to a hardcoded seed UUID. */
  isMockFallback: boolean
  /** Human-readable display label for the resolved record (e.g. bill number). */
  label: string
}

/**
 * Deterministic fallback UUIDs — used when the DB is empty. Mirrors the
 * constants already exported from `@/types/erp` for the investor command
 * center so legacy behaviour is preserved.
 */
const MOCK_FALLBACK_ID: Record<PrintDocumentKind, string> = {
  contracts: DEMO_SUBCONTRACTOR_CONTRACT_ID,
  "purchase-orders": DEMO_PURCHASE_ORDER_ID,
  bills: DEMO_SUBCONTRACTOR_BILL_ID,
  // NEW — no dedicated demo constant existed; reuse the subcontractor one so
  // the PDF page at least renders something. Callers may override this when a
  // real client-bill UUID is available.
  "client-bills": DEMO_SUBCONTRACTOR_BILL_ID,
  "bank-reconciliations": DEMO_BANK_RECONCILIATION_ID,
  "payment-runs": DEMO_AP_PAYMENT_RUN_ID,
  // No dedicated tax-invoice seed yet — fall back to a zero UUID so the
  // print template renders "לא נמצאה" gracefully in an empty tenant.
  "tax-invoices": "00000000-0000-0000-0000-000000000000",
}

/**
 * Short Hebrew label shown in the button text / toast when a live record was
 * resolved (vs a mock fallback).
 */
const KIND_LABEL_HE: Record<PrintDocumentKind, string> = {
  contracts: "חוזה קבלן משנה",
  "purchase-orders": "הזמנת רכש",
  bills: "חשבון קבלן משנה חלקי",
  "client-bills": "חשבון חלקי למזמין",
  "bank-reconciliations": "דוח התאמת בנק",
  "payment-runs": "דוח מסב + תשלומים",
  "tax-invoices": "חשבונית מס",
}

// ---------------------------------------------------------------------------
// Table mapping — each kind lists the table + id column to pull the latest id.
// ---------------------------------------------------------------------------

type LatestLookup = {
  table: string
  idCol: string
  orderCol: string
  labelCol?: string
}

const TABLE_LOOKUP: Record<PrintDocumentKind, LatestLookup> = {
  contracts: {
    table: "erp_subcontractor_contracts",
    idCol: "id",
    orderCol: "created_at",
    labelCol: "contract_number",
  },
  "purchase-orders": {
    table: "erp_purchase_orders",
    idCol: "id",
    orderCol: "created_at",
    labelCol: "po_number",
  },
  bills: {
    table: "erp_subcontractor_bills",
    idCol: "id",
    orderCol: "created_at",
    labelCol: "bill_number",
  },
  "client-bills": {
    table: "erp_client_progress_bills",
    idCol: "id",
    orderCol: "created_at",
    labelCol: "bill_number",
  },
  "bank-reconciliations": {
    table: "erp_bank_reconciliations",
    idCol: "id",
    orderCol: "created_at",
    labelCol: "period_yyyymm",
  },
  "payment-runs": {
    table: "erp_ap_payment_runs",
    idCol: "id",
    orderCol: "created_at",
    labelCol: "run_number",
  },
  "tax-invoices": {
    table: "erp_tax_invoices",
    idCol: "id",
    orderCol: "issue_date",
    labelCol: "invoice_number_label",
  },
}

// ---------------------------------------------------------------------------
// Server action
// ---------------------------------------------------------------------------

/**
 * Resolve the latest record of `kind` for the active Supabase session. If the
 * DB is empty (fresh install / demo tenant) OR the query fails, fall back to
 * the hardcoded seed UUID so the button ALWAYS opens a valid print route.
 */
export async function fetchLatestPrintTargetAction(
  kind: PrintDocumentKind,
): Promise<ResolvedPrintTarget> {
  const lookup = TABLE_LOOKUP[kind]
  const baseLabel = KIND_LABEL_HE[kind]

  try {
    const supabase = await createSupabaseServerAuthClient()
    const selectCols = lookup.labelCol
      ? `${lookup.idCol}, ${lookup.labelCol}`
      : lookup.idCol
    const { data, error } = await supabase
      .from(lookup.table)
      .select(selectCols)
      .order(lookup.orderCol, { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) {
      return fallback(kind, baseLabel)
    }

    const row = data as unknown as Record<string, unknown>
    const idVal = row[lookup.idCol]
    if (typeof idVal !== "string" || idVal.length === 0) {
      return fallback(kind, baseLabel)
    }

    const labelVal = lookup.labelCol ? row[lookup.labelCol] : undefined
    const labelSuffix =
      typeof labelVal === "string" && labelVal.length > 0
        ? ` · ${labelVal}`
        : typeof labelVal === "number"
          ? ` · #${labelVal}`
          : ""

    return {
      href: `/print/${kind}/${idVal}`,
      isMockFallback: false,
      label: `${baseLabel}${labelSuffix}`,
    }
  } catch {
    return fallback(kind, baseLabel)
  }
}

function fallback(kind: PrintDocumentKind, baseLabel: string): ResolvedPrintTarget {
  return {
    href: `/print/${kind}/${MOCK_FALLBACK_ID[kind]}`,
    isMockFallback: true,
    label: `${baseLabel} · דמו`,
  }
}
