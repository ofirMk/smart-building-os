"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { ArrowRight, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { useDiamondOnboardingOptional } from "@/components/marker-ofek/diamond-onboarding"
import { useModuleVisibility } from "@/components/marker-ofek/marker-ofek-dashboard-context"
import { useOrganizationBranding } from "@/components/organization-branding-context"
import { buttonVariants } from "@/components/ui/button-variants"
import {
  MODULE_IDS,
  MODULE_SWITCHBOARD_META,
  type ModuleId,
} from "@/lib/marker-ofek/module-registry"
import { resetDiamondOnboarding } from "@/lib/marker-ofek/user-dashboard-config-actions"
import { cn } from "@/lib/utils"

function IndigoSwitch({
  id,
  checked,
  onCheckedChange,
}: {
  id: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      dir="ltr"
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-2",
        checked ? "bg-indigo-600" : "bg-slate-200"
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-0.5 size-6 rounded-full bg-card shadow-sm transition-transform duration-200 ease-out",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5"
        )}
      />
    </button>
  )
}

export function ModuleManagerClient() {
  const router = useRouter()
  const branding = useOrganizationBranding()
  const diamond = useDiamondOnboardingOptional()
  const { modules, setModule, resetAll } = useModuleVisibility()
  const [resetTourPending, startResetTour] = React.useTransition()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <header className="pharmacy-hero-card p-6 md:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
          {branding.organizationName}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1e293b] md:text-3xl">
          ניהול מודולים
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          כיבוי מודול מסיר אותו מהניווט ומהמרכז, ומונע גישה לנתיבים המשויכים (מנותבים
          ללוח הבית). ההגדרות נשמרות בשרת לחשבון המשתמש (מנהל-על יכול לעדכן משתמשים
          אחרים ממסך הרשאות).
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => diamond?.openNavigator()}
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "gap-2 rounded-xl bg-indigo-700 text-white shadow-sm hover:bg-indigo-800"
            )}
          >
            <Sparkles className="size-4 shrink-0" aria-hidden />
            סיור 360° — מנטור
          </button>
          <button
            type="button"
            disabled={resetTourPending}
            onClick={() => {
              startResetTour(async () => {
                const res = await resetDiamondOnboarding()
                if (res.ok) {
                  toast.success("סימון סיום ראשוני אופס. פתחו סיור 360° ממרכז הפיקוד או מכאן.")
                  router.refresh()
                } else {
                  toast.error(res.error)
                }
              })
            }}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-2 border-indigo-100 bg-card text-indigo-900 shadow-sm hover:bg-indigo-50/80"
            )}
          >
            איפוס סימון סיום ראשוני
          </button>
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-[#0f172a]">
            מפת מתגים
          </h2>
          <button
            type="button"
            onClick={() => resetAll()}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "border-slate-100 bg-card text-slate-700 shadow-sm hover:bg-background"
            )}
          >
            איפוס לברירת מחדל (הכל פעיל)
          </button>
        </div>

        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-card shadow-sm">
          {MODULE_IDS.map((id: ModuleId) => {
            const meta = MODULE_SWITCHBOARD_META[id]
            const on = modules[id] === true
            return (
              <li
                key={id}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 first:rounded-t-xl last:rounded-b-xl"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <label
                    htmlFor={`mod-${id}`}
                    className="text-sm font-medium text-[#0f172a]"
                  >
                    {meta.title}
                  </label>
                  <p className="text-xs leading-relaxed text-slate-500">
                    {meta.description}
                  </p>
                  <p className="font-mono text-[10px] text-slate-400">{id}</p>
                </div>
                <IndigoSwitch
                  id={`mod-${id}`}
                  checked={on}
                  onCheckedChange={(v) => setModule(id, v)}
                />
              </li>
            )
          })}
        </ul>
      </section>

      <p className="rounded-lg border border-slate-100 bg-card px-3 py-2 text-xs text-slate-500 shadow-sm">
        רכיבים חדשים יירשמו ב־
        <code className="mx-1 rounded border border-slate-100 bg-background px-1.5 py-0.5 font-mono text-[10px] text-indigo-800">
          lib/marker-ofek/module-registry.ts
        </code>
        כדי שיופיעו כאן.
      </p>

      <Link
        href="/marker-ofek/settings"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "w-fit gap-2 border-slate-100 bg-card text-indigo-700 shadow-sm hover:bg-indigo-50/60"
        )}
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה להגדרות חברה
      </Link>
    </div>
  )
}
