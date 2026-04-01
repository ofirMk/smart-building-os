/**
 * מנקה תיאורי סעיף ממחרוזות JSON/מבנה פנימי (moqty, מפתחות אנגליים) ומשאיר עברית קריאה.
 */
export function cleanDescription(desc: string): string {
  if (!desc || typeof desc !== "string") return ""
  let s = desc.trim()
  if (!s) return ""

  s = s.split(":::moqty:::")[0] ?? s
  s = s.split(":::mo:::")[0] ?? s

  s = s.replace(/moqty\s*:[^:\s]*\s*:/gi, " ")
  s = s.replace(/\bmo[a-z]{0,12}\s*:\s*/gi, " ")
  s = s.replace(/[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*/g, " ")

  s = s.replace(/^[\d\s.:,;_|/\\-]+/g, "")
  s = s.replace(/[\d\s.:,;_|/\\-]+$/g, "")
  s = s.replace(/\d{2}\.\d{2}\.\d{2,}(?:\.\d+)*/g, " ")

  s = s.replace(/[^\u0590-\u05FF\s\-–—'"/().,״׳]+/g, " ")
  s = s.replace(/\s+/g, " ").trim()

  const hebrewRuns = s.match(/[\u0590-\u05FF]+(?:\s+[\u0590-\u05FF]+)*/g)
  if (hebrewRuns && hebrewRuns.length > 0) {
    return hebrewRuns.join(" ").replace(/\s+/g, " ").trim()
  }

  return s.trim()
}
