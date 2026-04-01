"use server"

import { revalidatePath } from "next/cache"

import { formatError } from "@/lib/format-error"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type DeleteProjectResult = { ok: true } | { ok: false; error: string }

/**
 * מחיקת פרויקט (מחיקה רכה — is_deleted) כדי לא להפר מפתחות זרים לחוזים וכו׳.
 * הפרויקט ייעלם מרשימות ברירת המחדל; נתונים מקושרים נשארים בבסיס לצורכי ביקורת.
 */
export async function deleteProject(
  projectId: string
): Promise<DeleteProjectResult> {
  const id = projectId?.trim()
  if (!id) {
    return { ok: false, error: "חסר מזהה פרויקט" }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()

    const { data: row, error: fetchErr } = await supabase
      .from("projects")
      .select("id")
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle()

    if (fetchErr) {
      return { ok: false, error: fetchErr.message }
    }
    if (!row) {
      return { ok: false, error: "הפרויקט לא נמצא או כבר נמחק" }
    }

    const { error: updErr } = await supabase
      .from("projects")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("is_deleted", false)

    if (updErr) {
      return { ok: false, error: updErr.message }
    }

    revalidatePath("/marker-ofek/projects")
    revalidatePath("/marker-ofek")
    revalidatePath(`/marker-ofek/projects/${id}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
