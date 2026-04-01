/** Internal delimiter for round-tripping סעיף + תיאור in a single DB `name` column. */
const MILESTONE_NAME_SEP = ":::mo:::"

/** Optional BoQ כמות/מחיר יחידה appended after the display name (still one `name` column). */
const BOQ_QTY_PRICE_TAIL = ":::moqty:::"

function parseNumLocal(s: string): number {
  const n = parseFloat(String(s).replace(",", "."))
  return Number.isFinite(n) ? n : NaN
}

export function encodeMilestoneDisplayName(
  sectionCode: string,
  description: string
): string {
  const s = sectionCode.trim()
  const d = description.trim()
  if (!s) return d
  if (!d) return s
  return `${s}${MILESTONE_NAME_SEP}${d}`
}

export function decodeMilestoneDisplayName(name: string): {
  sectionCode: string
  description: string
} {
  const n = stripBoqTail(name).text.trim()
  const idx = n.indexOf(MILESTONE_NAME_SEP)
  if (idx < 0) return { sectionCode: "", description: n }
  return {
    sectionCode: n.slice(0, idx).trim(),
    description: n.slice(idx + MILESTONE_NAME_SEP.length).trim(),
  }
}

function stripBoqTail(full: string): { text: string; qty: string; unitPrice: string } {
  const idx = full.indexOf(BOQ_QTY_PRICE_TAIL)
  if (idx < 0) return { text: full, qty: "", unitPrice: "" }
  const base = full.slice(0, idx)
  const tail = full.slice(idx + BOQ_QTY_PRICE_TAIL.length)
  const colon = tail.indexOf(":")
  if (colon < 0) return { text: base, qty: "", unitPrice: "" }
  return {
    text: base,
    qty: tail.slice(0, colon).trim(),
    unitPrice: tail.slice(colon + 1).trim(),
  }
}

/** כתב כמויות: שומר כמות ומחיר יחידה בתוך `name` לעריכה חוזרת. */
export function encodeBoqMilestoneStoredName(
  sectionCode: string,
  description: string,
  quantity: string,
  unitPrice: string
): string {
  const base = encodeMilestoneDisplayName(sectionCode, description)
  const q = parseNumLocal(quantity)
  const p = parseNumLocal(unitPrice)
  if (!Number.isFinite(q) || !Number.isFinite(p)) return base
  return `${base}${BOQ_QTY_PRICE_TAIL}${q}:${p}`
}

/** מפענח `name` מ-DB לשדות טופס (כולל כמות/מחיר אם קיימים). */
export function decodeMilestoneStoredName(full: string): {
  sectionCode: string
  description: string
  quantity: string
  unitPrice: string
} {
  const { text, qty, unitPrice } = stripBoqTail(full)
  const { sectionCode, description } = decodeMilestoneDisplayName(text)
  return { sectionCode, description, quantity: qty, unitPrice }
}
