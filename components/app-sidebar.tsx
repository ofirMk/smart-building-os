"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react"
import {
  ArrowRightLeft,
  Building2,
  ChevronDown,
  ChevronUp,
  Gauge,
  LogOut,
} from "lucide-react"

import { logout } from "@/app/(dashboard)/actions"
import {
  MARKER_OFEK_CONTRACTING_NAV_SECTIONS,
  type SidebarNavItem,
  FACILITY_ADMIN_NAV_SECTIONS,
  HOLDEN_NAV_SECTIONS,
  isFacilityManagementContext,
  isMarkerOfekExecutiveContext,
} from "@/app/(dashboard)/_components/sidebar"
import {
  type AppUserRole,
  guyRahumimWelcomeMessage,
} from "@/lib/auth/user-role"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/" || pathname === "/dashboard"
  }
  if (href === "/marker-ofek") {
    return pathname === "/marker-ofek" || pathname === "/marker-ofek/"
  }
  if (href === "/") {
    return pathname === "/" || pathname === "/dashboard"
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

function avatarLetterFromEmail(email: string | null): string {
  if (!email?.trim()) return "?"
  const first = email.trim().charAt(0)
  return /[a-z]/i.test(first) ? first.toUpperCase() : first
}

type CompanyCookie = "marker_ofek" | "holden_group" | "none"

function setSelectedCompanyCookie(company: CompanyCookie) {
  if (typeof document === "undefined") return
  const maxAge = company === "none" ? 0 : 60 * 60 * 24 * 180
  document.cookie = `selected_company=${company}; Path=/; Max-Age=${maxAge}; SameSite=Lax`
}

type AppSidebarProps = {
  userEmail: string | null
  userRole: AppUserRole
}

function SidebarNavLinkRow({
  pathname,
  item,
  closeMobileNav,
}: {
  pathname: string
  item: SidebarNavItem
  closeMobileNav: () => void
}) {
  const Icon = item.icon
  const isPrimaryHardRoute =
    item.href === "/" ||
    item.href === "/marker-ofek" ||
    item.href === "/dashboard/holden" ||
    item.href === "/hh-panels" ||
    item.href === "/hq"
  const isModulesCenterLink =
    (item.title === "מרכז מודולים" || item.title === "מרכז המודולים") &&
    item.href === "/marker-ofek"
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActivePath(pathname, item.href)}
        tooltip={item.title}
        size="default"
        className={cn(
          "gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ease-out",
          "[&_svg]:size-4 [&_svg]:shrink-0",
          "hover:bg-sidebar-accent/90 hover:text-sidebar-accent-foreground hover:shadow-sm",
          "data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:shadow-sm"
        )}
        render={
          isModulesCenterLink ? (
            <a
              href="/marker-ofek"
              onClick={closeMobileNav}
              dir="rtl"
              className="flex w-full items-center justify-start gap-2 text-start"
            >
              <Icon />
              <span className="truncate">מרכז המודולים</span>
            </a>
          ) : isPrimaryHardRoute ? (
            <a
              href={item.href}
              onClick={closeMobileNav}
              dir="rtl"
              className="flex w-full items-center justify-start gap-2 text-start"
            >
              <Icon />
              <span className="truncate">{item.title}</span>
            </a>
          ) : (
            <Link
              href={item.href}
              onClick={closeMobileNav}
              dir="rtl"
              className="flex w-full items-center justify-start gap-2 text-start"
            >
              <Icon />
              <span className="truncate">{item.title}</span>
            </Link>
          )
        }
      />
    </SidebarMenuItem>
  )
}

