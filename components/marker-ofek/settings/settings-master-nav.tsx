"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Building2, Shield, SlidersHorizontal, Sparkles, Users } from "lucide-react"

import { cn } from "@/lib/utils"

type SettingsNavItem = {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { title: "מרכז הגדרות", href: "/marker-ofek/settings", icon: Sparkles },
  { title: "פרטי חברה (MDM)", href: "/marker-ofek/settings/company", icon: Building2 },
  { title: "הגדרות חכמות", href: "/marker-ofek/settings/smart", icon: Sparkles },
  { title: "ניהול מודולים", href: "/marker-ofek/settings/modules", icon: SlidersHorizontal },
  { title: "כללי מערכת", href: "/marker-ofek/settings/system-rules", icon: Shield },
  {
    title: "הרשאות משתמשים",
    href: "/marker-ofek/settings/user-permissions",
    icon: Users,
  },
]

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SettingsMasterNav() {
  const pathname = usePathname() ?? ""

  return (
    <div className="space-y-1.5">
      {SETTINGS_NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors",
              active
                ? "border-border bg-accent text-accent-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{item.title}</span>
          </Link>
        )
      })}
    </div>
  )
}

