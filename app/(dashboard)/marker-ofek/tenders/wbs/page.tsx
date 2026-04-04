import { TendersWbsShell } from "@/components/marker-ofek/wbs/tenders-wbs-shell"
import { listProjectsForWbsSelector } from "@/lib/marker-ofek/wbs-structure-actions"

type PageProps = {
  searchParams?: Promise<{ projectId?: string; mode?: string }>
}

export default async function MarkerOfekTendersWbsPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const mode = sp.mode === "boq" ? "boq" : "editor"
  const tenderProjectId = sp.projectId?.trim() || null
  const projects = await listProjectsForWbsSelector()
  return <TendersWbsShell mode={mode} tenderProjectId={tenderProjectId} projects={projects} />
}
