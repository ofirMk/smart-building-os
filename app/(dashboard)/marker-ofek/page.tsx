import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { TZDate } from "@date-fns/tz"
import { format, startOfMonth, subDays } from "date-fns"

type HealthLevel = "green" | "yellow" | "red"

type Tile = {
  title: string
  href: string
  summary: string
  level: HealthLevel
}

function statusMeta(level: HealthLevel) {
  if (level === "green") {
    return { label: "תקין", dot: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-300" }
  }
  if (level === "yellow") {
    return { label: "דורש תשומת לב", dot: "bg-amber-400", badge: "bg-amber-400/15 text-amber-300" }
  }
  return { label: "קריטי", dot: "bg-red-500", badge: "bg-red-500/15 text-red-300" }
}

function asCount(value: number | null): number {
  return Number.isFinite(value) ? Number(value) : 0
}

async function safeCount(
  run: () => { then: (onfulfilled: (value: { count: number | null; error: { message: string } | null }) => unknown) => unknown }
) {
  try {
    const { count, error } = await (run() as Promise<{
      count: number | null
      error: { message: string } | null
    }>)
    if (error) return 0
    return asCount(count)
  } catch {
    return 0
  }
}

export default async function MarkerOfekHomePage() {
  const supabase = await createSupabaseServerAuthClient()
  const db = supabase.schema("public")
  const tz = "Asia/Jerusalem"
  const nowJerusalem = new TZDate(Date.now(), tz)
  const todayIso = format(nowJerusalem, "yyyy-MM-dd")
  const startOfMonthIso = format(startOfMonth(nowJerusalem), "yyyy-MM-dd")
  const sevenDaysAgoIso = format(subDays(nowJerusalem, 7), "yyyy-MM-dd")

  // הגבלת שכבת החברה לטבלאות מרקר אופק בלבד.
  const [
    poPendingApproval,
    itemsCatalogCount,
    weeklyExecutionLogs,
    aiPendingInvoices,
    workforceTodayLogs,
    unpaidInvoicesCount,
    tendersInReview,
    receiptsThisMonth,
  ] = await Promise.all([
    safeCount(() =>
      db
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("is_deleted", false)
        .is("ceo_signed_at", null)
    ),
    safeCount(() =>
      db.from("items_catalog").select("id", { count: "exact", head: true })
    ),
    safeCount(() =>
      db
        .from("daily_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgoIso)
    ),
    safeCount(() =>
      db
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
    ),
    safeCount(() =>
      db
        .from("daily_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayIso)
    ),
    safeCount(() =>
      db
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .neq("status", "paid")
    ),
    safeCount(() =>
      db
        .from("tender_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "for_review")
    ),
    safeCount(() =>
      db
        .from("goods_receipts")
        .select("id", { count: "exact", head: true })
        .gte("receipt_date", startOfMonthIso)
    ),
  ])

  const tiles: Tile[] = [
    {
      title: "רכש",
      href: "/marker-ofek/procurement",
      summary: `${poPendingApproval} הזמנות ממתינות לאישור הנהלה`,
      level: poPendingApproval > 10 ? "red" : poPendingApproval > 3 ? "yellow" : "green",
    },
    {
      title: "מלאי",
      href: "/marker-ofek/items",
      summary: `${itemsCatalogCount} פריטים פעילים בקטלוג`,
      level: itemsCatalogCount < 50 ? "red" : itemsCatalogCount < 200 ? "yellow" : "green",
    },
    {
      title: "דוחות ביצוע",
      href: "/marker-ofek/execution/progress-reports",
      summary: `${weeklyExecutionLogs} דיווחים תפעוליים בשבעת הימים האחרונים`,
      level: weeklyExecutionLogs < 3 ? "red" : weeklyExecutionLogs < 10 ? "yellow" : "green",
    },
    {
      title: "חשבוניות AI",
      href: "/marker-ofek/procurement/invoices/new",
      summary: `${aiPendingInvoices} חשבוניות ממתינות לעיבוד`,
      level: aiPendingInvoices > 20 ? "red" : aiPendingInvoices > 8 ? "yellow" : "green",
    },
    {
      title: "כוח אדם",
      href: "/marker-ofek/field-execution",
      summary: `${workforceTodayLogs} דיווחי צוות התקבלו היום`,
      level: workforceTodayLogs < 2 ? "red" : workforceTodayLogs < 5 ? "yellow" : "green",
    },
    {
      title: "תזרים",
      href: "/marker-ofek/finance",
      summary: `${unpaidInvoicesCount} חשבוניות פתוחות במערכת הכספית`,
      level: unpaidInvoicesCount > 30 ? "red" : unpaidInvoicesCount > 10 ? "yellow" : "green",
    },
    {
      title: "מכרזים",
      href: "/marker-ofek/pre-construction",
      summary: `${tendersInReview} מסמכי מכרז ממתינים לבקרה`,
      level: tendersInReview > 15 ? "red" : tendersInReview > 5 ? "yellow" : "green",
    },
    {
      title: "לוגיסטיקה",
      href: "/marker-ofek/procurement/delivery-notes/new",
      summary: `${receiptsThisMonth} קליטות סחורה בוצעו החודש`,
      level: receiptsThisMonth < 5 ? "red" : receiptsThisMonth < 20 ? "yellow" : "green",
    },
  ]

  return (
    <div dir="rtl" className="min-h-[calc(100vh-4rem)] px-4 py-6 md:px-6 md:py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="space-y-2 text-start">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
            מרקר אופק
          </p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">מרכז הפיקוד</h1>
          <p className="text-sm text-muted-foreground">
            תצוגת מצב חיה לכל תחום עבודה — בקרה מהירה, החלטות מדויקות.
          </p>
        </header>

        <section
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
          role="navigation"
          aria-label="מודולי מרקר אופק"
        >
          {tiles.map((tile) => {
            const meta = statusMeta(tile.level)
            return (
              <a
                key={tile.href}
                href={tile.href}
                className="group flex min-h-48 flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-400/60 hover:bg-accent/40 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-semibold text-card-foreground">
                    {tile.title}
                  </h2>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
                    <span className={`inline-block size-2 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {tile.summary}
                </p>
              </a>
            )
          })}
        </section>
      </div>
    </div>
  )
}
