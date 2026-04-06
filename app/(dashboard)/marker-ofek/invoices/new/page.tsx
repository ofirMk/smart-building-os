import type { Metadata } from "next"

import { InvoiceGeneratorClient } from "./invoice-generator-client"
import { COMPANY_PROFILE_COLUMNS } from "@/lib/marker-ofek/supabase-fields"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export const metadata: Metadata = {
  title: "מחולל חשבוניות",
}

export default async function NewMoInvoicePage() {
  const supabase = await createSupabaseServerAuthClient()

  const [{ data: settings }, { data: maxRow }, { data: company }] =
    await Promise.all([
      supabase
        .from("mo_system_settings")
        .select("default_vat_rate")
        .eq("singleton_key", 1)
        .maybeSingle(),
      supabase
        .from("mo_invoices")
        .select("invoice_number")
        .order("invoice_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("company_profile")
        .select(COMPANY_PROFILE_COLUMNS + ", vat_registration_number")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])

  const defaultVat = Number(
    (settings as { default_vat_rate?: number } | null)?.default_vat_rate ?? 17
  )
  const lastNum = maxRow?.invoice_number
  const nextHint =
    typeof lastNum === "number" && Number.isFinite(lastNum)
      ? lastNum + 1
      : null

  const c = company as
    | {
        company_name?: string
        legal_id?: string | null
        vat_registration_number?: string | null
        address?: string | null
      }
    | null

  return (
    <InvoiceGeneratorClient
      defaultVatPercent={Number.isFinite(defaultVat) ? defaultVat : 17}
      nextInvoiceNumberHint={nextHint}
      company={{
        company_name: String(c?.company_name ?? "").trim() || "חברה",
        legal_id: c?.legal_id ?? null,
        vat_registration_number: c?.vat_registration_number ?? null,
        address: c?.address ?? null,
      }}
    />
  )
}
