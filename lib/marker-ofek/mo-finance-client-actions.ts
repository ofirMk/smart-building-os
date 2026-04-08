"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

const createSchema = z.object({
  name: z.string().trim().min(1, "שם לקוח חובה").max(300),
  address: z.string().trim().max(500).optional().nullable(),
  email: z.string().trim().max(320).optional().nullable(),
  paymentTerms: z.string().trim().max(500).optional().nullable(),
  entityId: z.string().uuid().optional().nullable(),
  companyProfileId: z.string().uuid().optional().nullable(),
})

export async function createMoFinanceClientAction(
  raw: unknown
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const parsed = createSchema.safeParse(raw)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(" · ")
      return { ok: false, error: msg || "נתונים לא תקינים" }
    }
    const p = parsed.data
    const emailTrim = p.email?.trim() || null
    if (
      emailTrim &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)
    ) {
      return { ok: false, error: "דוא״ל לא תקין" }
    }

    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    if (p.entityId) {
      const { data: ent, error: entErr } = await supabase
        .from("entities")
        .select("id, type, is_deleted")
        .eq("id", p.entityId)
        .maybeSingle()
      if (entErr) return { ok: false, error: entErr.message }
      if (!ent || ent.is_deleted || ent.type !== "client") {
        return { ok: false, error: "ישות הלקוח לא נמצאה או שאינה מסוג מזמין" }
      }
    }

    const { data: row, error } = await supabase
      .from("mo_finance_clients")
      .insert({
        name: p.name.trim(),
        address: p.address?.trim() || null,
        email: emailTrim,
        payment_terms: p.paymentTerms?.trim() || null,
        entity_id: p.entityId?.trim() || null,
        company_profile_id: p.companyProfileId?.trim() || null,
        is_deleted: false,
      })
      .select("id")
      .single()

    if (error || !row?.id) {
      return { ok: false, error: error?.message ?? "שמירת לקוח נכשלה" }
    }

    revalidatePath("/marker-ofek/finance/invoices/new")
    revalidatePath("/marker-ofek/invoices/new")
    return { ok: true, id: row.id as string }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
