import { cache } from "react"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { SupabaseClient, User } from "@supabase/supabase-js"

export type TenantAuthContext = {
  supabase: SupabaseClient
  user: User
}

/**
 * משתמש מחובר + לקוח Supabase עם עוגיות סשן.
 * ממומא ב־React cache — קריאה חוזרת באותו רנדר לא מריצה שוב את getUser.
 */
export const getTenantAuthUser = cache(
  async (): Promise<TenantAuthContext | null> => {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    return { supabase, user }
  }
)
