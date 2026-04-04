/** Labels for primary Marker Ofek profit centers (Ir HaYin, Rainbow). */
export type ProfitCenterBrand = "ir_hayin" | "rainbow" | "other"

const LABEL: Record<ProfitCenterBrand, string> = {
  ir_hayin: "Ir HaYin",
  rainbow: "Rainbow",
  other: "—",
}

export function profitCenterLabel(brand: ProfitCenterBrand): string {
  return LABEL[brand]
}

/**
 * Infer brand from project name / internal code (Hebrew + English).
 */
export function inferProfitCenterBrand(
  name: string,
  internalCode: string
): ProfitCenterBrand {
  const s = `${name} ${internalCode}`.toLowerCase()
  if (s.includes("rainbow") || s.includes("ריינבו") || s.includes("ריינבואו")) {
    return "rainbow"
  }
  if (
    s.includes("ir ha") ||
    s.includes("hayin") ||
    s.includes("ir hayin") ||
    s.includes("עיר היין") ||
    s.includes("יר האיין")
  ) {
    return "ir_hayin"
  }
  return "other"
}

export function compareProfitCenterBrand(
  a: ProfitCenterBrand,
  b: ProfitCenterBrand
): number {
  const rank: Record<ProfitCenterBrand, number> = {
    ir_hayin: 0,
    rainbow: 1,
    other: 2,
  }
  return rank[a] - rank[b]
}
