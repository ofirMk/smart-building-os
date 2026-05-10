import { notFound } from "next/navigation"

import { IS_DEMO_MODE } from "@/lib/feature-flags"

/**
 * Demo-mode gate for the entire `/marker-ofek/pitch/*` segment.
 *
 * The pitch segment hosts investor-facing UI (lobby, command center, monetization
 * showcase) that uses **mock data** and references hardcoded demo UUIDs
 * (e.g. the seeded subcontractor contract / partial bill / purchase order).
 *
 * In production for a paying customer (Lihtman onboarding), `NEXT_PUBLIC_DEMO_MODE`
 * is unset / "false", and any direct request to `/marker-ofek/pitch` (or any
 * descendant) returns 404 — the segment is invisible.
 *
 * To re-enable for an investor demo build, set `NEXT_PUBLIC_DEMO_MODE=true`
 * at build time. See `lib/feature-flags.ts` and `.env.example`.
 */
export default function PitchSegmentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!IS_DEMO_MODE) {
    notFound()
  }
  return children
}
