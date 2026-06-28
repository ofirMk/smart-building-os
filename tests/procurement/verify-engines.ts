/**
 * tests/procurement/verify-engines.ts
 *
 * Verify that the PO State Machine and the 3-Way Match engine are correctly
 * wired to the database logic — without a live Supabase connection.
 *
 * Run:
 *   npx vitest run tests/procurement/verify-engines.ts
 *
 * Coverage:
 *   1. Pure state-machine guard logic (no I/O).
 *   2. applyPOTransition — DRAFT → APPROVED against a mocked Supabase client.
 *   3. resolveInvoiceForPayment — 100% perfect match → READY_FOR_PAYMENT.
 *   4. Negative paths: illegal transitions, cancelled-invoice guard, variance block.
 */

import { describe, it, expect, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  resolveNextStatus,
  isTransitionAllowed,
  getAvailableTransitions,
  applyPOTransition,
} from "@/lib/procurement/po-state-machine"

import {
  canAutoApprove,
  resolveInvoiceForPayment,
  performMatch,
  type MatchSummary,
} from "@/lib/procurement/three-way-match"

// ─────────────────────────────────────────────────────────────────────────────
// Supabase mock factory
//
// Every method in the fluent chain (.from / .update / .eq / .in / .single)
// returns the same "chain" object. The chain is a thenable — awaiting it
// resolves to `tableResult`. `.rpc()` resolves immediately to `rpcResult`.
//
// This mirrors how Supabase's PostgREST client works under the hood and is
// sufficient for unit-testing the TypeScript orchestration layer.
// ─────────────────────────────────────────────────────────────────────────────

type MockResult<T = unknown> = { data?: T; error: null | { message: string } }

