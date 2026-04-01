"use server"

import { revalidatePath } from "next/cache"

import { formatError } from "@/lib/format-error"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export async function createProject(formData: FormData): Promise<
  { ok: true; projectId: string } | { ok: false; error: string }
> {
  const name = formData.get("name")?.toString().trim() ?? ""
  const client_name = formData.get("client_name")?.toString().trim() ?? ""
  const tenderRaw = formData.get("tender_id")?.toString().trim()
  const tender_id =
    tenderRaw == null ||
    tenderRaw === "" ||
    tenderRaw.toLowerCase() === "none"
      ? null
      : tenderRaw

  if (!name) {
    return { ok: false, error: "שם פרויקט נדרש" }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("projects")
      .insert({
        name,
        client_name: client_name || null,
        tender_id,
        internal_project_code: "",
        address: null,
        status: "planning",
      })
      .select("id")
      .single()

    if (error) throw error
    if (!data?.id) throw new Error("לא התקבל מזהה פרויקט")

    revalidatePath("/marker-ofek/projects")
    revalidatePath(`/marker-ofek/projects/${data.id}`)
    return { ok: true, projectId: data.id }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
