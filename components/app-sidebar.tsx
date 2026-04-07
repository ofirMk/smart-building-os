"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react"
import {
  ArrowRightLeft,
  BarChart,
  Building2,
  ChevronDown,
  ChevronUp,
  Gauge,
  LogOut,
  Shield,
  Sparkles,
} from "lucide-react"

import { logout } from "@/app/(dashboard)/actions"
import {
  MARKER_OFEK_CONTRACTING_NAV_SECTIONS,
  type SidebarNavItem,
  type SidebarNavSection,
  FACILITY_ADMIN_NAV_SECTIONS,
  HOLDEN_NAV_SECTIONS,
  isFacilityManagementContext,
  isMarkerOfekExecutiveContext,
} from "@/app/(dashboard)/_components/sidebar"
import {
  indexOfSidebarSectionForPathname,
  isSidebarNavItemActive,
} from "@/app/(dashboard)/_components/sidebar-routes"
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
import { useModuleVisibility } from "@/components/marker-ofek/marker-ofek-dashboard-context"
import {
  filterSidebarSectionsByModules,
} from "@/lib/marker-ofek/module-registry"
import { MIRROR_BANNER_INSET_PT_CLASS } from "@/lib/marker-ofek/mirror-layout"
import { filterSidebarWhenNoManagedProjects } from "@/lib/marker-ofek/project-scope"
import {
  ERP_EXECUTION_SUBTITLE,
  useOrganizationBranding,
} from "@/components/organization-branding-context"
import { useSmartWorkspace } from "@/components/marker-ofek/workspace/smart-workspace-context"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"

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
  /** ברכת מארח — מרקר אופק */
  hostGreetingLine?: string | null
  showPartnerFinanceNav?: boolean
  showHoldingExecutiveNav?: boolean
  /** Ophir — link to per-user module toggles */
  showUserPermissionsNav?: boolean
  /** Admin / Ophir — AI user onboarding */
  showAiUserSetupNav?: boolean
  /** Guy/Samer / Ophir mirror: count of managed projects; null → do not hide empty-portfolio links */
  scopedProjectCount?: number | null
  /** When true, hide portfolio links if scopedProjectCount === 0 */
  applyEmptyPortfolioNav?: boolean
  /** Offset for fixed mirror banner */
  mirrorBannerActive?: boolean
}

function SidebarNavLinkRow({
  pathname,
  item,
  closeMobileNav,
  monoLabel = false,
  markerSoftNav,
}: {
  pathname: string
  item: SidebarNavItem
  closeMobileNav: () => void
  /** תוויות מרקר אופק תחת אקורדיון — מונוספייס פרמיום */
  monoLabel?: boolean
  /** ניווט רך + לשונית פנימית — מרקר אופק */
  markerSoftNav?: (href: string, title: string) => void
}) {
  const Icon = item.icon
  const useMarkerSoft =
    Boolean(markerSoftNav) && item.href.startsWith("/marker-ofek")
  const isPrimaryHardRoute =
    item.href === "/" ||
    item.href === "/marker-ofek" ||
    item.href === "/dashboard/holden" ||
    item.href === "/hh-panels" ||
    item.href === "/hq"
  const isModulesCenterLink =
    (item.title === "מרכז מודולים" || item.title === "מרכז המודולים") &&
    (item.href === "/marker-ofek/command-center" || item.href === "/marker-ofek")
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isSidebarNavItemActive(pathname, item.href)}
        tooltip={item.title}
        size="default"
        className={cn(
          "gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-out",
          "[&_svg]:size-4 [&_svg]:shrink-0",
          "data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm"
        )}
        render={
          isModulesCenterLink ? (
            <a
              href="/marker-ofek/command-center"
              onClick={(e) => {
                if (useMarkerSoft && markerSoftNav) {
                  e.preventDefault()
                  closeMobileNav()
                  markerSoftNav("/marker-ofek/command-center", "מרכז המודולים")
                  return
                }
                closeMobileNav()
              }}
              dir="rtl"
              className="flex w-full items-center justify-start gap-2 text-start"
            >
              <Icon />
              <span
                className={cn("truncate", monoLabel && "font-currency-mono text-[13px]")}
              >
                מרכז המודולים
              </span>
            </a>
          ) : isPrimaryHardRoute ? (
            <a
              href={item.href}
              onClick={(e) => {
                if (useMarkerSoft && markerSoftNav) {
                  e.preventDefault()
                  closeMobileNav()
                  markerSoftNav(item.href, item.title)
                  return
                }
                closeMobileNav()
              }}
              dir="rtl"
              className="flex w-full items-center justify-start gap-2 text-start"
            >
              <Icon />
              <span
                className={cn("truncate", monoLabel && "font-currency-mono text-[13px]")}
              >
                {item.title}
              </span>
            </a>
          ) : (
            <Link
              href={item.href}
              onClick={(e) => {
                if (useMarkerSoft && markerSoftNav) {
                  e.preventDefault()
                  closeMobileNav()
                  markerSoftNav(item.href, item.title)
                  return
                }
                closeMobileNav()
              }}
              dir="rtl"
              className="flex w-full items-center justify-start gap-2 text-start"
            >
              <Icon />
              <span
                className={cn("truncate", monoLabel && "font-currency-mono text-[13px]")}
              >
                {item.title}
              </span>
            </Link>
          )
        }
      />
    </SidebarMenuItem>
  )
}

