"use server"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

/**
 * רישום שגיאת אפליקציה ל־mo_system_error_events (לא חוסם את הזרימה הקוראת).
 * קוראים מ־catch ב־Server Actions או API routes.
 */
export async function logSystemErrorEvent(input: {
  source: string
  message: string
  context?: Record<string, unknown>
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { error } = await supabase.from("mo_system_error_events").insert({
      source: input.source.slice(0, 200),
      message: input.message.slice(0, 8000),
      context: input.context ?? {},
    })
    if (error) {
      if (/relation|does not exist/i.test(error.message)) {
        return { ok: true }
      }
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
