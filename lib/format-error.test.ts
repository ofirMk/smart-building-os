import { describe, expect, it } from "vitest"

import { formatError } from "./format-error"

describe("formatError", () => {
  it("reads Error.message", () => {
    expect(formatError(new Error("x"))).toBe("x")
  })

  it("reads object.message string", () => {
    expect(formatError({ message: "y" })).toBe("y")
  })

  it("stringifies plain objects", () => {
    expect(formatError({ code: 1 })).toBe('{"code":1}')
  })

  it("truncates very long messages", () => {
    const long = "a".repeat(3000)
    const out = formatError(new Error(long))
    expect(out.length).toBeLessThanOrEqual(2002)
    expect(out.endsWith("…")).toBe(true)
  })
})
