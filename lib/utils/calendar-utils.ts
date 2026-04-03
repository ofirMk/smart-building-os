const hebcalYearCache = new Map<number, Set<string>>()

function normalizeIsoDate(value: string): string {
  const iso = String(value ?? "").trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error("Invalid ISO date. Expected YYYY-MM-DD")
  }
  return iso
}

function getUtcDay(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00.000Z`).getUTCDay()
}

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00.000Z`)
  return new Date(ms + deltaDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function fetchHebcalHolidayDates(
  year: number
): Promise<Set<string>> {
  const y = Math.trunc(Number(year))
  if (!Number.isFinite(y) || y < 1900 || y > 2300) return new Set()
  const cached = hebcalYearCache.get(y)
  if (cached) return cached

  const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&year=${y}&maj=on&min=on&mod=on&nx=on&ss=on&mf=on&c=on&geo=none`
  const res = await fetch(url, { cache: "force-cache" })
  if (!res.ok) {
    throw new Error(`Hebcal request failed (${res.status})`)
  }

  const payload = (await res.json()) as { items?: Array<{ date?: string }> }
  const dates = new Set<string>()
  for (const item of payload.items ?? []) {
    const iso = String(item.date ?? "").slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      dates.add(iso)
    }
  }
  hebcalYearCache.set(y, dates)
  return dates
}

export function isWorkDay(
  date: string | Date,
  jewishHolidayDates: ReadonlySet<string> = new Set()
): boolean {
  const iso =
    date instanceof Date
      ? date.toISOString().slice(0, 10)
      : normalizeIsoDate(String(date))
  const day = getUtcDay(iso)
  if (day === 5 || day === 6) return false
  if (jewishHolidayDates.has(iso)) return false
  return true
}

export function addWorkingDaysSync(
  startIsoDate: string,
  durationDays: number,
  jewishHolidayDates: ReadonlySet<string> = new Set()
): string {
  const start = normalizeIsoDate(startIsoDate)
  const duration = Math.max(0, Math.floor(Number(durationDays) || 0))
  if (duration === 0) return start

  let cursor = start
  let remaining = duration
  while (remaining > 0) {
    cursor = shiftIsoDate(cursor, 1)
    if (isWorkDay(cursor, jewishHolidayDates)) {
      remaining -= 1
    }
  }
  return cursor
}

export async function addWorkingDays(
  startIsoDate: string,
  durationDays: number
): Promise<string> {
  const start = normalizeIsoDate(startIsoDate)
  const duration = Math.max(0, Math.floor(Number(durationDays) || 0))
  if (duration === 0) return start

  const year = Number(start.slice(0, 4))
  const holidaySets = await Promise.all([
    fetchHebcalHolidayDates(year),
    fetchHebcalHolidayDates(year + 1),
  ])
  const holidays = new Set<string>()
  for (const set of holidaySets) {
    for (const iso of set) holidays.add(iso)
  }

  return addWorkingDaysSync(start, duration, holidays)
}
