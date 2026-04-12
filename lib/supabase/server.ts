import { createServerClient } from "@supabase/ssr"
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  }

  return { url, key }
}

/**
 * Modern App Router server client (`@supabase/ssr`) with cookie sync.
 * Use in Server Components / Server Actions that need session-aware access.
 */
export async function createClient(): Promise<SupabaseClient> {
  const { url, key } = getSupabasePublicEnv()
  const cookieStore = await cookies()

  return createServerClient(url, key, {
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
          // Called from contexts where outgoing cookies cannot be mutated.
        }
      },
    },
  })
}

/**
 * Backward-compatible alias used by existing Holden ERP server actions.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  return createClient()
}

/**
 * Legacy anon server client without cookie-backed session.
 * Keep during staged migration of older modules.
 */
export function createSupabaseServerClient(): SupabaseClient {
  const { url, key } = getSupabasePublicEnv()

  return createSupabaseJsClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
