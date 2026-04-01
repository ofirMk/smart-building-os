/** תוויות פרק (WBS) — ניתן להרחבה לפי פרויקט */
export const WBS_CHAPTER_LABELS: Record<string, string> = {
  "08.01": "חשמל מרתפים",
  "08.02": "ליווי שלד",
  "08.03": "מבנה עילי",
  "98.01": "חריגים / עבודות נוספות",
}

/**
 * מקוד סעיף מלא (למשל 08.01.001) → קידומת פרק (08.01).
 */
export function wbsChapterPrefix(sectionCode: string): string {
  const s = sectionCode.trim()
  if (!s) return "—"
  const parts = s.split(".").filter((p) => p.length > 0)
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`
  return parts[0] ?? "—"
}

export function chapterHeaderLabel(prefix: string): string {
  const mapped = WBS_CHAPTER_LABELS[prefix]
  if (mapped) return `פרק ${prefix} — ${mapped}`
  if (prefix.startsWith("98")) {
    return `פרק ${prefix} — ${WBS_CHAPTER_LABELS["98.01"] ?? "חריגים / עבודות נוספות"}`
  }
  return `פרק ${prefix}`
}

/** פרקי 98.x בסוף, שאר לפי מיון טבעי */
export function sortChapterPrefixes(prefixes: string[]): string[] {
  return [...new Set(prefixes)].sort((a, b) => {
    const a98 = a.startsWith("98")
    const b98 = b.startsWith("98")
    if (a98 !== b98) return a98 ? 1 : -1
    return a.localeCompare(b, undefined, { numeric: true })
  })
}
