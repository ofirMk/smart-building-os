"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import {
  quickCatalogItemSchema,
  quickEntitySchema,
  quickProjectSchema,
  quickTenderLinkSchema,
} from "@/lib/marker-ofek/erp-validation-schemas"
import { logMoAuditEvent } from "@/lib/marker-ofek/audit-log"
import { formatError } from "@/lib/utils"

export async function quickCreateProject(
  raw: unknown
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const parsed = quickProjectSchema.safeParse(raw)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(" · ")
      return { ok: false, error: msg || "נתונים לא תקינים" }
    }
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const pm = parsed.data.managingPartnerUserId?.trim() || user.id

    const { data: client, error: clientErr } = await supabase
      .from("entities")
      .select("id, type, is_deleted")
      .eq("id", parsed.data.clientEntityId)
      .maybeSingle()

    if (clientErr) return { ok: false, error: clientErr.message }
    if (!client || client.is_deleted || client.type !== "client") {
      return { ok: false, error: "מזמין (לקוח) לא נמצא או שאינו מסוג client" }
    }

    const { data: inserted, error: insErr } = await supabase
      .from("projects")
      .insert({
        name: parsed.data.name.trim(),
        internal_project_code: parsed.data.internalProjectCode?.trim() || "",
        status: "planning",
        client_entity_id: parsed.data.clientEntityId,
        managing_partner_id: pm,
        is_deleted: false,
      })
      .select("id")
      .single()

    if (insErr || !inserted?.id) {
      return { ok: false, error: insErr?.message ?? "יצירת פרויקט נכשלה" }
    }

    const newId = inserted.id as string
    void logMoAuditEvent({
      action_type: "INSERT",
      table_name: "projects",
      project_id: newId,
      new_data: {
        id: newId,
        name: parsed.data.name.trim(),
        client_entity_id: parsed.data.clientEntityId,
      },
    })

    revalidatePath("/marker-ofek/projects")
    revalidatePath("/marker-ofek/contracts/new")
    revalidatePath("/marker-ofek/procurement/purchase-orders/new")
    return { ok: true, id: newId }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/** מכרז ריק מקושר לפרויקט — להמשך ייבוא BoQ */
export async function quickCreateTenderForProject(
  raw: unknown
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const parsed = quickTenderLinkSchema.safeParse(raw)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(" · ")
      return { ok: false, error: msg || "נתונים לא תקינים" }
    }
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: proj, error: pErr } = await supabase
      .from("projects")
      .select("id, is_deleted")
      .eq("id", parsed.data.projectId)
      .maybeSingle()
    if (pErr) return { ok: false, error: pErr.message }
    if (!proj || proj.is_deleted) {
      return { ok: false, error: "פרויקט לא נמצא" }
    }

    const { data: inserted, error: insErr } = await supabase
      .from("tenders")
      .insert({
        project_id: parsed.data.projectId,
        project_name_from_ai: parsed.data.title.trim(),
        building_structure_raw_data: {},
      })
      .select("id")
      .single()

    if (insErr || !inserted?.id) {
      return { ok: false, error: insErr?.message ?? "יצירת מכרז נכשלה" }
    }

    revalidatePath("/marker-ofek/procurement/purchase-orders/new")
    revalidatePath("/marker-ofek/tenders")
    return { ok: true, id: inserted.id as string }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function quickCreateEntity(
  raw: unknown
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const parsed = quickEntitySchema.safeParse(raw)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(" · ")
      return { ok: false, error: msg || "נתונים לא תקינים" }
    }
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const w = parsed.data.withholdingTaxExpiry?.trim() || null
    const b = parsed.data.bookkeepingAuthExpiry?.trim() || null
    const wDate = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? w : null
    const bDate = b && /^\d{4}-\d{2}-\d{2}$/.test(b) ? b : null

    const { data: inserted, error: insErr } = await supabase
      .from("entities")
      .insert({
        name: parsed.data.name.trim(),
        type: parsed.data.type,
        contact_info: {},
        legal_id: parsed.data.legalId?.trim() || null,
        address: parsed.data.address?.trim() || null,
        withholding_tax_expiry: wDate,
        bookkeeping_auth_expiry: bDate,
        default_withholding_tax_percent:
          parsed.data.defaultWithholdingPercent ?? null,
        is_deleted: false,
      })
      .select("id")
      .single()

    if (insErr || !inserted?.id) {
      return { ok: false, error: insErr?.message ?? "יצירת ישות נכשלה" }
    }

    const entId = inserted.id as string
    void logMoAuditEvent({
      action_type: "INSERT",
      table_name: "entities",
      project_id: null,
      new_data: {
        id: entId,
        name: parsed.data.name.trim(),
        type: parsed.data.type,
      },
    })

    revalidatePath("/marker-ofek/entities")
    revalidatePath("/marker-ofek/entities/suppliers")
    revalidatePath("/marker-ofek/procurement/purchase-orders/new")
    revalidatePath("/marker-ofek/contracts/new")
    return { ok: true, id: entId }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function quickCreateCatalogItem(
  raw: unknown
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const parsed = quickCatalogItemSchema.safeParse(raw)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(" · ")
      return { ok: false, error: msg || "נתונים לא תקינים" }
    }
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: inserted, error: insErr } = await supabase
      .from("items_catalog")
      .insert({
        sku: parsed.data.sku.trim(),
        description: parsed.data.description.trim(),
        category: parsed.data.category.trim(),
        unit: parsed.data.unit?.trim() || null,
        default_price:
          parsed.data.defaultPrice != null && Number.isFinite(parsed.data.defaultPrice)
            ? parsed.data.defaultPrice
            : null,
      })
      .select("id")
      .single()

    if (insErr || !inserted?.id) {
      return { ok: false, error: insErr?.message ?? "יצירת פריט קטלוג נכשלה" }
    }

    revalidatePath("/marker-ofek/items")
    revalidatePath("/marker-ofek/procurement/purchase-orders/new")
    return { ok: true, id: inserted.id as string }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
