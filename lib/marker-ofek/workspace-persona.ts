import { DEFAULT_MODULE_VISIBILITY } from "@/lib/marker-ofek/module-registry"
import type { WorkspacePersona, WorkspacePersonaPreset } from "@/lib/marker-ofek/workspace-types"

/** יעדי וידג'טים — Sidekick + לוח בקרה (HR מצמיד את שלושת הראשונים) */
export const HR_CONCIERGE_PINNED_WIDGET_IDS = [
  "sidekick-whatsapp",
  "sidekick-email-bridge",
  "sidekick-internal-browser",
] as const

export function mergePinnedWithHrConcierge(pinned: string[]): string[] {
  return [...new Set([...pinned, ...HR_CONCIERGE_PINNED_WIDGET_IDS])]
}

export function workspacePersonaPreset(persona: WorkspacePersona): WorkspacePersonaPreset {
  const base = { ...DEFAULT_MODULE_VISIBILITY }
  if (persona === "finance") {
    return {
      profileRole: "property_manager",
      modules: {
        ...base,
        gantt: false,
        billing: true,
        gapHunter: true,
        assets: true,
        executiveSummary: true,
      },
      markerViewFinancials: true,
      markerEditAccess: true,
      pinnedWidgets: ["tax-compliance-alerts", "pl-ribbon", "cashflow-strip"],
      defaultBrowserHomepage: "https://www.gov.il/he/service/companies-registry",
      browserPanelEnabled: true,
    }
  }
  if (persona === "field") {
    return {
      profileRole: "contractor",
      modules: {
        ...base,
        gantt: true,
        billing: false,
        gapHunter: false,
        assets: true,
        executiveSummary: false,
      },
      markerViewFinancials: false,
      markerEditAccess: false,
      pinnedWidgets: ["daily-logs", "project-photos", "whatsapp-subs-shortcuts"],
      defaultBrowserHomepage: "https://www.gov.il/he/departments/topics/prices/",
      browserPanelEnabled: true,
    }
  }
  return {
    profileRole: "property_manager",
    modules: { ...base },
    markerViewFinancials: true,
    markerEditAccess: true,
    pinnedWidgets: ["executive-pulse", "compliance-overview"],
    defaultBrowserHomepage: "https://www.gov.il/he/service/companies-registry",
    browserPanelEnabled: true,
  }
}
