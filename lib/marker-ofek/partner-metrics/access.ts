import type { AppUserRole } from "@/lib/auth/user-role"
import { GUY_RAHUMIM_ADMIN_EMAIL } from "@/lib/auth/user-role"

import type { PartnerMetricsPersona } from "./types"

export type { PartnerMetricsPersona }

/** Global view (Ophir): `PARTNER_FINANCE_SUPER_EMAIL` or legacy `PARTNER_OPHIR_EMAIL`. */
export function resolvePartnerSuperEmail(): string | null {
  const a = process.env.PARTNER_FINANCE_SUPER_EMAIL?.trim().toLowerCase()
  const b = process.env.PARTNER_OPHIR_EMAIL?.trim().toLowerCase()
  return a || b || null
}

/**
 * RBAC for `/partner-metrics` and `/partner-finance`:
 * - Guy Rahamim: `GUY_RAHUMIM_ADMIN_EMAIL` (`lib/auth/user-role.ts`)
 * - Ophir & Samer: `PARTNER_FINANCE_SUPER_EMAIL` / `PARTNER_OPHIR_EMAIL` and `PARTNER_SAMER_EMAIL`
 */
export function resolvePartnerMetricsPersona(
  email: string | null | undefined
): PartnerMetricsPersona | null {
  if (!email?.trim()) return null
  const e = email.trim().toLowerCase()
  const oph = resolvePartnerSuperEmail()
  const sam = process.env.PARTNER_SAMER_EMAIL?.trim().toLowerCase()
  const guy = GUY_RAHUMIM_ADMIN_EMAIL.trim().toLowerCase()
  if (oph && e === oph) return "ophir"
  if (e === guy) return "guy"
  if (sam && e === sam) return "samer"
  return null
}

export function isPartnerMetricsViewer(email: string | null | undefined): boolean {
  return resolvePartnerMetricsPersona(email) != null
}

/**
 * Holding executive dashboard: portfolio P&L.
 * - Admin / Ophir: full portfolio (no `managing_partner` filter in data layer).
 * - Guy / Samer: same screen, data scoped to `projects.managing_partner_id = auth.uid()`.
 */
export function canViewHoldingExecutive(
  email: string | null | undefined,
  role: AppUserRole | string | null | undefined
): boolean {
  if (!email?.trim()) return false
  if (role === "admin") return true
  const p = resolvePartnerMetricsPersona(email)
  return p === "ophir" || p === "guy" || p === "samer"
}

/** Ophir (global super) — remote module config for other users, user-permissions UI. */
export function isPartnerDashboardSuperAdmin(
  email: string | null | undefined
): boolean {
  return resolvePartnerMetricsPersona(email) === "ophir"
}
