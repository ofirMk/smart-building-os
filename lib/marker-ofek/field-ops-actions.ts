"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

const checklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  signed: z.boolean(),
  signed_at: z.string().nullable().optional(),
})

// NOTE: Next.js 16 forbids non-async exports from "use server" modules.
// This schema + its inferred type are consumed only within this file, so we
// drop the `export` keyword. External consumers must call the action itself
// (it owns the validation) rather than re-validating client-side.
const floorHandoverUpsertSchema = z.object({
  projectId: z.string().uuid(),
  buildingLabel: z.string().trim().min(1, "שם בניין חובה"),
  floorLabel: z.string().trim().min(1, "שם קומה חובה"),
  checklist: z.array(checklistItemSchema).min(1),
  readyForDrywall: z.boolean(),
})

const snagCreateSchema = z.object({
  projectId: z.string().uuid(),
  contractId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2, "כותרת קצרה מדי"),
  description: z.string().trim().optional(),
  deductionAmountIlsPositive: z.coerce
    .number()
    .positive("סכום קיזוז חייב להיות חיובי (יומר לשורה שלילית)"),
  photoDataUrls: z
    .array(z.string().min(20).max(1_200_000))
    .max(6, "עד 6 תמונות")
    .default([]),
})

export async function upsertFloorHandoverAction(
  raw: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = floorHandoverUpsertSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(" · ")
    return { ok: false, error: msg || "נתונים לא תקינים" }
  }
  const p = parsed.data
  const electrician = p.checklist.find((c) => c.id === "electrician")
  if (p.readyForDrywall && !electrician?.signed) {
    return {
      ok: false,
      error: "לא ניתן לסמן מוכן לגבס לפני חתימת חשמלאי",
    }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()
    const row = {
      project_id: p.projectId,
      building_label: p.buildingLabel.trim(),
      floor_label: p.floorLabel.trim(),
      checklist: p.checklist,
      ready_for_drywall: p.readyForDrywall,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase
      .schema("public")
      .from("mo_floor_handovers")
      .upsert(row, {
        onConflict: "project_id,building_label,floor_label",
      })
    if (error) return { ok: false, error: error.message }
    revalidatePath(`/marker-ofek/execution/field/floor-handover/${p.projectId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function createFieldSnagAction(
  raw: unknown
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = snagCreateSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(" · ")
    return { ok: false, error: msg || "נתונים לא תקינים" }
  }
  const p = parsed.data
  const neg = -Math.abs(p.deductionAmountIlsPositive)

  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    let subcontractorEntityId: string | null = null
    const cid = p.contractId?.trim() || null
    if (cid) {
      const { data: cRow, error: cErr } = await supabase
        .schema("public")
        .from("contracts")
        .select("id, project_id, entity_id")
        .eq("id", cid)
        .eq("is_deleted", false)
        .maybeSingle()
      if (cErr) return { ok: false, error: cErr.message }
      if (!cRow || String((cRow as { project_id?: string }).project_id) !== p.projectId) {
        return { ok: false, error: "החוזה אינו שייך לפרויקט" }
      }
      subcontractorEntityId = String((cRow as { entity_id?: string }).entity_id ?? "") || null
    }

    const { data, error } = await supabase
      .schema("public")
      .from("mo_field_snags")
      .insert({
        project_id: p.projectId,
        contract_id: cid,
        subcontractor_entity_id: subcontractorEntityId,
        title: p.title,
        description: p.description?.trim() || null,
        photo_data_urls: p.photoDataUrls,
        deduction_amount_ils: neg,
        status: "pending",
        created_by: user?.id ?? null,
      })
      .select("id")
      .single()

    if (error || !data?.id) {
      return { ok: false, error: error?.message ?? "שמירת ליקוי נכשלה" }
    }
    revalidatePath(`/marker-ofek/execution/field/snags/${p.projectId}`)
    return { ok: true, id: String(data.id) }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
