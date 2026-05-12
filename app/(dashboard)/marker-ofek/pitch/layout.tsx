import { notFound } from "next/navigation"

import { IS_DEMO_MODE } from "@/lib/feature-flags"

/**
 * Demo-mode gate for the entire `/marker-ofek/pitch/*` segment.
 *
 * The pitch segment hosts investor-facing UI (lobby, command center, monetization
 * showcase) that uses **mock data** and references hardcoded demo UUIDs
 * (e.g. the seeded subcontractor contract / partial bill / purchase order).
 *
 * Policy (updated 2026-05-12 emergency UI hotfix):
 *   - In `development` (`next dev`) the pitch segment is ALWAYS reachable so
 *     investor-demo prep + design review do not depend on environment flags.
 *   - In `production` the segment is gated by `NEXT_PUBLIC_DEMO_MODE=true`; if
 *     unset / "false" (paying customer build) any request returns 404 — the
 *     segment is invisible. See `lib/feature-flags.ts` and `.env.example`.
 */
export default function PitchSegmentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isProduction = process.env.NODE_ENV === "production"
  if (isProduction && !IS_DEMO_MODE) {
    notFound()
  }
  return children
}
