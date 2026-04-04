"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const MODULE_LINKS: { href: string; label: string }[] = [
  { href: "/marker-ofek/projects", label: "מרכז פרויקטים" },
  { href: "/marker-ofek/execution/gantt", label: "לו\"ז וביצוע (גאנט)" },
  { href: "/marker-ofek/execution/daily-logs", label: "יומני עבודה" },
  { href: "/marker-ofek/execution/plans", label: "תוכניות ו-Takeoff" },
  { href: "/marker-ofek/execution/resources", label: "משאבים ולוח שנה" },
]

function linkIsActive(pathname: string, href: string): boolean {
  if (href === "/marker-ofek/projects") {
    return pathname === "/marker-ofek/projects" || pathname.startsWith("/marker-ofek/projects/")
  }
  if (href === "/marker-ofek/execution/daily-logs") {
    return (
      pathname.startsWith("/marker-ofek/execution/daily-logs") ||
      pathname.includes("/daily-log")
    )
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function ProjectsModuleNav() {
  const pathname = usePathname() ?? ""

  return (
    <nav
      className="flex flex-wrap gap-2 border-b border-slate-100 bg-white px-1 py-3 md:px-0"
      aria-label="תת-מודול פרויקטים"
    >
      {MODULE_LINKS.map(({ href, label }, index) => {
        const active = linkIsActive(pathname, href)
        const n = String(index + 1).padStart(2, "0")
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors md:text-sm",
              active
                ? "border-slate-100 bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-100"
                : "border-transparent bg-white text-slate-600 hover:border-slate-100 hover:text-indigo-600"
            )}
          >
            <span
              className="font-mono text-[10px] tabular-nums text-slate-400 md:text-[11px]"
              aria-hidden
            >
              {n}
            </span>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
