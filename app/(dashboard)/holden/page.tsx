import Link from "next/link"
import { type LucideIcon, Building2, Percent, PlugZap, Ticket } from "lucide-react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  formatCountHe,
  formatKwhHe,
  getDashboardRpcMetrics,
  getSecondaryDashboardStats,
} from "@/lib/dashboard-stats"
import { getBuildingsWithCounts } from "@/lib/buildings"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"

export default async function HoldenCommandCenterPage() {
  const cookieStore = await cookies()
  const selectedCompany = resolveCompanyContext(
    cookieStore.get(COMPANY_COOKIE_KEY)?.value
  )
  if (!selectedCompany) {
    redirect("/")
  }
  if (selectedCompany === "marker_ofek") {
    redirect("/marker-ofek")
  }
  if (selectedCompany === "building_management_co") {
    redirect("/facility")
  }

  const [rpc, secondary, buildingsResult] = await Promise.all([
    getDashboardRpcMetrics(),
    getSecondaryDashboardStats(),
    getBuildingsWithCounts(),
  ])

  const buildings = buildingsResult.data ?? []
  const totalApartments = buildings.reduce((sum, b) => sum + (b.apartmentCount ?? 0), 0)
  const occupancyPct =
    totalApartments > 0 ? ((rpc.totalTenants / totalApartments) * 100).toFixed(1) : "0.0"

  return (
    <div dir="rtl" lang="he" className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-12 pt-2">
      <header className="space-y-2 text-start">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-400">
          הולדן גרופ - ניהול מבנים
        </p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          מרכז הפיקוד של הולדן
        </h1>
        <p className="text-sm text-muted-foreground">
          מרכז תפעול נכסים ודיירים — מופרד ממערכות הקבלנות של מרקר אופק.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HoldenCard title="בניינים מנוהלים" value={formatCountHe(buildings.length)} icon={Building2} />
        <HoldenCard title="קריאות שירות פתוחות" value={formatCountHe(rpc.openTickets)} icon={Ticket} />
        <HoldenCard title="צריכת חשמל החודש" value={formatKwhHe(secondary.evKwhMonth)} icon={PlugZap} />
        <HoldenCard title="מדד תפוסה" value={`${occupancyPct}%`} icon={Percent} />
      </section>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>קיצורי דרך</CardTitle>
          <CardDescription>גישה מהירה למודולי הולדן</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          <Link href="/buildings" className="text-primary hover:underline">
            ניהול בניינים
          </Link>
          <Link href="/tickets" className="text-primary hover:underline">
            קריאות שירות
          </Link>
          <Link href="/ev-management" className="text-primary hover:underline">
            אנרגיה ו-EV
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function HoldenCard({
  title,
  value,
  icon: Icon,
}: {
  title: string
  value: string
  icon: LucideIcon
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <span className="flex size-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
            <Icon className="size-4" aria-hidden />
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
