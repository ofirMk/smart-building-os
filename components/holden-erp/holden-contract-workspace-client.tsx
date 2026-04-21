"use client"

import * as React from "react"

import { HoldenA4Paper, HoldenSplitDocumentShell } from "@/components/holden-erp/holden-split-document-shell"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { holdenUpdateContractBoqLine } from "@/lib/holden-erp/contract-boq-actions"
import type { HoldenContractBoqRow, HoldenContractDocument } from "@/lib/holden-erp/loaders"
function roundMoney(n: number) {
  return Math.round(n * 100) / 100
}

export function HoldenContractWorkspaceClient({
  initial,
}: {
  initial: HoldenContractDocument
}) {
  const [rows, setRows] = React.useState<HoldenContractBoqRow[]>(initial.boqLines)
  const [savingId, setSavingId] = React.useState<string | null>(null)
  const committedRef = React.useRef<Map<string, HoldenContractBoqRow>>(new Map())

  React.useEffect(() => {
    setRows(initial.boqLines)
    const m = new Map<string, HoldenContractBoqRow>()
    for (const r of initial.boqLines) m.set(r.id, { ...r })
    committedRef.current = m
  }, [initial.boqLines])

  const total = React.useMemo(() => {
    return roundMoney(
      rows.reduce((s, r) => {
        const q = Number(r.quantity) || 0
        const p = Number(r.unit_price) || 0
        return s + q * p
      }, 0)
    )
  }, [rows])

  async function persist(lineId: string, next: HoldenContractBoqRow) {
    const prev = committedRef.current.get(lineId)
    if (!prev) return
    setSavingId(lineId)
    const res = await holdenUpdateContractBoqLine(initial.contract.id, lineId, {
      section_number: next.section_number,
      description: next.description,
      unit: next.unit ?? "",
      quantity: next.quantity ?? 0,
      unit_price: next.unit_price ?? 0,
    })
    setSavingId(null)
    if (!res.ok) {
      setRows((r) => r.map((x) => (x.id === lineId ? { ...prev } : x)))
      window.alert(res.error)
    } else {
      committedRef.current.set(lineId, { ...next })
    }
  }

  function updateRow(lineId: string, patch: Partial<HoldenContractBoqRow>) {
    setRows((prev) => {
      const copy = prev.map((r) => (r.id === lineId ? { ...r, ...patch } : r))
      return copy
    })
  }

  const c = initial.contract

  return (
    <HoldenSplitDocumentShell
      title={`חוזה — ${c.entity?.name ?? "ללא ישות"}`}
      subtitle={[c.project?.name, c.makat ? `מק״ט ${c.makat}` : null]
        .filter(Boolean)
        .join(" · ")}
      rightPane={
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 shadow-sm">
            <h2 className="text-sm font-medium text-slate-200">כותרת חוזה</h2>
            <dl className="mt-3 grid gap-2 text-sm text-slate-400">
              <div className="flex justify-between gap-4">
                <dt>סטטוס</dt>
                <dd className="text-emerald-400/90">{c.status}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>עיכבון %</dt>
                <dd>{c.retention_pct}%</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>מקדמה</dt>
                <dd>₪{roundMoney(c.advance_payment_amount).toLocaleString("he-IL")}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>מקדם צמידה</dt>
                <dd>{c.index_coefficient ?? 1}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2 shadow-sm">
            <div className="flex items-center justify-between px-2 py-2">
              <h2 className="text-sm font-medium text-slate-200">כתב כמויות</h2>
              <span className="text-xs text-slate-500">{rows.length} שורות</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-800/80">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">סעיף</TableHead>
                    <TableHead className="text-slate-400">תיאור</TableHead>
                    <TableHead className="text-slate-400">יח׳</TableHead>
                    <TableHead className="text-slate-400">כמות</TableHead>
                    <TableHead className="text-slate-400">מחיר</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="border-slate-800/90 hover:bg-slate-900/40"
                    >
                      <TableCell className="p-1">
                        <Input
                          className="h-8 border-slate-800 bg-slate-900/50 text-xs"
                          value={row.section_number}
                          onChange={(e) =>
                            updateRow(row.id, { section_number: e.target.value })
                          }
                          onBlur={() => void persist(row.id, row)}
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          className="h-8 border-slate-800 bg-slate-900/50 text-xs"
                          value={row.description}
                          onChange={(e) =>
                            updateRow(row.id, { description: e.target.value })
                          }
                          onBlur={() => void persist(row.id, row)}
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          className="h-8 border-slate-800 bg-slate-900/50 text-xs"
                          value={row.unit ?? ""}
                          onChange={(e) => updateRow(row.id, { unit: e.target.value })}
                          onBlur={() => void persist(row.id, row)}
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          type="number"
                          className="h-8 border-slate-800 bg-slate-900/50 text-xs"
                          value={row.quantity ?? ""}
                          onChange={(e) =>
                            updateRow(row.id, {
                              quantity: parseFloat(e.target.value) || 0,
                            })
                          }
                          onBlur={() => void persist(row.id, row)}
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          type="number"
                          className="h-8 border-slate-800 bg-slate-900/50 text-xs"
                          value={row.unit_price ?? ""}
                          onChange={(e) =>
                            updateRow(row.id, {
                              unit_price: parseFloat(e.target.value) || 0,
                            })
                          }
                          onBlur={() => void persist(row.id, row)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="px-2 py-2 text-xs text-slate-500">
              {savingId ? "שומר שורה…" : "שינויים נשמרים ביציאה משדה"}
            </p>
          </div>
        </div>
      }
      leftPane={
        <HoldenA4Paper>
          <div className="space-y-6 text-sm leading-relaxed">
            <div className="border-b border-slate-200 pb-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                חוזה / כתב כמויות
              </p>
              <h2 className="mt-2 text-lg font-bold text-foreground">
                {c.project?.name ?? "פרויקט"}
              </h2>
              <p className="text-slate-600">{c.entity?.name}</p>
            </div>
            <table className="w-full text-xs text-slate-800">
              <thead>
                <tr className="border-b border-slate-200 text-right">
                  <th className="py-1 pe-2">סעיף</th>
                  <th className="py-1">תיאור</th>
                  <th className="py-1">סה״כ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const lineTotal = roundMoney(
                    (Number(row.quantity) || 0) * (Number(row.unit_price) || 0)
                  )
                  return (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="py-1.5 pe-2 font-mono text-[11px]">
                        {row.section_number}
                      </td>
                      <td className="py-1.5 text-[11px]">{row.description}</td>
                      <td className="py-1.5 text-start font-medium tabular-nums">
                        ₪{lineTotal.toLocaleString("he-IL")}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="flex justify-between border-t border-slate-200 pt-4 text-base font-semibold text-foreground">
              <span>סה״כ חוזה</span>
              <span className="tabular-nums text-emerald-700">
                ₪{total.toLocaleString("he-IL")}
              </span>
            </div>
          </div>
        </HoldenA4Paper>
      }
    />
  )
}