export function AppSidebar({ userEmail, userRole }: AppSidebarProps) {
  const pathname = usePathname() ?? ""
  const [logoutPending, startLogoutTransition] = useTransition()
  const { isMobile, setOpenMobile } = useSidebar()
  const [fetchedRole, setFetchedRole] = useState<
    AppUserRole | null | undefined
  >(undefined)
  const [roleFetchError, setRoleFetchError] = useState<string | null>(null)

  const effectiveRole: AppUserRole = useMemo(
    () =>
      fetchedRole === undefined ? userRole : (fetchedRole ?? userRole),
    [fetchedRole, userRole]
  )

  const isMarkerOfek = useMemo(
    () => isMarkerOfekExecutiveContext(pathname),
    [pathname]
  )
  const isFacility = useMemo(
    () => isFacilityManagementContext(pathname),
    [pathname]
  )

  const holdenNavSections = useMemo(() => {
    if (effectiveRole === "admin") {
      return [...HOLDEN_NAV_SECTIONS, ...FACILITY_ADMIN_NAV_SECTIONS]
    }
    return HOLDEN_NAV_SECTIONS
  }, [effectiveRole])
  const markerNavSections = MARKER_OFEK_CONTRACTING_NAV_SECTIONS

  const guyWelcome = useMemo(
    () => guyRahumimWelcomeMessage(userEmail),
    [userEmail]
  )

  const closeMobileNav = useCallback(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, setOpenMobile])

  useEffect(() => {
    if (!isMobile) return
    setOpenMobile(false)
  }, [pathname, isMobile, setOpenMobile])

  useEffect(() => {
    let isMounted = true

    async function fetchRoleNoCache() {
      try {
        setRoleFetchError(null)
        const supabase = createSupabaseBrowserClient()
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) throw userError

        if (!user) {
          if (!isMounted) return
          setFetchedRole(null)
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle()

        if (profileError) throw profileError

        if (!isMounted) return
        const r = (profile as { role?: AppUserRole } | null)?.role ?? null
        setFetchedRole(r)
      } catch (error) {
        if (!isMounted) return
        setFetchedRole(null)
        setRoleFetchError(error instanceof Error ? error.message : String(error))
      }
    }

    void fetchRoleNoCache()

    return () => {
      isMounted = false
    }
  }, [])

  const brandHref = isMarkerOfek ? "/marker-ofek" : "/dashboard/holden"
  const brandTitle = isMarkerOfek
    ? "מרקר אופק יזמות וביצוע"
    : "הולדן ניהול מבנים ומתחמים"
  const brandSubtitle = isMarkerOfek
    ? "יזמות, ביצוע ורכש"
    : "נכסים, דיירים ותחזוקה"

  return (
    <Sidebar
      side="right"
      collapsible="offcanvas"
      variant="inset"
      className="print:hidden"
    >
      <SidebarHeader className="space-y-4 pb-4 pt-1">
        <div className="space-y-2.5 px-1 group-data-[collapsible=icon]:hidden">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-violet-700 dark:text-violet-300">
            החלפת חברה
          </p>
          <details className="group/company-switcher rounded-2xl border border-violet-400/45 bg-violet-500/8 p-1.5 shadow-sm dark:border-violet-400/35 dark:bg-violet-500/10">
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2 text-start text-sm font-semibold transition-colors",
                "hover:bg-white/70 dark:hover:bg-white/10"
              )}
            >
              <span className="inline-flex items-center gap-2">
                <ArrowRightLeft className="size-4 text-muted-foreground" aria-hidden />
                {isMarkerOfek ? (
                  <>
                    <Gauge className="size-4 text-violet-600 dark:text-violet-400" aria-hidden />
                    <span>מרקר אופק - ביצוע</span>
                  </>
                ) : (
                  <>
                    <Building2 className="size-4 text-cyan-600 dark:text-cyan-400" aria-hidden />
                    <span>הולדן גרופ - ניהול מבנים</span>
                  </>
                )}
              </span>
              <ChevronDown
                className="size-4 text-muted-foreground transition-transform duration-200 group-open/company-switcher:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="mt-1 space-y-1 rounded-xl bg-background/90 p-1 dark:bg-zinc-900/60">
              <button
                type="button"
                onClick={() => {
                  closeMobileNav()
                  setSelectedCompanyCookie("marker_ofek")
                  window.location.assign("/marker-ofek")
                }}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                  isMarkerOfek
                    ? "bg-violet-500/10 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                    : "hover:bg-muted"
                )}
              >
                <span>מרקר אופק - ביצוע</span>
                <Gauge className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  closeMobileNav()
                  setSelectedCompanyCookie("holden_group")
                  window.location.assign("/dashboard/holden")
                }}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                  isFacility && !isMarkerOfek
                    ? "bg-cyan-500/10 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300"
                    : "hover:bg-muted"
                )}
              >
                <span>הולדן גרופ - ניהול מבנים</span>
                <Building2 className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  closeMobileNav()
                  setSelectedCompanyCookie("none")
                  window.location.assign("/")
                }}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted"
              >
                <span>חזרה לבחירת חברה</span>
                <ArrowRightLeft className="size-3.5" aria-hidden />
              </button>
            </div>
          </details>
        </div>

        <a
          href={brandHref}
          onClick={closeMobileNav}
          className="flex items-center gap-3 rounded-2xl px-2 py-2 outline-none transition-all duration-300 ease-in-out hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-violet-500/30 dark:hover:bg-white/[0.04]"
        >
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_8px_24px_-8px_rgba(109,40,217,0.45)] transition-transform duration-300 ease-in-out hover:scale-[1.02]",
              "bg-gradient-to-br from-violet-600 to-violet-800 dark:from-violet-500 dark:to-violet-700"
            )}
          >
            {isMarkerOfek ? (
              <Gauge className="size-[1.125rem]" aria-hidden />
            ) : (
              <Building2 className="size-[1.125rem]" aria-hidden />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-bold tracking-tight text-neutral-900 dark:text-white">
              {brandTitle}
            </span>
            <span className="truncate text-xs font-normal text-neutral-500 dark:text-neutral-400">
              {brandSubtitle}
            </span>
          </div>
        </a>
        {guyWelcome ? (
          <p
            className="mt-2 px-2 text-xs font-medium text-emerald-600 group-data-[collapsible=icon]:hidden dark:text-emerald-400"
            data-testid="welcome-guy-rahumim"
          >
            {guyWelcome}
          </p>
        ) : null}
      </SidebarHeader>
      <SidebarContent>
        {(isMarkerOfek ? markerNavSections : holdenNavSections).map(
          (section, idx) => (
            <SidebarGroup key={section.label ?? `fm-section-${idx}`}>
              {section.label ? (
                <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                  {section.label}
                </SidebarGroupLabel>
              ) : null}
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {section.items.map((item, itemIdx) => (
                    <SidebarNavLinkRow
                      key={`fm-${idx}-${itemIdx}-${item.href}`}
                      pathname={pathname}
                      item={item}
                      closeMobileNav={closeMobileNav}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        )}
      </SidebarContent>
      <div
        className="mx-3 my-2 h-px bg-gradient-to-l from-transparent via-black/[0.06] to-transparent dark:via-white/[0.08]"
        aria-hidden
      />
      <SidebarFooter className="pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-start outline-none transition-all duration-300 ease-in-out",
                  "hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-violet-500/25 data-[popup-open]:bg-black/[0.04] dark:hover:bg-white/[0.05] dark:data-[popup-open]:bg-white/[0.05]"
                )}
                title={userEmail ?? "חשבון משתמש"}
              >
                <Avatar className="size-8 shrink-0 border border-sidebar-border">
                  <AvatarFallback className="bg-sidebar-accent text-xs font-medium">
                    {avatarLetterFromEmail(userEmail)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-sm font-medium">
                    {userEmail ?? "לא זמין"}
                  </p>
                  <p className="mt-1 inline-flex max-w-full rounded-md border border-red-400/90 bg-red-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-red-100">
                    {roleFetchError
                      ? "[תפקיד: מנהל מערכת]"
                      : "[תפקיד: מנהל מערכת]"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    מחובר למערכת
                  </p>
                </div>
                <ChevronUp
                  className="size-4 shrink-0 opacity-50 group-data-[collapsible=icon]:hidden"
                  aria-hidden
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-56"
                side="top"
                align="end"
                sideOffset={6}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-0.5 text-start">
                      <span className="text-sm font-medium">חשבון משתמש</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {userEmail ?? "—"}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={logoutPending}
                    onClick={() =>
                      startLogoutTransition(() => {
                        void logout()
                      })
                    }
                  >
                    <LogOut className="size-4" aria-hidden />
                    {logoutPending ? "מתנתקים…" : "התנתקות"}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
