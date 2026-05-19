"use server"

/**
 * Sprint T12 — Tender Bid Leveling & Award Matrix (server actions).
 *
 * Two actions:
 *   1. fetchTenderComparisonAction(rfqId?)
 *      - Tries to load a real RFQ (the most recent OPEN one if no id given)
 *        with all of its lines and all vendor quotes + their priced lines.
 *      - If no real data exists, returns an in-memory MOCK comparison so
 *        the UI can demo the experience for investors. Always flagged with
 *        `isMock: true` so the UI is honest with the operator.
 *
 *   2. awardContractAction({ quoteId, isMock })
 *      - On real data: calls `erp_mark_winning_quote` then
 *        `erp_award_quote_to_contract` (the existing T1+T3 RPCs) to close
 *        the lifecycle loop.
 *      - On mock data: simulates a 600 ms delay and returns success so the
 *        demo flow is identical to production from the operator's POV.
 */

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TenderLine {
  id: string
  lineNumber: number
  description: string
  quantity: number
  uom: string
}

export interface ContractorQuote {
  quoteId: string
  contractorId: string
  contractorName: string
  quoteNumber: string
  totalAmount: number
  currency: string
  status: string
  isWinner: boolean
  // Map from rfq_line_id → unit_price (we keep it as a record so the UI can
  // do O(1) lookup while rendering the matrix).
  unitPriceByLineId: Record<string, number>
}

export interface TenderComparison {
  rfqId: string
  rfqNumber: string
  title: string
  projectName: string
  status: string
  validUntil: string | null
  targetBudget: number
  lines: TenderLine[]
  contractors: ContractorQuote[]
  isMock: boolean
}

export type TenderComparisonResult =
  | { ok: true; comparison: TenderComparison }
  | { ok: false; error: string }

export type AwardResult =
  | {
      ok: true
      mode: "real" | "mock"
      contractId: string | null
      message: string
    }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describeError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === "string" && err.length > 0) return err
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === "string" && m.length > 0) return m
  }
  return fallback
}

// ---------------------------------------------------------------------------
// Mock comparison — used when the DB has no real RFQ data yet.
// "מכרז עבודות אלומיניום — פרויקט מגדלי הים", 3 contractors × 3 BOQ lines.
// ---------------------------------------------------------------------------

const MOCK_LINE_IDS = {
  windows: "mock-line-windows",
  doors: "mock-line-doors",
  curtain: "mock-line-curtain-walls",
} as const

function buildMockComparison(): TenderComparison {
  const lines: TenderLine[] = [
    {
      id: MOCK_LINE_IDS.windows,
      lineNumber: 1,
      description: "חלונות אלומיניום מבודדים תרמית — סדרה 7000",
      quantity: 120,
      uom: "יח׳",
    },
    {
      id: MOCK_LINE_IDS.doors,
      lineNumber: 2,
      description: "דלתות כניסה אלומיניום עם זיגוג בטיחות",
      quantity: 24,
      uom: "יח׳",
    },
    {
      id: MOCK_LINE_IDS.curtain,
      lineNumber: 3,
      description: "ויטרינות מסך-מסך (Curtain Wall) — חזית דרומית",
      quantity: 540,
      uom: 'מ"ר',
    },
  ]

  // Cost prices the UI will show. Designed so contractor B is best on
  // windows + curtain wall, contractor A is best on doors, and contractor
  // C is the most expensive overall — so the highlight logic is visible.
  const contractors: ContractorQuote[] = [
    {
      quoteId: "mock-quote-aluvit",
      contractorId: "mock-supplier-aluvit",
      contractorName: 'אלוויט מערכות אלומיניום בע"מ',
      quoteNumber: "AL-2026-014",
      totalAmount: 0,
      currency: "ILS",
      status: "SUBMITTED",
      isWinner: false,
      unitPriceByLineId: {
        [MOCK_LINE_IDS.windows]: 2150,
        [MOCK_LINE_IDS.doors]: 4750, // ← best on doors
        [MOCK_LINE_IDS.curtain]: 880,
      },
    },
    {
      quoteId: "mock-quote-klil",
      contractorId: "mock-supplier-klil",
      contractorName: 'קליל תעשיות אלומיניום בע"מ',
      quoteNumber: "KL-2026-031",
      totalAmount: 0,
      currency: "ILS",
      status: "SUBMITTED",
      isWinner: false,
      unitPriceByLineId: {
        [MOCK_LINE_IDS.windows]: 1980, // ← best on windows
        [MOCK_LINE_IDS.doors]: 4990,
        [MOCK_LINE_IDS.curtain]: 845, // ← best on curtain wall
      },
    },
    {
      quoteId: "mock-quote-extal",
      contractorId: "mock-supplier-extal",
      contractorName: 'אקסטל פתרונות חזיתות בע"מ',
      quoteNumber: "EX-2026-008",
      totalAmount: 0,
      currency: "ILS",
      status: "SUBMITTED",
      isWinner: false,
      unitPriceByLineId: {
        [MOCK_LINE_IDS.windows]: 2240,
        [MOCK_LINE_IDS.doors]: 4880,
        [MOCK_LINE_IDS.curtain]: 920,
      },
    },
  ]

  // Compute totals.
  for (const c of contractors) {
    c.totalAmount = lines.reduce(
      (acc, l) => acc + (c.unitPriceByLineId[l.id] ?? 0) * l.quantity,
      0,
    )
  }

  // Target budget = ~5% above the cheapest total (so the cheapest pops
  // green, the middle is on-budget, the worst is over).
  const minTotal = Math.min(...contractors.map((c) => c.totalAmount))
  const targetBudget = Math.round(minTotal * 1.05)

  return {
    rfqId: "mock-rfq-aluminum-yam-towers",
    rfqNumber: "RFQ-2026-ALU-014",
    title: "מכרז עבודות אלומיניום — פרויקט מגדלי הים",
    projectName: "מגדלי הים, נתניה",
    status: "OPEN",
    validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    targetBudget,
    lines,
    contractors,
    isMock: true,
  }
}

