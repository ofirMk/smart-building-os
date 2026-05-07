import type { Metadata } from "next"

import { InvestorPitchLobby } from "@/components/marker-ofek/pitch/investor-pitch-lobby"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export const metadata: Metadata = {
  title: "מרכז שליטה הנהלה · Marker Ofek",
}

/**
 * Hardcoded fallback project UUID — used **only** when the database has no
 * real projects at all (e.g. completely empty demo environment). In every
 * normal scenario the real, most-recently-created project replaces this.
 */
const FALLBACK_DEMO_PROJECT_ID = "8599ee46-50a7-4a5e-b219-e853ff093cc6"

/**
 * Resolve the project that should back the "🏗️ חמ"ל פרויקט" lobby tile.
 *
 * Priority order:
 *   1. Most recently-created non-deleted, non-demo project visible to the
 *      authenticated user under RLS.
 *   2. Any most-recently-created project (relax filters).
 *   3. The hardcoded `FALLBACK_DEMO_PROJECT_ID` constant.
 *
 * The query is wrapped in try/catch so a Supabase outage cannot break the
 * lobby render — the fallback is always returned.
 */
async function resolveDemoProjectId(): Promise<string> {
  try {
    const supabase = await createSupabaseServerAuthClient()

    // 1) Real, live project (preferred).
    const { data: live } = await supabase
      .from("projects")
      .select("id")
      .eq("is_deleted", false)
      .eq("is_demo_data", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (live?.id) return String(live.id)

    // 2) Anything at all — including demo seed rows.
    const { data: anyProject } = await supabase
      .from("projects")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (anyProject?.id) return String(anyProject.id)
  } catch {
    /* swallow — fall through to hardcoded fallback */
  }
  return FALLBACK_DEMO_PROJECT_ID
}

/**
 * Investor Pitch Lobby — the demo landing page bypassing the regular sidebar.
 *
 * Server Component: resolves a real project UUID from the DB so the
 * "🏗️ חמ"ל פרויקט" tile never lands on a ghost UUID and never triggers
 * 23503 FK-violation noise in the console.
 *
 * Reachable from anywhere via the global "🚀 חמ"ל משקיעים" header button.
 */
export default async function MarkerOfekPitchHubPage() {
  const projectId = await resolveDemoProjectId()
  return <InvestorPitchLobby projectId={projectId} />
}
