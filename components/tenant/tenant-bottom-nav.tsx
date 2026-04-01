"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarDays, Home, Ticket, User, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"

const items = [
  { href: "/tenant", label: "ראשי", icon: Home, match: (p: string) => p === "/tenant" },
  {
    href: "/tenant/billing",
    label: "החיובים שלי",
    icon: Wallet,
    match: (p: string) => p.startsWith("/tenant/billing"),
  },
  {
    href: "/tenant/tickets",
    label: "קריאות",
    icon: Ticket,
    match: (p: string) => p.startsWith("/tenant/tickets"),
  },
  {
    href: "/tenant/amenities",
    label: "מתקנים",
    icon: CalendarDays,
    match: (p: string) => p.startsWith("/tenant/amenities"),
  },
  {
    href: "/tenant/profile",
    label: "פרופיל",
    icon: User,
    match: (p: string) => p.startsWith("/tenant/profile"),
  },
] as const

export function TenantBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center border-t border-gray-800 bg-[#111111]/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.45)] backdrop-blur-md supports-[backdrop-filter]:bg-[#111111]/85"
    >
      <div className="flex h-14 w-full max-w-md items-stretch justify-around px-1">
        {items.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[0.65rem] font-medium transition-colors",
                active
                  ? "text-cyan-400"
                  : "text-gray-500 hover:text-gray-200"
              )}
            >
              <Icon
                className={cn(
                  "size-5 shrink-0",
                  active ? "text-cyan-400" : "text-gray-500"
                )}
                aria-hidden
              />
              <span className="truncate">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
