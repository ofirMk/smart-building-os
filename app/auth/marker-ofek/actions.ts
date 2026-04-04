"use server"

import { redirect } from "next/navigation"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { resolvePostMarkerOfekLoginPath } from "@/lib/marker-ofek/post-auth-redirect"

function mapAuthError(error: { message: string }): string {
  const raw = error.message
  const m = raw.toLowerCase()

  if (
    m.includes("invalid login credentials") ||
    m.includes("invalid credentials") ||
    m.includes("email not confirmed")
  ) {
    if (m.includes("email not confirmed")) {
      return "יש לאשר את כתובת האימייל לפני ההתחברות (בדקו את תיבת הדואר)"
    }
    return "אימייל או סיסמה שגויים. נסו שוב או אשרו את החשבון במייל."
  }

  return raw || "אירעה שגיאה בהזדהות. נסו שוב מאוחר יותר."
}

export type MarkerOfekLoginResult =
  | { ok: true }
  | { ok: false; error: string }

export async function markerOfekPasswordLogin(
  formData: FormData
): Promise<MarkerOfekLoginResult> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { ok: false, error: "יש למלא אימייל וסיסמה" }
  }

  const supabase = await createSupabaseServerAuthClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { ok: false, error: mapAuthError(error) }
  }

  const next = await resolvePostMarkerOfekLoginPath(supabase)
  redirect(next)
}
