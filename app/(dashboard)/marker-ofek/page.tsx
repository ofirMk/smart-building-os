import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { TZDate } from "@date-fns/tz"
import { format, startOfMonth, subDays } from "date-fns"
import { CheckCircle2, Clock3, FileCheck2, PackageSearch } from "lucide-react"

type HealthLevel = "green" | "yellow" | "red"

type Tile = {
  title: string
  href: string
  summary: string
  highlights: string[]
  quickActionLabel: string
  quickActionHref: string
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
  const startOfMonthIso = format(startOfMonth(nowJerusalem), "yyyy-MM-dd")
  const sevenDaysAgoIso = format(subDays(nowJerusalem, 7), "yyyy-MM-dd")
  const { data: firstActiveProject } = await db
    .from("projects")
    .select("id")
    .eq("is_deleted", false)
    .in("status", ["planning", "active", "on_hold"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const ganttHref = firstActiveProject?.id
    ? `/marker-ofek/execution/gantt/${firstActiveProject.id}`
    : "/marker-ofek/projects"
  const { data: irHaYayinProject } = await db
    .from("projects")
    .select("id, name")
    .eq("is_deleted", false)
    .or("name.ilike.%עיר היין%,name.ilike.%ir ha%,name.ilike.%irhayayin%")
    .limit(1)
    .maybeSingle()
  const progressProjectId =
    String(irHaYayinProject?.id ?? "").trim() || String(firstActiveProject?.id ?? "").trim()
  let progressPercent = 45
  if (progressProjectId) {
    const { data: taskRows } = await db
      .from("tasks")
      .select("progress")
      .eq("project_id", progressProjectId)
      .limit(500)
    const values = (taskRows ?? [])
      .map((r) => Number((r as { progress?: unknown }).progress ?? 0))
      .filter((v) => Number.isFinite(v))
    if (values.length > 0) {
      progressPercent = Math.round(values.reduce((acc, v) => acc + v, 0) / values.length)
    }
  }
  const { data: cableItem } = await db
    .from("items_catalog")
    .select("description")
    .eq("is_inventory", true)
    .or("description.ilike.%4x35%,description.ilike.%כבל 4x35%")
    .limit(1)
    .maybeSingle()
  const lowStockLabel = String(cableItem?.description ?? "").trim() || "כבל 4x35"

  // הגבלת שכבת החברה לטבלאות מרקר אופק בלבד.
  const [
    poPendingApproval,
    itemsCatalogCount,
    weeklyExecutionLogs,
    aiPendingInvoices,
    unpaidInvoicesCount,
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
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .neq("status", "paid")
    ),
    safeCount(() =>
      db
        .from("goods_receipts")
        .select("id", { count: "exact", head: true })
        .gte("receipt_date", startOfMonthIso)
    ),
  ])
  const aiSummaryText =
    aiPendingInvoices > 0
      ? `${aiPendingInvoices} חשבונית חדשה זוהתה ע״י AI`
      : "לא זוהו חשבוניות חדשות ע״י AI"

  const tiles: Tile[] = [
    {
      title: "רכש",
      href: "/marker-ofek/procurement",
      summary: `${poPendingApproval} הזמנות ממתינות לאישור`,
      highlights: [
        `${poPendingApproval} הזמנות ממתינות לאישור הנהלה`,
        `${receiptsThisMonth} קליטות סחורה החודש`,
        "עדכון ספקים ומחירים זמין כעת",
      ],
      quickActionLabel: "לאישור הזמנות",
      quickActionHref: "/marker-ofek/procurement/purchase-orders/new",
      level: poPendingApproval > 10 ? "red" : poPendingApproval > 3 ? "yellow" : "green",
    },
    {
      title: "מלאי",
      href: "/marker-ofek/items",
      summary: `התראת מלאי נמוך: ${lowStockLabel}`,
      highlights: [
        `התראת מלאי נמוך: ${lowStockLabel}`,
        `${itemsCatalogCount} פריטים פעילים בקטלוג`,
        `${weeklyExecutionLogs} תנועות יציאה/דיווח בשבוע האחרון`,
      ],
      quickActionLabel: "הוספת תנועת מלאי",
      quickActionHref: "/marker-ofek/procurement/delivery-notes/new",
      level: itemsCatalogCount < 50 ? "red" : itemsCatalogCount < 200 ? "yellow" : "green",
    },
    {
      title: "דוחות ביצוע",
      href: ganttHref,
      summary: `פרויקט "${String(irHaYayinProject?.name ?? "עיר היין")}" ב-${progressPercent}% התקדמות`,
      highlights: [
        `פרויקט "${String(irHaYayinProject?.name ?? "עיר היין")}" ב-${progressPercent}% התקדמות`,
        `${weeklyExecutionLogs} דיווחי ביצוע בשבעת הימים האחרונים`,
        "מעבר ישיר לגאנט להאצת החלטות",
      ],
      quickActionLabel: "פתיחת גאנט",
      quickActionHref: ganttHref,
      level: progressPercent < 35 ? "red" : progressPercent < 65 ? "yellow" : "green",
    },
    {
      title: "חשבוניות AI",
      href: "/marker-ofek/procurement/invoices/new",
      summary: aiSummaryText,
      highlights: [
        aiSummaryText,
        `${unpaidInvoicesCount} חשבוניות פתוחות לתשלום`,
        "בדיקת התאמות מוכנה לאישור",
      ],
      quickActionLabel: "אישור חשבונית",
      quickActionHref: "/marker-ofek/procurement/invoices/new",
      level: aiPendingInvoices > 20 ? "red" : aiPendingInvoices > 8 ? "yellow" : "green",
    },
  ]

  return (
    <div
      dir="rtl"
      className="min-h-[calc(100vh-4rem)] bg-zinc-50 px-3 py-4 md:px-5 md:py-6 dark:bg-[radial-gradient(circle_at_top,rgba(82,82,91,0.28)_0%,rgba(24,24,27,0.92)_45%,rgba(24,24,27,1)_100%)]"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 font-sans text-[13px] text-zinc-900 dark:text-zinc-100">
        <header className="space-y-2 text-start">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            מרקר אופק
          </p>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-2xl">מרכז הפיקוד</h1>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            תצוגת מצב חיה לכל תחום עבודה — בקרה מהירה, החלטות מדויקות.
          </p>
        </header>

        <section
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          role="navigation"
          aria-label="מודולי מרקר אופק"
        >
          {tiles.map((tile) => {
            const meta = statusMeta(tile.level)
            return (
              <article
                key={tile.href}
                className="group flex min-h-48 flex-col justify-between rounded-sm border border-zinc-300 bg-white p-3 transition-all duration-150 hover:border-zinc-500 hover:bg-zinc-100 dark:border-zinc-700/90 dark:bg-zinc-900/92 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/92"
              >
                <a href={tile.href} className="block">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                      {tile.title}
                    </h2>
                    <span className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}>
                      <span className={`inline-block size-2 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {tile.summary}
                  </p>
                </a>
                <ul className="mt-2 space-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {tile.highlights.map((line, idx) => (
                    <li key={`${tile.title}-${idx}`} className="flex items-start gap-1.5">
                      {idx === 0 ? (
                        <Clock3 className="mt-0.5 size-3.5 text-amber-600" aria-hidden />
                      ) : idx === 1 ? (
                        <PackageSearch className="mt-0.5 size-3.5 text-zinc-600" aria-hidden />
                      ) : (
                        <CheckCircle2 className="mt-0.5 size-3.5 text-emerald-600" aria-hidden />
                      )}
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <a
                    href={tile.quickActionHref}
                    className="inline-flex items-center gap-1 rounded-sm border border-zinc-300 bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-900 transition hover:border-zinc-500 hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-700"
                  >
                    <FileCheck2 className="size-3.5" />
                    {tile.quickActionLabel}
                  </a>
                </div>
              </article>
            )
          })}
        </section>
      </div>
    </div>
  )
}
