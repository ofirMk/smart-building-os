import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { AppUserRole } from "@/lib/auth/user-role"
import { isAdminOrManagerRole } from "@/lib/auth/user-role"
import {
  isExemptFromDiamondQualificationGate,
  isMarkerOfekQualificationTrainingAllowlistPath,
  isUserQualifiedForMarkerOfek,
  MARKER_ONBOARDING_SANDBOX_PATH,
} from "@/lib/marker-ofek/hr-qualification-gate"
import { canViewHoldingExecutive } from "@/lib/marker-ofek/partner-metrics/access"

/** מרחב ERP מרקר אופק (דשבורד, סרגל, מודולים פנימיים) — דורש סשן + כללי שכבה זו בלבד. */
export const MARKER_OFEK_ERP_PATH_PREFIX = "/marker-ofek" as const

/**
 * פורטל קבלנים חיצוני — `app/(external)/subcontractor-portal` (ללא מעטפת דשבורד).
 * לא נכלל ב־`isProtectedPath` כברירת מחדל (דמו ציבורי); חשיפת API רגישה נחסמת ע"י רשימת `/api/*` פנימית.
 */
export const SUBCONTRACTOR_PORTAL_PATH_PREFIX = "/subcontractor-portal" as const

function isSubcontractorPortalPath(pathname: string): boolean {
  return (
    pathname === SUBCONTRACTOR_PORTAL_PATH_PREFIX ||
    pathname.startsWith(`${SUBCONTRACTOR_PORTAL_PATH_PREFIX}/`)
  )
}

function isMarkerOfekErpPath(pathname: string): boolean {
  return (
    pathname === MARKER_OFEK_ERP_PATH_PREFIX ||
    pathname.startsWith(`${MARKER_OFEK_ERP_PATH_PREFIX}/`)
  )
}

/**
 * API פנימיים (Holden / רכש / HR / צ'אט ERP) — לא זמינים ללא סשן, גם אם הדפדפן בפורטל חיצוני.
 * לא כוללים webhooks כמו `/api/cron` או סורקים — יש לאמת מפתח נפרד בנתיב עצמו.
 */
function isSensitiveInternalApiPath(pathname: string): boolean {
  const prefixes = [
    "/api/erp/holden",
    "/api/ocr-invoice",
    "/api/hr/analyze-contract",
    "/api/hr-onboarding-chat",
    "/api/chat",
  ] as const
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** נתיבים הדורשים משתמש מחובר (או API פנימי רגיש). */
function isProtectedPath(pathname: string): boolean {
  if (isSensitiveInternalApiPath(pathname)) return true
  if (pathname === "/" || pathname === "/dashboard") return true
  if (pathname === "/facility" || pathname.startsWith("/facility/")) return true
  if (pathname.startsWith("/tenant")) return true

  const prefixes = [
    "/tickets",
    "/buildings",
    "/ev-management",
    "/amenities",
    "/announcements",
    "/documents",
    "/maintenance",
    "/tenants",
    "/vendors",
    "/chat",
    "/portal",
    MARKER_OFEK_ERP_PATH_PREFIX,
    "/management",
    "/hh-panels",
    "/hq",
  ] as const

  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function isLoginPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/admin" ||
    pathname === "/auth/marker-ofek/login" ||
    pathname.startsWith("/auth/marker-ofek/login/")
  )
}

/** דומיין ייעודי ל-Marker Ofek (למשל app.markerofek.co.il) — רשימה ב־MARKER_OFEK_AUTH_HOSTS */
function isMarkerOfekDedicatedHost(request: NextRequest): boolean {
  const raw =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? ""
  const host = raw.split(":")[0]?.trim().toLowerCase() ?? ""
  if (!host) return false
  const env =
    process.env.MARKER_OFEK_AUTH_HOSTS?.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean) ??
    []
  if (env.length === 0) return false
  return env.some((h) => {
    if (!h) return false
    if (host === h) return true
    if (h.startsWith("*.")) {
      const domain = h.slice(2)
      return host === domain || host.endsWith(`.${domain}`)
    }
    return host.endsWith(`.${h}`)
  })
}

