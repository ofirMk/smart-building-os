import { notFound } from "next/navigation"
import Link from "next/link"
import { Building2, Home, PlugZap, MapPin, ArrowRight, User, Mail } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getBuildingDetail } from "@/lib/buildings"
import { cn } from "@/lib/utils"
import type { ApartmentRow } from "@/lib/buildings"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

export default async function BuildingDetailPage({ params }: Props) {
  const { id } = await params
  const { data, error } = await getBuildingDetail(id)

  if (error || !data) {
    notFound()
  }

  const occupied = data.apartments.filter((a) => a.tenant_id !== null).length
  const vacant = data.apartments.length - occupied
  const addressParts = [data.address_line1, data.address_line2].filter(Boolean)
  const cityRegion = [data.city, data.region].filter(Boolean)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 text-start">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="breadcrumb">
        <Link href="/buildings" className="hover:text-foreground transition-colors">
          בניינים
        </Link>
        <ArrowRight className="size-3.5 rotate-180" aria-hidden />
        <span className="text-foreground font-medium">{data.name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Building2 className="size-7" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              {data.name}
            </h1>
            {(addressParts.length > 0 || cityRegion.length > 0) && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                {[...addressParts, ...cityRegion].join(" · ")}
                {data.postal_code ? ` · ${data.postal_code}` : ""}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={Home}
          label="סה״כ דירות"
          value={data.apartments.length.toLocaleString("he-IL")}
          color="emerald"
        />
        <StatCard
          icon={User}
          label="מאוכלסות"
          value={occupied.toLocaleString("he-IL")}
          color="cyan"
        />
        <StatCard
          icon={Home}
          label="פנויות"
          value={vacant.toLocaleString("he-IL")}
          color="amber"
        />
        <StatCard
          icon={PlugZap}
          label="עמדות טעינה"
          value={data.parkingSpotCount.toLocaleString("he-IL")}
          color="primary"
        />
      </div>

      {/* Apartments table */}
      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Home className="size-4 text-muted-foreground" aria-hidden />
            דירות
            <Badge variant="secondary" className="text-xs font-medium tabular-nums">
              {data.apartments.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.apartments.length === 0 ? (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <Home className="size-10 text-muted-foreground/40" aria-hidden />
              <p className="text-sm text-muted-foreground">לא נמצאו דירות לבניין זה</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      דירה
                    </th>
                    <th className="px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      קומה
                    </th>
                    <th className="px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      חדרים
                    </th>
                    <th className="px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      דייר
                    </th>
                    <th className="px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      סטטוס
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {data.apartments.map((apt) => (
                    <ApartmentRow key={apt.id} apt={apt} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ApartmentRow({ apt }: { apt: ApartmentRow }) {
  const occupied = apt.tenant_id !== null
  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-4 py-3 font-mono text-sm font-semibold tabular-nums text-foreground">
        {apt.unit_number}
      </td>
      <td className="px-4 py-3 text-muted-foreground tabular-nums">
        {apt.floor ?? "—"}
      </td>
      <td className="px-4 py-3 text-muted-foreground tabular-nums">
        {apt.bedrooms ?? "—"}
      </td>
      <td className="px-4 py-3">
        {occupied ? (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <User className="size-3.5 text-muted-foreground" aria-hidden />
              {apt.tenant_name ?? "—"}
            </span>
            {apt.tenant_email && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="size-3 shrink-0" aria-hidden />
                {apt.tenant_email}
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider",
            occupied
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          )}
        >
          {occupied ? "מאוכלסת" : "פנויה"}
        </Badge>
      </td>
    </tr>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string
  color: "emerald" | "cyan" | "amber" | "primary"
}) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    cyan: "bg-cyan-500/10 border-cyan-500/20 text-cyan-600 dark:text-cyan-400",
    amber: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
    primary: "bg-primary/10 border-primary/20 text-primary",
  }
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border px-4 py-3", colorMap[color])}>
      <div className="flex items-center gap-2">
        <Icon className="size-4 opacity-70" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</span>
      </div>
      <span className="text-2xl font-extrabold tabular-nums tracking-tight">{value}</span>
    </div>
  )
}
