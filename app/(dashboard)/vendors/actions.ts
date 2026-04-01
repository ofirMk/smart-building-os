"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export type VendorActionState = {
  ok: boolean
  message: string
}

export async function createVendor(
  _prev: VendorActionState,
  formData: FormData
): Promise<VendorActionState> {
  const name = String(formData.get("name") ?? "").trim()
  const profession = String(formData.get("profession") ?? "").trim()
  const phone = String(formData.get("phone") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()

  if (!name) {
    return { ok: false, message: "נא למלא שם קבלן." }
  }

  try {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.from("vendors").insert({
      name,
      profession: profession.length > 0 ? profession : null,
      phone: phone.length > 0 ? phone : null,
      email: email.length > 0 ? email : null,
      is_active: true,
    })

    if (error) {
      return { ok: false, message: error.message }
    }

    revalidatePath("/vendors")
    revalidatePath("/tickets")
    return { ok: true, message: "הקבלן נוסף בהצלחה." }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בשמירה"
    return { ok: false, message: msg }
  }
}
