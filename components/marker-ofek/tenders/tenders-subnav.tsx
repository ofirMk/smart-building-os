"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
  Calculator,
  FileSearch,
  GitCompare,
  Layers,
  LayoutDashboard,
} from "lucide-react"

import { TENDERS_ROUTES } from "@/lib/marker-ofek/tenders/nav"
import { cn } from "@/lib/utils"

const LINKS: {
  href: string
  label: string
  Icon: typeof Calculator
}[] = [
  { href: TENDERS_ROUTES.hub, label: "מרכז", Icon: LayoutDashboard },
  { href: TENDERS_ROUTES.pricing, label: "תמחור פרויקטים", Icon: Calculator },
  { href: TENDERS_ROUTES.boq, label: "כתבי כמויות", Icon: FileSearch },
  { href: TENDERS_ROUTES.comparison, label: "השוואת הצעות", Icon: GitCompare },
  { href: TENDERS_ROUTES.wbs, label: "מבנה WBS", Icon: Layers },
]

export function TendersSubnav({ className }: { className?: string }) {
  const pathname = usePathname() ?? ""
  const searchParams = useSearchParams()
  const projectId = searchParams.get("projectId")?.trim() ?? ""
  const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""

  return (
    <nav
      className={cn(
        "flex flex-wrap gap-2 rounded-xl border border-slate-100 bg-card p-2",
        className
      )}
      aria-label="מכרזים והערכות"
    >
      {LINKS.map(({ href, label, Icon }) => {
        const isHub = href === TENDERS_ROUTES.hub
        const dest = isHub ? href : `${href}${q}`
        const active = isHub
          ? pathname === href || pathname === `${href}/`
          : pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={dest}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border border-indigo-200 bg-card text-indigo-800 shadow-sm"
                : "border border-transparent text-slate-600 hover:border-slate-100 hover:bg-card"
            )}
          >
            <Icon className="size-4 shrink-0 stroke-[1.5] text-indigo-600" aria-hidden />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
