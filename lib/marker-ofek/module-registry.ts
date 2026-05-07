/**
 * Module Manager — kill switches for major product areas.
 * Register new features here so they appear in the switchboard (`/marker-ofek/settings/modules`).
 */

export const MODULE_IDS = [
  "gantt",
  "billing",
  "gapHunter",
  "assets",
  "executiveSummary",
] as const

/** Use this name when registering new kill-switch modules (keep in sync with `MODULE_SWITCHBOARD_META`). */
export const REGISTERED_MODULE_IDS = MODULE_IDS

export type ModuleId = (typeof MODULE_IDS)[number]

export type ModuleVisibilityState = Record<ModuleId, boolean>

export const DEFAULT_MODULE_VISIBILITY: ModuleVisibilityState = {
  gantt: true,
  billing: true,
  gapHunter: true,
  assets: true,
  executiveSummary: true,
}

/**
 * Investor-Pitch / Demo override — when set, every module is forced ON regardless
 * of any persisted state in `user_dashboard_configs.modules` or `localStorage`.
 *
 * Activate via `NEXT_PUBLIC_FORCE_ALL_MODULES_ON=1` in `.env.local` (or in Vercel's
 * project env). Useful when stale per-user toggles hide most of the sidebar and you
 * need the full menu visible for a demo. Turn it off (unset or `0`) post-pitch.
 *
 * Implementation note: read from `process.env` directly so both server (`getDashboardBootstrap`)
 * and client (`loadModuleVisibilityFromStorage`) hit the same flag at build time.
 */
export function isForceAllModulesOn(): boolean {
  const raw = process.env.NEXT_PUBLIC_FORCE_ALL_MODULES_ON
  return typeof raw === "string" && /^(1|true|on|yes)$/i.test(raw.trim())
}

/** Merge persisted JSON into defaults (used by server + client; not a Server Action). */
export function mergeRemoteModuleConfig(
  partial: Partial<ModuleVisibilityState> | null | undefined
): ModuleVisibilityState {
  // Pitch override — return all-true regardless of stored state.
  if (isForceAllModulesOn()) return { ...DEFAULT_MODULE_VISIBILITY }

  const next: ModuleVisibilityState = { ...DEFAULT_MODULE_VISIBILITY }
  if (!partial) return next
  for (const id of MODULE_IDS) {
    if (typeof partial[id] === "boolean") next[id] = partial[id]!
  }
  return next
}

/** Hebrew labels for the Switchboard UI */
export const MODULE_SWITCHBOARD_META: Record<
  ModuleId,
  { title: string; description: string }
> = {
  gantt: {
    title: "לוחות זמנים (גאנט)",
    description: "ניהול גאנט, לו״ז משאבים ותלויות בין משימות.",
  },
  billing: {
    title: "מרכז חיוב וכספים",
    description: "חשבוניות, חשבונות חלקיים, מרכז חוזים וחיוב, שותפי ניהול.",
  },
  gapHunter: {
    title: "בקרת פערים (Gap Hunter)",
    description: "סרגל פערי ביצוע מול חיוב ודוח PDF במרכז החיוב לחוזה.",
  },
  assets: {
    title: "נכסים, רכש ומתקנים",
    description: "שרשרת אספקה, פריטים, רכש, וכניסה למסכי ניהול נכסים (הולדן).",
  },
  executiveSummary: {
    title: "דשבורד הנהלה (CEO)",
    description: "מבט ציפור על פורטפוליו ומרכזי רווח.",
  },
}

const STORAGE_KEY = "sbos:module-visibility:v1"

export function loadModuleVisibilityFromStorage(): ModuleVisibilityState | null {
  if (typeof window === "undefined") return null
  // Pitch override — ignore any stored state and force all modules ON.
  if (isForceAllModulesOn()) return { ...DEFAULT_MODULE_VISIBILITY }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ModuleVisibilityState>
    const next = { ...DEFAULT_MODULE_VISIBILITY }
    for (const id of MODULE_IDS) {
      if (typeof parsed[id] === "boolean") next[id] = parsed[id]!
    }
    return next
  } catch {
    return null
  }
}

