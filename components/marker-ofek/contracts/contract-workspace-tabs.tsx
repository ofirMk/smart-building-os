"use client"

/**
 * ContractWorkspaceTabs — Sprint A.3.
 *
 * 5-tab workspace for a single subcontractor contract.
 * Receives fully-fetched data from the parent server component; renders
 * tables + the live ProgressCertificateBuilder.
 */
import * as React from "react"

import { ProgressCertificateBuilder } from "@/components/marker-ofek/contracts/progress-certificate-builder"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const dateFmt = new Intl.DateTimeFormat("he-IL", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

type BoqLineRow = {
  id: string
  line_no: number
  section_code: string
  description: string
  uom: string
  quantity: number
  unit_price: number
  total_line_price: number
}

type AmendmentRow = {
  id: string
  amendment_number: number
  amendment_type: string
  description: string
  value_delta: number
  status: string
  signed_at: string | null
  justification: string | null
}

type BillRow = {
  id: string
  bill_number: number
  execution_month: string
  bill_date: string
  cumulative_executed_amount: number
  amount_to_pay: number
  grand_total_amount: number
  status: string
}

type RetentionRow = {
  id: string
  entry_type: string
  entry_date: string
  amount: number
  milestone: string | null
  notes: string | null
  bill_id: string | null
}

type BackChargeRow = {
  id: string
  charge_number: number
  charge_type: string
  charge_date: string
  amount: number
  description: string
  source_doc_ref: string | null
  status: string
  deducted_in_bill_id: string | null
}

type EditableBill = {
  id: string
  billNumber: number
  status: string
  previousBilled: number
  vatPct: number
  retentionPct: number
  insurancePct: number
  initialLines: Record<
    string,
    { cumulativeQty: number; cumulativePct: number; cumulativeAmount: number }
  >
  initialTotals: {
    cumulative_executed_amount: number
    retention_deduction_amount: number
    insurance_deduction_amount: number
    cumulative_net_amount: number
    previous_billed_amount: number
    amount_to_pay: number
    vat_amount: number
    grand_total_amount: number
    back_charges_total: number
  }
  boqLines: {
    id: string
    lineNo: number
    description: string
    uom: string
    contractedQty: number
    unitPrice: number
    contractedTotal: number
  }[]
}

type Props = {
  boqLines: BoqLineRow[]
  amendments: AmendmentRow[]
  bills: BillRow[]
  retention: RetentionRow[]
  backCharges: BackChargeRow[]
  editableBill: EditableBill | null
}

const AMENDMENT_TYPE: Record<string, string> = {
  ADDENDUM: "תוספת",
  CHANGE_ORDER: "שינוי הזמנה",
  EXTRA_WORK: "עבודה חריגה",
  VARIATION: "וריאציה",
}

const AMENDMENT_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "טיוטה", cls: "bg-slate-100 text-slate-800" },
  PENDING_APPROVAL: { label: "ממתין לאישור", cls: "bg-amber-100 text-amber-900" },
  APPROVED: { label: "אושר", cls: "bg-emerald-100 text-emerald-900" },
  REJECTED: { label: "נדחה", cls: "bg-rose-100 text-rose-900" },
  CANCELLED: { label: "בוטל", cls: "bg-slate-100 text-slate-600" },
}

const BACK_CHARGE_TYPE: Record<string, string> = {
  MATERIAL_ISSUED: "חומרים שהונפקו",
  EQUIPMENT_RENTAL: "השאלת ציוד",
  REWORK: "תיקון חוזר",
  DELAY_PENALTY: "פיגור",
  UTILITY: "שירותים",
  SAFETY: "בטיחות",
  CLEANUP: "פינוי פסולת",
  OTHER: "אחר",
}

const BACK_CHARGE_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "ממתין", cls: "bg-slate-100 text-slate-800" },
  APPROVED: { label: "אושר", cls: "bg-amber-100 text-amber-900" },
  DEDUCTED: { label: "קוזז", cls: "bg-emerald-100 text-emerald-900" },
  DISPUTED: { label: "במחלוקת", cls: "bg-rose-100 text-rose-900" },
  WAIVED: { label: "ויתור", cls: "bg-slate-100 text-slate-500" },
  CANCELLED: { label: "בוטל", cls: "bg-slate-100 text-slate-500" },
}

