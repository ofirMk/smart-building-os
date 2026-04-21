import Link from "next/link"
import {
  ArrowUpRight,
  FolderKanban,
  Landmark,
  LineChart,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getOrganizationBranding } from "@/lib/marker-ofek/organization-branding"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatCountHe } from "@/lib/dashboard-stats"
import { cn } from "@/lib/utils"

const ACTIVE_PROJECT_STATUSES = ["planning", "active", "on_hold"] as const

export async function MarkerOfekDashboardHome() {
  const supabase = await createSupabaseServerAuthClient()
  const branding = await getOrganizationBranding()

  const [projectsCountRes, reportsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("is_deleted", false)
      .in("status", [...ACTIVE_PROJECT_STATUSES]),
    supabase
      .from("project_progress_reports")
      .select("id, report_month, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  const activeProjects = projectsCountRes.count ?? 0
  const recentReports = (reportsRes.data ?? []) as {
    id: string
    report_month: string | null
    created_at: string | null
  }[]
  const reportsError = reportsRes.error?.message

  return (
    <div
      dir="rtl"
      lang="he"
      className={cn(
        "mx-auto w-full max-w-[88rem] space-y-10 md:space-y-12",
        "px-0"
      )}
    >
      <header className="space-y-3 text-center sm:mx-0 sm:max-w-2xl sm:text-start">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {branding.organizationName}
        </p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          לוח בקרה — בנייה וביצוע
        </h1>
        <p className="mx-auto max-w-xl text-pretty text-sm text-muted-foreground sm:mx-0 md:text-base">
          {branding.slogan} מסך הבית של מערכת הביצוע והרכש. ניהול נכסים (הולדן) נמצא תחת נתיבי המתקנים —
          לא כאן.
        </p>
      </header>

      <section
        className="grid gap-6 md:grid-cols-3"
        aria-label="סיכום מהיר"
      >
        <Card className="rounded-xl border border-slate-100 bg-card shadow-sm transition-colors duration-200 hover:border-slate-200">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-lg font-semibold text-[#1e293b]">
                פרויקטים פעילים
              </CardTitle>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-background">
                <FolderKanban className="size-5 text-slate-500" aria-hidden />
              </span>
            </div>
            <CardDescription className="text-slate-400">
              סטטוסים: תכנון, פעיל, בהמתנה
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="font-currency-mono text-3xl font-semibold tabular-nums text-[#1e293b]">
              {formatCountHe(activeProjects)}
            </p>
            <Button
              variant="outline"
              size="sm"
              render={
                <Link href="/marker-ofek/projects">
                  לרשימת הפרויקטים
                  <ArrowUpRight className="ms-1 size-4" aria-hidden />
                </Link>
              }
            />
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-100 bg-card shadow-sm transition-colors duration-200 hover:border-slate-200 md:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg font-semibold text-[#1e293b]">
                  דוחות התקדמות אחרונים
                </CardTitle>
                <CardDescription className="text-slate-400">
                  נשלפים ממסד הנתונים — קישור ליצירה ועריכה
                </CardDescription>
              </div>
              <Button
                variant="secondary"
                size="sm"
                render={
                  <Link href="/marker-ofek/execution/progress-reports/new">
                    דוח חדש
                  </Link>
                }
              />
            </div>
          </CardHeader>
          <CardContent>
            {reportsError ? (
              <p className="text-sm text-destructive">
                לא ניתן לטעון דוחות: {reportsError}
              </p>
            ) : recentReports.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                אין עדיין דוחות התקדמות במערכת.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {recentReports.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-background"
                  >
                    <span className="font-medium text-[#1e293b]">
                      {r.report_month
                        ? `דיווח לחודש ${r.report_month}`
                        : "דוח התקדמות"}
                    </span>
                    <Link
                      href="/marker-ofek/execution/progress-reports/new"
                      className="text-xs text-primary underline-offset-4 hover:underline"
                    >
                      פתיחה / המשך
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-xl border border-slate-100 bg-card shadow-sm transition-colors duration-200 hover:border-slate-200">
        <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-2">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-background">
            <LineChart className="size-5 text-indigo-600" aria-hidden />
          </span>
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold text-[#1e293b]">
              בקרת תקציב ועלויות
            </CardTitle>
            <CardDescription className="text-slate-400">
              מעקב תקציבי פרויקטים, התאמות והשוואה לתכנון — במערכת הביצוע בלבד.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <Button
            render={
              <Link href="/marker-ofek/budget">
                <Landmark className="me-1 size-4" aria-hidden />
                מעבר לבקרת תקציב
              </Link>
            }
          />
          <Button
            variant="outline"
            render={
              <Link href="/marker-ofek/finance/centralized">
                כספים מרכזיים
              </Link>
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
