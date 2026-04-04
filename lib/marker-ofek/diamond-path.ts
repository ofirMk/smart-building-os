/**
 * סדר זהב — מיפוי לתפריט האקורדיון (label === `SidebarNavSection.label`).
 */
export const DIAMOND_PATH_STATION_LABELS = [
  "רכש",
  "מכרזים",
  "פרויקטים",
  "חוזה וחשבונות",
  "כספים",
] as const

export type DiamondPathStationLabel = (typeof DIAMOND_PATH_STATION_LABELS)[number]

export function sidebarIndexForDiamondStep(
  sections: readonly { label: string | null }[],
  step: number
): number {
  if (step < 0 || step >= DIAMOND_PATH_STATION_LABELS.length) return 0
  const want = DIAMOND_PATH_STATION_LABELS[step]
  const idx = sections.findIndex((s) => s.label === want)
  if (idx >= 0) return idx
  return Math.min(1 + step, Math.max(0, sections.length - 1))
}
