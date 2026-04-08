/**
 * השוואת שם לקוח מול שם במאגר הממשלתי — ללא תלות בשרת.
 */

export function normalizeComparableHebrewName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/["'`׳״]/g, "")
    .replace(/\b(בע["׳]?מ|בעמ|בע"מ|ltd|limited|inc\.?)\b/gi, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
}

function tokenSet(s: string): Set<string> {
  const n = normalizeComparableHebrewName(s)
  return new Set(n.split(/\s+/).filter((t) => t.length > 1))
}

/** חפיפת טוקנים — מספיקה לרוב שמות העסקים בעברית */
export function namesLikelyMatch(clientName: string, registryName: string): boolean {
  const a = normalizeComparableHebrewName(clientName)
  const b = normalizeComparableHebrewName(registryName)
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const sa = tokenSet(clientName)
  const sb = tokenSet(registryName)
  if (sa.size === 0 || sb.size === 0) return false
  let inter = 0
  for (const t of sa) {
    if (sb.has(t)) inter += 1
  }
  const denom = Math.min(sa.size, sb.size)
  return inter / denom >= 0.5
}
