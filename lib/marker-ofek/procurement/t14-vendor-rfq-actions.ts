"use server"

/**
 * Sprint T14 — B2B Subcontractor Magic-Link Portal (server actions).
 *
 * Public, unauthenticated actions consumed by the mobile-first vendor
 * bidding page at `app/(public)/vendor/rfq/[token]/page.tsx`.
 *
 *   1. `fetchVendorRfqAction(token)` — resolves a tender by its magic-link
 *      token. If the token is the canonical demo UUID
 *      (123e4567-e89b-12d3-a456-426614174000) OR any string we cannot map to
 *      a real RFQ, we return a hand-crafted "Aluminum Works" RFQ shell with
 *      three empty BOQ lines (windows / doors / curtain wall) ready for the
 *      subcontractor to price from the field.
 *
 *   2. `submitVendorBidAction({ token, contractorName, contactPhone, prices })`
 *      — currently a simulated submission (800 ms latency, success payload).
 *      In production this will insert into `erp_vendor_quotes` + lines and
 *      mark the token as redeemed. The action signature is forward-compatible
 *      with that future wiring.
 *
 * Both actions are intentionally side-effect free against the DB until a
 * real magic-link table exists — this avoids creating placeholder rows from
 * investor demos and keeps the surface area predictable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
//
// NOTE: "use server" modules in Next.js may only export async functions at
// runtime. Constants would compile to runtime exports and break the build,
// so the canonical demo token (123e4567-e89b-12d3-a456-426614174000) lives
// in `tests/critical-routes-protection.spec.ts` only. TypeScript interfaces
// are erased at compile time and are therefore safe to export here.

export interface VendorRfqLine {
  id: string
  lineNumber: number
  description: string
  quantity: number
  uom: string
  /** Suggested ceiling (optional) — when present the UI nudges if exceeded. */
  budgetCeilingUnit?: number | null
}

export interface VendorRfqEnvelope {
  token: string
  rfqNumber: string
  title: string
  ownerCompanyName: string
  projectName: string
  submissionDeadline: string // ISO yyyy-mm-dd
  contactName: string
  contactPhone: string
  currency: string
  lines: VendorRfqLine[]
  isDemo: boolean
}

export type FetchVendorRfqResult =
  | { ok: true; envelope: VendorRfqEnvelope }
  | { ok: false; error: string }

export interface VendorBidLine {
  lineId: string
  unitPrice: number
}

export interface SubmitVendorBidInput {
  token: string
  contractorName: string
  contactPhone: string
  notes?: string
  prices: VendorBidLine[]
}

export type SubmitVendorBidResult =
  | {
      ok: true
      bidReference: string
      submittedAt: string
      totalAmount: number
    }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Demo envelope builder
// ---------------------------------------------------------------------------

function buildDemoEnvelope(token: string): VendorRfqEnvelope {
  // 14-day window from today, ISO yyyy-mm-dd.
  const deadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  return {
    token,
    rfqNumber: "RFQ-2026-ALU-014",
    title: "מכרז עבודות אלומיניום — מגדלי הים",
    ownerCompanyName: "מרקר אופק יזמות והנדסה בע״מ",
    projectName: "מגדלי הים, נתניה",
    submissionDeadline: deadline,
    contactName: "ליאת כהן · מנהלת רכש",
    contactPhone: "+972-54-7700123",
    currency: "ILS",
    lines: [
      {
        id: "demo-line-windows",
        lineNumber: 1,
        description: "חלונות אלומיניום מבודדים תרמית — סדרה 7000",
        quantity: 120,
        uom: "יח׳",
        budgetCeilingUnit: 2400,
      },
      {
        id: "demo-line-doors",
        lineNumber: 2,
        description: "דלתות כניסה אלומיניום עם זיגוג בטיחות מחוסם",
        quantity: 24,
        uom: "יח׳",
        budgetCeilingUnit: 5200,
      },
      {
        id: "demo-line-curtain-walls",
        lineNumber: 3,
        description: "ויטרינות מסך-מסך (Curtain Wall) — חזית דרומית",
        quantity: 540,
        uom: 'מ"ר',
        budgetCeilingUnit: 980,
      },
    ],
    isDemo: true,
  }
}

// ---------------------------------------------------------------------------
// 1. Fetch — demo-first; future real lookup can slot in here.
// ---------------------------------------------------------------------------

export async function fetchVendorRfqAction(
  token: string,
): Promise<FetchVendorRfqResult> {
  try {
    const cleanedToken = (token ?? "").trim()
    if (!cleanedToken) {
      return { ok: false, error: "Magic link is missing the token segment." }
    }

    // For now every well-formed token (including the canonical demo UUID)
    // returns the seeded demo envelope. When the production
    // `erp_vendor_magic_links` table lands, the real lookup is one extra
    // branch above this fall-through.
    return { ok: true, envelope: buildDemoEnvelope(cleanedToken) }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Unexpected error loading the RFQ envelope.",
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Submit — simulated success with a small artificial latency.
// ---------------------------------------------------------------------------

export async function submitVendorBidAction(
  input: SubmitVendorBidInput,
): Promise<SubmitVendorBidResult> {
  try {
    if (!input.token || input.token.trim().length === 0) {
      return { ok: false, error: "Magic link token missing." }
    }
    if (!input.contractorName || input.contractorName.trim().length === 0) {
      return { ok: false, error: "נא להזין שם קבלן." }
    }
    if (!Array.isArray(input.prices) || input.prices.length === 0) {
      return { ok: false, error: "לא הוזנו מחירים — מלאו לפחות סעיף אחד." }
    }

    const totalAmount = input.prices.reduce(
      (acc, p) => acc + (Number.isFinite(p.unitPrice) ? p.unitPrice : 0),
      0,
    )
    if (totalAmount <= 0) {
      return { ok: false, error: "סך ההצעה חייב להיות גדול מאפס." }
    }

    // Simulate network round-trip so the UX spinner has presence.
    await new Promise((resolve) => setTimeout(resolve, 800))

    // Compose a friendly reference id (production: id from inserted row).
    const bidReference = `BID-${Date.now().toString(36).toUpperCase()}`
    return {
      ok: true,
      bidReference,
      submittedAt: new Date().toISOString(),
      totalAmount,
    }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "אירעה שגיאה בלתי צפויה בשליחה.",
    }
  }
}
