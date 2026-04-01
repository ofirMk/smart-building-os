import { describe, expect, it } from "vitest"

import {
  getSystemMapStats,
  MARKER_OFEK_SYSTEM_MAP_ROOT,
} from "./system-map-data"

describe("system-map-data", () => {
  it("counts stats and marks known active leaves", () => {
    const s = getSystemMapStats(MARKER_OFEK_SYSTEM_MAP_ROOT)
    expect(s.total).toBeGreaterThan(20)
    expect(s.active).toBe(9)
    expect(s.inProgress).toBe(0)
    expect(s.planned).toBe(s.total - s.active)
    expect(s.percentActive).toBe(
      Math.round((s.active / s.total) * 1000) / 10
    )
  })

  it("has eight top-level WBS layers 0–7", () => {
    expect(MARKER_OFEK_SYSTEM_MAP_ROOT).toHaveLength(8)
    expect(MARKER_OFEK_SYSTEM_MAP_ROOT.map((n) => n.id)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ])
  })
})
