"use client"

import { useMemo } from "react"
import { usePathname } from "next/navigation"

import { CommentNotificationBell } from "@/components/dashboard/comment-notification-bell"
import { AppSidebar } from "@/components/app-sidebar"
import { FullscreenToggle } from "@/components/marker-ofek/fullscreen-toggle"
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
  "/dashboard/holden": "Holden Command Center",
  "/facility": "לוח בקרה",
  "/announcements": "מרכז הכרזות",
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

  return (
    <SidebarProvider>
      <AppSidebar userEmail={userEmail} userRole={userRole} />
      <SidebarInset
        className={cn(
          "relative z-0 min-w-0 flex-1 overflow-x-hidden",
          "lg:pr-[calc(16rem+0.75rem)] lg:peer-data-[state=collapsed]:pr-[calc(var(--sidebar-width-icon)+1.25rem)]",
          "print:pe-0 print:lg:pe-0"
        )}
      >
        <header
          className={cn(
            "sticky top-0 z-20 flex h-[3.75rem] shrink-0 items-center gap-4 px-5 backdrop-blur-2xl print:hidden md:px-8",
            "bg-white/55 supports-[backdrop-filter]:bg-white/45 dark:bg-zinc-950/55 dark:supports-[backdrop-filter]:bg-zinc-950/40",
            "shadow-[0_8px_32px_-20px_rgba(15,23,42,0.12)] dark:shadow-[0_12px_40px_-20px_rgba(0,0,0,0.35)]"
          )}
        >
          <SidebarTrigger
            className={cn(
              "size-10 shrink-0 rounded-full transition-all duration-300 ease-in-out",
              "bg-white/60 text-foreground shadow-[0_4px_20px_-6px_rgba(15,23,42,0.15)] hover:bg-white/90",
              "dark:bg-white/10 dark:hover:bg-white/15 dark:shadow-[0_4px_24px_-6px_rgba(0,0,0,0.4)]"
            )}
          />
          <div className="flex min-w-0 flex-1 flex-col text-start">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600/90 dark:text-violet-400/90">
              {headerBrand}
            </p>
            <h1 className="truncate text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              {title}
            </h1>
            <p className="hidden text-xs font-normal text-neutral-500 dark:text-neutral-400 sm:block">
              {headerSubtitle}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <FullscreenToggle />
            {userRole === "admin" ? (
              <CommentNotificationBell className="text-neutral-500 transition-colors duration-300 ease-in-out hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100" />
            ) : null}
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-6 p-5 print:p-0 md:p-8 md:pb-12">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
