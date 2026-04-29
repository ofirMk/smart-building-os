export type CompanyContextId = string

export type CompanyContextOption = {
  id: CompanyContextId
  label: string
  subtitle: string
  targetHref: string
}

export const COMPANY_COOKIE_KEY = "selected_company"
export const ACTIVE_COMPANY_CHANGED_EVENT = "active-company-changed"

export const COMPANY_CONTEXT_OPTIONS: readonly CompanyContextOption[] = [
  {
    id: "marker_ofek",
    label: "מרקר אופק",
    subtitle: "ERP קבלנות, רכש, חוזים ובקרה",
    targetHref: "/marker-ofek/command-center",
  },
  {
    id: "holden_group",
    label: "הולדן",
    subtitle: "ניהול הנהלה וקבוצת אחזקות",
    targetHref: "/holden",
  },
  {
    id: "building_management_co",
    label: "חברת ניהול מבנים",
    subtitle: "ניהול דיירים, תחזוקה ומבנים חכמים",
    targetHref: "/facility",
  },
]

const COMPANY_IDS = new Set(COMPANY_CONTEXT_OPTIONS.map((option) => option.id))

export function isCompanyContextId(value: unknown): value is CompanyContextId {
  return typeof value === "string" && COMPANY_IDS.has(value)
}

export function resolveCompanyContext(
  value: string | null | undefined
): CompanyContextId | null {
  if (!value) return null
  return isCompanyContextId(value) ? value : null
}

export function companyTargetHref(id: CompanyContextId): string {
  return (
    COMPANY_CONTEXT_OPTIONS.find((option) => option.id === id)?.targetHref ??
    "/marker-ofek/command-center"
  )
}

export function getCompanyContextOption(
  id: CompanyContextId
): CompanyContextOption | null {
  return COMPANY_CONTEXT_OPTIONS.find((option) => option.id === id) ?? null
}

export function readActiveCompanyIdFromCookie(): CompanyContextId | null {
  if (typeof document === "undefined") return null
  const matcher = new RegExp(`(?:^|;\\s*)${COMPANY_COOKIE_KEY}=([^;]*)`)
  const raw = document.cookie.match(matcher)?.[1]?.trim()
  return resolveCompanyContext(raw)
}

export function writeActiveCompanyCookie(companyId: CompanyContextId): void {
  if (typeof document === "undefined") return
  const maxAge = 60 * 60 * 24 * 180
  document.cookie = `${COMPANY_COOKIE_KEY}=${companyId}; Path=/; Max-Age=${maxAge}; SameSite=Lax`
  window.dispatchEvent(
    new CustomEvent<{ companyId: CompanyContextId }>(ACTIVE_COMPANY_CHANGED_EVENT, {
      detail: { companyId },
    })
  )
}

export function companyDisplayName(id: CompanyContextId | null): string {
  if (!id) return "לא נבחרה חברה"
  return (
    COMPANY_CONTEXT_OPTIONS.find((option) => option.id === id)?.label ??
    "חברה לא ידועה"
  )
}