function defaultLoginPathForRequest(request: NextRequest): string {
  return isMarkerOfekDedicatedHost(request)
    ? "/auth/marker-ofek/login"
    : "/login"
}

function markerOfekPostAuthHome(
  role: string | null,
  email: string | null | undefined
): string {
  const r = role as AppUserRole | null
  if (canViewHoldingExecutive(email ?? null, r ?? "tenant")) {
    return "/management"
  }
  return "/marker-ofek/command-center"
}

function applyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach(({ name, value }) => {
    to.cookies.set(name, value)
  })
}

async function getProfileRole(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle()
  return (data as { role?: string } | null)?.role ?? null
}

/**
 * רענון סשן Supabase + הגנת נתיבים (RBAC שכבת Edge):
 * - `/marker-ofek/*` — הקשר ERP פנימי בלבד; דורש משתמש מחובר + שער הכשרה (Diamond) כשמוגדר.
 * - `/subcontractor-portal` — משטח נפרד; ללא מעטפת דשבורד (קביעה ב־`app/(external)/`).
 * - API רגישים — רשימה ב־`isSensitiveInternalApiPath`; אימות סכימות בצד שרת חובה בנוסף (ראו הערות Zod).
 * אחרי התחברות — פורטל מרכזי (קבוצת הולדן) לפי תפקיד.
 * נקרא מ־`proxy.ts` (שורש הפרויקט; Next.js 16+).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return supabaseResponse
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        supabaseResponse = NextResponse.next({
          request,
        })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  if (!user && isProtectedPath(pathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = defaultLoginPathForRequest(request)
    redirectUrl.search = ""
    const redirectResponse = NextResponse.redirect(redirectUrl)
    applyCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  if (
    user &&
    (isMarkerOfekErpPath(pathname) ||
      pathname === "/management" ||
      pathname.startsWith("/management/"))
  ) {
    const qRole = (await getProfileRole(supabase, user.id)) as AppUserRole | null
    if (!isExemptFromDiamondQualificationGate(user.email, qRole)) {
      const qualified = await isUserQualifiedForMarkerOfek(supabase, user.id)
      if (!qualified && !isMarkerOfekQualificationTrainingAllowlistPath(pathname)) {
        const redirectUrl = request.nextUrl.clone()
        redirectUrl.pathname = MARKER_ONBOARDING_SANDBOX_PATH
        redirectUrl.search = ""
        const redirectResponse = NextResponse.redirect(redirectUrl)
        applyCookies(supabaseResponse, redirectResponse)
        return redirectResponse
      }
    }
  }

  if (user && isLoginPath(pathname)) {
    const role = await getProfileRole(supabase, user.id)
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.search = ""
    if (
      pathname === "/auth/marker-ofek/login" ||
      pathname.startsWith("/auth/marker-ofek/login/")
    ) {
      redirectUrl.pathname = markerOfekPostAuthHome(role, user.email)
    } else if (isMarkerOfekDedicatedHost(request)) {
      redirectUrl.pathname = isAdminOrManagerRole(role)
        ? "/portal"
        : markerOfekPostAuthHome(role, user.email)
    } else {
      redirectUrl.pathname = isAdminOrManagerRole(role)
        ? "/portal"
        : "/marker-ofek/command-center"
    }
    const redirectResponse = NextResponse.redirect(redirectUrl)
    applyCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  if (isSubcontractorPortalPath(pathname)) {
    supabaseResponse.headers.set(
      "X-Marker-Ofek-Surface",
      "external-subcontractor-portal"
    )
  } else if (isMarkerOfekErpPath(pathname)) {
    supabaseResponse.headers.set("X-Marker-Ofek-Surface", "internal-erp")
  }

  return supabaseResponse
}
