import type { Metadata } from "next"

import { InvestorPitchLobby } from "@/components/marker-ofek/pitch/investor-pitch-lobby"

export const metadata: Metadata = {
  title: "חמ\"ל משקיעים · Marker Ofek",
}

/**
 * Investor Pitch Lobby — the demo landing page bypassing the regular sidebar.
 *
 * One-click navigation hub for the CEO during the live pitch:
 *   • Project AI Command Center   → /marker-ofek/projects/<demo-id>
 *   • CFO Dashboard               → /marker-ofek/finance
 *   • Subcontractor Gantt board   → /marker-ofek/projects/gantt
 *   • Monetization & Growth Engine → /marker-ofek/pitch/monetization
 *
 * Reachable from anywhere via the global "🚀 חמ"ל משקיעים" header button.
 */
export default function MarkerOfekPitchHubPage() {
  return <InvestorPitchLobby />
}
