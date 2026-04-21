"use client"

import * as React from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  deleteOverheadRegistryItem,
  listOverheadRegistryItems,
  upsertOverheadRegistryItem,
  type MoOverheadRegistryRow,
} from "@/lib/marker-ofek/overhead-registry-actions"
import {
  setCompanyOverheadAllocationMethod,
  type CompanyGlobalOverheadMethod,
} from "@/lib/marker-ofek/finance-company-settings-actions"
import { overheadAllocationMethodLabel } from "@/lib/marker-ofek/project-overhead-loading"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn, formatError } from "@/lib/utils"

const CATEGORY_LABELS: Record<MoOverheadRegistryRow["category"], string> = {
  administrative: "מנהלי",
  operational: "תפעולי",
  marketing: "שיווק",
}

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

type Props = {
  initialRows: MoOverheadRegistryRow[]
  isAdmin: boolean
  canSetAllocation: boolean
  initialMethod: CompanyGlobalOverheadMethod
}

export function OverheadRegistryClient({
  initialRows,
  isAdmin,
  canSetAllocation,
  initialMethod,
}: Props) {
  const [rows, setRows] = React.useState(initialRows)
  const [busy, setBusy] = React.useState(false)
  const [method, setMethod] =
    React.useState<CompanyGlobalOverheadMethod>(initialMethod)
  const [savingMethod, setSavingMethod] = React.useState(false)

  const [draft, setDraft] = React.useState({
    label: "",
    category: "administrative" as MoOverheadRegistryRow["category"],
    monthly_amount_nis: "",
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: "",
    sort_order: "0",
  })

  async function reload() {
    const res = await listOverheadRegistryItems()
    if (res.ok) setRows(res.rows)
    else toast.error(res.error)
  }

  async function onSaveMethod(next: CompanyGlobalOverheadMethod) {
    setSavingMethod(true)
    try {
      const res = await setCompanyOverheadAllocationMethod(next)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setMethod(next)
      toast.success("מדיניות העמסה עודכנה")
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSavingMethod(false)
    }
  }

  async function onAdd() {
    if (!isAdmin) return
    setBusy(true)
    try {
      const res = await upsertOverheadRegistryItem({
        label: draft.label,
        category: draft.category,
        monthly_amount_nis: Number(draft.monthly_amount_nis) || 0,
        effective_from: draft.effective_from,
        effective_to: draft.effective_to.trim() || null,
        sort_order: Number(draft.sort_order) || 0,
        is_active: true,
        notes: null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("נשמר")
      setDraft((d) => ({
        ...d,
        label: "",
        monthly_amount_nis: "",
      }))
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(id: string) {
    if (!isAdmin) return
    if (!confirm("למחוק שורה מרישום העקיפות?")) return
    setBusy(true)
    try {
      const res = await deleteOverheadRegistryItem(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("נמחק")
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const pool = rows
    .filter((r) => r.is_active)
    .reduce((s, r) => s + (Number(r.monthly_amount_nis) || 0), 0)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-16" dir="rtl">
      <header className="pharmacy-hero-card border-slate-100 p-6 md:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-700">
          Diamond ERP — עקיפות
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-indigo-950">
          רישום עלויות קבועות והעמסה לפרויקטים
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          סכומים חודשיים לפי קטגוריה (מנהלי / תפעולי / שיווק). ההעמסה לפרויקט מופיעה בדשבורד
          הנהלה כ־&quot;רווח נטו אחרי עקיפות&quot;.
        </p>
        <p className="mt-4 font-currency-mono text-lg font-semibold tabular-nums text-indigo-950">
          סה״כ פעיל לחודש: {ils.format(pool)}
        </p>
      </header>

      {canSetAllocation ? (
        <section className="rounded-xl border border-slate-100 bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-indigo-950">מדיניות העמסה (אופיר)</h2>
          <p className="mt-1 text-xs text-slate-500">
            חלוקת סכום העקיפות בין פרויקטים פעילים במסנן הנוכחי.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label>שיטה</Label>
              <Select
                value={method}
                disabled={savingMethod}
                onValueChange={(v) =>
                  void onSaveMethod((v ?? "revenue_pct") as CompanyGlobalOverheadMethod)
                }
              >
                <SelectTrigger className="w-[220px] border-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue_pct">
                    {overheadAllocationMethodLabel("revenue_pct")}
                  </SelectItem>
                  <SelectItem value="labor_hours">
                    {overheadAllocationMethodLabel("labor_hours")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {savingMethod ? (
              <Loader2 className="size-4 animate-spin text-indigo-600" aria-hidden />
            ) : null}
          </div>
        </section>
      ) : null}

      {isAdmin ? (
        <section className="rounded-xl border border-slate-100 bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-indigo-950">הוספת שורה</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-2 sm:col-span-2">
              <Label>תיאור</Label>
              <Input
                value={draft.label}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder="למשל: שכירות משרדים"
              />
            </div>
            <div className="grid gap-2">
              <Label>קטגוריה</Label>
              <Select
                value={draft.category}
                onValueChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    category: v as MoOverheadRegistryRow["category"],
                  }))
                }
              >
                <SelectTrigger className="border-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as MoOverheadRegistryRow["category"][]).map(
                    (k) => (
                      <SelectItem key={k} value={k}>
                        {CATEGORY_LABELS[k]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>סכום חודשי ₪</Label>
              <Input
                className="font-currency-mono"
                inputMode="decimal"
                value={draft.monthly_amount_nis}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, monthly_amount_nis: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>מתאריך</Label>
              <Input
                type="date"
                className="font-currency-mono"
                value={draft.effective_from}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, effective_from: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>עד תאריך (ריק = פתוח)</Label>
              <Input
                type="date"
                className="font-currency-mono"
                value={draft.effective_to}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, effective_to: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>סדר</Label>
              <Input
                className="font-currency-mono"
                value={draft.sort_order}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, sort_order: e.target.value }))
                }
              />
            </div>
          </div>
          <Button
            type="button"
            className="mt-4 bg-indigo-950 text-white hover:bg-indigo-900"
            disabled={busy || !draft.label.trim()}
            onClick={() => void onAdd()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            שמירה
          </Button>
        </section>
      ) : (
        <p className="text-sm text-slate-500">עריכת הרישום זמינה לאדמין בלבד.</p>
      )}

      <section className="overflow-x-auto rounded-xl border border-slate-100 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-100 hover:bg-transparent">
              <TableHead>תיאור</TableHead>
              <TableHead>קטגוריה</TableHead>
              <TableHead className="text-end font-currency-mono">חודשי ₪</TableHead>
              <TableHead className="font-currency-mono">מתאריך</TableHead>
              <TableHead className="font-currency-mono">עד</TableHead>
              <TableHead>פעיל</TableHead>
              {isAdmin ? <TableHead className="w-12" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-slate-500">
                  אין שורות — הוסיפו אחרי מיגרציה או הרשאות.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id} className="border-slate-100">
                  <TableCell className="font-medium text-indigo-950">{r.label}</TableCell>
                  <TableCell>{CATEGORY_LABELS[r.category]}</TableCell>
                  <TableCell className="text-end font-currency-mono tabular-nums">
                    {ils.format(Number(r.monthly_amount_nis) || 0)}
                  </TableCell>
                  <TableCell className="font-currency-mono text-sm">{r.effective_from}</TableCell>
                  <TableCell className="font-currency-mono text-sm">
                    {r.effective_to ?? "—"}
                  </TableCell>
                  <TableCell>{r.is_active ? "כן" : "לא"}</TableCell>
                  {isAdmin ? (
                    <TableCell>
                      <button
                        type="button"
                        className={cn(
                          "rounded-md p-2 text-rose-600 hover:bg-rose-50",
                          busy && "pointer-events-none opacity-40"
                        )}
                        aria-label="מחיקה"
                        onClick={() => void onDelete(r.id)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}
