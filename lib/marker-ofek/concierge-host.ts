import type { User } from "@supabase/supabase-js"
import { format } from "date-fns"
import { TZDate } from "@date-fns/tz"

import type { AppUserRole } from "@/lib/auth/user-role"
import {
  canViewHoldingExecutive,
} from "@/lib/marker-ofek/partner-metrics/access"

/** שעה 0–23 ב־Asia/Jerusalem */
export function jerusalemHour(d: Date = new Date()): number {
  const z = new TZDate(d.getTime(), "Asia/Jerusalem")
  return Number(format(z, "H"))
}

export function timeBandGreetingHe(hour: number): "בוקר טוב" | "צהריים טובים" | "ערב טוב" {
  if (hour >= 5 && hour < 12) return "בוקר טוב"
  if (hour >= 12 && hour < 18) return "צהריים טובים"
  return "ערב טוב"
}

/**
 * שם פרטי: פרופיל → מטא־דאטה OAuth (Google/Microsoft) → מקטע לפני @ באימייל.
 */
export function resolveHostFirstName(
  user: User | null | undefined,
  profileFullName: string | null | undefined
): string {
  const fromProfile = profileFullName?.trim()
  if (fromProfile) {
    const first = fromProfile.split(/\s+/)[0]?.trim()
    if (first) return first
  }
  const meta = user?.user_metadata as Record<string, unknown> | undefined
  const metaName =
    (typeof meta?.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta?.name === "string" && meta.name.trim()) ||
    (typeof meta?.given_name === "string" && meta.given_name.trim()) ||
    ""
  if (metaName) {
    const first = metaName.split(/\s+/)[0]?.trim()
    if (first) return first
  }
  const email = user?.email?.trim()
  if (email && email.includes("@")) {
    const local = email.split("@")[0] ?? ""
    const cleaned = local.replace(/[._+]+/g, " ").trim()
    if (cleaned) {
      const token = cleaned.split(/\s+/)[0] ?? ""
      if (token) {
        return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
      }
    }
  }
  return "שם"
}

export function buildHostWelcomeLine(firstName: string, hour = jerusalemHour()): string {
  return `${timeBandGreetingHe(hour)}, ${firstName}`
}

export function buildConciergePulseSentence(params: {
  firstName: string
  userEmail: string | null
  userRole: AppUserRole
  poPendingApproval: number
  draftFieldLogsYesterday: number
}): string {
  const { firstName, userEmail, userRole, poPendingApproval, draftFieldLogsYesterday } =
    params
  const execOrAdmin =
    userRole === "admin" || canViewHoldingExecutive(userEmail, userRole)
  if (execOrAdmin && poPendingApproval > 0) {
    return `${firstName}, יש ${poPendingApproval} הזמנות רכש שממתינות לאישור ה־CEO שלך.`
  }
  if (draftFieldLogsYesterday > 0) {
    return `${firstName}, יש ${draftFieldLogsYesterday} יומני עבודה מאתמול שטרם אושרו לחיוב.`
  }
  return `${firstName}, המערכת מסונכרנת — אין דגשים דחופים בתצוגה שלך כרגע.`
}
