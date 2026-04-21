"use client"

import * as React from "react"
import { AlertTriangle, Loader2, ShieldAlert, X } from "lucide-react"
import { z } from "zod"

import { apiGet } from "@/lib/utils/api-client"
import { formatVariancePct } from "@/lib/erp/pricing-logic"

const overrideRowSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  tableName: z.string(),
  documentType: z.enum(["PURCHASE_ORDER", "CHANGE_ORDER", "CLIENT_CONTRACT_LINE", "OTHER"]),
  documentId: z.string(),
  documentLabel: z.string(),
  supplierName: z.string().nullable(),
  itemLabel: z.string().nullable(),
  enteredPrice: z.coerce.number(),
  effectivePrice: z.coerce.number(),
  variance: z.coerce.number(),
  variancePct: z.coerce.number(),
  delta: z.coerce.number(),
  managerNote: z.string().nullable(),
  projectId: z.string().nullable(),
  auditPayload: z.record(z.string(), z.unknown()),
})

const overridesListSchema = z.array(overrideRowSchema)

type OverrideRow = z.infer<typeof overrideRowSchema>

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

function formatDateHe(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function documentTypeLabel(type: OverrideRow["documentType"]): string {
  if (type === "PURCHASE_ORDER") return "Purchase Order"
  if (type === "CHANGE_ORDER") return "Change Order"
  if (type === "CLIENT_CONTRACT_LINE") return "Contract Line"
  return "Audit Log"
}

export function HighRiskApprovalsWidget() {
  const [rows, setRows] = React.useState<OverrideRow[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<OverrideRow | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    setRows(null)
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const data = await apiGet<OverrideRow[]>(
          "/api/erp/dashboard/high-variance-overrides?days=30",
          { schema: overridesListSchema, signal: controller.signal }
        )
        if (controller.signal.aborted) return
        setRows(data)
        setLoading(false)
      } catch (err) {
        if (controller.signal.aborted) return
        if (err instanceof Error && err.name === "AbortError") return
        setRows(null)
        setLoading(false)
        setError(err instanceof Error ? err.message : "טעינת התראות כשלה")
      }
    })()

    return () => controller.abort()
  }, [])

  const highRiskCount = rows?.length ?? 0

  return (
    <section
      className="flex min-h-[320px] flex-col rounded-2xl border border-rose-200 bg-rose-50/40 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
      dir="rtl"
      lang="he"
    >
      <header className="flex items-center justify-between gap-2 border-b border-rose-200 bg-card/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
            <ShieldAlert className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-bold text-rose-950">
              High-Risk Approvals · אישורים חריגים
            </h2>
            <p className="text-[11px] text-rose-700/90">
              חריגות מעל 20% מול ממוצע היסטורי ב-30 הימים האחרונים
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            {highRiskCount}
          </span>
          {loading ? <Loader2 className="size-4 animate-spin text-rose-500" aria-hidden /> : null}
        </div>
      </header>

      {error ? (
        <div
          className="flex items-start gap-2 px-4 py-3 text-xs text-rose-800"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-4" aria-hidden />
          <p>{error}</p>
        </div>
      ) : rows && rows.length === 0 ? (
        <p className="m-4 rounded-xl border border-dashed border-emerald-300 bg-emerald-50 px-3 py-4 text-center text-xs text-emerald-800">
          אין חריגות מנהליות חריגות ב-30 הימים האחרונים.
        </p>
      ) : (
        <ul className="flex flex-1 flex-col gap-2 overflow-auto p-3">
          {(rows ?? []).map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setSelected(row)}
                className="grid w-full grid-cols-6 items-center gap-2 rounded-xl border border-rose-200 bg-card px-3 py-2 text-right transition-colors hover:border-rose-300 hover:bg-rose-50"
              >
                <div className="col-span-3 min-w-0">
                  <p className="truncate text-sm font-semibold text-rose-950">
                    {row.itemLabel ?? documentTypeLabel(row.documentType)}
                  </p>
                  <p className="truncate text-[11px] text-rose-700">
                    {row.supplierName ?? "—"} · {row.documentLabel}
                  </p>
                </div>
                <div className="col-span-1 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">
                    Approved
                  </p>
                  <p className="font-mono text-sm font-semibold text-slate-800">
                    {ils.format(row.enteredPrice)}
                  </p>
                </div>
                <div className="col-span-1 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">
                    vs Avg
                  </p>
                  <p className="font-mono text-sm font-semibold text-slate-800">
                    {ils.format(row.effectivePrice)}
                  </p>
                </div>
                <div className="col-span-1 text-end">
                  <span
                    className={
                      row.variance >= 0
                        ? "inline-flex items-center rounded-md border border-rose-300 bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-900"
                        : "inline-flex items-center rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900"
                    }
                  >
                    {formatVariancePct(row.variance)} vs Average
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelected(null)}
        >
          <div
            dir="rtl"
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-card p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-rose-700">
                  Audit Log · Manager Override
                </p>
                <h3 className="text-sm font-bold text-foreground">
                  {selected.itemLabel ?? documentTypeLabel(selected.documentType)}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {formatDateHe(selected.createdAt)} · {selected.supplierName ?? "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="סגור"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl border border-slate-200 bg-background p-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Approved</p>
                <p className="font-mono text-sm font-semibold text-slate-800">
                  {ils.format(selected.enteredPrice)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-background p-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Historical Avg</p>
                <p className="font-mono text-sm font-semibold text-slate-800">
                  {ils.format(selected.effectivePrice)}
                </p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-2">
                <p className="text-[10px] uppercase tracking-wider text-rose-700">Delta</p>
                <p className="font-mono text-sm font-semibold text-rose-900">
                  {ils.format(selected.delta)}
                  <span className="ms-1 text-[10px] text-rose-700">
                    ({formatVariancePct(selected.variance)})
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Manager Note
              </p>
              <p className="mt-1 rounded-xl border border-slate-200 bg-background p-2 text-sm text-slate-800">
                {selected.managerNote ??
                  "לא נרשמה הערת מנהל ידנית. להלן תיעוד האודיט המלא:"}
              </p>
              {selected.managerNote ? null : (
                <pre className="mt-2 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-slate-900/90 p-2 text-[11px] text-slate-100">
                  {JSON.stringify(selected.auditPayload, null, 2)}
                </pre>
              )}
            </div>

            <footer className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
              <span>
                Audit ID: <span className="font-mono text-slate-700">{selected.id.slice(0, 8)}</span>
              </span>
              <span>
                {documentTypeLabel(selected.documentType)} · {selected.documentLabel}
              </span>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  )
}
