"use client"

import * as React from "react"
import { Building, Building2, Layers3 } from "lucide-react"

import {
  ACTIVE_COMPANY_CHANGED_EVENT,
  companyDisplayName,
  readActiveCompanyIdFromCookie,
  type CompanyContextId,
} from "@/lib/company-context"
import { cn } from "@/lib/utils"

const ACTIVE_COMPANY_BADGE_THEME = {
  marker_ofek: {
    icon: Layers3,
    chipClassName: "bg-slate-900/50 border-slate-800 text-slate-200",
    iconClassName: "bg-slate-800 text-slate-200",
  },
  holden_group: {
    icon: Building2,
    chipClassName: "bg-slate-900/50 border-slate-800 text-slate-200",
    iconClassName: "bg-slate-800 text-slate-200",
  },
  building_management_co: {
    icon: Building,
    chipClassName: "bg-slate-900/50 border-slate-800 text-slate-200",
    iconClassName: "bg-slate-800 text-slate-200",
  },
} satisfies Record<
  CompanyContextId,
  {
    icon: React.ComponentType<{ className?: string }>
    chipClassName: string
    iconClassName: string
  }
>

type ActiveCompanyBadgeProps = {
  companyId?: CompanyContextId | null
  className?: string
}

export function ActiveCompanyBadge({ companyId, className }: ActiveCompanyBadgeProps) {
  const [cookieCompany, setCookieCompany] = React.useState<CompanyContextId | null>(() =>
    readActiveCompanyIdFromCookie()
  )

  React.useEffect(() => {
    if (companyId) {
      setCookieCompany(companyId)
      return
    }
    setCookieCompany(readActiveCompanyIdFromCookie())
  }, [companyId])

  React.useEffect(() => {
    const onCompanyChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ companyId?: CompanyContextId }>
      if (customEvent.detail?.companyId) {
        setCookieCompany(customEvent.detail.companyId)
        return
      }
      setCookieCompany(readActiveCompanyIdFromCookie())
    }
    window.addEventListener(ACTIVE_COMPANY_CHANGED_EVENT, onCompanyChanged)
    return () =>
      window.removeEventListener(ACTIVE_COMPANY_CHANGED_EVENT, onCompanyChanged)
  }, [])

  const activeCompany = companyId ?? cookieCompany
  if (!activeCompany) return null

  const theme = ACTIVE_COMPANY_BADGE_THEME[activeCompany as keyof typeof ACTIVE_COMPANY_BADGE_THEME]
  const Icon = theme.icon
  const displayName = companyDisplayName(activeCompany)

  return (
    <div
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border px-3 shadow-[0_2px_16px_rgba(15,23,42,0.08)]",
        "backdrop-blur-sm",
        theme.chipClassName,
        className
      )}
      aria-label={`חברה פעילה: ${displayName}`}
      title={`חברה פעילה: ${displayName}`}
    >
      <span
        className={cn(
          "inline-flex size-5 items-center justify-center rounded-md",
          theme.iconClassName
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="text-[10px] font-semibold tracking-wide text-slate-300">חברה פעילה</span>
      <span className="max-w-[11rem] truncate text-xs font-semibold text-slate-100">
        {displayName}
      </span>
    </div>
  )
}

