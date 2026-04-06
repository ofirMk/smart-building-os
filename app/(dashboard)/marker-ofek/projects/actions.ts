"use server"

import { revalidatePath } from "next/cache"

import { formatError } from "@/lib/format-error"
import { logMoAuditEvent } from "@/lib/marker-ofek/audit-log"
import { markerProjectIntakeFormSchema } from "@/lib/marker-ofek/erp-validation-schemas"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export async function createProject(formData: FormData): Promise<
  { ok: true; projectId: string } | { ok: false; error: string }
> {
  const nameRaw = formData.get("name")?.toString() ?? ""
  const client_nameRaw = formData.get("client_name")?.toString() ?? ""
  const tenderRaw = formData.get("tender_id")?.toString().trim()
  const tender_id =
    tenderRaw == null ||
    tenderRaw === "" ||
    tenderRaw.toLowerCase() === "none"
      ? null
      : tenderRaw

  const parsed = markerProjectIntakeFormSchema.safeParse({
    name: nameRaw,
    client_name: client_nameRaw,
    tender_id,
  })
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(" · ")
    return { ok: false, error: msg || "נתונים לא תקינים" }
  }

  const { name, client_name, tender_id: tid } = parsed.data

  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("projects")
      .insert({
        name,
        client_name: client_name || null,
        tender_id: tid ?? null,
        internal_project_code: "",
        address: null,
        status: "planning",
      })
      .select("id")
      .single()

    if (error) throw error
    if (!data?.id) throw new Error("לא התקבל מזהה פרויקט")

    const pid = data.id as string
    void logMoAuditEvent({
      action_type: "INSERT",
      table_name: "projects",
      project_id: pid,
      new_data: { id: pid, name, client_name: client_name || null, tender_id: tid },
    })

    revalidatePath("/marker-ofek/projects")
    revalidatePath(`/marker-ofek/projects/${pid}`)
    return { ok: true, projectId: pid }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
