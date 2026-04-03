import { redirect } from "next/navigation"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export default async function MarkerOfekGanttEntryPage() {
  const supabase = await createSupabaseServerAuthClient()
  const { data: firstActiveProject } = await supabase
    .schema("public")
    .from("projects")
    .select("id")
    .eq("is_deleted", false)
    .in("status", ["planning", "active", "on_hold"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const projectId = String(firstActiveProject?.id ?? "").trim()
  if (projectId) {
    redirect(`/marker-ofek/execution/gantt/${projectId}`)
  }
  redirect("/marker-ofek/projects")
}
