"use client"

import * as React from "react"
import { toast } from "sonner"

import { useOrganizationBranding } from "@/components/organization-branding-context"
import {
  listUsersForDashboardConfig,
  setUserDashboardModuleFlag,
  setUserMarkerAccessFlags,
  type DashboardConfigUserRow,
} from "@/lib/marker-ofek/user-dashboard-config-actions"
import {
  MODULE_IDS,
  MODULE_SWITCHBOARD_META,
  type ModuleId,
} from "@/lib/marker-ofek/module-registry"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { ArrowRight, Loader2 } from "lucide-react"

function IndigoSwitch({
  id,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      dir="ltr"
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-2",
        disabled ? "cursor-not-allowed opacity-60" : "",
        checked ? "bg-indigo-600" : "bg-slate-200"
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-0.5 size-6 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5"
        )}
      />
    </button>
  )
}

export function UserPermissionsClient() {
  const branding = useOrganizationBranding()
  const [rows, setRows] = React.useState<DashboardConfigUserRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [pending, setPending] = React.useState<Record<string, boolean>>({})

  React.useEffect(() => {
    let c = false
    async function load() {
      setLoading(true)
      const res = await listUsersForDashboardConfig()
      if (!c) {
        if (res.ok) setRows(res.users)
        else toast.error(res.error)
        setLoading(false)
      }
    }
    void load()
    return () => {
      c = true
    }
  }, [])

  async function onAccessToggle(
    userId: string,
    key: "viewFinancials" | "editAccess",
    value: boolean
  ) {
    const row = rows.find((r) => r.userId === userId)
    if (!row) return
    const next = {
      viewFinancials:
        key === "viewFinancials" ? value : row.markerAccess.viewFinancials,
      editAccess: key === "editAccess" ? value : row.markerAccess.editAccess,
    }
    const k = `${userId}:access`
    setRows((list) =>
      list.map((r) =>
        r.userId === userId ? { ...r, markerAccess: { ...next } } : r
      )
    )
    setPending((p) => ({ ...p, [k]: true }))
    const res = await setUserMarkerAccessFlags({
      targetUserId: userId,
      viewFinancials: next.viewFinancials,
      editAccess: next.editAccess,
    })
    setPending((p) => {
      const n = { ...p }
      delete n[k]
      return n
    })
    if (!res.ok) {
      toast.error(res.error)
      setRows((list) =>
        list.map((r) => (r.userId === userId ? { ...r, markerAccess: row.markerAccess } : r))
      )
    }
  }

  async function onToggle(userId: string, moduleId: ModuleId, value: boolean) {
    const key = `${userId}:${moduleId}`
    const prev = rows.find((r) => r.userId === userId)?.modules[moduleId]
    setRows((list) =>
      list.map((r) =>
        r.userId === userId
          ? { ...r, modules: { ...r.modules, [moduleId]: value } }
          : r
      )
    )
    setPending((p) => ({ ...p, [key]: true }))
    const res = await setUserDashboardModuleFlag({ targetUserId: userId, moduleId, value })
    setPending((p) => {
      const n = { ...p }
      delete n[key]
      return n
    })
    if (!res.ok) {
      toast.error(res.error)
      setRows((list) =>
        list.map((r) =>
          r.userId === userId
            ? {
                ...r,
                modules: {
                  ...r.modules,
                  [moduleId]: typeof prev === "boolean" ? prev : !value,
                },
              }
            : r
        )
      )
    }
  }

  return (
    <div className="bg-white font-sans text-[#0f172a] rtl" dir="rtl">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
        <header className="pharmacy-hero-card p-6 md:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
            {branding.organizationName}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1e293b] md:text-3xl">
            הרשאות משתמשים — מודולים
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            נראות מודולים, צפייה במרכז שותפי ניהול והרשאת עריכה (שמורה
            לשכבות עתידיות). שינויים נשמרים בשרת.
          </p>
        </header>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            טוען משתמשים…
          </div>
        ) : (
          <div className="space-y-6">
            {rows.map((row) => (
              <section
                key={row.userId}
                className="rounded-xl border border-slate-100 bg-white shadow-sm"
              >
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="font-mono text-xs text-slate-500">{row.userId}</p>
                  <p className="text-sm font-semibold text-[#0f172a]">
                    {row.email ?? "—"}
                  </p>
                </div>
                <ul className="divide-y divide-slate-100 border-b border-slate-100">
                  <li className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm font-medium text-[#0f172a]">
                        צפייה בכספים — הנהלה בכירה
                      </p>
                      <p className="text-xs text-slate-500">
                        מרכז שותפי ניהול / פירוט פרויקט
                      </p>
                    </div>
                    <IndigoSwitch
                      id={`${row.userId}-view-fin`}
                      checked={row.markerAccess.viewFinancials}
                      disabled={pending[`${row.userId}:access`] === true}
                      onCheckedChange={(v) => void onAccessToggle(row.userId, "viewFinancials", v)}
                    />
                  </li>
                  <li className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm font-medium text-[#0f172a]">הרשאת עריכה</p>
                      <p className="text-xs text-slate-500">
                        שמורה לבקרת שינויים עתידית במודולים
                      </p>
                    </div>
                    <IndigoSwitch
                      id={`${row.userId}-edit`}
                      checked={row.markerAccess.editAccess}
                      disabled={pending[`${row.userId}:access`] === true}
                      onCheckedChange={(v) => void onAccessToggle(row.userId, "editAccess", v)}
                    />
                  </li>
                </ul>
                <ul className="divide-y divide-slate-100">
                  {MODULE_IDS.map((mid) => {
                    const meta = MODULE_SWITCHBOARD_META[mid]
                    const on = row.modules[mid] === true
                    const key = `${row.userId}:${mid}`
                    const busy = pending[key] === true
                    return (
                      <li
                        key={mid}
                        className="flex flex-wrap items-center justify-between gap-4 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="text-sm font-medium text-[#0f172a]">{meta.title}</p>
                          <p className="font-mono text-[10px] text-slate-400">{mid}</p>
                        </div>
                        <IndigoSwitch
                          id={`${row.userId}-${mid}`}
                          checked={on}
                          disabled={busy}
                          onCheckedChange={(v) => void onToggle(row.userId, mid, v)}
                        />
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <Link
          href="/marker-ofek/settings/modules"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "w-fit gap-2 text-indigo-700"
          )}
        >
          <ArrowRight className="size-4 rotate-180" aria-hidden />
          ניהול מודולים (אצלך)
        </Link>
      </div>
    </div>
  )
}
