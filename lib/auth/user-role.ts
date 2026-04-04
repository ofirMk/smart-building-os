/** Matches `public.user_role` in Supabase. */
export type AppUserRole =
  | "admin"
  | "manager"
  | "property_manager"
  | "tenant"
  | "contractor"

export function isPortalRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "property_manager"
}

export function isTenantRole(role: string | null | undefined): boolean {
  return role === "tenant"
}

export function isAdminOrManagerRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "property_manager"
}

export const TENANT_DENIED_PATH_PREFIXES = [
  "/portal",
  "/marker-ofek",
  "/partner-finance",
  "/partner-metrics",
  "/hh-panels",
  "/hq",
] as const

export function isTenantDeniedPath(pathname: string): boolean {
  return TENANT_DENIED_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}

/** אימייל מנהל Marker Ofek — הודעת ברוכים הבאים בפריסה */
export const GUY_RAHUMIM_ADMIN_EMAIL = "liem.elc@gmail.com" as const

export function guyRahumimWelcomeMessage(
  email: string | null | undefined
): string | null {
  if (!email?.trim()) return null
  if (email.trim().toLowerCase() === GUY_RAHUMIM_ADMIN_EMAIL) {
    return "Welcome, Guy Rahumim"
  }
  return null
}
