import type { Metadata } from "next"

import { MaterialIssueWorkspace } from "@/components/marker-ofek/execution/material-issue-workspace"

export const metadata: Metadata = {
  title: "ניפוק ציוד לשטח",
  description:
    "Phase 5.2 — ניפוק ציוד ממחסן אתר לשטח / קבלן (Material Issue)",
}

export default function NewMaterialIssuePage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
      <MaterialIssueWorkspace />
    </div>
  )
}
