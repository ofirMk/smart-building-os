/**
 * Tax Invoice Composer (new) — Sprint T7b.
 *
 * Server shell: resolves the active company id + loads the customer master so
 * the client-side composer can render a typeahead. The actual form lives in
 * `TaxInvoiceComposerClient` to keep `createTaxInvoiceDraftAction` callable
 * via the client bundle.
 */

import { cookies } from "next/headers"
import Link from "next/link"

import { TaxInvoiceComposerClient } from "@/components/marker-ofek/finance/tax-invoice-composer-client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export const dynamic = "force-dynamic"

export default async function NewTaxInvoicePage() {
  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)

  if (!companyId) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-700">
        לא נמצא הקשר חברה פעיל.
      </div>
    )
  }

  const supabase = await createSupabaseServerAuthClient()
  const { data: customersData, error } = await supabase
    .from("erp_md_customers")
    .select("id, customer_number, name, legal_id, vat_id, address, default_vat_rate_pct")
    .eq("company_id", companyId)
    .eq("is_archived", false)
    .order("name", { ascending: true })
    .limit(500)

  const customers = (customersData ?? []).map((c) => ({
    id: String(c.id),
    customerNumber: String(c.customer_number ?? ""),
    name: String(c.name ?? ""),
    legalId: (c.legal_id as string | null) ?? null,
    vatId: (c.vat_id as string | null) ?? null,
    address: (c.address as string | null) ?? null,
    defaultVatRatePct: Number(c.default_vat_rate_pct ?? 17),
  }))

  if (customers.length === 0) {
    return (
      <div dir="rtl" className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <Card className="border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-bold">אין לקוחות רשומים</p>
          <p className="mt-1">
            לא ניתן להפיק חשבונית מס לפני שיצרת לפחות לקוח אחד בטבלת{" "}
            <span className="font-mono">erp_md_customers</span>.
            {error ? (
              <span className="mt-1 block text-xs">שגיאה: {error.message}</span>
            ) : null}
          </p>
          <div className="mt-3">
            <Button
              render={<Link href="/marker-ofek/finance/tax-invoices" />}
              variant="outline"
              size="sm"
            >
              חזרה לרשימה
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <TaxInvoiceComposerClient companyId={companyId} customers={customers} />
  )
}
