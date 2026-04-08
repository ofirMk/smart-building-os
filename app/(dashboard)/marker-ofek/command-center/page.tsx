import type { Metadata } from "next"
import { redirect } from "next/navigation"

import type { AppUserRole } from "@/lib/auth/user-role"
import {
  buildConciergePulseSentence,
  buildHostWelcomeLine,
  jerusalemHour,
  resolveHostFirstName,
} from "@/lib/marker-ofek/concierge-host"
import { getCommandCenterSnapshot } from "@/lib/marker-ofek/command-center-data"
import { getOrganizationBranding } from "@/lib/marker-ofek/organization-branding"
import {
  canViewHoldingExecutive,
} from "@/lib/marker-ofek/partner-metrics/access"
import { getHoldingExecutiveDashboard } from "@/lib/marker-ofek/partner-metrics-actions"
import { titleForPath } from "@/lib/marker-ofek/route-page-title"
import {
  getLastDashboardVisitForUser,
} from "@/lib/marker-ofek/user-dashboard-config-actions"
import { getWorkspaceSettingsBootstrap } from "@/lib/marker-ofek/user-workspace-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

import { CommandCenterView } from "./command-center-view"

export const metadata: Metadata = {
  title: "מרכז הפיקוד",
  description: "מרכז פיקוד ארגוני — ביצוע, רכש וחוזים",
}

export const dynamic = "force-dynamic"

export default async function MarkerOfekCommandCenterPage() {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) {
    redirect("/auth/marker-ofek/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle()

  const pr = profile as { role?: AppUserRole; full_name?: string | null } | null
  const role = pr?.role ?? "tenant"
  const hostFirstName = resolveHostFirstName(user, pr?.full_name ?? null)
  const hostWelcomeLine = buildHostWelcomeLine(hostFirstName, jerusalemHour())

  const [snapshot, branding, lastVisit, workspace] = await Promise.all([
    getCommandCenterSnapshot(),
    getOrganizationBranding(),
    getLastDashboardVisitForUser(),
    getWorkspaceSettingsBootstrap(),
  ])

  const pulseSummary = buildConciergePulseSentence({
    firstName: hostFirstName,
    userEmail: user.email ?? null,
    userRole: role,
    poPendingApproval: snapshot.poPendingApproval,
    draftFieldLogsYesterday: snapshot.draftFieldLogsYesterday,
  })

  let welcomeBack: { href: string; pageTitle: string } | null = null
  if (lastVisit?.path) {
    const p = lastVisit.path.trim()
    const skip =
      p === "/marker-ofek/command-center" ||
      p === "/marker-ofek" ||
      p === "/marker-ofek/"
    if (!skip) {
      welcomeBack = { href: p, pageTitle: titleForPath(p) }
    }
  }

  let executivePulse: {
    recognizedRevenueNis: number
    portfolioNetLoadedProfitNis: number
    accountsReceivableNis: number
  } | null = null
  if (canViewHoldingExecutive(user.email ?? null, role)) {
    const res = await getHoldingExecutiveDashboard()
    if (res.ok) {
      executivePulse = {
        recognizedRevenueNis: res.data.recognizedRevenueNis,
        portfolioNetLoadedProfitNis: res.data.portfolioNetLoadedProfitNis,
        accountsReceivableNis: res.data.accountsReceivableNis,
      }
    }
  }

  return (
    <CommandCenterView
      snapshot={snapshot}
      userEmail={user.email ?? null}
      userRole={role}
      branding={branding}
      hostFirstName={hostFirstName}
      hostWelcomeLine={hostWelcomeLine}
      pulseSummary={pulseSummary}
      welcomeBack={welcomeBack}
      executivePulse={executivePulse}
      workspacePersona={workspace.workspacePersona}
      savedDefaultProjectId={workspace.defaultProjectId}
      commandCenterLayout={workspace.commandCenterLayout}
    />
  )
}
