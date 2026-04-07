"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

export type MoOverheadRegistryRow = {
  id: string
  label: string
  category: "administrative" | "operational" | "marketing"
  monthly_amount_nis: number
  effective_from: string
  effective_to: string | null
  sort_order: number
  is_active: boolean
  notes: string | null
}

async function assertAdmin() {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) return { supabase, user: null as null, ok: false as const, error: "נדרשת התחברות" }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  const role = (profile as { role?: string } | null)?.role
  if (role !== "admin") {
    return { supabase, user, ok: false as const, error: "נדרשת הרשאת אדמין" }
  }
  return { supabase, user, ok: true as const, error: null as null }
}

export async function listOverheadRegistryItems(): Promise<
  { ok: true; rows: MoOverheadRegistryRow[] } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("mo_overhead_registry")
      .select(
        "id, label, category, monthly_amount_nis, effective_from, effective_to, sort_order, is_active, notes"
      )
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true })

    if (error) {
      if (/relation|does not exist/i.test(error.message)) {
        return { ok: true, rows: [] }
      }
      return { ok: false, error: error.message }
    }
    return { ok: true, rows: (data ?? []) as MoOverheadRegistryRow[] }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function upsertOverheadRegistryItem(input: {
  id?: string | null
  label: string
  category: MoOverheadRegistryRow["category"]
  monthly_amount_nis: number
  effective_from: string
  effective_to: string | null
  sort_order: number
  is_active: boolean
  notes: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const gate = await assertAdmin()
  if (!gate.ok) return { ok: false, error: gate.error }
  const supabase = gate.supabase

  const label = input.label.trim()
  if (!label) return { ok: false, error: "חסרה תיאור" }

  const payload = {
    label,
    category: input.category,
    monthly_amount_nis: Math.max(0, Number(input.monthly_amount_nis) || 0),
    effective_from: input.effective_from.trim().slice(0, 10),
    effective_to: input.effective_to?.trim()
      ? input.effective_to.trim().slice(0, 10)
      : null,
    sort_order: Math.floor(Number(input.sort_order) || 0),
    is_active: Boolean(input.is_active),
    notes: input.notes?.trim() || null,
  }

  try {
    const id = input.id?.trim()
    if (id) {
      const { error } = await supabase.from("mo_overhead_registry").update(payload).eq("id", id)
      if (error) return { ok: false, error: error.message }
      revalidatePath("/marker-ofek/finance/overhead")
      revalidatePath("/marker-ofek/executive")
      revalidatePath("/management")
      return { ok: true, id }
    }
    const { data, error } = await supabase
      .from("mo_overhead_registry")
      .insert(payload)
      .select("id")
      .single()
    if (error || !data?.id) return { ok: false, error: error?.message ?? "שמירה נכשלה" }
    revalidatePath("/marker-ofek/finance/overhead")
    revalidatePath("/marker-ofek/executive")
    revalidatePath("/management")
    return { ok: true, id: data.id as string }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function deleteOverheadRegistryItem(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin()
  if (!gate.ok) return { ok: false, error: gate.error }
  const tid = id.trim()
  if (!tid) return { ok: false, error: "חסר מזהה" }
  try {
    const { error } = await gate.supabase.from("mo_overhead_registry").delete().eq("id", tid)
    if (error) return { ok: false, error: error.message }
    revalidatePath("/marker-ofek/finance/overhead")
    revalidatePath("/marker-ofek/executive")
    revalidatePath("/management")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
