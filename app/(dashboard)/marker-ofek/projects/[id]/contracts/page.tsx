/**
 * Contracts List for a single project — Sprint A.3.
 *
 * Lists every active subcontractor contract under the given project_id with:
 *   • Original value
 *   • Approved amendments delta  (from erp_contract_amendments status=APPROVED)
 *   • Current value (= original + approved amendments)
 *   • Cumulative executed (last APPROVED bill's cumulative_executed_amount)
 *   • Remaining work (= current value − cumulative executed)
 *   • Progress %
 *
 * Path uses [id] to match the existing convention under
 * `app/(dashboard)/marker-ofek/projects/[id]/...`.
 */
import Link from "next/link"
import { cookies } from "next/headers"
import { Briefcase, FileText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export const dynamic = "force-dynamic"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const PCT = new Intl.NumberFormat("he-IL", {
  style: "percent",
  maximumFractionDigits: 1,
})

type ContractRow = {
  id: string
  contract_number: string
  contract_type: string
  total_amount: number
  retention_pct: number
  status: string
  subcontractor_id: string
}

type SupplierRow = { id: string; name: string; supplier_number: string }

type AmendmentRow = { contract_id: string; value_delta: number }

type BillRow = {
  contract_id: string
  cumulative_executed_amount: number
  bill_number: number
}

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "טיוטה", cls: "bg-slate-100 text-slate-800" },
  ACTIVE: { label: "בתוקף", cls: "bg-emerald-100 text-emerald-900" },
  COMPLETED: { label: "הושלם", cls: "bg-indigo-100 text-indigo-900" },
  CANCELLED: { label: "בוטל", cls: "bg-rose-100 text-rose-900" },
}

export default async function ProjectContractsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params

  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(
    cookieStore.get(COMPANY_COOKIE_KEY)?.value,
  )
  if (!companyId) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-700">
        לא נמצא הקשר חברה פעיל.
      </div>
    )
  }

  const supabase = await createSupabaseServerAuthClient()
  const { data: contracts } = await supabase
    .from("erp_subcontractor_contracts")
    .select(
      "id, contract_number, contract_type, total_amount, retention_pct, status, subcontractor_id",
    )
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .order("contract_number", { ascending: true })

  const rows = (contracts ?? []) as ContractRow[]
  if (rows.length === 0) {
    return (
      <div dir="rtl" className="p-6">
        <h1 className="text-xl font-bold tracking-tight">חוזי קבלן משנה</h1>
        <Card className="mt-4 p-8 text-center text-sm text-slate-600">
          אין חוזים פעילים בפרויקט זה.
        </Card>
      </div>
    )
  }

  const contractIds = rows.map((r) => r.id)
  const supplierIds = [...new Set(rows.map((r) => r.subcontractor_id))]

  const [supRes, amendRes, billsRes] = await Promise.all([
    supabase
      .from("erp_md_suppliers")
      .select("id, name, supplier_number")
      .eq("company_id", companyId)
      .in("id", supplierIds),
    supabase
      .from("erp_contract_amendments")
      .select("contract_id, value_delta")
      .eq("company_id", companyId)
      .eq("status", "APPROVED")
      .in("contract_id", contractIds),
    supabase
      .from("erp_subcontractor_bills")
      .select("contract_id, cumulative_executed_amount, bill_number")
      .eq("company_id", companyId)
      .in("contract_id", contractIds)
      .in("status", ["APPROVED", "PAID", "SUBMITTED"]),
  ])

  const supplierMap = new Map<string, SupplierRow>()
  for (const s of (supRes.data ?? []) as SupplierRow[]) supplierMap.set(s.id, s)

  const amendmentDelta = new Map<string, number>()
  for (const a of (amendRes.data ?? []) as AmendmentRow[]) {
    amendmentDelta.set(
      a.contract_id,
      (amendmentDelta.get(a.contract_id) ?? 0) + Number(a.value_delta),
    )
  }

  // Latest bill cumulative per contract
  const latestExec = new Map<string, number>()
  const latestBillNo = new Map<string, number>()
  for (const b of (billsRes.data ?? []) as BillRow[]) {
    const cur = latestBillNo.get(b.contract_id) ?? 0
    if (b.bill_number > cur) {
      latestBillNo.set(b.contract_id, b.bill_number)
      latestExec.set(b.contract_id, Number(b.cumulative_executed_amount))
    }
  }

  return (
    <div dir="rtl" className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700">
            <Briefcase className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              חוזי קבלן משנה
            </h1>
            <p className="text-xs text-muted-foreground">
              ניהול חוזים, חריגים, חשבונות חלקיים, עכבונות וקיזוזים — בפרויקט אחד.
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((c) => {
          const supplier = supplierMap.get(c.subcontractor_id)
          const original = Number(c.total_amount)
          const delta = amendmentDelta.get(c.id) ?? 0
          const current = original + delta
          const executed = latestExec.get(c.id) ?? 0
          const remaining = Math.max(0, current - executed)
          const pct = current > 0 ? executed / current : 0
          const badge = STATUS[c.status] ?? {
            label: c.status,
            cls: "bg-slate-100 text-slate-800",
          }
          return (
            <Card key={c.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-mono text-slate-500">
                    {c.contract_type}
                  </p>
                  <h2 className="text-base font-bold tracking-tight">
                    {c.contract_number}
                  </h2>
                  <p className="text-xs text-slate-700">
                    {supplier?.name ?? "—"}
                  </p>
                </div>
                <Badge className={badge.cls}>{badge.label}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
                <dt className="text-slate-600">ערך מקורי</dt>
                <dd className="text-end font-mono">{ILS.format(original)}</dd>
                {delta !== 0 ? (
                  <>
                    <dt className="text-slate-600">תוספות מאושרות</dt>
                    <dd className="text-end font-mono text-emerald-700">
                      {delta > 0 ? "+" : ""}
                      {ILS.format(delta)}
                    </dd>
                  </>
                ) : null}
                <dt className="text-slate-600 font-semibold">ערך נוכחי</dt>
                <dd className="text-end font-mono font-semibold">
                  {ILS.format(current)}
                </dd>
                <dt className="text-slate-600">בוצע (מצטבר)</dt>
                <dd className="text-end font-mono">{ILS.format(executed)}</dd>
                <dt className="text-slate-600">יתרת ביצוע</dt>
                <dd className="text-end font-mono">{ILS.format(remaining)}</dd>
              </dl>
              <div className="space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(100, pct * 100)}%` }}
                  />
                </div>
                <p className="text-end text-[10px] font-mono text-slate-600">
                  {PCT.format(pct)} בוצע
                </p>
              </div>
              <Link
                href={`/marker-ofek/projects/${projectId}/contracts/${c.id}`}
                className="mt-1 inline-flex items-center justify-end gap-1.5 border-t border-slate-100 pt-2 text-xs font-semibold text-indigo-700 hover:underline"
              >
                <FileText className="size-3.5" aria-hidden />
                פתח סביבת עבודה
              </Link>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
