"use client"

/**
 * GlobalPitchNavButton — always-visible "מרכז שליטה הנהלה" CTA mounted inside
 * the global header actions slot. One click from anywhere in the app brings
 * the CEO straight back to the executive lobby at `/marker-ofek/pitch`.
 *
 * Renamed from "🚀 חמ"ל משקיעים" — no longer demo-flavoured copy.
 *
 * Hides itself when already on the lobby route to avoid redundancy.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Rocket } from "lucide-react"

import { cn } from "@/lib/utils"

export function GlobalPitchNavButton({ className }: { className?: string }) {
  const pathname = usePathname() ?? ""
  const onPitchRoute = pathname.startsWith("/marker-ofek/pitch")
  if (onPitchRoute) return null

  return (
    <Link
      href="/marker-ofek/pitch"
      aria-label="פתח מסך מנהל המערכת"
      className={cn(
        // Vivid emerald → cyan gradient, white text, soft glow.
        "group relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-full bg-gradient-to-l from-emerald-500 via-emerald-600 to-cyan-600 px-4 text-sm font-semibold text-white shadow-md shadow-emerald-500/30 transition-all hover:from-emerald-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-emerald-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300",
        className,
      )}
    >
      {/* Diagonal sheen on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"
      />
      <Rocket className="size-4" />
      <span className="hidden sm:inline">מנהל המערכת</span>
      <span
        aria-hidden
        className="ms-0.5 inline-block size-1.5 animate-pulse rounded-full bg-white"
      />
    </Link>
  )
}
