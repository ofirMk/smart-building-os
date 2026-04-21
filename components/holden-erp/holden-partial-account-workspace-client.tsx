"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { HoldenA4Paper, HoldenSplitDocumentShell } from "@/components/holden-erp/holden-split-document-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  holdenApplyDefaultRetainageAndRecalculate,
  holdenApproveSubcontractorPartialAccount,
  holdenMarkPartialAccountPaid,
  holdenMarkPartialAccountSent,
  holdenSubmitPartialAccountForApproval,
} from "@/lib/holden-erp/partial-account-bpm-actions"
import type { HoldenPartialDocument, HoldenPartialLineRow } from "@/lib/holden-erp/loaders"
import { calculatePartialAccount } from "@/lib/marker-ofek/partial-account-actions"

function roundMoney(n: number) {
  return Math.round(n * 100) / 100
}

export function HoldenPartialAccountWorkspaceClient({
  initial,
}: {
  initial: HoldenPartialDocument
}) {
  const router = useRouter()
  const [lines, setLines] = React.useState<HoldenPartialLineRow[]>(initial.lines)
  const linesRef = React.useRef(lines)
  React.useEffect(() => {
    linesRef.current = lines
  }, [lines])
  const [header, setHeader] = React.useState({
    retention: initial.partial.retention_deduction,
    paymentDue: initial.partial.payment_due,
    cumulative: initial.partial.total_cumulative_amount,
    periodIndexed: initial.partial.period_work_indexed,
    status: initial.partial.status,
  })
  const [busy, setBusy] = React.useState<string | null>(null)

  React.useEffect(() => {
    setLines(initial.lines)
    setHeader({
      retention: initial.partial.retention_deduction,
      paymentDue: initial.partial.payment_due,
      cumulative: initial.partial.total_cumulative_amount,
      periodIndexed: initial.partial.period_work_indexed,
      status: initial.partial.status,
    })
  }, [initial])

  async function recalc(linePatches: Array<{ id: string; quantity_previous: number; quantity_current: number }>) {
    setBusy("calc")
    const res = await calculatePartialAccount({
      partialAccountId: initial.partial.id,
      linePatches,
    })
    setBusy(null)
    if (!res.ok) {
      window.alert(res.error)
      return
    }
    setHeader((h) => ({
      ...h,
      retention: res.data.retentionDeduction,
      paymentDue: res.data.paymentDue,
      cumulative: res.data.totalCumulativeAmount,
      periodIndexed: res.data.periodWorkIndexed,
    }))
    router.refresh()
  }

  function updateLine(
    id: string,
    field: "quantity_previous" | "quantity_current",
    value: number
  ) {
    setLines((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    )
  }

  async function onBlurLine(lineId: string) {
    const row = linesRef.current.find((r) => r.id === lineId)
    if (!row) return
    await recalc([
      {
        id: row.id,
        quantity_previous: row.quantity_previous,
        quantity_current: row.quantity_current,
      },
    ])
  }

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(label)
    const r = await fn()
    setBusy(null)
    if (!r.ok) window.alert(r.error ?? "שגיאה")
    else window.location.reload()
  }

  const c = initial.contract
  const pa = initial.partial

  return (
    <HoldenSplitDocumentShell
      title={`חשבון חלקי מס׳ ${pa.account_number}`}
      subtitle={[c.project?.name, c.entity?.name].filter(Boolean).join(" · ")}
      rightPane={
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 shadow-sm">
            <h2 className="text-sm font-medium text-slate-200">סטטוס BPM</h2>
            <p className="mt-2 text-lg font-semibold text-emerald-400/90">{header.status}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 bg-slate-900/40 text-slate-100"
                disabled={!!busy}
                onClick={() =>
                  run("submit", () => holdenSubmitPartialAccountForApproval(pa.id))
                }
              >
                שלח לאישור
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-500"
                disabled={!!busy}
                onClick={() =>
                  run("approve", () => holdenApproveSubcontractorPartialAccount(pa.id))
                }
              >
                אשר
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 bg-slate-900/40 text-slate-100"
                disabled={!!busy}
                onClick={() => run("sent", () => holdenMarkPartialAccountSent(pa.id))}
              >
                סמן נשלח
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 bg-slate-900/40 text-slate-100"
                disabled={!!busy}
                onClick={() => run("paid", () => holdenMarkPartialAccountPaid(pa.id))}
              >
                סמן שולם
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="bg-slate-800 text-slate-100"
                disabled={!!busy}
                onClick={() =>
                  run("ret", () =>
                    holdenApplyDefaultRetainageAndRecalculate(pa.id, pa.contract_id)
                  )
                }
              >
                עיכבון 5%
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 shadow-sm">
            <h2 className="text-sm font-medium text-slate-200">סיכומים</h2>
            <dl className="mt-3 grid gap-2 text-sm text-slate-400">
              <div className="flex justify-between gap-4">
                <dt>עיכבון</dt>
                <dd className="tabular-nums text-slate-200">
                  ₪{roundMoney(header.retention).toLocaleString("he-IL")}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>נטו לתשלום</dt>
                <dd className="tabular-nums text-emerald-400/90">
                  ₪{roundMoney(header.paymentDue).toLocaleString("he-IL")}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>מצטבר מאושר</dt>
                <dd className="tabular-nums text-slate-200">
                  ₪{roundMoney(header.cumulative).toLocaleString("he-IL")}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2 shadow-sm">
            <h2 className="px-2 py-2 text-sm font-medium text-slate-200">שורות ביצוע</h2>
            <div className="overflow-x-auto rounded-lg border border-slate-800/80">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">סעיף</TableHead>
                    <TableHead className="text-slate-400">תיאור</TableHead>
                    <TableHead className="text-slate-400">% קודם</TableHead>
                    <TableHead className="text-slate-400">% נוכחי</TableHead>
                    <TableHead className="text-slate-400">תקופה ₪</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((row) => (
                    <TableRow
                      key={row.id}
                      className="border-slate-800/90 hover:bg-slate-900/40"
                    >
                      <TableCell className="font-mono text-xs text-slate-300">
                        {row.section_number}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs text-slate-300">
                        {row.description}
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          type="number"
                          className="h-8 border-slate-800 bg-slate-900/50 text-xs"
                          value={row.quantity_previous}
                          onChange={(e) =>
                            updateLine(
                              row.id,
                              "quantity_previous",
                              Math.min(
                                100,
                                Math.max(0, parseFloat(e.target.value) || 0)
                              )
                            )
                          }
                          onBlur={() => onBlurLine(row.id)}
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          type="number"
                          className="h-8 border-slate-800 bg-slate-900/50 text-xs"
                          value={row.quantity_current}
                          onChange={(e) =>
                            updateLine(
                              row.id,
                              "quantity_current",
                              Math.min(
                                150,
                                Math.max(0, parseFloat(e.target.value) || 0)
                              )
                            )
                          }
                          onBlur={() => onBlurLine(row.id)}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums text-xs text-slate-400">
                        {row.line_total_price != null
                          ? `₪${roundMoney(row.line_total_price).toLocaleString("he-IL")}`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="px-2 py-2 text-xs text-slate-500">
              {busy === "calc" ? "מחשב…" : "אחוזים מצטברים לשורה; עריכה מעדכנת מסמך בזמן אמת"}
            </p>
          </div>
        </div>
      }
      leftPane={
        <HoldenA4Paper>
          <div className="space-y-6 text-sm leading-relaxed">
            <div className="border-b border-slate-200 pb-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                חשבון חלקי
              </p>
              <h2 className="mt-2 text-lg font-bold text-foreground">
                מס׳ {pa.account_number}{" "}
                <span className="text-base font-normal text-slate-600">
                  · {c.project?.name}
                </span>
              </h2>
              <p className="text-slate-600">{c.entity?.name}</p>
            </div>
            <table className="w-full text-xs text-slate-800">
              <thead>
                <tr className="border-b border-slate-200 text-right">
                  <th className="py-1 pe-2">סעיף</th>
                  <th className="py-1">ביצוע %</th>
                  <th className="py-1">תקופה</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-1.5 pe-2 font-mono text-[11px]">
                      {row.section_number}
                    </td>
                    <td className="py-1.5 tabular-nums">{row.quantity_current}%</td>
                    <td className="py-1.5 text-start tabular-nums">
                      {row.line_total_price != null
                        ? `₪${roundMoney(row.line_total_price).toLocaleString("he-IL")}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-2 border-t border-slate-200 pt-4 text-foreground">
              <div className="flex justify-between text-sm">
                <span>עיכבון</span>
                <span className="tabular-nums font-medium">
                  ₪{roundMoney(header.retention).toLocaleString("he-IL")}
                </span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>לתשלום</span>
                <span className="tabular-nums text-emerald-700">
                  ₪{roundMoney(header.paymentDue).toLocaleString("he-IL")}
                </span>
              </div>
            </div>
          </div>
        </HoldenA4Paper>
      }
    />
  )
}
