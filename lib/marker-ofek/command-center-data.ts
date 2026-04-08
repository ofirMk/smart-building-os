import "server-only"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { TZDate } from "@date-fns/tz"
import { format, startOfMonth, subDays } from "date-fns"

import {
  derivativeIsDiamondAlert,
  type DerivativeScheduleRow,
} from "@/lib/marker-ofek/derivative-gantt"
import { MARKER_DEMO_SANDBOX_PROJECT_ID } from "@/lib/marker-ofek/hr-qualification-gate"
import type { CommandCenterSnapshot, CommandCenterTile } from "@/lib/marker-ofek/command-center-types"

export type {
  CommandCenterHealthLevel,
  CommandCenterSnapshot,
  CommandCenterTile,
} from "@/lib/marker-ofek/command-center-types"

type BoqLine = {
  tender_project_id: string
  quantity: number | string | null
  unit_price: number | string | null
  boq_version: string
}

function asCount(value: number | null): number {
  return Number.isFinite(value) ? Number(value) : 0
}

async function safeCount(
  run: () => PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  try {
    const { count, error } = await run()
    if (error) return 0
    return asCount(count)
  } catch {
    return 0
  }
}

function sumOpenTendersEstimate(lines: BoqLine[], projectIds: string[]): number {
  let total = 0
  for (const pid of projectIds) {
    const projectLines = lines.filter((l) => l.tender_project_id === pid)
    if (projectLines.length === 0) continue
    const versions = new Set(projectLines.map((l) => l.boq_version))
    const pick = versions.has("final")
      ? "final"
      : versions.has("v2")
        ? "v2"
        : "v1"
    for (const l of projectLines.filter((x) => x.boq_version === pick)) {
      const q = Number(l.quantity)
      const p = Number(l.unit_price)
      if (Number.isFinite(q) && Number.isFinite(p)) total += q * p
    }
  }
  return Math.round(total * 100) / 100
}

/**
 * מדדי מרכז הפיקוד — שימוש בדף command-center ובבדיקות.
 */
