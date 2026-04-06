"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"

import { playDiamondTransitionSwoosh } from "@/lib/marker-ofek/diamond-ui-audio"

export const DIAMOND_LAST_PATH_KEY = "diamond_last_path"

/** מסלול קליטת מכרז כשאין יעד ‎/new‎ מתאים */
export const DIAMOND_TENDER_INTAKE_HREF =
  "/marker-ofek/pre-construction/tender-intake"

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

function hasOpenSelectContent(): boolean {
  if (typeof document === "undefined") return false
  return (
    document.querySelector('[data-slot="select-content"][data-open]') != null
  )
}

/** F2 מותר גם כשהמיקוד בתוך רשימת ה־Select הפתוחה */
function shouldBlockDiamondF2(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('[data-slot="select-content"][data-open]')) return false
  return isTypingTarget(target)
}

function shouldBlockDiamondEscape(target: EventTarget | null): boolean {
  if (hasOpenSelectContent()) return true
  return isTypingTarget(target)
}

function resolveF2Href(
  targetEntity: string | undefined,
  f2HrefOption: string | undefined
): string | undefined {
  if (typeof document !== "undefined") {
    const open = document.querySelector(
      '[data-slot="select-content"][data-open]'
    ) as HTMLElement | null
    if (open) {
      const hrefOverride = open.getAttribute("data-diamond-href")?.trim()
      if (hrefOverride) return hrefOverride
      const ent = open.getAttribute("data-diamond-entity")?.trim()
      if (ent) return `/marker-ofek/${ent}/new`
    }
  }
  const opt = f2HrefOption?.trim()
  if (opt) return opt
  const ent = targetEntity?.trim()
  if (ent) return `/marker-ofek/${ent}/new`
  return undefined
}

/** דפים עם ‎useDiamondNavigation‎ ייעודי (לא ברירת מחדל projects של workspace) */
const MARKER_OFEK_DIAMOND_FORM_PATHS = new Set<string>([
  "/marker-ofek/projects/new",
  "/marker-ofek/procurement/purchase-orders/new",
  "/marker-ofek/execution/progress-reports/new",
  "/marker-ofek/execution/daily-logs/new",
  "/marker-ofek/contracts/create-client",
  "/marker-ofek/contracts/create-subcontractor",
  "/marker-ofek/customers/new",
  "/marker-ofek/finance/customers/new",
  "/marker-ofek/invoices/new",
])

const MARKER_OFEK_DIAMOND_PATH_PREFIXES = [
  "/marker-ofek/execution/wbs/task/",
  "/marker-ofek/execution/wbs/node/",
  "/marker-ofek/execution/diamond-workspace/",
] as const

/** דפים שבהם נרשם ניווט יהלום בקומפוננטת הדף — ללא כפילות ממעטפת workspace */
export function isMarkerOfekDiamondFormPath(pathname: string): boolean {
  const p = (pathname.split("?")[0] ?? "").replace(/\/$/, "") || "/"
  if (MARKER_OFEK_DIAMOND_FORM_PATHS.has(p)) return true
  return MARKER_OFEK_DIAMOND_PATH_PREFIXES.some((prefix) => p.startsWith(prefix))
}

export type UseDiamondNavigationOptions = {
  /** כשאין ‎Select‎ פתוח עם ‎data-diamond-*‎ — ניווט F2 לנתיב מלא (למשל קליטת מכרז) */
  f2Href?: string
  /** כבוי כשמעטפת אחרת מנהלת יהלום (למשל מרקר אופק) */
  enabled?: boolean
}

/**
 * ניווט יהלום: F2 להקמה מהירה (לפי ישות או לפי ‎Select‎ פתוח), Escape חזרה ל־sessionStorage.
 * מאזינים אחרי מטפלי מקומיים — אם בוצע ‎preventDefault‎ (למשל F2 למודאל), לא מנווטים.
 */
export function useDiamondNavigation(
  targetEntity?: string,
  options?: UseDiamondNavigationOptions
): void {
  const router = useRouter()
  const pathname = usePathname() ?? ""
  const f2HrefOption = options?.f2Href
  const enabled = options?.enabled !== false

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        const href = resolveF2Href(targetEntity, f2HrefOption)
        if (!href) return
        if (e.defaultPrevented) return
        if (shouldBlockDiamondF2(e.target)) return
        e.preventDefault()
        sessionStorage.setItem(DIAMOND_LAST_PATH_KEY, pathname)
        playDiamondTransitionSwoosh()
        router.push(href)
        return
      }

      if (e.key === "Escape") {
        if (e.defaultPrevented) return
        if (shouldBlockDiamondEscape(e.target)) return
        const lastPath = sessionStorage.getItem(DIAMOND_LAST_PATH_KEY)
        if (!lastPath) return
        e.preventDefault()
        sessionStorage.removeItem(DIAMOND_LAST_PATH_KEY)
        playDiamondTransitionSwoosh()
        router.push(lastPath)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [enabled, targetEntity, f2HrefOption, router, pathname])
}