const BILL_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "טיוטה", cls: "bg-slate-100 text-slate-800" },
  SUBMITTED: { label: "הוגש", cls: "bg-amber-100 text-amber-900" },
  APPROVED: { label: "אושר", cls: "bg-emerald-100 text-emerald-900" },
  PAID: { label: "שולם", cls: "bg-indigo-100 text-indigo-900" },
  REJECTED: { label: "נדחה", cls: "bg-rose-100 text-rose-900" },
}

const RETENTION_TYPE: Record<string, string> = {
  HOLD: "החזקה",
  RELEASE: "שחרור",
  FORFEITURE: "חילוט",
}

const RETENTION_TONE: Record<string, string> = {
  HOLD: "text-slate-800",
  RELEASE: "text-emerald-800",
  FORFEITURE: "text-rose-800",
}

export function ContractWorkspaceTabs({
  boqLines,
  amendments,
  bills,
  retention,
  backCharges,
  editableBill,
}: Props) {
  return (
    <Tabs defaultValue="boq" dir="rtl" className="w-full">
      <TabsList>
        <TabsTrigger value="boq">כתב כמויות ({boqLines.length})</TabsTrigger>
        <TabsTrigger value="amendments">
          חריגים ותוספות ({amendments.length})
        </TabsTrigger>
        <TabsTrigger value="bills">חשבונות מוגשים ({bills.length})</TabsTrigger>
        <TabsTrigger value="retention">עכבונות ({retention.length})</TabsTrigger>
        <TabsTrigger value="backcharges">קיזוזים ({backCharges.length})</TabsTrigger>
      </TabsList>

      {/* ── BOQ ────────────────────────────────────────────────────────── */}
      <TabsContent value="boq" className="mt-3">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-2 py-2 text-start">#</th>
                <th className="px-2 py-2 text-start">סעיף</th>
                <th className="px-2 py-2 text-start">תיאור</th>
                <th className="px-2 py-2 text-start">יח׳</th>
                <th className="px-2 py-2 text-end">כמות</th>
                <th className="px-2 py-2 text-end">מחיר ליחידה</th>
                <th className="px-2 py-2 text-end">סה&quot;כ שורה</th>
              </tr>
            </thead>
            <tbody>
              {boqLines.map((b) => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 font-mono text-slate-500">
                    {b.line_no}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{b.section_code}</td>
                  <td className="px-2 py-1.5">{b.description}</td>
                  <td className="px-2 py-1.5">{b.uom}</td>
                  <td className="px-2 py-1.5 text-end font-mono">{b.quantity}</td>
                  <td className="px-2 py-1.5 text-end font-mono">
                    {ILS.format(b.unit_price)}
                  </td>
                  <td className="px-2 py-1.5 text-end font-mono font-semibold">
                    {ILS.format(b.total_line_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TabsContent>

      {/* ── Amendments ──────────────────────────────────────────────────── */}
      <TabsContent value="amendments" className="mt-3">
        {amendments.length === 0 ? (
          <EmptyState message="אין חריגים או תוספות לחוזה זה." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-2 py-2 text-start">#</th>
                  <th className="px-2 py-2 text-start">סוג</th>
                  <th className="px-2 py-2 text-start">תיאור</th>
                  <th className="px-2 py-2 text-end">סכום</th>
                  <th className="px-2 py-2 text-center">סטטוס</th>
                  <th className="px-2 py-2 text-start">תאריך חתימה</th>
                </tr>
              </thead>
              <tbody>
                {amendments.map((a) => {
                  const st = AMENDMENT_STATUS[a.status] ?? {
                    label: a.status,
                    cls: "bg-slate-100",
                  }
                  return (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-mono text-slate-500">
                        {a.amendment_number}
                      </td>
                      <td className="px-2 py-1.5">
                        {AMENDMENT_TYPE[a.amendment_type] ?? a.amendment_type}
                      </td>
                      <td className="px-2 py-1.5">
                        <div>{a.description}</div>
                        {a.justification ? (
                          <div className="text-[10px] text-slate-500">
                            {a.justification}
                          </div>
                        ) : null}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-end font-mono font-semibold ${a.value_delta < 0 ? "text-rose-700" : "text-emerald-700"}`}
                      >
                        {a.value_delta > 0 ? "+" : ""}
                        {ILS.format(a.value_delta)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        {a.signed_at
                          ? dateFmt.format(new Date(a.signed_at))
                          : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>

      {/* ── Bills (with live builder for the editable one) ─────────────── */}
      <TabsContent value="bills" className="mt-3 space-y-4">
        {editableBill ? (
          <ProgressCertificateBuilder
            billId={editableBill.id}
            billNumber={editableBill.billNumber}
            status={editableBill.status}
            retentionPct={editableBill.retentionPct}
            insurancePct={editableBill.insurancePct}
            vatPct={editableBill.vatPct}
            previousBilled={editableBill.previousBilled}
            boqLines={editableBill.boqLines}
            initialLines={editableBill.initialLines}
            initialTotals={editableBill.initialTotals}
          />
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-2 py-2 text-start">#</th>
                <th className="px-2 py-2 text-start">חודש</th>
                <th className="px-2 py-2 text-start">תאריך</th>
                <th className="px-2 py-2 text-end">בוצע מצטבר</th>
                <th className="px-2 py-2 text-end">לתשלום</th>
                <th className="px-2 py-2 text-end">סה&quot;כ עם מע&quot;מ</th>
                <th className="px-2 py-2 text-center">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => {
                const st = BILL_STATUS[b.status] ?? {
                  label: b.status,
                  cls: "bg-slate-100",
                }
                return (
                  <tr key={b.id} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-mono text-slate-500">
                      #{b.bill_number}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{b.execution_month}</td>
                    <td className="px-2 py-1.5">
                      {dateFmt.format(new Date(b.bill_date))}
                    </td>
                    <td className="px-2 py-1.5 text-end font-mono">
                      {ILS.format(b.cumulative_executed_amount)}
                    </td>
                    <td className="px-2 py-1.5 text-end font-mono">
                      {ILS.format(b.amount_to_pay)}
                    </td>
                    <td className="px-2 py-1.5 text-end font-mono font-semibold">
                      {ILS.format(b.grand_total_amount)}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${st.cls}`}
                      >
                        {st.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </TabsContent>

      {/* ── Retention ──────────────────────────────────────────────────── */}
      <TabsContent value="retention" className="mt-3">
        {retention.length === 0 ? (
          <EmptyState message="אין תנועות עכבון לחוזה זה." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-2 py-2 text-start">תאריך</th>
                  <th className="px-2 py-2 text-start">סוג</th>
                  <th className="px-2 py-2 text-end">סכום</th>
                  <th className="px-2 py-2 text-start">אבן דרך</th>
                  <th className="px-2 py-2 text-start">הערות</th>
                </tr>
              </thead>
              <tbody>
                {retention.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">
                      {dateFmt.format(new Date(r.entry_date))}
                    </td>
                    <td
                      className={`px-2 py-1.5 font-semibold ${RETENTION_TONE[r.entry_type] ?? ""}`}
                    >
                      {RETENTION_TYPE[r.entry_type] ?? r.entry_type}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-end font-mono font-semibold ${RETENTION_TONE[r.entry_type] ?? ""}`}
                    >
                      {r.entry_type === "HOLD" ? "+" : "−"}
                      {ILS.format(r.amount)}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-slate-600">
                      {r.milestone ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-slate-700">
                      {r.notes ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>

      {/* ── Back-charges ───────────────────────────────────────────────── */}
      <TabsContent value="backcharges" className="mt-3">
        {backCharges.length === 0 ? (
          <EmptyState message="אין קיזוזים מיוחדים לחוזה זה." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-2 py-2 text-start">#</th>
                  <th className="px-2 py-2 text-start">סוג</th>
                  <th className="px-2 py-2 text-start">תאריך</th>
                  <th className="px-2 py-2 text-start">תיאור</th>
                  <th className="px-2 py-2 text-end">סכום</th>
                  <th className="px-2 py-2 text-center">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {backCharges.map((bc) => {
                  const st = BACK_CHARGE_STATUS[bc.status] ?? {
                    label: bc.status,
                    cls: "bg-slate-100",
                  }
                  return (
                    <tr key={bc.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-mono text-slate-500">
                        {bc.charge_number}
                      </td>
                      <td className="px-2 py-1.5">
                        {BACK_CHARGE_TYPE[bc.charge_type] ?? bc.charge_type}
                      </td>
                      <td className="px-2 py-1.5">
                        {dateFmt.format(new Date(bc.charge_date))}
                      </td>
                      <td className="px-2 py-1.5">
                        <div>{bc.description}</div>
                        {bc.source_doc_ref ? (
                          <div className="font-mono text-[10px] text-slate-500">
                            {bc.source_doc_ref}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 text-end font-mono font-semibold text-rose-700">
                        −{ILS.format(bc.amount)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
      {message}
    </div>
  )
}
