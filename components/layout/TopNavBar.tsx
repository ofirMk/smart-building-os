"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  Bot,
  ChevronDown,
  ClipboardList,
  FileStack,
  LayoutDashboard,
  ListChecks,
  PackageSearch,
  Receipt,
  Package,
  ScanLine,
  Search,
  Sparkles,
  Users,
  WalletCards,
  UserRound,
} from "lucide-react"

import { NavDrawerTrigger } from "@/components/dashboard/nav-drawer-trigger"
import { ActiveCompanyBadge } from "@/components/layout/active-company-badge"
import { MarkerOfekHeaderNav } from "@/components/marker-ofek/layout/header"
import { NotificationBell } from "@/components/marker-ofek/layout/notification-bell"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ACTIVE_COMPANY_CHANGED_EVENT,
  COMPANY_CONTEXT_OPTIONS,
  companyTargetHref,
  readActiveCompanyIdFromCookie,
  resolveCompanyContext,
  type CompanyContextId,
  writeActiveCompanyCookie,
} from "@/lib/company-context"
import { cn } from "@/lib/utils"

type TopNavBarProps = {
  children?: React.ReactNode
  className?: string
  stickyClassName?: string
  isHoldenErpShell?: boolean
}

type MegaId = "procurement" | "finance" | "projects" | "hr" | "ai"

type MegaItem = {
  href: string
  title: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
}

const MEGA_MENUS: Record<
  MegaId,
  { label: string; rootHref: string; items: MegaItem[] }
> = {
  procurement: {
    label: "רכש",
    rootHref: "/marker-ofek/procurement",
    items: [
      {
        href: "/marker-ofek/procurement/orders",
        title: "הזמנות רכש",
        subtitle: "לוח הזמנות אחרונות ומעקב",
        icon: Package,
      },
      {
        href: "/marker-ofek/procurement/purchase-orders/from-boq",
        title: "BoQ (כתב כמויות)",
        subtitle: "הפקת הזמנות מתוך מכרז",
        icon: FileStack,
      },
      {
        href: "/marker-ofek/procurement/suppliers",
        title: "ספקים",
        subtitle: "ניהול ספקים והסכמי מסגרת",
        icon: Users,
      },
      {
        href: "/marker-ofek/procurement/catalog",
        title: "קטלוגים",
        subtitle: "מחירונים, פריטים ומקטים",
        icon: PackageSearch,
      },
    ],
  },
  finance: {
    label: "כספים",
    rootHref: "/marker-ofek/finance",
    items: [
      {
        href: "/marker-ofek/finance/budget-control",
        title: "תקציבים",
        subtitle: "תקציב מול ביצוע וחריגות",
        icon: WalletCards,
      },
      {
        href: "/marker-ofek/finance/invoices",
        title: "חשבוניות",
        subtitle: "ניהול חשבוניות ומעקב",
        icon: Receipt,
      },
      {
        href: "/marker-ofek/finance/payments",
        title: "תשלומים",
        subtitle: "מס״ב, התאמות ובקרה",
        icon: ClipboardList,
      },
      {
        href: "/marker-ofek/finance/billing",
        title: "Billing",
        subtitle: "חשבונות יזם וקבלנים",
        icon: LayoutDashboard,
      },
    ],
  },
  projects: {
    label: "פרויקטים",
    rootHref: "/marker-ofek/projects",
    items: [
      {
        href: "/marker-ofek/projects",
        title: "אתרים פעילים",
        subtitle: "תמונת מצב לכלל הפרויקטים",
        icon: LayoutDashboard,
      },
      {
        href: "/marker-ofek/execution/daily-logs/new",
        title: "ניהול משימות",
        subtitle: "יומן ביצוע ומשימות שטח",
        icon: ListChecks,
      },
      {
        href: "/marker-ofek/execution/gantt",
        title: "גאנט",
        subtitle: "תכנון ובקרת לוחות זמנים",
        icon: ScanLine,
      },
    ],
  },
  hr: {
    label: "משאבי אנוש",
    rootHref: "/marker-ofek/hr/timesheets",
    items: [
      {
        href: "/marker-ofek/entities/new?kind=worker",
        title: "ספר עובדים",
        subtitle: "כרטיסי עובד והרשאות",
        icon: Users,
      },
      {
        href: "/marker-ofek/execution/attendance",
        title: "נוכחות",
        subtitle: "שעון נוכחות יומי",
        icon: ClipboardList,
      },
      {
        href: "/marker-ofek/hr/timesheets",
        title: "שכר ושעות",
        subtitle: "ניהול timesheets ותלושי שכר",
        icon: WalletCards,
      },
    ],
  },
  ai: {
    label: "AI Agent",
    rootHref: "/chat",
    items: [
      {
        href: "/chat",
        title: "עוזר AI ראשי",
        subtitle: "צ׳אט חכם ארגוני",
        icon: Bot,
      },
      {
        href: "/marker-ofek/procurement/goods-receipt/new",
        title: "AI OCR למסמכים",
        subtitle: "Magic Extract לתעודות משלוח",
        icon: ScanLine,
      },
    ],
  },
}

