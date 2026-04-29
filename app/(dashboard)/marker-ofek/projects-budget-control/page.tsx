import type { Metadata } from "next"

import { ProjectsBudgetControlScaffold } from "@/components/marker-ofek/projects-budget-control/projects-budget-control-scaffold"
import { loadProjectsBudgetControlData } from "@/lib/marker-ofek/projects-budget-control-data"

export const metadata: Metadata = {
  title: "Projects & Budget Control",
  description: "Scaffold from master spec for projects lifecycle and budget control",
}

export default async function ProjectsBudgetControlPage() {
  const data = await loadProjectsBudgetControlData()
  return (
    <ProjectsBudgetControlScaffold
      title="Projects & Budget Control"
      subtitle="Scaffold: הקמת פרויקט, מהדורות תכנון, היררכיית BOQ, ועד בקרה תקציבית חודשית."
      rows={data.rows}
      initialError={data.error}
    />
  )
}
