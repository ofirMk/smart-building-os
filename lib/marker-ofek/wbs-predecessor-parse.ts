/**
 * Parses predecessor tokens: row "#" or WBS code, optional FS/SS/FF/SF, optional lag (e.g. +2, -1 working days).
 * Examples: "5", "5FS+2", "1.2FS-1"
 */

export type ParsedPredecessorLink = {
  rowNumber: number | null
  wbsCode: string | null
  linkType: "FS" | "SS" | "FF" | "SF"
  lagWorkingDays: number
}

const TOKEN_RE =
  /^(?:(\d+(?:\.\d+)+)|(\d+))\s*(FS|SS|FF|SF)?\s*([+-]\d+)?$/i

export function parsePredecessorToken(raw: string): ParsedPredecessorLink | null {
  const s = String(raw ?? "").trim()
  if (!s) return null
  const m = s.match(TOKEN_RE)
  if (!m) return null
  const wbs = m[1] ?? null
  const row = m[2] ?? null
  const lt = (m[3] ?? "FS").toUpperCase() as ParsedPredecessorLink["linkType"]
  const lag = m[4] != null && m[4] !== "" ? Number.parseInt(String(m[4]), 10) : 0
  if (Number.isNaN(lag)) return null
  if (wbs) {
    return { rowNumber: null, wbsCode: wbs, linkType: lt, lagWorkingDays: lag }
  }
  if (row) {
    const n = Number.parseInt(row, 10)
    if (Number.isNaN(n) || n < 1) return null
    return { rowNumber: n, wbsCode: null, linkType: lt, lagWorkingDays: lag }
  }
  return null
}
