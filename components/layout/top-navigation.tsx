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
type MegaColumn = { title: string; links: MegaLink[] }
type NavItem = {
  key: string
  label: string
  href?: string
  columns?: MegaColumn[]
}

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
        links: [{ label: "כרטיס פריט", href: "/marker-ofek/items" }],
      },
      { title: "מכרזים", links: [] },
      { title: "חוזים וחשבונות", links: [] },
      { title: "פרויקטים", links: [] },
      { title: "בקרה תקציבית", links: [] },
      { title: "שינויי דיירים", links: [] },
      { title: "בדק", links: [] },
    ],
  },
  { key: "building-management", label: "ניהול מבנים" },
  { key: "trade", label: "סחר" },
  { key: "finance", label: "כספים" },
  { key: "office", label: "משרד" },
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
  return (
    <div className="flex flex-col gap-2">
      <h3
        className={cn(
          "text-[11px] font-semibold uppercase tracking-[0.12em]",
          hasAnyLink ? "text-foreground" : "text-muted-foreground/75"
        )}
      >
        {column.title}
      </h3>
      {column.links.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
          בהקמה
        </p>
      ) : (
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
