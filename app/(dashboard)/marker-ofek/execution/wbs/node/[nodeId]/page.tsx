import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

import { WbsNodeSkeletonClient } from "./wbs-node-skeleton-client"

type PageProps = {
  params: Promise<{ nodeId: string }> | { nodeId: string }
}

export default async function WbsNodeSkeletonPage({ params }: PageProps) {
  const { nodeId } = await Promise.resolve(params)
  const id = String(nodeId ?? "").trim()
  if (!id) {
    return <WbsNodeSkeletonClient nodeId="—" projectIdHint={null} />
  }

  const supabase = await createSupabaseServerAuthClient()
  const { data: node } = await supabase
    .from("wbs_nodes")
    .select("structure_id")
    .eq("id", id)
    .maybeSingle()

  const sid =
    node && typeof (node as { structure_id?: string }).structure_id === "string"
      ? (node as { structure_id: string }).structure_id
      : null

  let projectId: string | null = null
  if (sid) {
    const { data: st } = await supabase
      .from("wbs_structures")
      .select("project_id")
      .eq("id", sid)
      .maybeSingle()
    if (
      st &&
      typeof (st as { project_id?: string | null }).project_id === "string"
    ) {
      projectId = (st as { project_id: string }).project_id
    }
  }

  return <WbsNodeSkeletonClient nodeId={id} projectIdHint={projectId} />
}