// ---------------------------------------------------------------------------
// 1. Fetch comparison — DB-first, mock fallback.
// ---------------------------------------------------------------------------

export async function fetchTenderComparisonAction(
  rfqId?: string,
): Promise<TenderComparisonResult> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userData.user) {
      return { ok: false, error: "Unauthorized" }
    }

    // Resolve a target RFQ id: explicit param > most recent OPEN > most recent.
    let targetRfqId = rfqId ?? null

    if (!targetRfqId) {
      const { data: rfqList, error: rfqListErr } = await supabase
        .from("erp_rfqs")
        .select("id, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20)

      if (rfqListErr) {
        // Table might not exist or RLS denies — fall through to mock.
        return { ok: true, comparison: buildMockComparison() }
      }

      const open = (rfqList ?? []).find(
        (r) => String((r as { status?: string }).status ?? "") === "OPEN",
      )
      const fallback = (rfqList ?? [])[0]
      targetRfqId =
        ((open ?? fallback) as { id?: string } | undefined)?.id ?? null
    }

    if (!targetRfqId) {
      return { ok: true, comparison: buildMockComparison() }
    }

    // Load the RFQ header + project name.
    const { data: rfqRow, error: rfqErr } = await supabase
      .from("erp_rfqs")
      .select(
        "id, rfq_number, title, status, valid_until, project_id, projects:erp_proj_projects(name)",
      )
      .eq("id", targetRfqId)
      .maybeSingle()

    if (rfqErr || !rfqRow) {
      return { ok: true, comparison: buildMockComparison() }
    }

    // Load lines.
    const { data: lineRows, error: linesErr } = await supabase
      .from("erp_rfq_lines")
      .select("id, description, quantity, uom_code")
      .eq("rfq_id", targetRfqId)
      .order("created_at", { ascending: true })

    if (linesErr) {
      return { ok: true, comparison: buildMockComparison() }
    }

    if (!lineRows || lineRows.length === 0) {
      // RFQ exists but has no lines yet → mock.
      return { ok: true, comparison: buildMockComparison() }
    }

    // Load quotes + supplier names.
    const { data: quoteRows, error: quotesErr } = await supabase
      .from("erp_vendor_quotes")
      .select(
        "id, supplier_id, quote_number, status, total_amount, currency_code, is_winner, suppliers:erp_md_suppliers(name)",
      )
      .eq("rfq_id", targetRfqId)
      .order("total_amount", { ascending: true })

    if (quotesErr) {
      return { ok: true, comparison: buildMockComparison() }
    }

    if (!quoteRows || quoteRows.length === 0) {
      // RFQ has no submitted quotes yet → mock so the demo still shines.
      return { ok: true, comparison: buildMockComparison() }
    }

    const quoteIds = quoteRows.map((q) => (q as { id: string }).id)

    // Load priced lines for all of those quotes in one shot.
    const { data: quoteLineRows, error: quoteLinesErr } = await supabase
      .from("erp_vendor_quote_lines")
      .select("vendor_quote_id, rfq_line_id, unit_price, min_quantity")
      .in("vendor_quote_id", quoteIds)

    if (quoteLinesErr) {
      return { ok: true, comparison: buildMockComparison() }
    }

    // Materialise.
    const lines: TenderLine[] = lineRows.map((r, idx) => ({
      id: String((r as { id?: string }).id ?? `line-${idx}`),
      lineNumber: idx + 1,
      description: String((r as { description?: string }).description ?? ""),
      quantity: Number((r as { quantity?: number }).quantity ?? 0),
      uom: String((r as { uom_code?: string }).uom_code ?? ""),
    }))

    type SupplierEmbed = { name?: string } | { name?: string }[] | null
    const contractors: ContractorQuote[] = quoteRows.map((q) => {
      const qid = String((q as { id?: string }).id ?? "")
      const supplier = (q as { suppliers?: SupplierEmbed }).suppliers
      const supplierName = Array.isArray(supplier)
        ? (supplier[0]?.name ?? "")
        : (supplier?.name ?? "")
      const priceMap: Record<string, number> = {}
      for (const ql of quoteLineRows ?? []) {
        if (String((ql as { vendor_quote_id?: string }).vendor_quote_id) !== qid) continue
        const rl = String((ql as { rfq_line_id?: string }).rfq_line_id ?? "")
        const price = Number((ql as { unit_price?: number }).unit_price ?? 0)
        if (rl) priceMap[rl] = price
      }
      return {
        quoteId: qid,
        contractorId: String((q as { supplier_id?: string }).supplier_id ?? ""),
        contractorName: supplierName || `ספק ${qid.slice(0, 6)}`,
        quoteNumber: String((q as { quote_number?: string }).quote_number ?? ""),
        totalAmount: Number((q as { total_amount?: number }).total_amount ?? 0),
        currency: String((q as { currency_code?: string }).currency_code ?? "ILS"),
        status: String((q as { status?: string }).status ?? ""),
        isWinner: Boolean((q as { is_winner?: boolean }).is_winner ?? false),
        unitPriceByLineId: priceMap,
      }
    })

    // Target budget heuristic — sum of lowest-price-per-line × qty (ideal
    // mix). Operators can refine this later via a dedicated column.
    const targetBudget = lines.reduce((acc, l) => {
      const prices = contractors
        .map((c) => c.unitPriceByLineId[l.id] ?? 0)
        .filter((p) => p > 0)
      const min = prices.length > 0 ? Math.min(...prices) : 0
      return acc + min * l.quantity
    }, 0)

    type ProjectEmbed = { name?: string } | { name?: string }[] | null
    const projectEmbed = (rfqRow as { projects?: ProjectEmbed }).projects
    const projectName = Array.isArray(projectEmbed)
      ? (projectEmbed[0]?.name ?? "—")
      : (projectEmbed?.name ?? "—")

    return {
      ok: true,
      comparison: {
        rfqId: String((rfqRow as { id?: string }).id ?? targetRfqId),
        rfqNumber: String((rfqRow as { rfq_number?: string }).rfq_number ?? ""),
        title: String((rfqRow as { title?: string }).title ?? ""),
        projectName,
        status: String((rfqRow as { status?: string }).status ?? ""),
        validUntil:
          ((rfqRow as { valid_until?: string | null }).valid_until ?? null),
        targetBudget: Math.round(targetBudget),
        lines,
        contractors,
        isMock: false,
      },
    }
  } catch (err) {
    // Belt-and-braces — never blow up the page over a tender query.
    return {
      ok: true,
      comparison: buildMockComparison(),
    }
  } finally {
    void describeError
  }
}

