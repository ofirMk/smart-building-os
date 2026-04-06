import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

import { WbsTaskSkeletonClient } from "./wbs-task-skeleton-client"

type PageProps = {
  params: Promise<{ taskId: string }> | { taskId: string }
}

export default async function WbsTaskSkeletonPage({ params }: PageProps) {
  const { taskId } = await Promise.resolve(params)
  const id = String(taskId ?? "").trim()
  if (!id) {
    return (
      <WbsTaskSkeletonClient taskId="—" projectIdHint={null} />
    )
  }

  const supabase = await createSupabaseServerAuthClient()
  const { data } = await supabase
    .from("tasks")
    .select("project_id")
    .eq("id", id)
    .maybeSingle()

  const pid =
    data && typeof (data as { project_id?: string }).project_id === "string"
      ? (data as { project_id: string }).project_id
      : null

  return <WbsTaskSkeletonClient taskId={id} projectIdHint={pid} />
}
