export type FloorHandoverChecklistItem = {
  id: string
  label: string
  signed: boolean
  signed_at?: string | null
}

export const DEFAULT_FLOOR_HANDOVER_CHECKLIST: FloorHandoverChecklistItem[] = [
  {
    id: "electrician",
    label: "חשמלאי — אישור סיום לפני גבס",
    signed: false,
  },
  {
    id: "plumbing",
    label: "אינסטלציה",
    signed: false,
  },
  {
    id: "hvac",
    label: "מיזוג אוויר",
    signed: false,
  },
]

export function mergeFloorHandoverChecklist(
  fromDb: unknown
): FloorHandoverChecklistItem[] {
  const raw = Array.isArray(fromDb) ? fromDb : []
  const byId = new Map(
    DEFAULT_FLOOR_HANDOVER_CHECKLIST.map((x) => [
      x.id,
      { ...x },
    ] as const)
  )
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const id = String(o.id ?? "").trim()
    if (!id) continue
    const label = String(o.label ?? byId.get(id)?.label ?? id).trim() || id
    const prev = byId.get(id) ?? { id, label, signed: false }
    const signed_at =
      o.signed_at == null || o.signed_at === ""
        ? null
        : String(o.signed_at)
    byId.set(id, {
      ...prev,
      label,
      signed: Boolean(o.signed),
      signed_at,
    })
  }
  return Array.from(byId.values())
}
