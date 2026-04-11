"use client"

import * as React from "react"

import { NavDrawerProvider } from "@/components/dashboard/nav-drawer-context"
import { NavDrawerSheet } from "@/components/dashboard/nav-drawer-sheet"
import { TopNavBar } from "@/components/layout/TopNavBar"
import Link from "next/link"
import { Building2, CreditCard, LayoutDashboard, Package, Settings } from "lucide-react"

import { cn } from "@/lib/utils"

function NavDrawerQuickLinks() {
  const links = [
    { href: "/marker-ofek/command-center", label: "מרכז פיקוד", icon: LayoutDashboard },
    { href: "/marker-ofek/procurement", label: "רכש", icon: Package },
    { href: "/marker-ofek/finance", label: "כספים", icon: CreditCard },
    { href: "/marker-ofek/projects", label: "פרויקטים", icon: Building2 },
    { href: "/marker-ofek/settings", label: "הגדרות", icon: Settings },
  ]
  return (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="ניווט מהיר">
      <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        קיצורי דרך
      </p>
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground",
            "transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  )
}

export function DashboardLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <NavDrawerProvider>
      <div
        className="flex min-h-screen w-full flex-col bg-white text-slate-900 [color-scheme:light] dark:!bg-white dark:!text-slate-900"
        data-dashboard-root="v2"
      >
        <TopNavBar />
        <main className="flex min-h-0 w-full max-w-none flex-1 flex-col p-4 md:p-6">
          {children}
        </main>
      </div>
      <NavDrawerSheet>
        <NavDrawerQuickLinks />
      </NavDrawerSheet>
    </NavDrawerProvider>
  )
}
