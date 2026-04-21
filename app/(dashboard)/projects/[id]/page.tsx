import { notFound } from "next/navigation"

import { ProjectWorkspaceClient } from "@/components/erp/projects/project-workspace-client"

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolved = await Promise.resolve(params)
  const id = typeof resolved.id === "string" ? resolved.id : ""
  if (!id) notFound()

  return <ProjectWorkspaceClient projectId={id} />
}

