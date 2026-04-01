import { describe, expect, it } from "vitest"

import {
  isAllowedProcurementDrillDownPath,
  PROCUREMENT_DRILLDOWN_URLS,
} from "./drill-down-f2"

describe("drill-down-f2", () => {
  it("allows only whitelisted paths", () => {
    expect(
      isAllowedProcurementDrillDownPath(PROCUREMENT_DRILLDOWN_URLS.projectSetup)
    ).toBe(true)
    expect(
      isAllowedProcurementDrillDownPath(
        PROCUREMENT_DRILLDOWN_URLS.categorySetup
      )
    ).toBe(true)
    expect(isAllowedProcurementDrillDownPath("/evil-redirect")).toBe(false)
    expect(isAllowedProcurementDrillDownPath("//evil.com")).toBe(false)
    expect(isAllowedProcurementDrillDownPath("https://x")).toBe(false)
  })
})
