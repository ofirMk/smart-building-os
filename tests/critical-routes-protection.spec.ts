import { test, expect, type APIRequestContext } from "@playwright/test"

/**
 * Zero-Regression Tripwire — protected investor / demo routes.
 *
 * These routes MUST exist and MUST render without a Next.js 404 page. The
 * tripwire fires the moment a backend / cleanup task accidentally deletes
 * or renames the `app/(dashboard)/marker-ofek/<route>/page.tsx` file (or any
 * of its critical component dependencies).
 *
 * Rules:
 *  1. Status MUST be in {200, 301, 302, 307, 308, 401, 403}. A bare 404
 *     means the page file was deleted or the route segment was renamed.
 *  2. The final response body MUST NOT contain Next.js 404 markers
 *     ("This page could not be found", "404", "Page Not Found", "הדף לא נמצא")
 *     unless the response itself is an auth redirect to /login.
 *  3. We deliberately do NOT require auth: the route registration alone is
 *     what we protect. Auth-gated middleware redirects (307 → /login) are
 *     acceptable because Next still resolves the page slot.
 */

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3000"

const PROTECTED_ROUTES = [
  "/marker-ofek/pitch",
  "/marker-ofek/projects",
  "/marker-ofek/contracts-engine",
  // Sprint T6 — Finance closing loop (added 2026-05-12).
  "/marker-ofek/finance/cashflow",
  "/marker-ofek/finance/aging",
  "/marker-ofek/finance/receipts",
  // Contextual-PDF distribution — live operational print routes (added 2026-05-13).
  // The tripwire uses a seed UUID; the page renders even if the row is missing
  // (shows "החשבון לא נמצא"), so the registration check is valid either way.
  "/print/client-bills/00000000-0000-0000-0000-000000000000",
  "/print/bills/00000000-0000-0000-0000-000000000000",
  "/print/contracts/00000000-0000-0000-0000-000000000000",
  "/print/purchase-orders/00000000-0000-0000-0000-000000000000",
  // Sprint T7b — Tax-invoice management + printable PDF (added 2026-05-13).
  "/marker-ofek/finance/tax-invoices",
  "/marker-ofek/finance/tax-invoices/new",
  "/marker-ofek/finance/tax-invoices/00000000-0000-0000-0000-000000000000",
  "/print/tax-invoices/00000000-0000-0000-0000-000000000000",
  // Sprint T7c — Finance settings admin page (added 2026-05-14).
  "/marker-ofek/admin/finance-settings",
  // Sprint T8 — Executive Cash-Flow & Financial Cockpit (added 2026-05-14).
  "/marker-ofek/finance/dashboard",
  // Sprint P1 — Project Onboarding Wizard + preserved legacy flow (added 2026-05-17).
  "/marker-ofek/projects/new",
  "/marker-ofek/projects/legacy-setup",
] as const

const NOT_FOUND_MARKERS = [
  "This page could not be found",
  "Page Not Found",
  "הדף לא נמצא",
]

const ACCEPTABLE_STATUSES = new Set([200, 301, 302, 303, 307, 308, 401, 403])

async function assertRouteRegistered(request: APIRequestContext, path: string) {
  // maxRedirects: 0 — we explicitly want to see redirects, not follow them.
  const res = await request.get(`${BASE}${path}`, { maxRedirects: 0 })
  const status = res.status()

  expect(
    ACCEPTABLE_STATUSES.has(status),
    `Route ${path} returned unexpected status ${status}. ` +
      `Expected one of: 200/301/302/303/307/308/401/403. A 404 here means ` +
      `the page file was deleted or the route segment was renamed.`,
  ).toBe(true)

  // If it is a redirect, ensure it doesn't redirect to a Next.js 404 fallback.
  if (status >= 300 && status < 400) {
    const location = res.headers()["location"] ?? ""
    expect(
      location.includes("/_not-found") === false,
      `Route ${path} redirected to a Next.js _not-found fallback (${location}).`,
    ).toBe(true)
    return
  }

  // Direct 200: ensure body is not a 404 surface.
  if (status === 200) {
    const body = await res.text()
    for (const marker of NOT_FOUND_MARKERS) {
      expect(
        body.includes(marker) === false,
        `Route ${path} responded 200 but its body contained a 404 marker: "${marker}".`,
      ).toBe(true)
    }
  }
}

test.describe("Critical Routes Protection — Zero Regression Tripwire", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`protected route ${route} is registered and is not a 404`, async ({ request }) => {
      await assertRouteRegistered(request, route)
    })
  }
})
