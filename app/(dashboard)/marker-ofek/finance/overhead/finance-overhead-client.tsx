"use client"

import * as React from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import type { MoOverheadRegistryRow } from "@/lib/marker-ofek/overhead-registry-actions"
import {
  deleteOverheadRegistryItem,
  listOverheadRegistryItems,
  upsertOverheadRegistryItem,
} from "@/lib/marker-ofek/overhead-registry-actions"
import type { CompanyGlobalOverheadMethod } from "@/lib/marker-ofek/finance-company-settings-actions"
import { setCompanyOverheadAllocationMethod } from "@/lib/marker-ofek/finance-company-settings-actions"
import { upsertProjectOverheadPolicy } from "@/lib/marker-ofek/finance-reporting-actions"
import { buttonVariants } from "@/components/ui/button-variants"
import { Input } from "@/components/ui/input"
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

const CATEGORY_OPTS: { v: MoOverheadRegistryRow["category"]; label: string }[] = [
  { v: "administrative", label: "הנהלה כללית" },
  { v: "operational", label: "תפעול" },
  { v: "marketing", label: "שיווק" },
]

type ProjectRow = {
  id: string
  name: string | null
  internal_project_code: string | null
}

type PolicyRow = {
  project_id: string
  method: string
  fixed_rate_percent: number
}

