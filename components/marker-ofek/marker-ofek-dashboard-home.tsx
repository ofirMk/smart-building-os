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
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatCountHe } from "@/lib/dashboard-stats"
import { cn } from "@/lib/utils"

const ACTIVE_PROJECT_STATUSES = ["planning", "active", "on_hold"] as const

export async function MarkerOfekDashboardHome() {
  const supabase = await createSupabaseServerAuthClient()

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
          מרקר אופק יזמות וביצוע
        </p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          לוח בקרה — בנייה וביצוע
        </h1>
        <p className="mx-auto max-w-xl text-pretty text-sm text-muted-foreground sm:mx-0 md:text-base">
          מסך הבית של מרקר אופק בלבד. ניהול נכסים (הולדן) נמצא תחת נתיבי המתקנים
          — לא כאן.
        </p>
      </header>

      <section
        className="grid gap-6 md:grid-cols-3"
        aria-label="סיכום מהיר"
      >
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-lg font-semibold">
                פרויקטים פעילים
              </CardTitle>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/50">
                <FolderKanban className="size-5" aria-hidden />
              </span>
            </div>
            <CardDescription>סטטוסים: תכנון, פעיל, בהמתנה</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-3xl font-semibold tabular-nums text-foreground">
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

        <Card className="border-border/80 shadow-sm md:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg font-semibold">
                  דוחות התקדמות אחרונים
                </CardTitle>
                <CardDescription>
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
              <ul className="divide-y divide-border/80 rounded-lg border border-border/60">
                {recentReports.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                  >
                    <span className="font-medium text-foreground">
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

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent shadow-sm">
        <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-2">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-background">
            <LineChart className="size-5 text-primary" aria-hidden />
          </span>
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold">
              בקרת תקציב ועלויות
            </CardTitle>
            <CardDescription>
              מעקב תקציבי פרויקטים, התאמות והשוואה לתכנון — בתוך מרקר אופק בלבד.
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
