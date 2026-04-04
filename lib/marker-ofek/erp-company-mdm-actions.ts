"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { isPartnerDashboardSuperAdmin } from "@/lib/marker-ofek/partner-metrics/access"
import { companyMdmFormSchema } from "@/lib/marker-ofek/erp-validation-schemas"
import { formatError } from "@/lib/utils"

export type CompanyMdmRow = {
  id: string
  company_name: string
  legal_id: string | null
  address: string | null
  phone: string | null
  email: string | null
  vat_registration_number: string | null
  bank_name: string | null
  bank_branch: string | null
  bank_account_number: string | null
}

export async function getCompanyMdmProfile(): Promise<
  { ok: true; row: CompanyMdmRow | null } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("company_profile")
      .select(
        "id, company_name, legal_id, address, phone, email, vat_registration_number, bank_name, bank_branch, bank_account_number"
      )
      .limit(1)
      .maybeSingle()

    if (error) return { ok: false, error: error.message }
    return { ok: true, row: data as CompanyMdmRow | null }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function updateCompanyMdmProfile(input: {
  legalId: string | null
  vatRegistrationNumber: string | null
  bankName: string | null
  bankBranch: string | null
  bankAccountNumber: string | null
  address: string | null
  phone: string | null
  email: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, error: "נדרשת התחברות" }
    if (!isPartnerDashboardSuperAdmin(user.email)) {
      return { ok: false, error: "עדכון פרטי חברה מיועד למנהל המערכת בלבד" }
    }

    const { data: row, error: selErr } = await supabase
      .from("company_profile")
      .select("id")
      .limit(1)
      .maybeSingle()

    if (selErr) return { ok: false, error: selErr.message }
    const id = (row as { id?: string } | null)?.id
    if (!id) return { ok: false, error: "חסר company_profile — הריצו מיגרציות" }

    const trimmed = {
      legalId: input.legalId?.trim() ?? "",
      vatRegistrationNumber: input.vatRegistrationNumber?.trim() ?? "",
      bankName: input.bankName?.trim() ?? "",
      bankBranch: input.bankBranch?.trim() ?? "",
      bankAccountNumber: input.bankAccountNumber?.trim() ?? "",
    }
    const parsed = companyMdmFormSchema.safeParse(trimmed)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(" · ")
      return { ok: false, error: msg || "שדות חובה חסרים" }
    }

    const { error } = await supabase
      .from("company_profile")
      .update({
        legal_id: parsed.data.legalId,
        vat_registration_number: parsed.data.vatRegistrationNumber,
        bank_name: parsed.data.bankName,
        bank_branch: parsed.data.bankBranch,
        bank_account_number: parsed.data.bankAccountNumber,
        address: input.address?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
      })
      .eq("id", id)

    if (error) return { ok: false, error: error.message }

    revalidatePath("/marker-ofek/settings/company")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
