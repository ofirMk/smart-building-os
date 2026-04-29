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

  if (
    m.includes("user already registered") ||
    m.includes("already been registered")
  ) {
    return "כתובת האימייל כבר רשומה במערכת. נסו להתחבר."
  }

  if (m.includes("password") && m.includes("least")) {
    return "הסיסמה חלשה מדי או קצרה מדי (דרישות האבטחה של המערכת)"
  }

  if (m.includes("signup") && m.includes("disabled")) {
    return "ההרשמה חסומה בהגדרות השרת. פנו למנהל המערכת."
  }

  return raw || "אירעה שגיאה בהזדהות. נסו שוב מאוחר יותר."
}

export type MarkerOfekLoginResult =
  | { ok: true }
  | { ok: false; error: string }

export type MarkerOfekSignUpResult =
  | { ok: true; pendingVerification: true }
  | { ok: false; error: string }

export async function markerOfekPasswordLogin(
  formData: FormData
): Promise<MarkerOfekLoginResult> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { ok: false, error: "יש למלא אימייל וסיסמה" }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return { ok: false, error: mapAuthError(error) }
    }
    if (!data.user?.id || !data.session?.access_token) {
      return {
        ok: false,
        error: "האימות נכשל. בדקו שהאימייל והסיסמה תקינים ונסו שוב.",
      }
    }

    const next = await resolvePostMarkerOfekLoginPath(supabase)
    redirect(next)
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "אירעה שגיאה בהזדהות. נסו שוב מאוחר יותר."
    return { ok: false, error: message }
  }
}

export async function markerOfekSignUp(
  formData: FormData
): Promise<MarkerOfekSignUpResult> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const confirmPassword = String(formData.get("confirmPassword") ?? "")

  if (!email || !password) {
    return { ok: false, error: "יש למלא אימייל וסיסמה" }
  }
  if (password.length < 6) {
    return { ok: false, error: "הסיסמה חייבת להכיל לפחות 6 תווים" }
  }
  if (confirmPassword && password !== confirmPassword) {
    return { ok: false, error: "אימות הסיסמה אינו תואם" }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: "admin",
          source: "marker_ofek_signup",
        },
      },
    })

    if (error) {
      return { ok: false, error: mapAuthError(error) }
    }

    if (data.user && !data.session) {
      return { ok: true, pendingVerification: true }
    }

    if (data.user && data.session?.access_token) {
      const next = await resolvePostMarkerOfekLoginPath(supabase)
      redirect(next)
    }

    return { ok: false, error: "לא ניתן להשלים את ההרשמה" }
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "אירעה שגיאה בהזדהות. נסו שוב מאוחר יותר."
    return { ok: false, error: message }
  }
}
