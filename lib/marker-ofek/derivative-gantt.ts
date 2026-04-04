function normalizeIso(value: string | null | undefined): string | null {
  const v = String(value ?? "").trim()
  if (!v) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  return v
}

function dateToUtcMs(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`)
}

export type DerivativeScheduleRow = {
  id: string
  name: string
  parent_task_id: string | null
  is_derivative: boolean
  progress: number
  start_date: string | null
  end_date: string | null
}

/**
 * Linear time-based expectation (calendar span) for "should be at X% by today".
 */
export function linearTimelinePercent(
  start: string | null | undefined,
  end: string | null | undefined,
  todayIso: string
): number | null {
  const s = normalizeIso(start)
  const e = normalizeIso(end)
  const t = normalizeIso(todayIso)
  if (!s || !e || !t) return null
  if (dateToUtcMs(t) <= dateToUtcMs(s)) return 0
  if (dateToUtcMs(t) >= dateToUtcMs(e)) return 100
  const span = dateToUtcMs(e) - dateToUtcMs(s)
  if (span <= 0) return 100
  const elapsed = dateToUtcMs(t) - dateToUtcMs(s)
  return Math.max(0, Math.min(100, Math.round((elapsed / span) * 100)))
}

const LAG_SLACK_PCT = 7

/**
 * "Diamond alert": subcontractor row is behind the master baseline timeline or behind master %.
 */
export function derivativeIsDiamondAlert(
  sub: Pick<DerivativeScheduleRow, "progress" | "start_date" | "end_date">,
  master: Pick<DerivativeScheduleRow, "progress" | "start_date" | "end_date"> | undefined,
  todayIso: string
): boolean {
  if (!master) return false
  const expected = linearTimelinePercent(master.start_date, master.end_date, todayIso)
  if (expected == null) return false
  const subP = Math.round(Number(sub.progress) || 0)
  const masterP = Math.round(Number(master.progress) || 0)
  if (subP < expected - LAG_SLACK_PCT) return true
  if (subP < masterP - LAG_SLACK_PCT) return true
  return false
}

export function masterTaskForDerivative(
  tasks: DerivativeScheduleRow[],
  derivative: DerivativeScheduleRow
): DerivativeScheduleRow | undefined {
  const mid = derivative.parent_task_id?.trim()
  if (!mid || !derivative.is_derivative) return undefined
  return tasks.find((t) => t.id === mid)
}