function MarkerOfekSidebarAccordion({
  pathname,
  sections,
  closeMobileNav,
  markerSoftNav,
}: {
  pathname: string
  sections: SidebarNavSection[]
  closeMobileNav: () => void
  markerSoftNav?: (href: string, title: string) => void
}) {
  const activeIdx = useMemo(
    () => indexOfSidebarSectionForPathname(pathname, sections),
    [pathname, sections]
  )
  const [openIdx, setOpenIdx] = useState<number>(() => activeIdx)

  useEffect(() => {
    setOpenIdx(activeIdx)
  }, [activeIdx])

  return (
    <div className="flex flex-col gap-1.5 px-0.5">
      {sections.map((section, idx) => {
        const label = section.label?.trim() || `קבוצה ${idx + 1}`
        const isOpen = openIdx === idx
        const sectionHasActive = section.items.some((it) =>
          isSidebarNavItemActive(pathname, it.href)
        )

        return (
          <div
            key={`${label}-${idx}`}
            className="rounded-xl border border-slate-200/80 bg-white/40 dark:border-sidebar-border dark:bg-sidebar-accent/20"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => {
                setOpenIdx((cur) => (cur === idx ? -1 : idx))
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-start transition-colors duration-150",
                "text-indigo-950 hover:bg-slate-50/90 dark:text-indigo-100 dark:hover:bg-sidebar-accent/60",
                sectionHasActive && !isOpen && "bg-indigo-50/50 dark:bg-indigo-950/25"
              )}
            >
              <span className="min-w-0 flex-1 text-sm font-semibold tracking-tight">
                {label}
              </span>
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 shrink-0 text-indigo-950/60 transition-transform duration-200 ease-out motion-reduce:transition-none dark:text-indigo-200/70",
                  isOpen && "-rotate-180"
                )}
              />
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="px-1 pb-2 pt-0.5">
                  <SidebarMenu className="gap-0.5">
                    {section.items.map((item, itemIdx) => (
                      <SidebarNavLinkRow
                        key={`acc-${idx}-${itemIdx}-${item.href}`}
                        pathname={pathname}
                        item={item}
                        closeMobileNav={closeMobileNav}
                        monoLabel
                        markerSoftNav={markerSoftNav}
                      />
                    ))}
                  </SidebarMenu>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function AppSidebar({
  userEmail,
  userRole,
  hostGreetingLine = null,
  showPartnerFinanceNav = false,
  showHoldingExecutiveNav = false,
  showUserPermissionsNav = false,
  showAiUserSetupNav = false,
  scopedProjectCount = null,
  applyEmptyPortfolioNav = false,
  mirrorBannerActive = false,
}: AppSidebarProps) {
  const pathname = usePathname() ?? ""
  const router = useRouter()
  const smartWs = useSmartWorkspace()
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

  const { modules } = useModuleVisibility()

  const holdenNavSections = useMemo(() => {
    const raw =
      effectiveRole === "admin"
        ? [...HOLDEN_NAV_SECTIONS, ...FACILITY_ADMIN_NAV_SECTIONS]
        : HOLDEN_NAV_SECTIONS
    return filterSidebarSectionsByModules(raw, modules)
  }, [effectiveRole, modules])

  const markerNavSections = useMemo((): SidebarNavSection[] => {
    const withoutExec = showHoldingExecutiveNav
      ? MARKER_OFEK_CONTRACTING_NAV_SECTIONS
      : MARKER_OFEK_CONTRACTING_NAV_SECTIONS.map((section) => ({
          ...section,
          items: section.items.filter(
            (i) =>
              i.href !== "/marker-ofek/executive" && i.href !== "/management"
          ),
        }))
    let withAdmin = withoutExec
    if (showUserPermissionsNav || showAiUserSetupNav) {
      withAdmin = withAdmin.map((section) =>
        section.label === "מערכת"
          ? {
              ...section,
              items: [
                ...section.items,
                ...(showAiUserSetupNav
                  ? [
                      {
                        title: "הקמת משתמש (AI)",
                        href: "/marker-ofek/settings/users/ai-setup",
                        icon: Sparkles,
                      } satisfies SidebarNavItem,
                    ]
                  : []),
                ...(showUserPermissionsNav
                  ? [
                      {
                        title: "הרשאות משתמשים",
                        href: "/marker-ofek/settings/user-permissions",
                        icon: Shield,
                      } satisfies SidebarNavItem,
                    ]
                  : []),
              ],
            }
          : section
      )
    }
    const withPartners: SidebarNavSection[] = !showPartnerFinanceNav
      ? withAdmin
      : [
          ...withAdmin,
          {
            label: "הנהלה בכירה",
            items: [
              {
                title: "מרכז שותפי ניהול",
                href: "/marker-ofek/partner-finance",
                icon: BarChart,
              },
            ],
          },
        ]
    const filtered = filterSidebarSectionsByModules(withPartners, modules)
    return filterSidebarWhenNoManagedProjects(
      filtered,
      scopedProjectCount,
      applyEmptyPortfolioNav
    )
  }, [
    showPartnerFinanceNav,
    showHoldingExecutiveNav,
    showUserPermissionsNav,
    showAiUserSetupNav,
    scopedProjectCount,
    applyEmptyPortfolioNav,
    modules,
  ])

  const guyWelcome = useMemo(
    () => guyRahumimWelcomeMessage(userEmail),
    [userEmail]
  )

  const closeMobileNav = useCallback(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, setOpenMobile])

  const markerSoftNav = useCallback(
    (href: string, title: string) => {
      smartWs?.ensureTabForPath(href, title)
      router.push(href)
    },
    [router, smartWs]
  )

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

  const branding = useOrganizationBranding()
  const brandHref = isMarkerOfek ? "/marker-ofek/command-center" : "/dashboard/holden"
  const erpBrandLine = `${branding.organizationName} · ${ERP_EXECUTION_SUBTITLE}`
  const brandTitle = isMarkerOfek
    ? erpBrandLine
    : "הולדן ניהול מבנים ומתחמים"
  const brandSubtitle = isMarkerOfek
    ? ERP_EXECUTION_SUBTITLE
    : "נכסים, דיירים ותחזוקה"

  return (
    <Sidebar
      side="right"
      collapsible="offcanvas"
      variant="inset"
      className={cn("print:hidden", mirrorBannerActive && MIRROR_BANNER_INSET_PT_CLASS)}
    >
      <SidebarHeader className="space-y-4 pb-4 pt-1">
        {isMarkerOfek && hostGreetingLine ? (
          <div className="rounded-xl border border-sidebar-border bg-white/80 px-3 py-2.5 shadow-sm dark:bg-sidebar-accent/40">
            <p className="text-sm font-semibold tracking-tight text-indigo-950 dark:text-indigo-100">
              {hostGreetingLine}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              נעים לראותך כאן.
            </p>
          </div>
        ) : null}
        <div className="space-y-2.5 px-1 group-data-[collapsible=icon]:hidden">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            החלפת חברה
          </p>
          <details className="group/company-switcher rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-1.5 shadow-sm">
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 text-start text-sm font-semibold transition-colors duration-200",
                "hover:bg-sidebar-accent"
              )}
            >
              <span className="inline-flex items-center gap-2">
                <ArrowRightLeft className="size-4 text-muted-foreground" aria-hidden />
                {isMarkerOfek ? (
                  <>
                    <Gauge className="size-4 text-sidebar-primary" aria-hidden />
                    <span className="truncate">{erpBrandLine}</span>
                  </>
                ) : (
                  <>
                    <Building2 className="size-4 text-slate-600 dark:text-slate-300" aria-hidden />
                    <span>הולדן גרופ - ניהול מבנים</span>
                  </>
                )}
              </span>
              <ChevronDown
                className="size-4 text-muted-foreground transition-transform duration-200 group-open/company-switcher:rotate-180"
                aria-hidden
              />
            </summary>
              <div className="mt-1 space-y-1 rounded-lg bg-muted/80 p-1 dark:bg-sidebar-accent/40">
              <button
                type="button"
                onClick={() => {
                  closeMobileNav()
                  setSelectedCompanyCookie("marker_ofek")
                  window.location.assign("/marker-ofek/command-center")
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors duration-200",
                  isMarkerOfek
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "hover:bg-sidebar-accent"
                )}
              >
                <span className="truncate text-start">{erpBrandLine}</span>
                <Gauge className="size-4 shrink-0" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  closeMobileNav()
                  setSelectedCompanyCookie("holden_group")
                  window.location.assign("/dashboard/holden")
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors duration-200",
                  isFacility && !isMarkerOfek
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "hover:bg-sidebar-accent"
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
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent"
              >
                <span>חזרה לבחירת חברה</span>
                <ArrowRightLeft className="size-3.5" aria-hidden />
              </button>
            </div>
          </details>
        </div>

        <a
          href={brandHref}
          onClick={(e) => {
            if (isMarkerOfek && brandHref.startsWith("/marker-ofek")) {
              e.preventDefault()
              closeMobileNav()
              markerSoftNav(brandHref, "מרכז הפיקוד")
              return
            }
            closeMobileNav()
          }}
          className="flex items-center gap-3 rounded-xl px-2 py-2 outline-none transition-all duration-200 ease-in-out hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
        >
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-md ring-1 ring-slate-100 transition-transform duration-200 ease-out hover:scale-[1.02]",
              isMarkerOfek
                ? "border border-slate-100 bg-white"
                : "bg-gradient-to-br from-slate-800 to-slate-950 text-sidebar-primary-foreground dark:from-slate-100 dark:to-slate-300 dark:text-slate-900"
            )}
          >
            {isMarkerOfek ? (
              branding.brandLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.brandLogoUrl}
                  alt=""
                  className="size-full object-contain p-1.5"
                />
              ) : (
                <Building2
                  className="size-[1.125rem] text-[#1e1b4b]"
                  aria-hidden
                />
              )
            ) : (
              <Building2 className="size-[1.125rem]" aria-hidden />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-bold tracking-tight text-sidebar-foreground">
              {brandTitle}
            </span>
            <span className="truncate text-xs font-normal text-muted-foreground">
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
        {isMarkerOfek ? (
          <SidebarGroup className="px-1">
            <SidebarGroupContent>
              <MarkerOfekSidebarAccordion
                pathname={pathname}
                sections={markerNavSections}
                closeMobileNav={closeMobileNav}
                markerSoftNav={markerSoftNav}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          holdenNavSections.map((section, idx) => (
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
          ))
        )}
      </SidebarContent>
      <div
        className="mx-3 my-2 h-px bg-gradient-to-l from-transparent via-border to-transparent"
        aria-hidden
      />
      <SidebarFooter className="pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start outline-none transition-all duration-200 ease-in-out",
                  "hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring/30 data-[popup-open]:bg-sidebar-accent"
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
