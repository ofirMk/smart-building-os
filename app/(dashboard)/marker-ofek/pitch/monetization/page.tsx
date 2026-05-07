import type { Metadata } from "next"

import { MonetizationShowcase } from "@/components/marker-ofek/pitch/monetization-showcase"

export const metadata: Metadata = {
  title: "מודל עסקי · Marker Ofek",
}

/**
 * Monetization Showcase — 3-tier business model deck for the live investor pitch.
 *
 * Tier 1 (PLG): Field Access — $70 / project · 145 active projects (mock).
 * Tier 2 (SaaS): Company OS — from ₪2,500 / month · 24 enterprises (mock).
 * Tier 3 (Pay-per-Use): AI Credits Engine — exponential MRR via engineering tokens.
 */
export default function MarkerOfekPitchMonetizationPage() {
  return <MonetizationShowcase />
}
