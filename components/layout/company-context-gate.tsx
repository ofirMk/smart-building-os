"use client"

import { Building2, Building, Layers3 } from "lucide-react"
import { useRouter } from "next/navigation"
import type { ComponentType } from "react"

import {
  COMPANY_CONTEXT_OPTIONS,
  type CompanyContextId,
  writeActiveCompanyCookie,
} from "@/lib/company-context"
import { cn } from "@/lib/utils"

const COMPANY_ICONS = {
  marker_ofek: Layers3,
  holden_group: Building2,
  building_management_co: Building,
} as const satisfies Record<CompanyContextId, ComponentType<{ className?: string }>>

export function CompanyContextGate() {
  const router = useRouter()

  return (
    <div
      dir="rtl"
      className="flex min-h-svh w-full items-center justify-center bg-background px-4 py-8 text-foreground"
    >
      <div className="w-full max-w-5xl">
        <header className="mb-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Smart Building OS · ERP Foundation
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            בחירת חברה פעילה
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            לפני הכניסה למערכת, בחרו את הקשר החברה. הבחירה קובעת את מודולי העבודה והנתונים הפעילים.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {COMPANY_CONTEXT_OPTIONS.map((company) => {
            const Icon = COMPANY_ICONS[company.id as keyof typeof COMPANY_ICONS]
            return (
              <button
                key={company.id}
                type="button"
                onClick={() => {
                  writeActiveCompanyCookie(company.id)
                  router.push(company.targetHref)
                }}
                className={cn(
                  "group rounded-2xl border border-slate-200 bg-card p-5 text-start shadow-sm",
                  "transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg hover:shadow-sky-100/70",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
                )}
              >
                <span className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition-colors group-hover:bg-sky-100 group-hover:text-sky-700">
                  <Icon className="size-5" aria-hidden />
                </span>
                <p className="text-base font-semibold text-foreground">{company.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {company.subtitle}
                </p>
              </button>
            )
          })}
        </section>
      </div>
    </div>
  )
}