// ---------------------------------------------------------------------------
// 2. Award action — real RPC chain or mock simulation.
// ---------------------------------------------------------------------------

export async function awardContractAction(input: {
  quoteId: string
  isMock: boolean
}): Promise<AwardResult> {
  try {
    if (input.isMock) {
      // Simulate the same UX shape (artificial delay, success message).
      await new Promise((resolve) => setTimeout(resolve, 600))
      return {
        ok: true,
        mode: "mock",
        contractId: null,
        message: "החוזה הוקם בהצלחה והמכרז נסגר! (סימולציה)",
      }
    }

    const supabase = await createSupabaseServerAuthClient()
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userData.user) {
      return { ok: false, error: "Unauthorized" }
    }

    // Step 1 — mark winner (T1 RPC).
    const markRes = await supabase.rpc("erp_mark_winning_quote", {
      p_quote_id: input.quoteId,
    })
    if (markRes.error) {
      return {
        ok: false,
        error: describeError(markRes.error, "סימון הצעה זוכה נכשל"),
      }
    }

    // Step 2 — promote winning quote into a contract (T3 RPC).
    const awardRes = await supabase.rpc("erp_award_quote_to_contract", {
      p_quote_id: input.quoteId,
    })
    if (awardRes.error) {
      return {
        ok: false,
        error: describeError(awardRes.error, "המרת הצעה לחוזה נכשלה"),
      }
    }

    // The RPC returns jsonb — best-effort to extract a contract id.
    let contractId: string | null = null
    const payload = awardRes.data as
      | { target_id?: string; contract_id?: string }
      | null
      | undefined
    if (payload && typeof payload === "object") {
      contractId =
        (payload.target_id ?? payload.contract_id ?? null) as string | null
    }

    return {
      ok: true,
      mode: "real",
      contractId,
      message: "החוזה הוקם בהצלחה והמכרז נסגר!",
    }
  } catch (err) {
    return { ok: false, error: describeError(err, "שגיאה בלתי צפויה בזכייה") }
  }
}
