import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { resolvePostMarkerOfekLoginPath } from "@/lib/marker-ofek/post-auth-redirect"

/**
 * OAuth / magic-link — החלפת קוד לסשן (PKCE). יש להגדיר Redirect URL ב-Supabase: `/auth/callback`.
 */
export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  let destination = "/marker-ofek/command-center"

  if (!url || !key) {
    return NextResponse.redirect(`${origin}/auth/marker-ofek/login?error=config`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/marker-ofek/login?error=missing_code`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          /* Server Component boundary */
        }
      },
    },
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/auth/marker-ofek/login?error=oauth`)
  }

  destination = await resolvePostMarkerOfekLoginPath(supabase)

  return NextResponse.redirect(`${origin}${destination}`)
}
