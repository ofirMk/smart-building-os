"use client"

import React, { useMemo, useState } from "react"
import { FileOutput, Landmark } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { generateMasavFileAction } from "@/lib/holden-erp/payment-actions"
import type { PendingPaymentRow } from "@/types/holden-finance"

type MasavClientProps = {
  pendingPayments: PendingPaymentRow[]
}

export function MasavClient({ pendingPayments }: MasavClientProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [isGenerating, setIsGenerating] = useState(false)

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(pendingPayments.map((r) => r.id)))
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const { selectedCount, selectedTotal } = useMemo(() => {
    let sum = 0
    let count = 0
    for (const row of pendingPayments) {
      if (!selectedIds.has(row.id)) continue
      count += 1
      sum += Number(row.amount) || 0
    }
    return {
      selectedCount: count,
      selectedTotal: Math.round(sum * 100) / 100,
    }
  }, [pendingPayments, selectedIds])

  const ils = useMemo(
    () =>
      new Intl.NumberFormat("he-IL", {
        style: "currency",
        currency: "ILS",
        minimumFractionDigits: 2,
      }),
    []
  )

  const handleGenerateFile = async () => {
    if (selectedIds.size === 0) return
    setIsGenerating(true)
    try {
      const ids = [...selectedIds]
      const result = await generateMasavFileAction(ids)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const blob = new Blob([result.fileContent], {
        type: "text/plain;charset=utf-8",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "")
      a.href = url
      a.download = `masav_run_${ymd}.txt`
      a.rel = "noopener"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setSelectedIds(new Set())
      toast.success("הקובץ הורד בהצלחה")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה ביצירת הקובץ")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={selectAll}>
            בחר הכל
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearSelection}
          >
            נקה בחירה
          </Button>
        </div>
        <Button
          type="button"
          disabled={selectedCount === 0 || isGenerating}
          className="gap-2"
          onClick={handleGenerateFile}
        >
          <FileOutput className="size-4" aria-hidden />
          {isGenerating ? "יוצר קובץ…" : "המשך ליצירת קובץ"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
        <div className="max-h-[min(60vh,520px)] overflow-auto">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 z-10 bg-background text-xs text-slate-500 shadow-sm">
              <tr>
                <th className="w-10 p-2" />
                <th className="p-2">תאריך</th>
                <th className="p-2">קבלן / צד</th>
                <th className="p-2">חוזה</th>
                <th className="p-2">פרויקט</th>
                <th className="p-2">מקור</th>
                <th className="p-2">קוד חשבון</th>
                <th className="p-2 text-left">סכום לתשלום</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pendingPayments.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="p-10 text-center text-slate-400"
                  >
                    אין דוחות מאושרים ממתינים לתשלום
                  </td>
                </tr>
              ) : (
                pendingPayments.map((row) => {
                  const checked = selectedIds.has(row.id)
                  return (
                    <tr
                      key={row.id}
                      onClick={() => toggleRow(row.id)}
                      className={`cursor-pointer transition-colors ${
                        checked
                          ? "bg-sky-50 hover:bg-sky-100"
                          : "hover:bg-background"
                      }`}
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          readOnly
                          tabIndex={-1}
                          className="pointer-events-none h-4 w-4 rounded border-slate-300 text-sky-600"
                        />
                      </td>
                      <td className="whitespace-nowrap p-2">
                        {row.date
                          ? new Date(row.date).toLocaleDateString("he-IL")
                          : "—"}
                      </td>
                      <td className="max-w-[180px] truncate p-2 font-medium">
                        {row.contractorName}
                      </td>
                      <td className="p-2">{row.contractNumber || "—"}</td>
                      <td className="max-w-[160px] truncate p-2 text-slate-600">
                        {row.projectName}
                      </td>
                      <td className="p-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            row.paymentSource === "procurement_masav"
                              ? "bg-emerald-500/15 text-emerald-700"
                              : "bg-sky-500/15 text-sky-700"
                          }`}
                        >
                          {row.paymentSource === "procurement_masav"
                            ? "רכש"
                            : "דוח"}
                        </span>
                      </td>
                      <td className="font-mono text-xs p-2 text-slate-600">
                        {row.glAccountCode ?? "—"}
                      </td>
                      <td className="p-2 text-left font-medium tabular-nums">
                        {ils.format(row.amount)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-background px-4 py-3">
        <div className="flex items-center gap-2 text-slate-600">
          <Landmark className="size-5 text-slate-400" aria-hidden />
          <span className="text-sm">
            נבחרו{" "}
            <strong className="text-foreground">
              {selectedCount}
            </strong>{" "}
            דוחות
          </span>
        </div>
        <div className="text-start">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            סה״כ לריצת תשלום
          </p>
          <p className="text-xl font-bold tabular-nums text-foreground">
            {ils.format(selectedTotal)}
          </p>
        </div>
      </div>
    </div>
  )
}
