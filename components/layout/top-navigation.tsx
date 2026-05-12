"use client"

/**
 * Top Navigation — Salient-style horizontal nav bar (RTL-first).
 *
 * מבנה: לוגו בימין | פריטי ניווט זורמים שמאלה | actions-slot בסוף (שמאל ב-RTL)
 *
 * עיצוב:
 *  - גובה קבוע h-16 (4rem), shrink-0, border-b — סרגל "נעול" בראש ה-shell.
 *  - פריטי top-level ללא נתיב וללא children → `text-muted-foreground` (בהקמה).
 *  - פריט עם children → פותח Mega-Menu רחב ברזולוציות גדולות.
 *  - Mega-menu: רקע אטום (bg-card), shadow-md, grid של 7 עמודות.
 *  - keyboard: Esc סוגר. click-outside סוגר. route-change סוגר.
 *
 * שרשרת ה-Layout Invariants נשמרת (ראה docs/architecture/layout-invariants.md).
 */

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronDown, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

type MegaLink = { label: string; href?: string }
type MegaColumn = { title: string; href?: string; links: MegaLink[] }
type NavItem = {
  key: string
  label: string
  href?: string
  columns?: MegaColumn[]
}

/**
 * Demo project UUID used for module deep-links that require a project context
 * (e.g. WBS Planning, Cost Control Cockpit). Mirrors the same constant in
 * `app/(dashboard)/marker-ofek/pitch/page.tsx` so investor walkthroughs always
 * land on a real, seeded project. If you change this, update both places.
 *
 * Transparent Navigation Rule: every heavy module we build must be reachable
 * from this nav. No URL-only modules.
 */
const DEMO_PROJECT_ID = "8599ee46-50a7-4a5e-b219-e853ff093cc6"

/* ─────────────────────────────────────────────────────────────────
 * מקור-אמת יחיד למבנה התפריט — ניתן לעדכון פשוט בעתיד.
 * ───────────────────────────────────────────────────────────────── */
const NAV_ITEMS: NavItem[] = [
  { key: "entrepreneurship", label: "יזמות" },
  { key: "planning", label: "תכנון" },
  {
    key: "construction",
    label: "בנייה",
    columns: [
      {
        title: "שרשרת רכש",
        links: [
          { label: "כרטיס פריט", href: "/marker-ofek/items" },
          { label: "קטלוג פריטים", href: "/marker-ofek/procurement/catalog" },
          { label: "הזמנות רכש", href: "/marker-ofek/procurement/orders" },
          { label: "ספקים", href: "/marker-ofek/procurement/suppliers" },
        ],
      },
      { title: "מכרזים", links: [] },
      {
        title: "חוזים וחשבונות",
        href: "/marker-ofek/contracts-engine",
        links: [
          { label: "מנוע חוזים W2 (MedaTech)", href: "/marker-ofek/contracts-engine" },
          { label: "מאגר חוזים", href: "/marker-ofek/contracts" },
          { label: "חוזה חדש", href: "/marker-ofek/contracts/new" },
        ],
      },
      {
        title: "פרויקטים",
        href: "/marker-ofek/projects",
        links: [
          { label: "כל הפרויקטים", href: "/marker-ofek/projects" },
          {
            label: "תכנון WBS (Sprint A.4)",
            href: `/marker-ofek/projects/${DEMO_PROJECT_ID}/planning`,
          },
          { label: "כספת מסמכים (DMS)", href: "/marker-ofek/dms" },
        ],
      },
      {
        title: "בקרה תקציבית",
        href: `/marker-ofek/projects/${DEMO_PROJECT_ID}/cost-control`,
        links: [
          {
            label: "Cockpit פרויקט (Sprint A.5)",
            href: `/marker-ofek/projects/${DEMO_PROJECT_ID}/cost-control`,
          },
          { label: "בקרת תקציב כללית", href: "/marker-ofek/finance/budget-control" },
        ],
      },
      { title: "שינויי דיירים", links: [] },
      { title: "בדק", links: [] },
    ],
  },
  { key: "building-management", label: "ניהול מבנים" },
  { key: "trade", label: "סחר" },
  {
    key: "finance",
    label: "כספים",
    columns: [
      {
        title: "תשלומים",
        href: "/marker-ofek/finance/payments",
        links: [
          { label: "ריצת תשלומים (AP)", href: "/marker-ofek/finance/payments/runs" },
          { label: 'מס"ב (MASAV)', href: "/marker-ofek/finance/payments/masav" },
          { label: "דרישות תשלום", href: "/marker-ofek/finance/payment-demands" },
          { label: "סקירת תשלומים", href: "/marker-ofek/finance/payments" },
        ],
      },
      {
        title: "התאמות בנקאיות",
        href: "/marker-ofek/finance/bank-reconciliation",
        links: [
          { label: "Bank Reconciliation", href: "/marker-ofek/finance/bank-reconciliation" },
          { label: "קליטת דפי בנק", href: "/marker-ofek/finance/bank-statements/new" },
          { label: "התאמות (legacy)", href: "/marker-ofek/finance/reconciliations" },
        ],
      },
      {
        title: "חיובים ולקוחות",
        href: "/marker-ofek/finance/billing",
        links: [
          { label: "חיובי לקוחות", href: "/marker-ofek/finance/billing" },
          { label: "חשבונות חלקיים", href: "/marker-ofek/finance/partials" },
          { label: "מאגר לקוחות", href: "/marker-ofek/finance/customers" },
        ],
      },
      {
        title: "דוחות פיננסיים",
        links: [
          { label: "תזרים מזומנים", href: "/marker-ofek/finance/cash-flow" },
          { label: "רווח והפסד", href: "/marker-ofek/finance/pnl" },
          { label: 'דוח מע"מ', href: "/marker-ofek/finance/vat-report" },
          { label: "Aging", href: "/marker-ofek/finance/reports/aging" },
        ],
      },
    ],
  },
  {
    key: "office",
    label: "משרד",
    columns: [
      {
        title: "ניהול",
        href: "/marker-ofek/settings",
        links: [
          { label: "הגדרות חברה", href: "/marker-ofek/settings" },
          { label: "פרמטרים גלובליים (System Parameters)", href: "/marker-ofek/settings/system-parameters" },
          { label: "כללי מערכת (legacy)", href: "/marker-ofek/settings/system-rules" },
        ],
      },
      {
        title: "ניהול מסמכים",
        href: "/marker-ofek/dms",
        links: [
          { label: "כספת מסמכים (DMS)", href: "/marker-ofek/dms" },
        ],
      },
      {
        title: "Admin",
        links: [
          { label: "Demo (Investor Pitch)", href: "/marker-ofek/pitch" },
          { label: "מרכז פיקוד", href: "/marker-ofek/command-center" },
        ],
      },
    ],
  },
]

