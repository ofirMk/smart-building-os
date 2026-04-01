import { Suspense } from "react"
import { notFound } from "next/navigation"

import { MarkerOfekRouteSkeleton } from "@/components/marker-ofek/marker-ofek-route-skeleton"

import { MarkerOfekProjectHubSection } from "./project-hub-section"

export default async function MarkerOfekProjectHubPage({
  params,
}: {
  /** Next.js 15+ עשוי להעביר Promise */
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolved = await Promise.resolve(params)
  const id = typeof resolved.id === "string" ? resolved.id : ""
  if (!id) notFound()

  return (
    <Suspense fallback={<MarkerOfekRouteSkeleton />}>
      <MarkerOfekProjectHubSection id={id} />
    </Suspense>
  )
}
