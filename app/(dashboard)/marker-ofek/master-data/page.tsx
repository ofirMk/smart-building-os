import { Suspense } from "react"

import { MasterDataDashboard } from "@/components/marker-ofek/master-data/master-data-dashboard"
import {
  fetchCurrenciesAction,
  fetchErpPaymentTermsForMasterAction,
  fetchSupplierPartsAction,
  fetchSuppliersV2Action,
  fetchUnitsOfMeasureAction,
} from "@/lib/holden-erp/master-data-actions"

const VALID_TABS = new Set([
  "suppliers",
  "parts",
  "uom",
  "currencies",
])

export default async function MasterDataPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const raw =
    typeof sp.tab === "string"
      ? sp.tab
      : Array.isArray(sp.tab)
        ? sp.tab[0]
        : undefined
  const initialTab =
    raw && VALID_TABS.has(raw) ? raw : "suppliers"

  const [cur, uom, parts, sup, terms] = await Promise.all([
    fetchCurrenciesAction(),
    fetchUnitsOfMeasureAction(),
    fetchSupplierPartsAction(),
    fetchSuppliersV2Action(),
    fetchErpPaymentTermsForMasterAction(),
  ])

  const loadErrors: string[] = []
  if (!cur.ok) loadErrors.push(cur.error)
  if (!uom.ok) loadErrors.push(uom.error)
  if (!parts.ok) loadErrors.push(parts.error)
  if (!sup.ok) loadErrors.push(sup.error)
  if (!terms.ok) loadErrors.push(terms.error)

  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-[40vh] items-center justify-center bg-white text-sm text-slate-500"
          dir="rtl"
        >
          טוען נתוני מאסטר…
        </div>
      }
    >
      <MasterDataDashboard
        initialTab={initialTab}
        initialCurrencies={cur.ok ? cur.data : []}
        initialUom={uom.ok ? uom.data : []}
        initialParts={parts.ok ? parts.data : []}
        initialSuppliers={sup.ok ? sup.data : []}
        paymentTerms={terms.ok ? terms.data : []}
        loadErrors={loadErrors}
      />
    </Suspense>
  )
}

