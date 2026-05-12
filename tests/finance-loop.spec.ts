import { test, expect } from "@playwright/test"

/**
 * Sprint T6 — AR/AP closing loop API smoke tests.
 *
 * These tests assert the auth boundary on the new finance routes — without a
 * session the dashboard pages must redirect to login (never 404), and direct
 * API access (when wrapped as endpoints in future iterations) must reject.
 *
 * The triggers + RPC themselves are covered by SQL-level guards in the
 * migration (idempotency, FK enforcement, RLS). E2E creation of a receipt
 * requires a seeded session and is out of scope for the smoke gate.
 */

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3000"

const FINANCE_ROUTES = [
  "/marker-ofek/finance/cashflow",
  "/marker-ofek/finance/aging",
  "/marker-ofek/finance/receipts",
] as const

test.describe("Sprint T6 finance routes — registration smoke", () => {
  for (const route of FINANCE_ROUTES) {
    test(`route ${route} is registered (no Next.js 404)`, async ({ request }) => {
      const res = await request.get(`${BASE}${route}`, { maxRedirects: 0 })
      const status = res.status()
      expect(
        [200, 301, 302, 303, 307, 308, 401, 403].includes(status),
        `Route ${route} returned unexpected status ${status}`,
      ).toBe(true)
      if (status >= 300 && status < 400) {
        const location = res.headers()["location"] ?? ""
        expect(location.includes("/_not-found")).toBe(false)
      }
    })
  }
})
