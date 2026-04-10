import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * לקוח עם עוגיות סשן (משתמש מחובר) — ל־Server Actions ולמוטציות מאובטחות.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const { createSupabaseServerAuthClient } = await import("./server-auth")
  return createSupabaseServerAuthClient()
}

/** לקוח anon ללא עוגיות — שימושים נקודתיים; עדיף `createSupabaseServerAuthClient` לדפים עם משתמש. */
export function createSupabaseServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