const QUICK_SEARCH_LINKS: { href: string; title: string; subtitle: string }[] =
  [
    {
      href: "/marker-ofek/command-center",
      title: "מרכז פיקוד",
      subtitle: "מודולים · KPI",
    },
    {
      href: "/marker-ofek/procurement/purchase-order-delivery-flow",
      title: "זרימת הזמנה ואספקה",
      subtitle: "רכש",
    },
    {
      href: "/marker-ofek/finance",
      title: "מרכז כספים",
      subtitle: "תזרים · חשבוניות",
    },
    {
      href: "/holden",
      title: "הולדן — ניהול נכסים",
      subtitle: "מתקנים",
    },
    {
      href: "/chat",
      title: "AI Agent",
      subtitle: "צ'אט חכם",
    },
  ]

/** Brand “breathing” accent — emerald → teal → sky */
const BREATHING_LINE_CLASS =
  "h-[3px] rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-600 shadow-[0_1px_8px_rgba(16,185,129,0.35)]"

function setCompanyCookie(company: CompanyContextId) {
  writeActiveCompanyCookie(company)
}

function isPathUnder(pathname: string, prefix: string) {
  if (pathname === prefix) return true
  return pathname.startsWith(prefix + "/")
}

function megaActive(pathname: string, id: MegaId): boolean {
  const items = MEGA_MENUS[id].items
  return items.some((it) => isPathUnder(pathname, it.href))
}

