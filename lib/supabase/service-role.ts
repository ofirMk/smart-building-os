import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Server-only client with the **service role** key — bypasses RLS for system jobs (cron, admin scripts).
 * Never import this in client components.
 *
 * Diamond V1.0: untyped client during incremental `types/supabase.ts` alignment; prefer `Tables<>` in lib.
 */
export function createSupabaseServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    )
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
