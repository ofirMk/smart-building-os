import { describe, expect, it } from "vitest"

import {
  MO_PROCUREMENT_CATEGORY_NAMES,
  normalizeProcurementCategory,
} from "./procurement-categories"

describe("normalizeProcurementCategory", () => {
  it("keeps known categories", () => {
    for (const n of MO_PROCUREMENT_CATEGORY_NAMES) {
      expect(normalizeProcurementCategory(n)).toBe(n)
    }
  })

  it("maps unknown to שונות", () => {
    expect(normalizeProcurementCategory("לא קיים")).toBe("שונות")
    expect(normalizeProcurementCategory("")).toBe("שונות")
    expect(normalizeProcurementCategory(null)).toBe("שונות")
  })
})
