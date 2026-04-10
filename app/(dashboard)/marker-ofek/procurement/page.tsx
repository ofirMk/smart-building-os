import { Suspense } from "react"

import { UnifiedProcurementHubClient } from "@/components/marker-ofek/procurement/unified-procurement-hub-client"
import {
  fetchCurrenciesAction,
  fetchErpPaymentTermsForMasterAction,
  fetchSupplierPartsAction,
  fetchSuppliersV2Action,
  fetchUnitsOfMeasureAction,
} from "@/lib/holden-erp/master-data-actions"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export default async function UnifiedProcurementHubPage() {
  const supabase = await createServerSupabaseClient()

  const { data: projRows, error: projErr } = await supabase
    .from("projects")
    .select("id, name, internal_project_code, is_deleted")
    .eq("is_deleted", false)
    .order("name", { ascending: true })

  const projects =
    (projRows ?? []).map((r) => ({
      id: String((r as { id: string }).id),
      name: String((r as { name: string }).name ?? ""),
      internal_project_code: String(
        (r as { internal_project_code?: string }).internal_project_code ?? ""
      ),
    })) ?? []

  const { data: poRows, error: poErr } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, order_date, status, wh_status, total_amount, project_id, supplier_id"
    )
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(400)

  const entityIds = [
    ...new Set(
      (poRows ?? []).map((r) =>
        String((r as { supplier_id: string }).supplier_id)
      )
    ),
  ]

  let entityName = new Map<string, string>()
  if (entityIds.length > 0) {
    const { data: ents } = await supabase
      .from("entities")
      .select("id, name")
      .in("id", entityIds)
    for (const e of ents ?? []) {
      entityName.set(
        String((e as { id: string }).id),
        String((e as { name: string }).name ?? "")
      )
    }
  }

  const initialPurchaseOrders =
    (poRows ?? []).map((r) => {
      const row = r as {
        id: string
        po_number: string
        order_date: string
        status: string
        wh_status: string | null
        total_amount: number
        project_id: string | null
        supplier_id: string
      }
      return {
        id: String(row.id),
        po_number: String(row.po_number ?? ""),
        order_date: String(row.order_date ?? ""),
        status: String(row.status ?? ""),
        wh_status: row.wh_status,
        total_amount: Number(row.total_amount) || 0,
        project_id: row.project_id,
        supplier_name: entityName.get(String(row.supplier_id)) ?? null,
      }
    }) ?? []

  const [cur, uom, parts, sup, terms] = await Promise.all([
    fetchCurrenciesAction(),
    fetchUnitsOfMeasureAction(),
    fetchSupplierPartsAction(),
    fetchSuppliersV2Action(),
    fetchErpPaymentTermsForMasterAction(),
  ])

  const loadErrors: string[] = []
  if (projErr) loadErrors.push(projErr.message)
  if (poErr) loadErrors.push(poErr.message)
  if (!cur.ok) loadErrors.push(cur.error)
  if (!uom.ok) loadErrors.push(uom.error)
  if (!parts.ok) loadErrors.push(parts.error)
  if (!sup.ok) loadErrors.push(sup.error)
  if (!terms.ok) loadErrors.push(terms.error)

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center bg-[#070b12] text-slate-400">
          טוען מרכז רכש…
        </div>
      }
    >
      <UnifiedProcurementHubClient
        projects={projects}
        parts={parts.ok ? parts.data : []}
        uoms={uom.ok ? uom.data : []}
        currencies={cur.ok ? cur.data : []}
        suppliers={sup.ok ? sup.data : []}
        paymentTerms={terms.ok ? terms.data : []}
        initialPurchaseOrders={initialPurchaseOrders}
        loadErrors={loadErrors}
      />
    </Suspense>
  )
}
