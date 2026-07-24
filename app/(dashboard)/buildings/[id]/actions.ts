"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export type UpdateBuildingInput = {
  name: string
  address_line1: string
  address_line2: string
  city: string
  region: string
  postal_code: string
  total_floors: number | null
  planned_units: number | null
  year_built: number | null
}

export type UpdateBuildingResult =
  | { ok: true }
  | { ok: false; error: string }

export async function updateBuilding(
  id: string,
  input: UpdateBuildingInput
): Promise<UpdateBuildingResult> {
  if (!input.name?.trim()) return { ok: false, error: "שם הבניין הוא שדה חובה" }
  if (!input.city?.trim()) return { ok: false, error: "עיר היא שדה חובה" }

  try {
    const supabase = createSupabaseServerClient()

    const { error } = await supabase
      .from("buildings")
      .update({
        name: input.name.trim(),
        address_line1: input.address_line1.trim() || null,
        address_line2: input.address_line2.trim() || null,
        city: input.city.trim(),
        region: input.region.trim() || null,
        postal_code: input.postal_code.trim() || null,
        total_floors: input.total_floors ?? null,
        planned_units: input.planned_units ?? null,
        year_built: input.year_built ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (error) return { ok: false, error: error.message }

    revalidatePath(`/buildings/${id}`)
    revalidatePath("/buildings")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה לא ידועה" }
  }
}
