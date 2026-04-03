"use client"

import { useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { CommentNotificationBell } from "@/components/dashboard/comment-notification-bell"
import { AppSidebar } from "@/components/app-sidebar"
import { FullscreenToggle } from "@/components/marker-ofek/fullscreen-toggle"
import { GlobalProjectSearch } from "@/components/marker-ofek/global-project-search"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  type AppUserRole,
  guyRahumimWelcomeMessage,
} from "@/lib/auth/user-role"
import { isMarkerOfekExecutiveContext } from "@/app/(dashboard)/_components/sidebar-routes"
import { cn } from "@/lib/utils"

const titles: Record<string, string> = {
  "/": "לוח בקרה",
  "/dashboard": "לוח בקרה",
  "/dashboard/holden": "מרכז הפיקוד של הולדן",
  "/facility": "לוח בקרה",
  "/announcements": "דוחות ונתונים",
  "/buildings": "בניינים",
  "/tenants": "ניהול דיירים",
  "/vendors": "ניהול קבלנים",
  "/maintenance": "תחזוקה מונעת",
  "/billing": "ניהול כספים",
  "/documents": "כספת מסמכים",
  "/tickets": "קריאות שירות",
  "/ev-management": "ניהול טעינה",
  "/amenities": "מתקנים",
  "/chat": "צ'אט AI",
}

function titleForPath(pathname: string) {
  if (pathname === "/marker-ofek" || pathname === "/marker-ofek/") {
    return "לוח בקרה"
  }
  if (titles[pathname]) return titles[pathname]
  const match = Object.keys(titles).find(
    (k) => k !== "/" && k !== "/dashboard" && pathname.startsWith(k)
  )
  return match ? titles[match] : "בניין חכם"
}

type Crumb = { label: string; href: string | null }

function buildHebrewCrumbs(pathname: string): Crumb[] {
  if (!pathname.startsWith("/marker-ofek")) {
    return [{ label: titleForPath(pathname), href: null }]
  }
  const labelMap: Record<string, string> = {
    "pre-construction": "קדם ביצוע",
    projects: "פרויקטים",
    contracts: "חוזים",
    execution: "ביצוע",
    gantt: "גנט",
    procurement: "רכש",
    invoices: "חשבוניות",
    reconciliation: "בקרת התאמות",
    "delivery-notes": "תעודות משלוח",
    items: "פריטים",
    "supply-chain": "שרשרת אספקה",
    "daily-logs": "יומני עבודה",
    "progress-reports": "חשבונות חלקיים",
  }
  const segments = pathname.split("/").filter(Boolean)
  const crumbs: Crumb[] = [{ label: "מרקר אופק", href: "/marker-ofek" }]
  let acc = ""
  for (const segment of segments.slice(1)) {
    acc += `/${segment}`
    const isIdLike = /^[0-9a-f-]{8,}$/i.test(segment)
    if (isIdLike) {
      crumbs.push({ label: "פרויקט", href: null })
      continue
    }
    crumbs.push({
      label: labelMap[segment] ?? segment.replace(/-/g, " "),
      href: `/marker-ofek${acc}`,
    })
  }
  if (crumbs.length === 1) {
    crumbs[0] = { label: "לוח בקרה", href: "/marker-ofek" }
  }
  return crumbs
}

export function DashboardShell({
  children,
  userEmail,
  userRole,
}: {
  children: React.ReactNode
  userEmail: string | null
  userRole: AppUserRole
}) {
  const pathname = usePathname()
  const title = useMemo(() => titleForPath(pathname), [pathname])
  const headerBrand = useMemo(
    () =>
      isMarkerOfekExecutiveContext(pathname)
        ? "מרקר אופק יזמות וביצוע"
        : "הולדן ניהול מבנים ומתחמים",
    [pathname]
  )
  const headerSubtitle = useMemo(
    () =>
      guyRahumimWelcomeMessage(userEmail) ??
      "תפעול נכסים ברמה הגבוהה ביותר וחוויית דיירים",
    [userEmail]
  )
  const crumbs = useMemo(() => buildHebrewCrumbs(pathname), [pathname])

  return (
    <SidebarProvider dir="rtl">
      <AppSidebar userEmail={userEmail} userRole={userRole} />
      <SidebarInset
        dir="rtl"
        className={cn(
          "relative z-0 min-w-0 flex-1 overflow-x-hidden",
          "print:pe-0 print:lg:pe-0"
        )}
      >
        <header
          className={cn(
            "sticky top-0 z-20 flex min-h-[3.75rem] shrink-0 items-center gap-3 px-4 py-1.5 backdrop-blur print:hidden md:px-6",
            "border-b border-zinc-300/90 bg-white/88 supports-[backdrop-filter]:bg-white/76",
            "dark:border-zinc-700/80 dark:bg-zinc-900/72 dark:supports-[backdrop-filter]:bg-zinc-900/64"
          )}
        >
          <SidebarTrigger
            className={cn(
              "size-8 shrink-0 rounded-sm transition-all duration-300 ease-in-out",
              "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100",
              "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:shadow-[0_4px_24px_-6px_rgba(0,0,0,0.4)]"
            )}
          />
          <div className="flex min-w-0 flex-1 flex-col text-start">
            <div className="mb-0.5 flex items-center gap-1 overflow-x-auto text-[10px] text-zinc-500 dark:text-neutral-400">
              {crumbs.map((crumb, idx) => (
                <span key={`${crumb.label}-${idx}`} className="inline-flex items-center gap-1 whitespace-nowrap">
                  {idx > 0 ? <ChevronLeft className="size-3" aria-hidden /> : null}
                  {crumb.href && idx < crumbs.length - 1 ? (
                    <Link href={crumb.href} className="hover:text-violet-600 dark:hover:text-violet-300">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={idx === crumbs.length - 1 ? "font-semibold text-neutral-700 dark:text-neutral-200" : ""}>
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </div>
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-violet-400/90">
              {headerBrand}
            </p>
            <h1 className="truncate text-base font-bold tracking-tight text-zinc-900 dark:text-neutral-50">
              {title}
            </h1>
            <p className="hidden text-[11px] font-normal text-zinc-500 dark:text-neutral-400 sm:block">
              {headerSubtitle}
            </p>
          </div>
          {isMarkerOfekExecutiveContext(pathname) ? <GlobalProjectSearch /> : null}
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <FullscreenToggle />
            {userRole === "admin" ? (
              <CommentNotificationBell className="text-neutral-500 transition-colors duration-300 ease-in-out hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100" />
            ) : null}
          </div>
        </header>
        <div className="mx-auto flex min-h-0 w-full max-w-[1680px] flex-1 flex-col gap-4 bg-transparent p-3 print:p-0 md:p-5 md:pb-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