function makeChainable<T>(result: MockResult<T>): unknown {
  const handler: ProxyHandler<object> = {
    get(_, prop: string) {
      if (prop === "then") {
        return (
          resolve: (v: MockResult<T>) => unknown,
          reject?: (v: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject)
      }
      if (prop === "catch") {
        return (reject: (v: unknown) => unknown) =>
          Promise.resolve(result).catch(reject)
      }
      // Any other method in the chain (update, eq, in, single, …) returns the same chain.
      return () => makeChainable(result)
    },
  }
  return new Proxy({}, handler)
}

function makeSupabaseMock(opts: {
  tableResult?: MockResult
  rpcResult?: MockResult
}): SupabaseClient {
  const tableResult = opts.tableResult ?? { error: null, data: null }
  const rpcResult = opts.rpcResult ?? { error: null, data: [] }
  return {
    from: (_table: string) => makeChainable(tableResult),
    rpc: (_name: string, _params?: unknown) => Promise.resolve(rpcResult),
  } as unknown as SupabaseClient
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants shared across tests
// ─────────────────────────────────────────────────────────────────────────────

const COMPANY_ID = "test-company-01"
const PO_ID = "po-uuid-1234"
const INVOICE_ID = "inv-uuid-5678"

/** Mocked RPC payload representing a 100% perfect 2-line match. */
const PERFECT_MATCH_RPC_ROW = {
  invoice_id: INVOICE_ID,
  new_invoice_status: "MATCHED",
  total_invoice_lines: 2,
  matched_lines: 2,
  perfect_lines: 2,
  qty_variance_lines: 0,
  price_variance_lines: 0,
  mixed_variance_lines: 0,
  unmatched_lines: 0,
  total_qty_diff: "0.000",
  total_price_diff_value: "0.00",
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PO State Machine — pure logic (no I/O)
// ─────────────────────────────────────────────────────────────────────────────

describe("PO State Machine — pure guards", () => {
  it("resolves DRAFT → PENDING_APPROVAL for SUBMIT transition", () => {
    const result = resolveNextStatus("DRAFT", "SUBMIT")
    expect(result).toEqual({ ok: true, newStatus: "PENDING_APPROVAL" })
  })

  it("resolves PENDING_APPROVAL → APPROVED for APPROVE transition", () => {
    const result = resolveNextStatus("PENDING_APPROVAL", "APPROVE")
    expect(result).toEqual({ ok: true, newStatus: "APPROVED" })
  })

  it("rejects SENT_TO_SUPPLIER → PENDING_APPROVAL (no such transition)", () => {
    const result = resolveNextStatus("SENT_TO_SUPPLIER", "SUBMIT")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("SUBMIT")
      expect(result.error).toContain("SENT_TO_SUPPLIER")
    }
  })

  it("resolves APPROVED → SENT_TO_SUPPLIER for SEND transition", () => {
    const result = resolveNextStatus("APPROVED", "SEND")
    expect(result).toEqual({ ok: true, newStatus: "SENT_TO_SUPPLIER" })
  })

  it("resolves PENDING_APPROVAL → DRAFT for REVERT transition", () => {
    const result = resolveNextStatus("PENDING_APPROVAL", "REVERT")
    expect(result).toEqual({ ok: true, newStatus: "DRAFT" })
  })

  it("resolves SENT_TO_SUPPLIER → CLOSED for CLOSE transition", () => {
    const result = resolveNextStatus("SENT_TO_SUPPLIER", "CLOSE")
    expect(result).toEqual({ ok: true, newStatus: "CLOSED" })
  })

  it("resolves CLOSED → REOPENED for REOPEN transition", () => {
    const result = resolveNextStatus("CLOSED", "REOPEN")
    expect(result).toEqual({ ok: true, newStatus: "REOPENED" })
  })

  it("resolves REOPENED → APPROVED for RESTORE transition", () => {
    const result = resolveNextStatus("REOPENED", "RESTORE")
    expect(result).toEqual({ ok: true, newStatus: "APPROVED" })
  })

  it("allows CANCEL from DRAFT, APPROVED, and SENT_TO_SUPPLIER", () => {
    for (const status of ["DRAFT", "APPROVED", "SENT_TO_SUPPLIER"] as const) {
      expect(isTransitionAllowed(status, "CANCEL")).toBe(true)
    }
  })

  it("blocks CANCEL from CLOSED", () => {
    expect(isTransitionAllowed("CLOSED", "CANCEL")).toBe(false)
  })

  it("blocks CANCEL from CANCELLED", () => {
    expect(isTransitionAllowed("CANCELLED", "CANCEL")).toBe(false)
  })

  it("lists correct available transitions from DRAFT", () => {
    const available = getAvailableTransitions("DRAFT")
    expect(available).toContain("SUBMIT")
    expect(available).toContain("CANCEL")
    expect(available).not.toContain("CLOSE")
    expect(available).not.toContain("SEND")
  })

  it("lists only REOPEN from CLOSED", () => {
    const available = getAvailableTransitions("CLOSED")
    expect(available).toEqual(["REOPEN"])
  })

  it("lists no available transitions from CANCELLED", () => {
    expect(getAvailableTransitions("CANCELLED")).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. applyPOTransition — DRAFT → APPROVED via mocked Supabase
// ─────────────────────────────────────────────────────────────────────────────

describe("applyPOTransition — DRAFT → PENDING_APPROVAL (mocked DB)", () => {
  it("succeeds when Supabase update returns no error", async () => {
    const supabase = makeSupabaseMock({ tableResult: { error: null } })

    const result = await applyPOTransition({
      supabase,
      companyId: COMPANY_ID,
      poId: PO_ID,
      transition: "SUBMIT",
      currentStatus: "DRAFT",
    })

    expect(result).toEqual({ ok: true, newStatus: "PENDING_APPROVAL" })
  })

  it("fails fast before DB call when transition is illegal (SENT_TO_SUPPLIER → SUBMIT)", async () => {
    // The DB should never be called — we can pass a mock that always errors
    // to confirm the guard fires before any I/O.
    const supabase = makeSupabaseMock({
      tableResult: { error: { message: "should not be reached" } },
    })

    const result = await applyPOTransition({
      supabase,
      companyId: COMPANY_ID,
      poId: PO_ID,
      transition: "SUBMIT",
      currentStatus: "SENT_TO_SUPPLIER",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).not.toContain("should not be reached")
      expect(result.error).toContain("SUBMIT")
    }
  })

  it("propagates a DB error when Supabase returns one", async () => {
    const supabase = makeSupabaseMock({
      tableResult: { error: { message: "duplicate key value" } },
    })

    const result = await applyPOTransition({
      supabase,
      companyId: COMPANY_ID,
      poId: PO_ID,
      transition: "SUBMIT",
      currentStatus: "DRAFT",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("duplicate key value")
    }
  })

  it("sets issued_at when transition is SEND (APPROVED → SENT_TO_SUPPLIER)", async () => {
    // Capture the patch that was passed to .update()
    let capturedPatch: Record<string, unknown> | null = null

    const mockChain = {
      update: vi.fn((patch: Record<string, unknown>) => {
        capturedPatch = patch
        return makeChainable<null>({ error: null })
      }),
    }

    const supabase = {
      from: (_table: string) => mockChain,
      rpc: vi.fn(),
    } as unknown as SupabaseClient

    const result = await applyPOTransition({
      supabase,
      companyId: COMPANY_ID,
      poId: PO_ID,
      transition: "SEND",
      currentStatus: "APPROVED",
    })

    expect(result).toEqual({ ok: true, newStatus: "SENT_TO_SUPPLIER" })
    expect(capturedPatch).not.toBeNull()
    expect((capturedPatch as Record<string, unknown> | null)?.issued_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Three-Way Match — canAutoApprove pure guard
// ─────────────────────────────────────────────────────────────────────────────

describe("canAutoApprove — pure guard", () => {
  const perfectSummary: MatchSummary = {
    invoiceId: INVOICE_ID,
    invoiceStatus: "MATCHED",
    totalInvoiceLines: 2,
    matchedLines: 2,
    perfectLines: 2,
    qtyVarianceLines: 0,
    priceVarianceLines: 0,
    mixedVarianceLines: 0,
    unmatchedLines: 0,
    totalQtyDiff: 0,
    totalPriceDiffValue: 0,
    isPerfectMatch: true,
  }

  it("returns true for a 100% perfect match", () => {
    expect(canAutoApprove(perfectSummary)).toBe(true)
  })

  it("returns false when there are unmatched lines", () => {
    expect(canAutoApprove({ ...perfectSummary, unmatchedLines: 1 })).toBe(false)
  })

  it("returns false when there are qty variances", () => {
    expect(
      canAutoApprove({ ...perfectSummary, qtyVarianceLines: 1, perfectLines: 1 }),
    ).toBe(false)
  })

  it("returns false when there are price variances", () => {
    expect(
      canAutoApprove({ ...perfectSummary, priceVarianceLines: 1, perfectLines: 1 }),
    ).toBe(false)
  })

  it("returns false for an invoice with zero lines", () => {
    expect(
      canAutoApprove({ ...perfectSummary, totalInvoiceLines: 0, matchedLines: 0, perfectLines: 0 }),
    ).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. performMatch — RPC wrapper (mocked)
// ─────────────────────────────────────────────────────────────────────────────

describe("performMatch — RPC wrapper (mocked Supabase)", () => {
  it("returns a perfect MatchSummary when RPC returns all PERFECT lines", async () => {
    const supabase = makeSupabaseMock({
      rpcResult: { error: null, data: [PERFECT_MATCH_RPC_ROW] },
    })

    const result = await performMatch(supabase, {
      companyId: COMPANY_ID,
      invoiceId: INVOICE_ID,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.summary.invoiceStatus).toBe("MATCHED")
      expect(result.summary.perfectLines).toBe(2)
      expect(result.summary.unmatchedLines).toBe(0)
      expect(result.summary.isPerfectMatch).toBe(true)
      expect(result.summary.totalQtyDiff).toBe(0)
      expect(result.summary.totalPriceDiffValue).toBe(0)
    }
  })

  it("returns ok:false when RPC returns an error", async () => {
    const supabase = makeSupabaseMock({
      rpcResult: { error: { message: "חשבונית ספק לא נמצאה" }, data: null },
    })

    const result = await performMatch(supabase, {
      companyId: COMPANY_ID,
      invoiceId: INVOICE_ID,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("חשבונית ספק לא נמצאה")
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. resolveInvoiceForPayment — full flow (mocked Supabase)
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveInvoiceForPayment — perfect match → READY_FOR_PAYMENT", () => {
  it("promotes invoice to READY_FOR_PAYMENT when all lines are PERFECT", async () => {
    // RPC returns MATCHED + all perfect; two subsequent table updates succeed.
    const supabase = makeSupabaseMock({
      tableResult: { error: null },
      rpcResult: { error: null, data: [PERFECT_MATCH_RPC_ROW] },
    })

    const result = await resolveInvoiceForPayment(supabase, {
      companyId: COMPANY_ID,
      invoiceId: INVOICE_ID,
    })

    expect(result).toEqual({ ok: true, finalStatus: "READY_FOR_PAYMENT" })
  })

  it("blocks auto-approval when the RPC returns qty variance lines", async () => {
    const variantRow = {
      ...PERFECT_MATCH_RPC_ROW,
      new_invoice_status: "HAS_VARIANCES",
      perfect_lines: 1,
      qty_variance_lines: 1,
    }

    const supabase = makeSupabaseMock({
      tableResult: { error: null },
      rpcResult: { error: null, data: [variantRow] },
    })

    const result = await resolveInvoiceForPayment(supabase, {
      companyId: COMPANY_ID,
      invoiceId: INVOICE_ID,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("חריגת כמות")
    }
  })

  it("blocks auto-approval when the RPC returns price variance lines", async () => {
    const variantRow = {
      ...PERFECT_MATCH_RPC_ROW,
      new_invoice_status: "HAS_VARIANCES",
      perfect_lines: 1,
      price_variance_lines: 1,
    }

    const supabase = makeSupabaseMock({
      tableResult: { error: null },
      rpcResult: { error: null, data: [variantRow] },
    })

    const result = await resolveInvoiceForPayment(supabase, {
      companyId: COMPANY_ID,
      invoiceId: INVOICE_ID,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("חריגת מחיר")
    }
  })

  it("blocks auto-approval when there are unmatched lines", async () => {
    const variantRow = {
      ...PERFECT_MATCH_RPC_ROW,
      new_invoice_status: "HAS_VARIANCES",
      matched_lines: 1,
      perfect_lines: 1,
      unmatched_lines: 1,
    }

    const supabase = makeSupabaseMock({
      tableResult: { error: null },
      rpcResult: { error: null, data: [variantRow] },
    })

    const result = await resolveInvoiceForPayment(supabase, {
      companyId: COMPANY_ID,
      invoiceId: INVOICE_ID,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("לא מקושרות")
    }
  })

  it("propagates RPC failure without touching the invoice table", async () => {
    const supabase = makeSupabaseMock({
      tableResult: { error: { message: "should not reach update" } },
      rpcResult: { error: { message: "connection timeout" }, data: null },
    })

    const result = await resolveInvoiceForPayment(supabase, {
      companyId: COMPANY_ID,
      invoiceId: INVOICE_ID,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("connection timeout")
      expect(result.error).not.toContain("should not reach update")
    }
  })
})
