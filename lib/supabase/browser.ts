import { createBrowserClient } from "@supabase/ssr"

/**
 * לקוח Supabase בדפדפן (עם סשן מ-auth) — לשימוש בקומפוננטות Client.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  }

  return createBrowserClient(url, key)
}
