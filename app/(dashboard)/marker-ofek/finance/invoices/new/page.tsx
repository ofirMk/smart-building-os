import type { Metadata } from "next"

import { InvoiceCommanderClient } from "@/components/marker-ofek/finance/invoice-commander-client"
import { COMPANY_PROFILE_COLUMNS } from "@/lib/marker-ofek/supabase-fields"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export const metadata: Metadata = {
  title: "חשבונית מס חדשה — כספים",
  description: "הפקת חשבונית מס ללקוח — מסגרת רשות המסים",
}

export default async function FinanceNewInvoicePage({
  searchParams,
}: {
  searchParams?: Promise<{ clientName?: string; amount?: string }>
}) {
  const sp = (await searchParams) ?? {}
  const rawName = typeof sp.clientName === "string" ? sp.clientName.trim() : ""
  const rawAmount =
    typeof sp.amount === "string" ? sp.amount.trim().replace(",", ".") : ""
  const parsedAmount = rawAmount !== "" ? Number(rawAmount) : Number.NaN
  const amount =
    Number.isFinite(parsedAmount) && parsedAmount >= 0 ? parsedAmount : undefined

  const voicePrefill =
    rawName || amount !== undefined
      ? {
          ...(rawName ? { clientName: rawName } : {}),
          ...(amount !== undefined ? { amount } : {}),
        }
      : null

  const supabase = await createSupabaseServerAuthClient()

  const [{ data: settings }, finRes, { data: company }] = await Promise.all([
    supabase
      .from("mo_system_settings")
      .select("default_vat_rate")
      .eq("singleton_key", 1)
      .maybeSingle(),
    supabase
      .from("finance_invoices")
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
  const maxFinance =
    finRes.error &&
    (String(finRes.error.message).includes("does not exist") ||
      String(finRes.error.message).includes("schema cache"))
      ? null
      : finRes.data
  const lastNum = (maxFinance as { invoice_number?: number } | null)?.invoice_number
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
    <InvoiceCommanderClient
      defaultVatPercent={Number.isFinite(defaultVat) ? defaultVat : 17}
      nextInvoiceNumberHint={nextHint}
      voicePrefill={voicePrefill}
      company={{
        company_name: String(c?.company_name ?? "").trim() || "חברה",
        legal_id: c?.legal_id ?? null,
        vat_registration_number: c?.vat_registration_number ?? null,
        address: c?.address ?? null,
      }}
    />
  )
}
