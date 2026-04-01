import { addMonths, startOfMonth } from "date-fns"
import { TZDate } from "@date-fns/tz"

import { createSupabaseServerClient } from "@/lib/supabase/server"

const TZ_IL = "Asia/Jerusalem"

export type MonthlyCashflowDatum = {
  monthKey: string
  labelHe: string
  /** סכומים ששולמו בחודש (לפי paid_at, אזור ישראל) */
  collected: number
  /** חשבוניות ממתינות שתאריך היעד בחודש */
  outstanding: number
}

function monthKeyIsrael(isoDate: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_IL,
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date(isoDate))
    .slice(0, 7)
}

/**
 * 6 חודשים אחרונים — גבייה ששולמה מול יתרות לפי תאריך יעד (ממתינות).
 */
export async function getMonthlyInvoiceCashflowLast6Months(): Promise<
  MonthlyCashflowDatum[]
> {
  const now = new TZDate(Date.now(), TZ_IL)
  const startMonth = startOfMonth(now)

  const out: MonthlyCashflowDatum[] = []
  for (let i = 5; i >= 0; i--) {
    const ref = addMonths(startMonth, -i)
    const y = ref.getFullYear()
    const m = ref.getMonth() + 1
    const monthKey = `${y}-${String(m).padStart(2, "0")}`
    const labelHe = new Intl.DateTimeFormat("he-IL", {
      month: "short",
      year: "numeric",
      timeZone: TZ_IL,
    }).format(ref)

    out.push({
      monthKey,
      labelHe,
      collected: 0,
      outstanding: 0,
    })
  }

  const keySet = new Set(out.map((r) => r.monthKey))

  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("invoices")
      .select("amount, status, paid_at, due_date")

    if (error || !data) {
      return out
    }

    const rows = data as {
      amount: string | number | null
      status: string
      paid_at: string | null
      due_date: string | null
    }[]

    for (const row of rows) {
      const amt = Number(row.amount ?? 0)
      if (!Number.isFinite(amt)) continue

      if (row.status === "paid" && row.paid_at) {
        const mk = monthKeyIsrael(row.paid_at)
        if (keySet.has(mk)) {
          const slot = out.find((s) => s.monthKey === mk)
          if (slot) slot.collected += amt
        }
      }

      if (row.status === "pending" && row.due_date) {
        const due = String(row.due_date).trim()
        const ym = /^(\d{4})-(\d{2})/.exec(due)
        const mk = ym ? `${ym[1]}-${ym[2]}` : monthKeyIsrael(`${due}T12:00:00`)
        if (keySet.has(mk)) {
          const slot = out.find((s) => s.monthKey === mk)
          if (slot) slot.outstanding += amt
        }
      }
    }

    for (const slot of out) {
      slot.collected = Math.round(slot.collected * 100) / 100
      slot.outstanding = Math.round(slot.outstanding * 100) / 100
    }
  } catch {
    /* keep zeros */
  }

  return out
}
