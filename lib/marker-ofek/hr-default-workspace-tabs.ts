import { randomUUID } from "node:crypto"

import type { WorkspaceOpenTab } from "@/lib/marker-ofek/workspace-types"

function tab(href: string, title: string, pinned: boolean): WorkspaceOpenTab {
  return { id: randomUUID(), href, title, pinned }
}

/** לשוניות ותצוגה מפוצלת — הקמת HR (נשמר מיד ב־user_workspace_settings) */
export function buildHrProvisionWorkspaceTabs(args: {
  persona: "finance" | "field" | "executive"
  projectId: string | null
  grantSystemAdmin: boolean
}): {
  openTabs: WorkspaceOpenTab[]
  splitView: boolean
  secondaryTabHref: string | null
  splitPrimaryPinnedHref: string | null
} {
  const pid = args.projectId?.trim() || null
  const ganttHref = pid
    ? `/marker-ofek/execution/gantt/${pid}`
    : "/marker-ofek/execution/gantt"

  if (args.persona === "field") {
    return {
      openTabs: [
        tab(ganttHref, "גאנט", true),
        tab("/marker-ofek/execution/daily-logs", "יומני עבודה", false),
        tab("/marker-ofek/procurement/catalog", "קטלוג פריטים", false),
      ],
      splitView: false,
      secondaryTabHref: null,
      splitPrimaryPinnedHref: null,
    }
  }

  if (args.persona === "finance") {
    return {
      openTabs: [
        tab("/marker-ofek/finance/billing", "חיוב ותזרים", true),
        tab("/marker-ofek/finance/partials", "חשבונות חלקיים", false),
        tab("/marker-ofek/procurement/orders", "הזמנות רכש", false),
      ],
      splitView: false,
      secondaryTabHref: null,
      splitPrimaryPinnedHref: null,
    }
  }

  const execSplit = args.grantSystemAdmin || args.persona === "executive"
  const primary = tab("/management", "דשבורד הנהלה", true)
  return {
    openTabs: [
      primary,
      tab("/marker-ofek/command-center", "מרכז פיקוד", false),
      tab("/marker-ofek/finance/billing", "חיוב ותזרים", false),
    ],
    splitView: execSplit,
    secondaryTabHref: execSplit ? "/marker-ofek/procurement/orders" : null,
    splitPrimaryPinnedHref: execSplit ? primary.href : null,
  }
}

export function defaultBrowserBookmarksForPersona(
  persona: "finance" | "field" | "executive"
): { label: string; href: string }[] {
  if (persona === "field") {
    return [
      { label: "מפות", href: "https://www.google.com/maps" },
      { label: "קטלוג פריטים", href: "/marker-ofek/procurement/catalog" },
      { label: "גיליון פריטים", href: "/marker-ofek/items" },
    ]
  }
  if (persona === "finance") {
    return [
      { label: "רשם החברות", href: "https://www.gov.il/he/service/companies-registry" },
      { label: "חיוב ותזרים", href: "/marker-ofek/finance/billing" },
      { label: "הזמנות רכש", href: "/marker-ofek/procurement/orders" },
    ]
  }
  return [
    { label: "מרכז פיקוד", href: "/marker-ofek/command-center" },
    { label: "דשבורד הנהלה", href: "/management" },
    { label: "כתבי כמויות", href: "/marker-ofek/tenders/boq" },
  ]
}
