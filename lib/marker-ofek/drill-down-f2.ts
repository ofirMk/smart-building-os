import type * as React from "react"

/**
 * קיצור ERP: Drill-Down / Quick Setup — פותח מסך הקמת מאסטר בלשונית חדשה
 * כדי לא לאבד מצב טופס (למשל קליטת OCR).
 */
export const DRILL_DOWN_QUICK_SETUP_KEY = "F2" as const

export const PROCUREMENT_DRILLDOWN_URLS = {
  /** הקמת פרויקט חדש (מרכז רווח) */
  projectSetup: "/marker-ofek/projects/new",
  /** Placeholder — ניהול קטגוריות רכש / Shadow Catalog */
  categorySetup: "/marker-ofek/procurement/categories-setup",
} as const

const ALLOWED_DRILLDOWN_PATHS: ReadonlySet<string> = new Set(
  Object.values(PROCUREMENT_DRILLDOWN_URLS)
)

/** רק נתיבים ידועים מראש — מונע שימוש לרעה ב-window.open (Open Redirect). */
export function isAllowedProcurementDrillDownPath(url: string): boolean {
  return ALLOWED_DRILLDOWN_PATHS.has(url)
}

export function openMasterSetupInNewTab(url: string): void {
  if (typeof window === "undefined") return
  if (!isAllowedProcurementDrillDownPath(url)) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[drill-down-f2] blocked non-whitelisted URL:", url)
    }
    return
  }
  window.open(url, "_blank", "noopener,noreferrer")
}

export function handleDrillDownQuickSetupKeyDown(
  e: React.KeyboardEvent,
  setupUrl: (typeof PROCUREMENT_DRILLDOWN_URLS)[keyof typeof PROCUREMENT_DRILLDOWN_URLS]
): void {
  if (e.key !== DRILL_DOWN_QUICK_SETUP_KEY) return
  e.preventDefault()
  e.stopPropagation()
  openMasterSetupInNewTab(setupUrl)
}
