"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Building2,
  Car,
  ClipboardList,
  LayoutGrid,
  Warehouse,
} from "lucide-react"

import { ProcurementIcon } from "@/components/marker-ofek/procurement/procurement-icon"
import { PROCUREMENT_BASE, PROCUREMENT_ROUTES } from "@/lib/marker-ofek/procurement/nav"
import { cn } from "@/lib/utils"

const LINKS: {
  href: string
  label: string
  Icon: typeof ClipboardList
}[] = [
  { href: PROCUREMENT_ROUTES.orders, label: "הזמנות", Icon: ClipboardList },
  { href: PROCUREMENT_ROUTES.suppliers, label: "ספקים", Icon: Building2 },
  { href: PROCUREMENT_ROUTES.inventory, label: "ניהול מלאי", Icon: Warehouse },
  { href: PROCUREMENT_ROUTES.catalog, label: "קטלוג פריטים", Icon: LayoutGrid },
  { href: PROCUREMENT_ROUTES.assets, label: "נכסי חברה", Icon: Car },
]

function pathMatchesPillar(pathname: string, href: string): boolean {
  if (href === PROCUREMENT_ROUTES.orders) {
    return (
      pathname === PROCUREMENT_ROUTES.orders ||
      pathname === `${PROCUREMENT_ROUTES.orders}/` ||
      pathname === PROCUREMENT_BASE ||
      pathname === `${PROCUREMENT_BASE}/`
    )
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function ProcurementSubnav({ className }: { className?: string }) {
  const pathname = usePathname() ?? ""

  return (
    <nav
      className={cn(
        "flex flex-wrap gap-2 rounded-xl border border-slate-100 bg-white p-2",
        className
      )}
      aria-label="רכש — תת־מודולים"
    >
      {LINKS.map(({ href, label, Icon }) => {
        const active = pathMatchesPillar(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border border-indigo-200 bg-white text-indigo-800 shadow-sm"
                : "border border-transparent text-slate-600 hover:border-slate-100 hover:bg-white"
            )}
          >
            <ProcurementIcon icon={Icon} className="size-4" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

/** @deprecated Use `ProcurementSubnav` — alias kept for existing imports. */
export const ProcurementCommandSubnav = ProcurementSubnav
