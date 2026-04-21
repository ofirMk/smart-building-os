import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, FolderKanban, Plus } from "lucide-react"

import { ActiveProjectsList } from "./active-projects-list"
import { ProjectsModuleNav } from "./projects-module-nav"
import { buttonVariants } from "@/components/ui/button-variants"
import { resolvePartnerMetricsPersona } from "@/lib/marker-ofek/partner-metrics/access"
import { resolveManagingPartnerScope } from "@/lib/marker-ofek/effective-managing-partner-scope"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { cn } from "@/lib/utils"
import type { MarkerOfekProjectRow } from "@/types/marker-ofek"

export const metadata: Metadata = {
  title: "פרויקטים",
  description: "מרכזי רווח — פרויקטים פעילים",
}

const ACTIVE_STATUSES = ["planning", "active", "on_hold"] as const

export default async function MarkerOfekProjectsDashboardPage() {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const persona = resolvePartnerMetricsPersona(user?.email ?? null)
  const scope = await resolveManagingPartnerScope(user?.email ?? null, user?.id ?? null)

  let query = supabase
    .from("projects")
    .select(
      "id, internal_project_code, name, client_name, status, created_at"
    )
    .eq("is_deleted", false)
    .in("status", [...ACTIVE_STATUSES])

  if ((persona === "guy" || persona === "samer") && user?.id) {
    query = query.eq("managing_partner_id", user.id)
  } else if (persona === "ophir" && scope.effectiveManagingPartnerId) {
    query = query.eq("managing_partner_id", scope.effectiveManagingPartnerId)
  }

  const { data, error } = await query.order("created_at", { ascending: false })

  const projects = (data ?? []) as Pick<
    MarkerOfekProjectRow,
    | "id"
    | "internal_project_code"
    | "name"
    | "client_name"
    | "status"
    | "created_at"
  >[]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <div className="pharmacy-hero-card p-6 md:p-8">
        <div
          className="pointer-events-none absolute -start-24 -top-24 size-72 rounded-full bg-violet-500/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-600">
              <FolderKanban className="size-6" aria-hidden />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-violet-600/90">
                מרקר אופק
              </p>
              <h1 className="text-pretty text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                פרויקטים
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                מרכזי רווח (Profit Center): רשימת פרויקטים פעילים — חוזים, גאנט,
                יומני עבודה, תוכניות ומשאבים.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/marker-ofek/projects/new"
              className={cn(
                buttonVariants({ size: "lg" }),
                "gap-2 bg-violet-600 text-white hover:bg-violet-500"
              )}
            >
              <Plus className="size-4" aria-hidden />
              הקמת פרויקט חדש
            </Link>
          </div>
        </div>
      </div>

      <ProjectsModuleNav />

      <div className="rounded-xl border border-slate-100 bg-card p-4 shadow-sm md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">פרויקטים פעילים</h2>
          {error ? (
            <p className="text-sm text-destructive">
              שגיאת טעינה: {error.message}
            </p>
          ) : null}
        </div>

        {projects.length === 0 && !error ? (
          <p className="text-sm text-muted-foreground">
            אין פרויקטים במצב תכנון, פעיל או מושהה. צרו פרויקט חדש כדי להתחיל.
          </p>
        ) : (
          <ActiveProjectsList projects={projects} />
        )}

        <Link
          href="/marker-ofek"
          className="mt-6 inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowRight className="size-4 rotate-180" aria-hidden />
          חזרה ללוח הבקרה
        </Link>
      </div>
    </div>
  )
}
