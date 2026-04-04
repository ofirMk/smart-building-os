"use server"

import { redirect } from "next/navigation"

import { isAdminOrManagerRole } from "@/lib/auth/user-role"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

async function redirectAfterAuth(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>
): Promise<never> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  const role = (profile as { role?: string } | null)?.role ?? "tenant"
  redirect(
    isAdminOrManagerRole(role) ? "/portal" : "/marker-ofek/command-center"
  )
}

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

export type LoginResult =
  | { ok: true }
  | { ok: false; error: string }

export type SignupResult =
  | { ok: true; pendingVerification: true }
  | { ok: false; error: string }

export async function login(formData: FormData): Promise<LoginResult> {
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

  await redirectAfterAuth(supabase)
  return { ok: true }
}

export async function signup(formData: FormData): Promise<SignupResult> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { ok: false, error: "יש למלא אימייל וסיסמה" }
  }

  if (password.length < 6) {
    return { ok: false, error: "הסיסמה חייבת להכיל לפחות 6 תווים" }
  }

  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: "מנהל מערכת",
        role: "admin",
      },
    },
  })

  if (error) {
    return { ok: false, error: mapAuthError(error) }
  }

  if (data.user && !data.session) {
    return { ok: true, pendingVerification: true }
  }

  if (data.user && data.session) {
    await redirectAfterAuth(supabase)
  }

  return { ok: false, error: "לא ניתן להשלים את ההרשמה" }
}
