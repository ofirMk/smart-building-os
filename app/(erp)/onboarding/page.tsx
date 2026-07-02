import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Building2, ChevronLeft, PlusCircle } from "lucide-react"

import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ONBOARDING_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  type OnboardingStatus,
  type ContractType,
} from "@/types/onboarding"

// ─────────────────────────────────────────────────────────────────────────────
// Status → badge variant mapping
// ─────────────────────────────────────────────────────────────────────────────

function statusVariant(status: OnboardingStatus | null): "default" | "secondary" | "destructive" | "outline" {
  if (!status) return "outline"
  const map: Record<OnboardingStatus, "default" | "secondary" | "destructive" | "outline"> = {
    draft: "outline",
    tasks_generated: "secondary",
    in_progress: "default",
    completed: "secondary",
    cancelled: "destructive",
  }
  return map[status]
}

function statusColor(status: OnboardingStatus | null): string {
  if (!status) return "text-muted-foreground"
  const map: Record<OnboardingStatus, string> = {
    draft: "text-muted-foreground",
    tasks_generated: "text-blue-600",
    in_progress: "text-amber-600",
    completed: "text-emerald-600",
    cancelled: "text-destructive",
  }
  return map[status]
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function OnboardingPortfolioPage() {
  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
  if (!companyId) redirect("/login")

  const supabase = createSupabaseServiceRoleClient()

  // Fetch all buildings for this company with their active onboarding config (if any)
  const { data: buildings } = await supabase
    .from("buildings")
    .select(
      `id, name, city,
       erp_onboarding_configs!left(
         id, status, contract_type, tasks_generated_at,
         completed_at, features_config
       )`
    )
    .eq("company_id", companyId)
    .order("name", { ascending: true })

  const rows = (buildings ?? []).map((b) => {
    // Pick the active config (status NOT completed/cancelled) or the most recent completed one
    const configs: Array<{
      id: string
      status: OnboardingStatus
      contract_type: ContractType
      tasks_generated_at: string | null
      completed_at: string | null
    }> = Array.isArray(b.erp_onboarding_configs)
      ? b.erp_onboarding_configs
      : b.erp_onboarding_configs
        ? [b.erp_onboarding_configs as never]
        : []

    const activeConfig = configs.find(
      (c) => !["completed", "cancelled"].includes(c.status)
    ) ?? configs.find((c) => c.status === "completed") ?? null

    return { building: b, config: activeConfig }
  })

  const inProgress = rows.filter((r) => r.config && !["completed", "cancelled"].includes(r.config.status))
  const completed  = rows.filter((r) => r.config?.status === "completed")
  const notStarted = rows.filter((r) => !r.config || r.config.status === "cancelled")

  return (
    <div className="container max-w-6xl py-8 space-y-8" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">הקמת בניינים חכמים</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            ניהול תהליכי ההקמה של כל הבניינים בתיק
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
            {inProgress.length} בתהליך
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            {completed.length} הושלמו
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-slate-300" />
            {notStarted.length} לא התחילו
          </span>
        </div>
      </div>

      {/* In-progress */}
      {inProgress.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            בתהליך הקמה
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {inProgress.map(({ building, config }) => (
              <BuildingCard key={building.id} building={building} config={config} />
            ))}
          </div>
        </section>
      )}

      {/* Not started */}
      {notStarted.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            ממתינים להקמה
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {notStarted.map(({ building }) => (
              <BuildingCard key={building.id} building={building} config={null} />
            ))}
          </div>
        </section>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            הוקמו בהצלחה
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {completed.map(({ building, config }) => (
              <BuildingCard key={building.id} building={building} config={config} />
            ))}
          </div>
        </section>
      )}

      {rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground gap-3">
          <Building2 className="w-12 h-12 opacity-20" />
          <p className="text-sm">לא נמצאו בניינים לחברה זו.</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Building card
// ─────────────────────────────────────────────────────────────────────────────

type BuildingRow = { id: string; name: string; city?: string | null }
type ConfigRow = {
  id: string
  status: OnboardingStatus
  contract_type: ContractType
  tasks_generated_at: string | null
  completed_at: string | null
} | null

function BuildingCard({ building, config }: { building: BuildingRow; config: ConfigRow }) {
  const href = `/erp/onboarding/buildings/${building.id}`
  const isNew = !config

  return (
    <Card className="flex flex-col hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{building.name}</CardTitle>
          {config ? (
            <Badge variant={statusVariant(config.status)} className="shrink-0 text-xs">
              {ONBOARDING_STATUS_LABELS[config.status]}
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
              לא התחיל
            </Badge>
          )}
        </div>
        {building.city && (
          <p className="text-xs text-muted-foreground">{building.city}</p>
        )}
      </CardHeader>

      <CardContent className="text-sm text-muted-foreground flex-1 pb-2">
        {config ? (
          <p>
            <span className="font-medium text-foreground">
              {CONTRACT_TYPE_LABELS[config.contract_type]}
            </span>
            {config.completed_at && (
              <span className="block text-xs mt-1">
                הושלם {new Date(config.completed_at).toLocaleDateString("he-IL")}
              </span>
            )}
          </p>
        ) : (
          <p className="text-xs">לחץ להתחיל הגדרת חוזה ומשימות הקמה</p>
        )}
      </CardContent>

      <CardFooter className="pt-2">
        <Button
          render={<Link href={href} />}
          variant={isNew ? "default" : "outline"}
          size="sm"
          className="w-full gap-1"
        >
          {isNew ? (
            <>
              <PlusCircle className="w-4 h-4" />
              התחל הקמה
            </>
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              {config?.status === "completed" ? "צפה בסיכום" : "המשך הקמה"}
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
