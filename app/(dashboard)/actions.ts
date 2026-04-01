"use server"

import { redirect } from "next/navigation"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export async function logout(): Promise<void> {
  const supabase = await createSupabaseServerAuthClient()
  await supabase.auth.signOut()
  redirect("/login")
}
