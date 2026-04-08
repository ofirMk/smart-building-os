import { createBrowserClient } from "@supabase/ssr"

/**
 * Single browser client — `@supabase/ssr` / Auth use a storage lock per instance.
 * Creating a new client on every call causes "Lock was not released" / steal errors.
 */
let browserClientSingleton: ReturnType<typeof createBrowserClient> | null = null

/**
 * לקוח Supabase בדפדפן (עם סשן מ-auth) — לשימוש בקומפוננטות Client.
 * Diamond V1.0: untyped during migration; use `Tables<>` from `@/types/supabase` in helpers.
 */
export function createSupabaseBrowserClient() {
  if (browserClientSingleton) {
    return browserClientSingleton
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  }

  browserClientSingleton = createBrowserClient(url, key)
  return browserClientSingleton
}
