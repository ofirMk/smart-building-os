import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"

import { isAdminOrManagerRole } from "@/lib/auth/user-role"
/** נתיבים הדורשים משתמש מחובר */
function isProtectedPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/dashboard") return true
  if (pathname === "/facility" || pathname.startsWith("/facility/")) return true
  if (pathname.startsWith("/tenant")) return true

  const prefixes = [
    "/tickets",
    "/buildings",
    "/ev-management",
    "/amenities",
    "/announcements",
    "/billing",
    "/documents",
    "/maintenance",
    "/tenants",
    "/vendors",
    "/chat",
    "/portal",
    "/marker-ofek",
    "/hh-panels",
    "/hq",
  ] as const

  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function isLoginPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/admin"
  )
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
 * רענון סשן Supabase + הגנת נתיבים. אחרי התחברות — פורטל מרכזי (קבוצת הולדן).
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
    redirectUrl.pathname = "/login"
    redirectUrl.search = ""
    const redirectResponse = NextResponse.redirect(redirectUrl)
    applyCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  if (user && isLoginPath(pathname)) {
    const role = await getProfileRole(supabase, user.id)
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = isAdminOrManagerRole(role)
      ? "/portal"
      : "/marker-ofek"
    redirectUrl.search = ""
    const redirectResponse = NextResponse.redirect(redirectUrl)
    applyCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  return supabaseResponse
}
