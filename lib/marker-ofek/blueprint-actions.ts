"use server"

import { revalidatePath } from "next/cache"

import { fetchProjectBoq, type ProjectBoqRow } from "@/lib/marker-ofek/gantt-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type BlueprintDetectedItem = {
  id: string
  item: string
  qty: number
  unit: string
  suggestedBoqItemId: string | null
}

const MOCK_SCAN_MS = 2200

function normalizeToken(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s.-]/gu, "")
    .trim()
}

function suggestBoqMatch(aiLabel: string, rows: ProjectBoqRow[]): string | null {
  if (rows.length === 0) return null
  const n = normalizeToken(aiLabel)
  if (!n) return null
  const words = n.split(/\s+/).filter((w) => w.length >= 2)

  let bestId: string | null = null
  let bestScore = 0

  for (const r of rows) {
    const desc = normalizeToken(r.description)
    const code = normalizeToken(r.item_code)
    let score = 0
    if (desc && (desc.includes(n) || n.includes(desc))) score += 60
    if (code && (code.includes(n) || n.includes(code))) score += 50
    if (desc && code && n === `${code} ${desc}`) score += 20
    for (const w of words) {
      if (w.length < 3) continue
      if (desc.includes(w)) score += 8
      if (code.includes(w)) score += 6
    }
    if (score > bestScore) {
      bestScore = score
      bestId = r.id
    }
  }

  return bestScore >= 18 ? bestId : null
}

function mockDetectedItemsForFile(file: File, boqRows: ProjectBoqRow[]): BlueprintDetectedItem[] {
  const seed = file.name.length + file.size
  const variants: Array<Omit<BlueprintDetectedItem, "id" | "suggestedBoqItemId">>[] = [
    [
      { item: "Concrete Wall", qty: 45, unit: "m³" },
      { item: "Rebar Steel", qty: 12.5, unit: "ton" },
      { item: "Ceramic Flooring", qty: 120, unit: "m²" },
    ],
    [
      { item: "קיר בטון", qty: 38, unit: "m³" },
      { item: "יציקת רצפה", qty: 210, unit: "m²" },
      { item: "תקרת גבס", qty: 95, unit: "m²" },
    ],
    [
      { item: "Structural Steel", qty: 8.2, unit: "ton" },
      { item: "Facade Glazing", qty: 340, unit: "m²" },
    ],
  ]
  const pick = variants[seed % variants.length] ?? variants[0]
  return pick.map((row) => ({
    id: crypto.randomUUID(),
    item: row.item,
    qty: row.qty,
    unit: row.unit,
    suggestedBoqItemId: suggestBoqMatch(row.item, boqRows),
  }))
}

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

/**
 * Receives a blueprint file (PDF/image), runs a mock AI pipeline, and returns detected quantities.
 * Replace `mockDetectedItemsForFile` with a real model call when ready.
 */
export async function processBlueprintAI(formData: FormData): Promise<{
  ok: true
  detectedItems: BlueprintDetectedItem[]
  fileLabel: string
}> {
  const projectId = String(formData.get("projectId") ?? "").trim()
  const file = formData.get("file")
  if (!projectId) throw new Error("נדרש פרויקט")
  if (!(file instanceof File) || file.size <= 0) throw new Error("קובץ לא תקין")

  const mime = String(file.type ?? "").trim() || "application/octet-stream"
  if (!ALLOWED_TYPES.has(mime)) {
    throw new Error("סוג קובץ לא נתמך. יש להעלות PDF או תמונה (JPEG/PNG/WebP).")
  }

  const maxBytes = 28 * 1024 * 1024
  if (file.size > maxBytes) throw new Error("הקובץ גדול מדי (מקסימום ~28MB).")

  const boqRows = await fetchProjectBoq(projectId)

  await new Promise((r) => setTimeout(r, MOCK_SCAN_MS))

  void file.arrayBuffer()

  const detectedItems = mockDetectedItemsForFile(file, boqRows)

  return {
    ok: true,
    detectedItems,
    fileLabel: file.name || "blueprint",
  }
}

export async function confirmBlueprintQuantities(input: {
  projectId: string
  updates: Array<{ boqItemId: string; plannedQuantity: number }>
}) {
  const projectId = String(input.projectId ?? "").trim()
  const raw = (input.updates ?? []).filter((u) => String(u.boqItemId ?? "").trim())
  if (!projectId) throw new Error("projectId חסר")
  if (raw.length === 0) throw new Error("אין עדכונים לאישור")

  const merged = new Map<string, number>()
  for (const u of raw) {
    const boqItemId = String(u.boqItemId ?? "").trim()
    const plannedQuantity = Number(u.plannedQuantity)
    if (!boqItemId) continue
    if (!Number.isFinite(plannedQuantity) || plannedQuantity < 0) {
      throw new Error("כמות מתוכננת לא תקינה")
    }
    merged.set(boqItemId, (merged.get(boqItemId) ?? 0) + plannedQuantity)
  }

  const supabase = await createSupabaseServerAuthClient()

  for (const [boqItemId, plannedQuantity] of merged) {
    const { error } = await supabase
      .schema("public")
      .from("project_boq")
      .update({ planned_quantity: plannedQuantity })
      .eq("id", boqItemId)
      .eq("project_id", projectId)
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath("/marker-ofek/execution")
  revalidatePath("/marker-ofek/execution/plans")
  return { ok: true, updated: merged.size }
}
