import type { Metadata } from "next"

import { ProjectControlRoom } from "@/components/marker-ofek/dashboard/project-control-room"

export const metadata: Metadata = {
  title: "קוקפיט ניהול פרויקטים",
  description: "Phase 5.1 — דשבורד תפעולי למנהלי פרויקט (Marker Ofek)",
}

export default function MarkerOfekDashboardPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
      <ProjectControlRoom />
    </div>
  )
}