function MotionDropdown({
  open,
  children,
  align = "end",
}: {
  open: boolean
  children: React.ReactNode
  align?: "end" | "start"
}) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? undefined : { opacity: 0, y: -4, scale: 0.99 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "absolute top-[calc(100%+6px)] z-[60] min-w-[13rem] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl ring-1 ring-slate-900/[0.04]",
            align === "end" ? "end-0" : "start-0"
          )}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function MegaMenuPanel({
  id,
  open,
  onLinkNavigate,
}: {
  id: MegaId
  open: boolean
  onLinkNavigate: () => void
}) {
  const reduce = useReducedMotion()
  const data = MEGA_MENUS[id]

  return (
    <AnimatePresence mode="wait">
      {open ? (
        <motion.div
          key={id}
          role="region"
          aria-label={data.label}
          initial={
            reduce
              ? { opacity: 1, y: 0 }
              : { opacity: 0, y: 10, scale: 0.985 }
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={
            reduce
              ? { opacity: 0 }
              : { opacity: 0, y: 6, scale: 0.99 }
          }
          transition={{
            duration: 0.28,
            ease: [0.22, 1, 0.36, 1],
          }}
          className={cn(
            "pointer-events-auto absolute start-1/2 top-full z-[55] mt-2 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 rtl:translate-x-1/2",
            "rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl ring-1 ring-slate-900/[0.06]"
          )}
          style={{ transformOrigin: "top center" }}
        >
          <div className="border-b border-border px-2 pb-2 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {data.label}
            </p>
          </div>
          <ul className="flex flex-col gap-0.5 p-1">
            {data.items.map((item, index) => {
              const Icon = item.icon
              return (
                <li key={`${id}-${item.title}-${index}`}>
                  <Link
                    href={item.href}
                    onClick={onLinkNavigate}
                    className={cn(
                      "group/mega flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors duration-200",
                      "hover:bg-accent/60",
                      "hover:shadow-sm"
                    )}
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover/mega:bg-accent group-hover/mega:text-accent-foreground">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-start">
                      <span className="block text-sm font-semibold text-foreground transition-colors group-hover/mega:text-accent-foreground">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground group-hover/mega:text-accent-foreground/80">
                        {item.subtitle}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function BreathingNavTrigger({
  href,
  label,
  open,
  active,
  onEnter,
  onLeaveIntent,
}: {
  href: string
  label: string
  open: boolean
  active: boolean
  onEnter: () => void
  onLeaveIntent: () => void
}) {
  return (
    <div
      className="relative"
      onMouseEnter={onEnter}
      onMouseLeave={onLeaveIntent}
    >
      <Link
        href={href}
        aria-expanded={open}
        aria-haspopup="true"
        onFocus={onEnter}
        className={cn(
          "group/trigger relative flex items-center gap-0.5 rounded-md px-2.5 py-2 text-[13px] font-medium outline-none transition-colors duration-200",
          "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
          (open || active) && "bg-accent text-accent-foreground"
        )}
      >
        <span className="relative z-10">{label}</span>
        <ChevronDown
          className={cn(
            "size-3.5 opacity-60 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            open && "rotate-180 opacity-90"
          )}
          aria-hidden
        />
        {/* Breathing line — scales in on hover OR when open/active */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-2 -bottom-px overflow-hidden rounded-full",
            BREATHING_LINE_CLASS,
            "origin-center transition-[transform,opacity] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            "scale-x-0 opacity-0",
            "group-hover/trigger:scale-x-100 group-hover/trigger:opacity-100",
            (open || active) && "scale-x-100 opacity-100"
          )}
        />
      </Link>
    </div>
  )
}

/**
 * Premium top navigation: mega-menus (framer-motion), breathing brand underline,
 * NavDrawer + search/notifications/profile. Light theme only.
 */
export function TopNavBar({
  children,
  className,
  stickyClassName,
  isHoldenErpShell,
}: TopNavBarProps) {
  const pathname = usePathname() ?? ""
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const [domain, setDomain] = React.useState<CompanyContextId>("marker_ofek")
  const [openMega, setOpenMega] = React.useState<MegaId | null>(null)
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const navClusterRef = React.useRef<HTMLDivElement>(null)

  const [profileOpen, setProfileOpen] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [searchQ, setSearchQ] = React.useState("")
  const profileRef = React.useRef<HTMLDivElement>(null)

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  const scheduleCloseMega = React.useCallback(() => {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => setOpenMega(null), 160)
  }, [clearCloseTimer])

  const openMegaId = React.useCallback(
    (id: MegaId) => {
      clearCloseTimer()
      setOpenMega(id)
    },
    [clearCloseTimer]
  )

  React.useEffect(() => {
    const next = readActiveCompanyIdFromCookie()
    if (next) setDomain(next)
  }, [])

  React.useEffect(() => {
    const onCompanyChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ companyId?: CompanyContextId }>
      const next = resolveCompanyContext(customEvent.detail?.companyId ?? null)
      if (next) {
        setDomain(next)
      }
    }
    window.addEventListener(ACTIVE_COMPANY_CHANGED_EVENT, onCompanyChanged)
    return () =>
      window.removeEventListener(ACTIVE_COMPANY_CHANGED_EVENT, onCompanyChanged)
  }, [])

  React.useEffect(() => setOpenMega(null), [pathname])

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (profileRef.current && !profileRef.current.contains(t)) setProfileOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMega(null)

      const mod = e.metaKey || e.ctrlKey
      const isK =
        e.code === "KeyK" ||
        e.key === "k" ||
        e.key === "K"
      if (mod && isK) {
        // Capture + preventDefault stops Chrome/Firefox from focusing the address bar on Ctrl+K / Cmd+K.
        e.preventDefault()
        if (e.repeat) return
        // מרקר אופק: פלטת הפקודה ב־MarkerOfekWorkspaceLayout — לא לפתוח כפילות מ־TopNavBar
        if (pathname.startsWith("/marker-ofek")) return
        setSearchOpen(true)
      }
    }
    document.addEventListener("keydown", onKey, { capture: true })
    return () =>
      document.removeEventListener("keydown", onKey, { capture: true })
  }, [pathname])

  React.useEffect(() => {
    return () => clearCloseTimer()
  }, [clearCloseTimer])

  const filteredQuick = React.useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return QUICK_SEARCH_LINKS
    return QUICK_SEARCH_LINKS.filter(
      (x) =>
        x.title.toLowerCase().includes(q) || x.subtitle.toLowerCase().includes(q)
    )
  }, [searchQ])

  const commandCenterActive =
    pathname === "/marker-ofek/command-center" ||
    pathname === "/marker-ofek" ||
    pathname === "/marker-ofek/"
  const isMarkerWorkspace = pathname.startsWith("/marker-ofek")

  return (
    <>
      <motion.header
        layout={false}
        initial={{ opacity: 0.98 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "sticky z-[70] flex min-h-[3.25rem] shrink-0 flex-col border-b border-border/70 bg-card/95 text-foreground shadow-[0_8px_20px_rgba(15,23,42,0.08)] backdrop-blur-md print:hidden",
          isHoldenErpShell ? "shadow-[0_1px_0_0_rgb(226_232_240/0.9)]" : "",
          stickyClassName,
          className
        )}
      >
        <div
          className={cn(
            "relative grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-2 py-1.5 md:gap-3 md:px-3",
            children ? "border-b border-border/70" : ""
          )}
        >
          <div className="flex min-w-0 items-center gap-2 justify-self-start md:gap-3">
            <NavDrawerTrigger
              className={cn(
                "size-9 shrink-0 rounded-lg border border-slate-200 bg-card text-slate-600 shadow-sm",
                "transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                "hover:bg-muted hover:text-foreground hover:shadow-md",
                "active:scale-[0.96]"
              )}
            />
            <Link
              href="/marker-ofek/command-center"
              className="group flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-sm">
                <Sparkles className="size-4" aria-hidden />
              </span>
              <span className="hidden min-w-0 flex-col text-start sm:flex">
                <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Smart Building OS
                </span>
                <span className="truncate text-sm font-semibold text-foreground">
                  מרקר אופק
                </span>
              </span>
            </Link>

            <div className="hidden h-8 w-px bg-slate-200/90 sm:block" aria-hidden />

            <div className="hidden min-w-[9.5rem] sm:block">
              <Select
                value={domain}
                onValueChange={(v) => {
                  if (
                    v === "marker_ofek" ||
                    v === "holden_group" ||
                    v === "building_management_co"
                  ) {
                    setDomain(v)
                    setCompanyCookie(v)
                    router.push(companyTargetHref(v))
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="h-8 border-slate-200 bg-card px-2 text-xs font-medium"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_CONTEXT_OPTIONS.map((company) => (
                    <SelectItem key={company.id} value={company.id} className="text-sm">
                      {company.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="hidden sm:block">
              <ActiveCompanyBadge companyId={domain} />
            </div>
          </div>

          {/* Main top navigation — single source for Marker Ofek from sidebar config */}
          {isMarkerWorkspace ? (
            <div className="min-w-0 justify-self-center overflow-visible" dir="rtl">
              <MarkerOfekHeaderNav className="mx-auto w-full max-w-[min(80rem,100%)] justify-center" />
            </div>
          ) : (
            <div
              ref={navClusterRef}
              className="hidden min-w-0 justify-self-center lg:block"
              onMouseLeave={scheduleCloseMega}
            >
              <nav
                className="relative flex flex-wrap items-center justify-center gap-1"
                aria-label="ניווט ראשי — תפריטי עומק"
              >
                <div className="relative px-0.5">
                  <Link
                    href="/marker-ofek/command-center"
                    className={cn(
                      "group/cc relative block rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                      commandCenterActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
                    )}
                  >
                    מרכז פיקוד
                    <span
                      aria-hidden
                      className={cn(
                        BREATHING_LINE_CLASS,
                        "pointer-events-none absolute inset-x-2 -bottom-px origin-center transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        commandCenterActive
                          ? "scale-x-100 opacity-100"
                          : "scale-x-0 opacity-0 group-hover/cc:scale-x-100 group-hover/cc:opacity-100"
                      )}
                    />
                  </Link>
                </div>

                {(["procurement", "finance", "projects", "hr", "ai"] as const).map(
                  (mid) => (
                    <div
                      key={mid}
                      className="relative"
                      onMouseEnter={() => openMegaId(mid)}
                    >
                      <BreathingNavTrigger
                        href={MEGA_MENUS[mid].rootHref}
                        label={MEGA_MENUS[mid].label}
                        open={openMega === mid}
                        active={megaActive(pathname, mid)}
                        onEnter={() => openMegaId(mid)}
                        onLeaveIntent={() => {}}
                      />
                    </div>
                  )
                )}
              </nav>

              {/* Single portal for mega panel — positioned under nav */}
              <div
                className="pointer-events-none absolute start-0 end-0 top-full z-[54] flex justify-center"
                onMouseEnter={clearCloseTimer}
                onMouseLeave={scheduleCloseMega}
              >
                <div className="pointer-events-auto relative h-0 w-full max-w-3xl">
                  {(["procurement", "finance", "projects", "hr", "ai"] as const).map(
                    (mid) => (
                      <MegaMenuPanel
                        key={mid}
                        id={mid}
                        open={openMega === mid}
                        onLinkNavigate={() => setOpenMega(null)}
                      />
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex shrink-0 items-center justify-self-end gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-slate-200 bg-card px-2 text-xs font-medium text-slate-700 shadow-sm"
              onClick={() => setSearchOpen(true)}
              aria-label="חיפוש מהיר"
            >
              <Search className="size-3.5 opacity-80" aria-hidden />
              <span className="hidden sm:inline">חיפוש</span>
              <kbd className="hidden rounded border border-slate-200 bg-background px-1 font-mono text-[10px] text-slate-500 sm:inline">
                ⌘K
              </kbd>
            </Button>

            <NotificationBell
              onOpenChange={(next) => {
                if (next) setProfileOpen(false)
              }}
            />

            <div className="relative" ref={profileRef}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
              className="h-8 gap-1 rounded-lg ps-2 pe-1.5 text-foreground hover:bg-accent"
                onClick={() => {
                  setProfileOpen((o) => !o)
                }}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserRound className="size-4" aria-hidden />
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 opacity-60 transition-transform duration-200",
                    profileOpen && "rotate-180"
                  )}
                  aria-hidden
                />
              </Button>
              <MotionDropdown open={profileOpen} align="end">
                <div className="py-1 text-start">
                  <p className="px-3 py-2 text-[11px] font-medium text-muted-foreground">
                    חשבון
                  </p>
                  <Link
                    href="/marker-ofek/settings"
                    className="block rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => setProfileOpen(false)}
                  >
                    הגדרות אישיות
                  </Link>
                  <Link
                    href="/marker-ofek/settings/user-permissions"
                    className="block rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => setProfileOpen(false)}
                  >
                    הרשאות
                  </Link>
                  <div className="my-1 h-px bg-border" />
                  <button
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-start text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                    onClick={() => setProfileOpen(false)}
                  >
                    יציאה (דמו)
                  </button>
                </div>
              </MotionDropdown>
            </div>
          </div>
        </div>

        {children ? (
          <div className="flex min-h-[2.5rem] w-full items-start gap-2 bg-card px-2 py-1.5 md:px-3">
            {children}
          </div>
        ) : null}
      </motion.header>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent
          className="max-w-lg gap-0 overflow-hidden border-border bg-card p-0 shadow-2xl"
          showCloseButton
        >
          <motion.div
            initial={
              reduceMotion ? false : { opacity: 0, y: 10, scale: 0.985 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: reduceMotion ? 0 : 0.24,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex flex-col gap-0"
          >
            <DialogHeader className="border-b border-slate-100 px-4 pb-3 pt-4 text-start">
              <DialogTitle className="text-base font-semibold">חיפוש מהיר</DialogTitle>
            </DialogHeader>
            <div className="px-4 pb-4">
              <Input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="הקלד לסינון קישורים…"
                className="h-9 border-slate-200 bg-card text-sm"
                autoFocus
              />
              <ul className="mt-3 max-h-[min(50vh,20rem)] space-y-0.5 overflow-y-auto">
                {filteredQuick.map((item, index) => (
                  <li key={`${item.title}-${index}`}>
                    <Link
                      href={item.href}
                      className="flex flex-col rounded-lg px-3 py-2 text-start transition-colors hover:bg-muted"
                      onClick={() => setSearchOpen(false)}
                    >
                      <span className="text-sm font-medium text-foreground">
                        {item.title}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {item.subtitle}
                      </span>
                    </Link>
                  </li>
                ))}
                {filteredQuick.length === 0 ? (
                  <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                    לא נמצאו תוצאות
                  </li>
                ) : null}
              </ul>
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>
    </>
  )
}
