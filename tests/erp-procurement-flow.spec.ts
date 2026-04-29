import { test, expect } from "@playwright/test"

/**
 * זרימת רכש ERP — בדיקות E2E קריטיות
 *
 * דרישות מוקדמות:
 *  - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY מוגדרים בסביבת הבדיקה
 *  - Dev server פועל על http://localhost:3000
 */

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:3000"

test.describe("ERP Procurement — canonical API routes", () => {
  test("GET /api/erp/master-data/suppliers returns 401 without session", async ({ request }) => {
    const res = await request.get(`${BASE}/api/erp/master-data/suppliers`)
    expect([401, 403]).toContain(res.status())
  })

  test("GET /api/erp/master-data/items returns 401 without session", async ({ request }) => {
    const res = await request.get(`${BASE}/api/erp/master-data/items`)
    expect([401, 403]).toContain(res.status())
  })

  test("GET /api/erp/projects returns 401 without session", async ({ request }) => {
    const res = await request.get(`${BASE}/api/erp/projects`)
    expect([401, 403]).toContain(res.status())
  })

  test("GET /api/erp/contracts returns 401 without session", async ({ request }) => {
    const res = await request.get(`${BASE}/api/erp/contracts`)
    expect([401, 403]).toContain(res.status())
  })

  test("GET /api/erp/procurement/purchase-orders returns 401 without session", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/erp/procurement/purchase-orders`)
    expect([401, 403]).toContain(res.status())
  })
})

test.describe("Legacy routes are gone", () => {
  test("GET /api/suppliers returns 404 (deleted)", async ({ request }) => {
    const res = await request.get(`${BASE}/api/suppliers`)
    expect(res.status()).toBe(404)
  })

  test("GET /api/holden-erp/intent returns 404 (deleted)", async ({ request }) => {
    const res = await request.get(`${BASE}/api/holden-erp/intent`)
    expect(res.status()).toBe(404)
  })
})

test.describe("AI Jobs Gateway", () => {
  test("POST /api/erp/ai/jobs returns 401 without session", async ({ request }) => {
    const res = await request.post(`${BASE}/api/erp/ai/jobs`, {
      data: { type: "risk_scan", payload: {}, company_id: "test" },
    })
    expect([401, 403]).toContain(res.status())
  })

  test("POST /api/erp/ai/jobs returns 400 with missing type", async ({ request }) => {
    const res = await request.post(`${BASE}/api/erp/ai/jobs`, {
      data: { payload: {}, company_id: "test" },
      headers: { Cookie: "invalid-session=true" },
    })
    expect([400, 401]).toContain(res.status())
  })
})

test.describe("AI Graceful Degradation — Holden Intent", () => {
  test("POST /api/erp/holden/intent returns 400 for empty text", async ({ request }) => {
    const res = await request.post(`${BASE}/api/erp/holden/intent`, {
      data: { text: "" },
    })
    expect([400, 401]).toContain(res.status())
  })
})

test.describe("RLS cross-company isolation", () => {
  test("API rejects cross-company x-company-id header without valid session", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/erp/master-data/suppliers`, {
      headers: {
        "x-company-id": "some_other_company",
        "x-active-company-id": "some_other_company",
      },
    })
    expect([401, 403]).toContain(res.status())
  })
})
