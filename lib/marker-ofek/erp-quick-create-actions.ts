"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import {
  quickCatalogItemSchema,
  quickEntitySchema,
  quickProjectSchema,
  quickTenderLinkSchema,
} from "@/lib/marker-ofek/erp-validation-schemas"
import { logMoAuditEvent } from "@/lib/marker-ofek/audit-log"
import { formatError } from "@/lib/utils"

async function resolveActiveCompanyId(): Promise<string> {
  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
  if (!companyId) {
    throw new Error("Missing active company context")
  }
  return companyId
}

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

function firstValidIsoDate(val: string | null | undefined): string | null {
  const t = typeof val === "string" ? val.trim() : ""
  if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  return null
}

/** תנאי תשלום לטופס ישות — קריאה בלבד */
export async function listErpPaymentTermsForEntityForm(): Promise<
  { code: string; label: string }[]
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("erp_payment_terms")
      .select("code, description")
      .order("code")
    if (error) return []
    return (data ?? []).map((r) => ({
      code: r.code as string,
      label:
        r.description && String(r.description).trim()
          ? `${r.code} — ${String(r.description).trim()}`
          : String(r.code),
    }))
  } catch {
    return []
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

    const wDate = firstValidIsoDate(parsed.data.withholding_tax_expiry)
    const bDate = firstValidIsoDate(parsed.data.bookkeeping_cert_expiry)

    const contact: Record<string, string> = {}
    const em = parsed.data.email?.trim()
    const ph = parsed.data.phone?.trim()
    if (em) contact.email = em
    if (ph) contact.phone = ph

    const pctRaw =
      parsed.data.withholding_tax_pct ?? parsed.data.default_withholding_tax_percent
    const pct =
      pctRaw != null && Number.isFinite(Number(pctRaw))
        ? Number(pctRaw)
        : null

    const taxIdTrim = parsed.data.tax_id?.trim() || null
    const erpSup = parsed.data.erp_supplier_number?.trim() || null
    const erpCust = parsed.data.erp_customer_number?.trim() || null
    const ptc = parsed.data.payment_term_code?.trim() || null
    const gl = parsed.data.gl_account_code?.trim() || null

    const { data: inserted, error: insErr } = await supabase
      .from("entities")
      .insert({
        name: parsed.data.name.trim(),
        type: parsed.data.type,
        contact_info: contact,
        legal_id: parsed.data.legal_id?.trim() || null,
        address: parsed.data.address?.trim() || null,
        tax_id: taxIdTrim,
        erp_supplier_number: erpSup,
        erp_customer_number: erpCust,
        payment_term_code: ptc,
        gl_account_code: gl,
        withholding_tax_expiry: wDate,
        bookkeeping_cert_expiry: bDate,
        default_withholding_tax_percent: pct ?? 0,
        withholding_tax_pct: pct,
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
    const companyId = await resolveActiveCompanyId()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const familyRes = await supabase
      .from("erp_md_product_families")
      .select("id")
      .eq("company_id", companyId)
      .order("family_code", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (familyRes.error || !familyRes.data?.id) {
      return { ok: false, error: familyRes.error?.message ?? "חסרה משפחת מוצר פעילה לחברה" }
    }

    const { data: inserted, error: insErr } = await supabase
      .from("erp_md_items")
      .insert({
        company_id: companyId,
        item_number: parsed.data.sku.trim(),
        internal_sku: parsed.data.sku.trim(),
        description: parsed.data.description.trim(),
        product_family_id: familyRes.data.id,
        unit_of_measure: parsed.data.unit?.trim() || "יחידה",
        status: "ACTIVE",
        is_inventory_managed: true,
        legacy_default_price:
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
