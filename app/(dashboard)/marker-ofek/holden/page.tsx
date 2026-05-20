import type { Metadata } from "next"

import { HoldenChat } from "@/components/holden/holden-chat"

export const metadata: Metadata = {
  title: "Holden · AI Copilot",
}

export const dynamic = "force-dynamic"

/**
 * Sprint T15 — Holden AI Copilot page.
 *
 * Authenticated dashboard page that mounts the Claude-style chat surface.
 * The brain (`askHoldenAction`) lives server-side and routes intents using
 * smart keyword scoring; this page is a thin shell so we can later swap in
 * a real LLM call without touching the route.
 */
export default function HoldenPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <HoldenChat />
    </div>
  )
}
