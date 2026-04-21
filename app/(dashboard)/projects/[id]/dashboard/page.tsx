import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { ProjectDashboardClient } from "@/components/erp/projects/dashboard/project-dashboard-client"

export const metadata: Metadata = {
  title: "Project Dashboard · Margins, Variances & Exposure",
  description:
    "Bento analytics surface for project profitability with margin, billing-variance and offset exposure widgets.",
}

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolved = await Promise.resolve(params)
  const id = typeof resolved.id === "string" ? resolved.id : ""
  if (!id) notFound()

  return <ProjectDashboardClient projectId={id} />
}