export async function getCommandCenterSnapshot(): Promise<CommandCenterSnapshot> {
  const supabase = await createSupabaseServerAuthClient()
  const db = supabase.schema("public")
  const tz = "Asia/Jerusalem"
  const nowJerusalem = new TZDate(Date.now(), tz)
  const startOfMonthIso = format(startOfMonth(nowJerusalem), "yyyy-MM-dd")
  const sevenDaysAgoIso = format(subDays(nowJerusalem, 7), "yyyy-MM-dd")
  const yesterdayIso = format(subDays(nowJerusalem, 1), "yyyy-MM-dd")
  const todayIso = format(nowJerusalem, "yyyy-MM-dd")
  const stalePartialCutoff = format(subDays(nowJerusalem, 21), "yyyy-MM-dd")

  const { data: firstActiveProject } = await db
    .from("projects")
    .select("id")
    .eq("is_deleted", false)
    .eq("is_demo_data", false)
    .in("status", ["planning", "active", "on_hold"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const ganttHref = firstActiveProject?.id
    ? `/marker-ofek/execution/gantt/${firstActiveProject.id}`
    : "/marker-ofek/projects"

  const [
    poPendingApproval,
    draftFieldLogsYesterday,
    weeklyExecutionLogs,
    receiptsThisMonth,
    openTenderIdsData,
    sitesRes,
    activeProjRes,
    derivativeTasksRes,
    staleDraftPartials,
  ] = await Promise.all([
    safeCount(() =>
      db
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("is_deleted", false)
        .neq("project_id", MARKER_DEMO_SANDBOX_PROJECT_ID)
        .is("ceo_signed_at", null)
        .then((r) => ({ count: r.count, error: r.error }))
    ),
    safeCount(() =>
      db
        .from("project_daily_logs")
        .select("id", { count: "exact", head: true })
        .eq("log_date", yesterdayIso)
        .eq("field_approval_status", "draft")
        .then((r) => ({ count: r.count, error: r.error }))
    ),
    safeCount(() =>
      db
        .from("daily_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgoIso)
        .then((r) => ({ count: r.count, error: r.error }))
    ),
    safeCount(() =>
      db
        .from("goods_receipts")
        .select("id", { count: "exact", head: true })
        .gte("receipt_date", startOfMonthIso)
        .then((r) => ({ count: r.count, error: r.error }))
    ),
    db.from("tender_projects").select("id").in("status", ["draft", "submitted"]),
    db.from("project_sites").select("project_id"),
    db
      .from("projects")
      .select("id")
      .eq("is_deleted", false)
      .eq("is_demo_data", false)
      .in("status", ["planning", "active", "on_hold"]),
    db
      .from("tasks")
      .select("id, name, progress, start_date, end_date, parent_task_id")
      .eq("is_derivative", true)
      .not("parent_task_id", "is", null)
      .limit(400),
    safeCount(() =>
      db
        .from("partial_accounts")
        .select("id", { count: "exact", head: true })
        .eq("is_deleted", false)
        .eq("status", "draft")
        .lt("created_at", stalePartialCutoff)
        .then((r) => ({ count: r.count, error: r.error }))
    ),
  ])

  const openTenderIds = (openTenderIdsData.data ?? []).map((r) => (r as { id: string }).id)
  const openTendersCount = openTenderIds.length

  const activeProjectIds = new Set(
    activeProjRes.error != null
      ? []
      : ((activeProjRes.data ?? []) as Array<{ id: string }>)
          .map((r) => String(r.id ?? "").trim())
          .filter(Boolean)
  )
  const activeSitesCount =
    sitesRes.error != null
      ? 0
      : ((sitesRes.data ?? []) as Array<{ project_id: string }>).filter((s) =>
          activeProjectIds.has(String(s.project_id ?? "").trim())
        ).length

  const derRows: Array<Record<string, unknown>> =
    derivativeTasksRes.error != null
      ? []
      : ((derivativeTasksRes.data ?? []) as Array<Record<string, unknown>>)

  const parentIds = [
    ...new Set(derRows.map((r) => String(r.parent_task_id ?? "").trim()).filter(Boolean)),
  ]
  let scheduleExceptions = 0
  if (parentIds.length > 0 && derRows.length > 0) {
    const { data: masterRows } = await db
      .from("tasks")
      .select("id, name, progress, start_date, end_date")
      .in("id", parentIds)
    const masterMap = new Map<string, DerivativeScheduleRow>()
    for (const m of masterRows ?? []) {
      const row = m as Record<string, unknown>
      const id = String(row.id ?? "").trim()
      if (!id) continue
      masterMap.set(id, {
        id,
        name: String(row.name ?? ""),
        parent_task_id: null,
        is_derivative: false,
        progress: Number(row.progress ?? 0) || 0,
        start_date: row.start_date == null ? null : String(row.start_date).trim() || null,
        end_date: row.end_date == null ? null : String(row.end_date).trim() || null,
      })
    }
    for (const d of derRows) {
      const pid = String(d.parent_task_id ?? "").trim()
      const sub: DerivativeScheduleRow = {
        id: String(d.id ?? ""),
        name: String(d.name ?? ""),
        parent_task_id: pid || null,
        is_derivative: true,
        progress: Number(d.progress ?? 0) || 0,
        start_date: d.start_date == null ? null : String(d.start_date).trim() || null,
        end_date: d.end_date == null ? null : String(d.end_date).trim() || null,
      }
      if (derivativeIsDiamondAlert(sub, pid ? masterMap.get(pid) : undefined, todayIso)) {
        scheduleExceptions += 1
      }
    }
  }

  let boqForOpen: BoqLine[] = []
  if (openTenderIds.length > 0) {
    const { data: boqLines } = await db
      .from("tender_boq_items")
      .select("tender_project_id, quantity, unit_price, boq_version")
      .in("tender_project_id", openTenderIds)
    boqForOpen = (boqLines ?? []) as BoqLine[]
  }

  const currencyIls = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

  const totalTenderEstimate =
    openTenderIds.length > 0 ? sumOpenTendersEstimate(boqForOpen, openTenderIds) : 0

  const tiles: CommandCenterTile[] = [
    {
      title: "רכש",
      href: "/marker-ofek/procurement/orders",
      summary: `${poPendingApproval} הזמנות ממתינות לאישור`,
      highlights: [
        `${poPendingApproval} הזמנות ממתינות לאישור הנהלה`,
        `${receiptsThisMonth} קליטות סחורה החודש`,
        "פריטים, קטלוג, הזמנות — לפני מכרזים וביצוע",
      ],
      quickActionLabel: "לאישור הזמנות",
      quickActionHref: "/marker-ofek/procurement/purchase-orders/new",
      level: poPendingApproval > 10 ? "red" : poPendingApproval > 3 ? "yellow" : "green",
      summaryMono: true,
    },
    {
      title: "מכרזים",
      href: "/marker-ofek/tenders",
      summary: `${openTendersCount} מכרזים פתוחים · אומדן כולל ${currencyIls.format(totalTenderEstimate)}`,
      highlights: [
        `${openTendersCount} מכרזים במצב טיוטה או הוגש`,
        `אומדן כולל מצטבר (BoQ): ${currencyIls.format(totalTenderEstimate)}`,
        "כתבי כמויות, השוואת הצעות והמרה לחוזה",
      ],
      quickActionLabel: "מרכז מכרזים",
      quickActionHref: "/marker-ofek/tenders",
      level: openTendersCount > 8 ? "yellow" : openTendersCount > 0 ? "green" : "green",
      summaryMono: true,
    },
    {
      title: "פרויקטים",
      href: "/marker-ofek/projects",
      summary: `${activeSitesCount} אתרים פעילים | ${scheduleExceptions} חריגות בלו\"ז`,
      highlights: [
        "ניהול אתרים, גאנט ביצוע, דיווח ביצוע יומי וסנכרון שטח",
        `${weeklyExecutionLogs} דיווחי ביצוע בשבעת הימים האחרונים`,
        "גאנט, תוכניות ודיווח יומי — חוזים במודול חוזה וחשבונות",
      ],
      quickActionLabel: "פתיחת גאנט",
      quickActionHref: ganttHref,
      level: scheduleExceptions > 6 ? "red" : scheduleExceptions > 0 ? "yellow" : "green",
      summaryMono: true,
      articleClassName: "min-h-[272px] md:p-7",
    },
    {
      title: "חוזה וחשבונות",
      href: "/marker-ofek/finance/contracts-billing",
      summary: "חוזים לפני חשבונות חלקיים — מדדים, עכבון, חריגים וכספת",
      highlights: [
        "סדר זהב: יצירת חוזה → כספת → הצמדות → חלקיים",
        "כספת מסמכים: הרשאות צפייה וניתוח AI",
        "חשבונות חלקיים אחרי ליבת החוזה",
      ],
      quickActionLabel: "פתיחת מרכז חוזה וחשבונות",
      quickActionHref: "/marker-ofek/finance/contracts-billing",
      level: "green",
      summaryMono: false,
    },
    {
      title: "כספים",
      href: "/marker-ofek/finance/billing",
      summary: "חשבוניות מס, מרכז חיוב ותזרים, חשבונית מרכזת",
      highlights: [
        "מודול נפרד אחרי חוזה וחשבונות — מסמכי מס ותזרים",
        "מרכז חיוב לפי פרויקט וחוזה",
        "חשבונית מרכזת ודיווח כספי",
      ],
      quickActionLabel: "מרכז חיוב ותזרים",
      quickActionHref: "/marker-ofek/finance/billing",
      level: "green",
      summaryMono: false,
    },
  ]

  return {
    tiles,
    poPendingApproval,
    draftFieldLogsYesterday,
    weeklyExecutionLogs,
    openTendersCount,
    scheduleExceptions,
    staleDraftPartials,
    ganttHref,
  }
}