export function saveModuleVisibilityToStorage(state: ModuleVisibilityState): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota */
  }
}

/**
 * Which pillar cards on the ERP hub require which modules (all listed must be on).
 */
export const PILLAR_MODULE_REQUIREMENTS: Partial<Record<string, ModuleId[]>> = {
  "field-execution": ["gantt"],
  "contracts-billing": ["billing"],
  finance: ["billing"],
  procurement: ["assets"],
  "financial-control": ["billing"],
}

export function isPillarVisible(
  pillarId: string,
  modules: ModuleVisibilityState
): boolean {
  const req = PILLAR_MODULE_REQUIREMENTS[pillarId]
  if (!req?.length) return true
  return req.every((id) => modules[id])
}

/** Paths that must stay reachable so users can re-enable modules. */
/** Longer paths first — always reachable so modules can be re-enabled. */
const ALWAYS_ALLOWED_PREFIXES = [
  "/marker-ofek/settings/user-permissions",
  "/marker-ofek/settings/modules",
  "/marker-ofek/settings",
]

/**
 * Map URL to controlling module. `null` = not gated by a kill switch.
 */
export function pathnameToModule(pathname: string): ModuleId | null {
  const raw = pathname.split("?")[0] ?? ""
  const p = raw.replace(/\/+$/, "") || "/"

  for (const prefix of ALWAYS_ALLOWED_PREFIXES) {
    if (p === prefix || p.startsWith(`${prefix}/`)) return null
  }

  if (p.startsWith("/marker-ofek/roadmap")) return null

  if (p.startsWith("/marker-ofek/command-center")) return "executiveSummary"
  if (p === "/management" || p.startsWith("/management/")) return "executiveSummary"
  if (p.startsWith("/marker-ofek/execution/gantt")) return "gantt"
  if (p.startsWith("/marker-ofek/execution/resources")) return "gantt"
  if (p.startsWith("/marker-ofek/execution/progress-reports")) return "billing"
  if (p.startsWith("/marker-ofek/contracts")) return "billing"
  if (p.startsWith("/marker-ofek/finance")) return "billing"
  if (p.startsWith("/marker-ofek/sales-orders")) return "billing"
  if (p.startsWith("/marker-ofek/billing")) return "billing"
  if (p.startsWith("/marker-ofek/partner-finance")) return "billing"
  if (p.startsWith("/partner-finance")) return "billing"
  if (p.startsWith("/partner-metrics")) return "billing"
  if (p.startsWith("/marker-ofek/budget")) return "billing"

  if (p.startsWith("/marker-ofek/catalog")) return "assets"
  if (p.startsWith("/marker-ofek/items")) return "assets"
  if (p.startsWith("/marker-ofek/supply-chain")) return "assets"
  if (p.startsWith("/marker-ofek/procurement")) return "assets"
  if (p.startsWith("/marker-ofek/logistics")) return "assets"

  if (p.startsWith("/holden") || p === "/holden") return "assets"
  if (p.startsWith("/buildings")) return "assets"
  if (p.startsWith("/ev-management")) return "assets"
  if (p.startsWith("/facility")) return "assets"

  return null
}

export function isPathAllowedByModules(
  pathname: string,
  modules: ModuleVisibilityState
): boolean {
  const m = pathnameToModule(pathname)
  if (m == null) return true
  return modules[m] === true
}

export type SidebarNavItemShape = { href: string; title: string }

export function filterNavItemsByModules<T extends SidebarNavItemShape>(
  items: T[],
  modules: ModuleVisibilityState
): T[] {
  return items.filter((item) => {
    const m = pathnameToModule(item.href)
    if (m == null) return true
    return modules[m] === true
  })
}

export function filterSidebarSectionsByModules<
  S extends { items: SidebarNavItemShape[]; label: string | null },
>(sections: S[], modules: ModuleVisibilityState): S[] {
  return sections
    .map((section) => ({
      ...section,
      items: filterNavItemsByModules(section.items, modules),
    }))
    .filter((s) => s.items.length > 0)
}