export function FinanceOverheadClient({
  initialRegistry,
  initialMethod,
  initialProjects,
  initialPolicies,
}: {
  initialRegistry: MoOverheadRegistryRow[]
  initialMethod: CompanyGlobalOverheadMethod
  initialProjects: ProjectRow[]
  initialPolicies: PolicyRow[]
}) {
  const [rows, setRows] = React.useState(initialRegistry)
  const [globalMethod, setGlobalMethod] =
    React.useState<CompanyGlobalOverheadMethod>(initialMethod)
  const [savingGlobal, setSavingGlobal] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const policyMap = React.useMemo(() => {
    const m = new Map<string, PolicyRow>()
    for (const p of initialPolicies) m.set(p.project_id, p)
    return m
  }, [initialPolicies])

  const [localPol, setLocalPol] = React.useState<
    Record<
      string,
      { method: "revenue_based" | "labor_based" | "fixed_rate"; fixed: string }
    >
  >(() => {
    const o: Record<
      string,
      { method: "revenue_based" | "labor_based" | "fixed_rate"; fixed: string }
    > = {}
    for (const pr of initialProjects) {
      const ex = policyMap.get(pr.id)
      o[pr.id] = {
        method: (ex?.method as "revenue_based" | "labor_based" | "fixed_rate") ?? "revenue_based",
        fixed: ex != null ? String(ex.fixed_rate_percent ?? 0) : "0",
      }
    }
    return o
  })

  async function saveGlobalMethod(m: CompanyGlobalOverheadMethod) {
    setSavingGlobal(true)
    try {
      const res = await setCompanyOverheadAllocationMethod(m)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setGlobalMethod(m)
      toast.success("מדיניות ברירת מחדל עודכנה")
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSavingGlobal(false)
    }
  }

  async function saveProjectPolicy(projectId: string) {
    const st = localPol[projectId]
    if (!st) return
    setBusyId(projectId)
    try {
      const res = await upsertProjectOverheadPolicy({
        projectId,
        method: st.method,
        fixedRatePercent: Number(st.fixed) || 0,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("מדיניות פרויקט נשמרה")
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusyId(null)
    }
  }

  async function saveRow(r: MoOverheadRegistryRow, draft: Partial<MoOverheadRegistryRow>) {
    setBusyId(r.id)
    try {
      const res = await upsertOverheadRegistryItem({
        id: r.id,
        label: draft.label ?? r.label,
        category: (draft.category ?? r.category) as MoOverheadRegistryRow["category"],
        monthly_amount_nis: Number(draft.monthly_amount_nis ?? r.monthly_amount_nis) || 0,
        effective_from: draft.effective_from ?? r.effective_from,
        effective_to: draft.effective_to ?? r.effective_to,
        sort_order: Number(draft.sort_order ?? r.sort_order) || 0,
        is_active: draft.is_active ?? r.is_active,
        notes: draft.notes ?? r.notes,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const list = await refreshList()
      if (list) setRows(list)
      toast.success("נשמר")
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusyId(null)
    }
  }

  async function refreshList(): Promise<MoOverheadRegistryRow[] | null> {
    const res = await listOverheadRegistryItems()
    if (!res.ok) return null
    return res.rows
  }

  async function addRow() {
    setBusyId("new")
    try {
      const res = await upsertOverheadRegistryItem({
        label: "עקיפה חדשה",
        category: "administrative",
        monthly_amount_nis: 0,
        effective_from: new Date().toISOString().slice(0, 10),
        effective_to: null,
        sort_order: rows.length * 10,
        is_active: true,
        notes: null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const list = await refreshList()
      if (list) setRows(list)
      toast.success("נוספה שורה")
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusyId(null)
    }
  }

  async function removeRow(id: string) {
    if (!confirm("למחוק שורה מרישום העקיפות?")) return
    setBusyId(id)
    try {
      const res = await deleteOverheadRegistryItem(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setRows((x) => x.filter((r) => r.id !== id))
      toast.success("נמחק")
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 md:px-6 rtl" dir="rtl">
      <header className="pharmacy-hero-card border-slate-100 bg-card p-6">
        <h1 className="text-2xl font-bold tracking-tight text-[#1e293b]">
          עקיפות והעמסה — Finance ERP
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          רישום עלויות קבועות/משתנות (מנהלי, תפעול, שיווק), ברירת מחדל גלובלית להעמסה,
          ומדיניות לפי פרויקט (הכנסה / ימי גאנט / אחוז קבוע). כל שינוי נרשם ב־mo_audit_logs.
        </p>
      </header>

      <section className="rounded-xl border border-slate-100 bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">מדיניות העמסה — ברירת מחדל חברה</h2>
        <p className="mt-1 text-xs text-slate-500">
          חל על פרויקטים ללא שורה בטבלת מדיניות פרויקט. ניתן לשלב שיטות per-project.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Select
            value={globalMethod}
            onValueChange={(v) => saveGlobalMethod(v as CompanyGlobalOverheadMethod)}
            disabled={savingGlobal}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue_pct">אחוז מהכנסה מוכרת</SelectItem>
              <SelectItem value="labor_hours">ימי עבודה (גאנט)</SelectItem>
            </SelectContent>
          </Select>
          {savingGlobal ? (
            <Loader2 className="size-4 animate-spin text-slate-400" aria-hidden />
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-slate-100 bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-800">רישום עקיפות חודשי</h2>
          <button
            type="button"
            className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
            onClick={() => void addRow()}
            disabled={busyId === "new"}
          >
            {busyId === "new" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="size-4" aria-hidden />
            )}
            שורה חדשה
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-100">
                <TableHead>תיאור</TableHead>
                <TableHead>קטגוריה</TableHead>
                <TableHead className="text-end">סכום חודשי ₪</TableHead>
                <TableHead>מתאריך</TableHead>
                <TableHead>עד</TableHead>
                <TableHead className="text-center">פעיל</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-slate-500">
                    אין שורות — הוסיפו עקיפה או הריצו מיגרציות.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <OverheadRowEditor
                    key={r.id}
                    row={r}
                    busy={busyId === r.id}
                    onSave={(d) => void saveRow(r, d)}
                    onDelete={() => void removeRow(r.id)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-100 bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">מדיניות לפי פרויקט</h2>
        <p className="mt-1 text-xs text-slate-500">
          דורס את ברירת המחדל הגלובלית לפרויקט זה. fixed_rate = אחוז מסך עומס החודש לפני חלוקת השאר.
        </p>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>פרויקט</TableHead>
                <TableHead>שיטה</TableHead>
                <TableHead className="text-end">אחוז קבוע</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialProjects.map((p) => {
                const st = localPol[p.id] ?? {
                  method: "revenue_based" as const,
                  fixed: "0",
                }
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <span className="font-mono text-[11px] text-slate-400">
                        {p.internal_project_code || "—"}
                      </span>
                      <span className="block font-medium text-slate-800">
                        {p.name || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={st.method}
                        onValueChange={(v) =>
                          setLocalPol((prev) => ({
                            ...prev,
                            [p.id]: {
                              ...st,
                              method: v as "revenue_based" | "labor_based" | "fixed_rate",
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="revenue_based">לפי הכנסה</SelectItem>
                          <SelectItem value="labor_based">לפי ימי גאנט</SelectItem>
                          <SelectItem value="fixed_rate">אחוז קבוע מסך עומס</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-end">
                      <Input
                        className="font-currency-mono ms-auto max-w-[100px] text-end"
                        value={st.fixed}
                        onChange={(e) =>
                          setLocalPol((prev) => ({
                            ...prev,
                            [p.id]: { ...st, fixed: e.target.value },
                          }))
                        }
                        inputMode="decimal"
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
                        disabled={busyId === p.id}
                        onClick={() => void saveProjectPolicy(p.id)}
                      >
                        {busyId === p.id ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          "שמירה"
                        )}
                      </button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>

    </div>
  )
}

function OverheadRowEditor({
  row,
  busy,
  onSave,
  onDelete,
}: {
  row: MoOverheadRegistryRow
  busy: boolean
  onSave: (d: Partial<MoOverheadRegistryRow>) => void
  onDelete: () => void
}) {
  const [label, setLabel] = React.useState(row.label)
  const [category, setCategory] = React.useState(row.category)
  const [amount, setAmount] = React.useState(String(row.monthly_amount_nis))
  const [from, setFrom] = React.useState(row.effective_from.slice(0, 10))
  const [to, setTo] = React.useState(row.effective_to?.slice(0, 10) ?? "")
  const [active, setActive] = React.useState(row.is_active)

  return (
    <TableRow>
      <TableCell>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} className="min-w-[140px]" />
      </TableCell>
      <TableCell>
        <Select value={category} onValueChange={(v) => setCategory(v as MoOverheadRegistryRow["category"])}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTS.map((c) => (
              <SelectItem key={c.v} value={c.v}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-end">
        <Input
          className="font-currency-mono ms-auto max-w-[120px] text-end"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
        />
      </TableCell>
      <TableCell>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[140px]" />
      </TableCell>
      <TableCell>
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-[140px]"
        />
      </TableCell>
      <TableCell className="text-center">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          aria-label="פעיל"
        />
      </TableCell>
      <TableCell className="flex gap-1">
        <button
          type="button"
          className={cn(buttonVariants({ size: "sm" }))}
          disabled={busy}
          onClick={() =>
            onSave({
              label,
              category,
              monthly_amount_nis: Number(amount) || 0,
              effective_from: from,
              effective_to: to.trim() ? to : null,
              is_active: active,
            })
          }
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "שמור"}
        </button>
        <button
          type="button"
          className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          onClick={onDelete}
          aria-label="מחק"
        >
          <Trash2 className="size-4 text-red-600" />
        </button>
      </TableCell>
    </TableRow>
  )
}
