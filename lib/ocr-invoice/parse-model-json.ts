/**
 * Extract JSON object or array from model text (strip fences, trim prose).
 */
export function extractModelJsonPayload(text: string): unknown {
  let s = text.replace(/^\uFEFF/, "").trim()
  const fence =
    /^```(?:json)?\s*([\s\S]*?)```\s*$/im.exec(s) ??
    /^```\s*([\s\S]*?)```\s*$/im.exec(s)
  if (fence) s = fence[1].trim()

  const tryParse = (chunk: string) => {
    try {
      return JSON.parse(chunk) as unknown
    } catch {
      return undefined
    }
  }

  const direct = tryParse(s)
  if (direct !== undefined) return direct

  const iObj = s.indexOf("{")
  const iArr = s.indexOf("[")
  const candidates = [iObj, iArr].filter((i) => i >= 0)
  if (candidates.length === 0) {
    throw new Error("לא נמצא JSON בתשובת המודל")
  }
  const start = Math.min(...candidates)
  const open = s[start]
  const close = open === "{" ? "}" : "]"

  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (escape) {
        escape = false
      } else if (c === "\\") {
        escape = true
      } else if (c === '"') {
        inString = false
      }
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) {
        const slice = s.slice(start, i + 1)
        const parsed = tryParse(slice)
        if (parsed !== undefined) return parsed
        throw new Error("תוכן JSON פגום בתשובת המודל")
      }
    }
  }

  throw new Error("לא ניתן לפרסר JSON מתשובת המודל")
}
