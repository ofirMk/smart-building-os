"use server"

import { revalidatePath } from "next/cache"

import type { AnnouncementUrgency } from "@/lib/announcements"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type AnnouncementActionState = {
  ok: boolean
  message: string
}

export async function createAnnouncement(
  _prev: AnnouncementActionState,
  formData: FormData
): Promise<AnnouncementActionState> {
  const title = String(formData.get("title") ?? "").trim()
  const content = String(formData.get("content") ?? "").trim()
  const urgency = String(formData.get("urgency") ?? "info") as AnnouncementUrgency

  if (!title || !content) {
    return { ok: false, message: "נא למלא כותרת ותוכן." }
  }

  if (!["info", "warning", "critical"].includes(urgency)) {
    return { ok: false, message: "רמת דחיפות לא תקינה." }
  }

  try {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.from("announcements").insert({
      title,
      content,
      urgency,
      is_active: true,
    })

    if (error) {
      return { ok: false, message: error.message }
    }

    revalidatePath("/announcements")
    revalidatePath("/tenant")
    return { ok: true, message: "ההכרזה פורסמה בהצלחה." }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בפרסום"
    return { ok: false, message: msg }
  }
}

export async function toggleAnnouncementActive(
  id: string,
  isActive: boolean
): Promise<AnnouncementActionState> {
  if (!id) {
    return { ok: false, message: "מזהה לא חוקי." }
  }

  try {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase
      .from("announcements")
      .update({ is_active: isActive })
      .eq("id", id)

    if (error) {
      return { ok: false, message: error.message }
    }

    revalidatePath("/announcements")
    revalidatePath("/tenant")
    return {
      ok: true,
      message: isActive ? "ההכרזה הופעלה." : "ההכרזה הופסקה.",
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בעדכון"
    return { ok: false, message: msg }
  }
}
