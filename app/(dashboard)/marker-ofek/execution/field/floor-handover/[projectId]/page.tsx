import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

import FloorHandoverClient from "./floor-handover-client"

type PageProps = {
  params: Promise<{ projectId: string }> | { projectId: string }
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>
}

export default async function FloorHandoverPage({ params, searchParams }: PageProps) {
  const resolved = await Promise.resolve(params)
  const spRaw = searchParams ? await Promise.resolve(searchParams) : {}
  const sp: Record<string, string | string[] | undefined> = spRaw ?? {}
  const projectId = String(resolved.projectId ?? "").trim()
  const building = String(
    (Array.isArray(sp.building) ? sp.building[0] : sp.building) ?? ""
  ).trim()
  const floor = String(
    (Array.isArray(sp.floor) ? sp.floor[0] : sp.floor) ?? ""
  ).trim()

  const supabase = await createSupabaseServerAuthClient()
  let initialRow: {
    building_label: string
    floor_label: string
    checklist: unknown
    ready_for_drywall: boolean
  } | null = null

  if (building && floor) {
    const { data } = await supabase
      .schema("public")
      .from("mo_floor_handovers")
      .select("building_label, floor_label, checklist, ready_for_drywall")
      .eq("project_id", projectId)
      .eq("building_label", building)
      .eq("floor_label", floor)
      .maybeSingle()
    if (data) {
      const d = data as Record<string, unknown>
      initialRow = {
        building_label: String(d.building_label ?? ""),
        floor_label: String(d.floor_label ?? ""),
        checklist: d.checklist,
        ready_for_drywall: Boolean(d.ready_for_drywall),
      }
    }
  }

  return (
    <FloorHandoverClient
      projectId={projectId}
      initialRow={initialRow}
      defaultBuilding={building}
      defaultFloor={floor}
    />
  )
}