type TopNavigationProps = {
  /** Actions slot — יוצג בצד השמאלי (end ב-RTL). */
  children?: React.ReactNode
  className?: string
  /** יעד הקישור של הלוגו (ברירת-מחדל: מרכז הפיקוד). */
  logoHref?: string
}

export function TopNavigation({
  children,
  className,
  logoHref = "/marker-ofek/command-center",
}: TopNavigationProps) {
  const pathname = usePathname() ?? ""
  const reduce = useReducedMotion()
  const [openKey, setOpenKey] = React.useState<string | null>(null)
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const headerRef = React.useRef<HTMLElement>(null)

  /* close on route change */
  React.useEffect(() => {
    setOpenKey(null)
  }, [pathname])

  /* close on Escape */
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenKey(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  /* click-outside close */
  React.useEffect(() => {
    if (openKey === null) return
    function onClick(e: MouseEvent) {
      if (!headerRef.current) return
      if (!headerRef.current.contains(e.target as Node)) {
        setOpenKey(null)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [openKey])

  const scheduleClose = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpenKey(null), 160)
  }, [])

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  const openMega = React.useCallback(
    (key: string) => {
      cancelClose()
      setOpenKey(key)
    },
    [cancelClose]
  )

  /* derive which mega to render (currently open and has columns) */
  const activeMegaItem = React.useMemo(
    () =>
      openKey
        ? NAV_ITEMS.find(
            (i) => i.key === openKey && i.columns && i.columns.length > 0
          )
        : undefined,
    [openKey]
  )

  return (
    <header
      ref={headerRef}
      dir="rtl"
      data-layout-region="top-nav"
      className={cn(
        // גובה קבוע + shrink-0 — חוק Layout Invariants #2
        "relative z-50 h-16 shrink-0 border-b border-border/70",
        "bg-card/95 text-foreground backdrop-blur-md",
        "shadow-[0_1px_0_0_rgb(226_232_240/0.55)]",
        "print:hidden",
        className
      )}
    >
      <div
        className="mx-auto flex h-full w-full max-w-[100rem] items-center gap-4 px-4 md:gap-6 md:px-6"
        onMouseLeave={scheduleClose}
      >
        {/* ─── לוגו (ימין ב-RTL) ─── */}
        <Link
          href={logoHref}
          className="group flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/60"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-sm ring-1 ring-slate-900/10">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <span className="hidden flex-col text-start leading-tight sm:flex">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Smart Building OS
            </span>
            <span className="text-sm font-semibold text-foreground">
              מרקר אופק
            </span>
          </span>
        </Link>

        {/* ─── פריטי ניווט (זורמים שמאלה ב-RTL) ─── */}
        <nav
          aria-label="ניווט ראשי"
          className="flex min-w-0 flex-1 items-center gap-0.5"
        >
          {NAV_ITEMS.map((item) => {
            const hasMenu = !!item.columns && item.columns.length > 0
            const hasHref = !!item.href
            const isOpen = openKey === item.key

            /* active detection */
            const active = hasHref && pathname === item.href
            const childActive =
              hasMenu &&
              item.columns!.some((c) =>
                c.links.some((l) => !!l.href && pathname === l.href)
              )
            const highlighted = active || childActive || isOpen

            /* base class */
            const triggerClass = cn(
              "relative inline-flex items-center gap-1 rounded-md px-3 py-2 text-[13px] font-medium outline-none transition-colors duration-150",
              // placeholder (no link, no menu) — muted + not interactive
              !hasMenu &&
                !hasHref &&
                "cursor-default text-muted-foreground/70 hover:bg-transparent",
              // interactive items
              (hasMenu || hasHref) &&
                "text-foreground/80 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              // highlighted state (active path / open menu)
              highlighted && "bg-muted text-foreground"
            )

            /* Placeholder (no link, no menu) */
            if (!hasMenu && !hasHref) {
              return (
                <span
                  key={item.key}
                  className={triggerClass}
                  aria-disabled="true"
                  title="בהקמה — יפעיל בקרוב"
                >
                  {item.label}
                </span>
              )
            }

            /* Direct link (no mega) */
            if (!hasMenu && hasHref) {
              return (
                <Link key={item.key} href={item.href!} className={triggerClass}>
                  {item.label}
                </Link>
              )
            }

            /* Has mega menu */
            return (
              <div
                key={item.key}
                className="relative"
                onMouseEnter={() => openMega(item.key)}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  aria-controls={`mega-${item.key}`}
                  onClick={() => setOpenKey(isOpen ? null : item.key)}
                  onFocus={() => openMega(item.key)}
                  className={triggerClass}
                >
                  <span>{item.label}</span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 opacity-60 transition-transform duration-200",
                      isOpen && "rotate-180 opacity-90"
                    )}
                    aria-hidden
                  />
                </button>
              </div>
            )
          })}
        </nav>

        {/* ─── Actions slot (שמאל ב-RTL) ─── */}
        {children ? (
          <div className="flex shrink-0 items-center gap-1">{children}</div>
        ) : null}
      </div>

      {/* ─── Mega-Menu Panel ─── */}
      <AnimatePresence>
        {activeMegaItem ? (
          <motion.div
            key={activeMegaItem.key}
            id={`mega-${activeMegaItem.key}`}
            role="region"
            aria-label={activeMegaItem.label}
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            className="absolute inset-x-0 top-full z-40 border-b border-border/70 bg-card shadow-[0_12px_28px_rgba(15,23,42,0.14)]"
          >
            <div className="mx-auto w-full max-w-[100rem] px-4 py-6 md:px-6 md:py-7">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4 lg:grid-cols-7">
                {activeMegaItem.columns!.map((col) => (
                  <MegaColumnView
                    key={col.title}
                    column={col}
                    currentPath={pathname}
                    onNavigate={() => setOpenKey(null)}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  )
}

function MegaColumnView({
  column,
  currentPath,
  onNavigate,
}: {
  column: MegaColumn
  currentPath: string
  onNavigate: () => void
}) {
  const hasAnyLink = column.links.some((l) => !!l.href)
  const titleHasHref = !!column.href
  /** Title is a direct link to the module when column.href is provided. */
  const titleClass = cn(
    "text-[11px] font-semibold uppercase tracking-[0.12em]",
    titleHasHref
      ? "cursor-pointer text-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
      : hasAnyLink
        ? "text-foreground"
        : "text-muted-foreground/75"
  )
  return (
    <div className="flex flex-col gap-2">
      {titleHasHref ? (
        <Link
          href={column.href!}
          onClick={onNavigate}
          className={titleClass}
        >
          {column.title}
        </Link>
      ) : (
        <h3 className={titleClass}>{column.title}</h3>
      )}
      {column.links.length === 0 && !titleHasHref ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
          בהקמה
        </p>
      ) : column.links.length === 0 ? null : (
        <ul className="flex flex-col gap-0.5">
          {column.links.map((link) => {
            const active = !!link.href && currentPath === link.href
            if (link.href) {
              return (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    onClick={onNavigate}
                    className={cn(
                      "block rounded-md px-2 py-1.5 text-[13px] transition-colors",
                      active
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-foreground/80 hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              )
            }
            return (
              <li
                key={link.label}
                className="px-2 py-1.5 text-[13px] text-muted-foreground/70"
              >
                {link.label}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
