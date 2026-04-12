import { createClient } from "./client"

/**
 * Backward-compatible browser helper used across existing modules.
 * New code should prefer `createClient` from `lib/supabase/client`.
 */
export function createSupabaseBrowserClient() {
  return createClient()
}
