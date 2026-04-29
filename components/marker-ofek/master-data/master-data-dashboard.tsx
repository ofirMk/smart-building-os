"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Coins,
  Package,
  Ruler,
  Search,
  Trash2,
  Truck,
} from "lucide-react"
import { toast } from "sonner"

import {
  createCurrencyAction,
  createSupplierPartAction,
  createSupplierV2Action,
  createUnitOfMeasureAction,
  deleteCurrencyAction,
  deleteSupplierPartAction,
  deleteSupplierV2Action,
  deleteUnitOfMeasureAction,
  updateCurrencyAction,
  updateSupplierPartAction,
  updateSupplierV2Action,
  updateUnitOfMeasureAction,
} from "@/lib/holden-erp/master-data-actions"
import type {
  ErpPaymentTermOption,
  MasterDataCurrencyRow,
  MasterDataSupplierPartRow,
  MasterDataSupplierV2Row,
  MasterDataUomRow,
} from "@/types/master-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const TAB_VALUES = ["suppliers", "parts", "uom", "currencies"] as const
type TabValue = (typeof TAB_VALUES)[number]

function isTabValue(v: string): v is TabValue {
  return (TAB_VALUES as readonly string[]).includes(v)
}

type Props = {
  initialTab: string
  initialCurrencies: MasterDataCurrencyRow[]
  initialUom: MasterDataUomRow[]
  initialParts: MasterDataSupplierPartRow[]
  initialSuppliers: MasterDataSupplierV2Row[]
  paymentTerms: ErpPaymentTermOption[]
  loadErrors: string[]
}

const glass =
  "rounded-2xl border border-white/10 bg-slate-950/40 shadow-[0_0_40px_-12px_rgba(16,185,129,0.35)] backdrop-blur-xl"

export function MasterDataDashboard({
  initialTab,
  initialCurrencies,
  initialUom,
  initialParts,
  initialSuppliers,
  paymentTerms,
  loadErrors,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabValue>(() =>
    isTabValue(initialTab) ? initialTab : "suppliers"
  )

  useEffect(() => {
    const q = searchParams.get("tab")
    if (q && isTabValue(q)) setActiveTab(q)
  }, [searchParams])

  const onTabChange = useCallback(
    (v: string) => {
      if (!isTabValue(v)) return
      setActiveTab(v)
      const next = new URLSearchParams(searchParams.toString())
      next.set("tab", v)
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const [qSup, setQSup] = useState("")
  const [qPart, setQPart] = useState("")
  const [qCur, setQCur] = useState("")
  const [qUom, setQUom] = useState("")

  const refresh = useCallback(() => {
    router.refresh()
  }, [router])

  return (
    <div
      dir="rtl"
      className="flex-1 min-h-0 overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100"
    >
      <div className="mx-auto max-w-[1600px] space-y-6 p-4 pb-16 md:p-8">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
              <Package className="size-6" aria-hidden />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">
                נתוני מאסטר · ERP
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                ניהול נתוני בסיס
              </h1>
            </div>
          </div>
          <p className="max-w-2xl text-sm text-slate-400">
            ספקים, מקט״י, יחידות מידה ומטבעות — עריכה בשורה, חיפוש מהיר, ממשק
            כהה ברמת SaaS
          </p>
        </header>

        {loadErrors.length > 0 ? (
          <div
            role="alert"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          >
            {loadErrors.join(" · ")}
          </div>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={onTabChange}
          className="w-full gap-6"
        >
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-2xl border border-white/10 bg-slate-900/80 p-2 shadow-inner">
            <TabsTrigger
              value="suppliers"
              className="gap-2 rounded-xl data-[state=active]:bg-gradient-to-l data-[state=active]:from-blue-600 data-[state=active]:to-emerald-600 data-[state=active]:text-white"
            >
              <Truck className="size-4 opacity-80" />
              ספקים
            </TabsTrigger>
            <TabsTrigger
              value="parts"
              className="gap-2 rounded-xl data-[state=active]:bg-gradient-to-l data-[state=active]:from-blue-600 data-[state=active]:to-emerald-600 data-[state=active]:text-white"
            >
              <Package className="size-4 opacity-80" />
              מקט״י ספקים
            </TabsTrigger>
            <TabsTrigger
              value="uom"
              className="gap-2 rounded-xl data-[state=active]:bg-gradient-to-l data-[state=active]:from-blue-600 data-[state=active]:to-emerald-600 data-[state=active]:text-white"
            >
              <Ruler className="size-4 opacity-80" />
              יחידות מידה
            </TabsTrigger>
            <TabsTrigger
              value="currencies"
              className="gap-2 rounded-xl data-[state=active]:bg-gradient-to-l data-[state=active]:from-blue-600 data-[state=active]:to-emerald-600 data-[state=active]:text-white"
            >
              <Coins className="size-4 opacity-80" />
              מטבעות
            </TabsTrigger>
          </TabsList>

          <TabsContent value="suppliers" className="mt-0 outline-none">
            <SuppliersTab
              initial={initialSuppliers}
              paymentTerms={paymentTerms}
              currencies={initialCurrencies}
              q={qSup}
              setQ={setQSup}
              refresh={refresh}
            />
          </TabsContent>
          <TabsContent value="parts" className="mt-0 outline-none">
            <PartsTab
              initial={initialParts}
              suppliers={initialSuppliers}
              q={qPart}
              setQ={setQPart}
              refresh={refresh}
            />
          </TabsContent>
          <TabsContent value="uom" className="mt-0 outline-none">
            <UomTab
              initial={initialUom}
              q={qUom}
              setQ={setQUom}
              refresh={refresh}
            />
          </TabsContent>
          <TabsContent value="currencies" className="mt-0 outline-none">
            <CurrenciesTab
              initial={initialCurrencies}
              q={qCur}
              setQ={setQCur}
              refresh={refresh}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function filterRows<T>(rows: T[], q: string, pick: (r: T) => string) {
  const t = q.trim().toLowerCase()
  if (!t) return rows
  return rows.filter((r) => pick(r).toLowerCase().includes(t))
}

function SuppliersTab({
  initial,
  paymentTerms,
  currencies,
  q,
  setQ,
  refresh,
}: {
  initial: MasterDataSupplierV2Row[]
  paymentTerms: ErpPaymentTermOption[]
  currencies: MasterDataCurrencyRow[]
  q: string
  setQ: (v: string) => void
  refresh: () => void
}) {
  const rows = useMemo(
    () =>
      filterRows(
        initial,
        q,
        (r) =>
          `${r.name} ${r.tax_id ?? ""} ${r.payment_term_code ?? ""} ${r.balance}`
      ),
    [initial, q]
  )

  const [draft, setDraft] = useState({
    name: "",
    tax_id: "",
    payment_term_code: "",
    currency_id: "",
  })
  const [busy, setBusy] = useState<string | null>(null)

  async function saveRow(row: MasterDataSupplierV2Row) {
    setBusy(row.id)
    try {
      const res = await updateSupplierV2Action({
        id: row.id,
        name: row.name.trim(),
        supplier_type: row.supplier_type,
        tax_id: row.tax_id,
        payment_term_code: row.payment_term_code,
        currency_id: row.currency_id,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("הספק עודכן")
      refresh()
    } finally {
      setBusy(null)
    }
  }

  async function addRow() {
    if (!draft.name.trim()) {
      toast.error("נא להזין שם ספק")
      return
    }
    setBusy("new")
    try {
      const res = await createSupplierV2Action({
        name: draft.name,
        tax_id: draft.tax_id || null,
        payment_term_code: draft.payment_term_code || null,
        currency_id: draft.currency_id || null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("ספק נוסף")
      setDraft({
        name: "",
        tax_id: "",
        payment_term_code: "",
        currency_id: "",
      })
      refresh()
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    if (!confirm("למחוק ספק זה?")) return
    setBusy(id)
    try {
      const res = await deleteSupplierV2Action(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("נמחק")
      refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cn("space-y-4 p-4 md:p-6", glass)}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש ספק, ח.פ., תנאי תשלום..."
            className="h-11 rounded-xl border-white/10 bg-slate-900/60 pr-10 text-slate-100 placeholder:text-slate-500"
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[920px] text-right text-sm">
          <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="p-3 font-semibold">שם</th>
              <th className="p-3 font-semibold">ח.פ. / עוסק</th>
              <th className="p-3 font-semibold">תנאי תשלום</th>
              <th className="p-3 font-semibold">מטבע</th>
              <th className="p-3 font-semibold">יתרה</th>
              <th className="w-24 p-3 font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <SupplierRow
                key={r.id}
                row={r}
                paymentTerms={paymentTerms}
                currencies={currencies}
                busy={busy === r.id}
                onCommit={(full) => void saveRow(full)}
                onDelete={() => void remove(r.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 md:grid-cols-2 lg:grid-cols-5">
        <Input
          placeholder="שם ספק חדש"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="border-white/10 bg-slate-900/60 text-slate-100"
        />
        <Input
          placeholder="ח.פ."
          value={draft.tax_id}
          onChange={(e) => setDraft((d) => ({ ...d, tax_id: e.target.value }))}
          className="border-white/10 bg-slate-900/60 text-slate-100"
        />
        <select
          className="h-10 rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-slate-100"
          value={draft.payment_term_code}
          onChange={(e) =>
            setDraft((d) => ({ ...d, payment_term_code: e.target.value }))
          }
        >
          <option value="">תנאי תשלום</option>
          {paymentTerms.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code} — {p.description}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-slate-100"
          value={draft.currency_id}
          onChange={(e) =>
            setDraft((d) => ({ ...d, currency_id: e.target.value }))
          }
        >
          <option value="">מטבע</option>
          {currencies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} ({c.symbol})
            </option>
          ))}
        </select>
        <Button
          type="button"
          disabled={busy === "new"}
          onClick={() => void addRow()}
          className="h-10 rounded-xl bg-gradient-to-l from-emerald-600 to-blue-600 font-semibold text-white"
        >
          הוסף ספק
        </Button>
      </div>
    </div>
  )
}

function SupplierRow({
  row,
  paymentTerms,
  currencies,
  busy,
  onCommit,
  onDelete,
}: {
  row: MasterDataSupplierV2Row
  paymentTerms: ErpPaymentTermOption[]
  currencies: MasterDataCurrencyRow[]
  busy: boolean
  onCommit: (full: MasterDataSupplierV2Row) => void
  onDelete: () => void
}) {
  const [local, setLocal] = useState(row)
  useEffect(() => {
    setLocal(row)
  }, [row])
  function push(next: Partial<MasterDataSupplierV2Row>) {
    setLocal((prev) => {
      const merged = { ...prev, ...next }
      queueMicrotask(() => onCommit(merged))
      return merged
    })
  }
  return (
    <tr className="hover:bg-card/[0.03]">
      <td className="p-2">
        <Input
          value={local.name}
          onChange={(e) => {
            const name = e.target.value
            setLocal((s) => ({ ...s, name }))
          }}
          onBlur={(e) =>
            push({ name: e.currentTarget.value.trim() })
          }
          className="h-9 border-white/10 bg-slate-900/50 text-slate-100"
        />
      </td>
      <td className="p-2">
        <Input
          value={local.tax_id ?? ""}
          onChange={(e) => {
            const tax_id = e.target.value || null
            setLocal((s) => ({ ...s, tax_id }))
          }}
          onBlur={(e) =>
            push({ tax_id: e.currentTarget.value.trim() || null })
          }
          className="h-9 border-white/10 bg-slate-900/50 text-slate-100"
        />
      </td>
      <td className="p-2">
        <select
          className="h-9 w-full rounded-md border border-white/10 bg-slate-900/50 px-2 text-sm"
          value={local.payment_term_code ?? ""}
          onChange={(e) => {
            const payment_term_code = e.target.value || null
            push({ payment_term_code })
          }}
        >
          <option value="">—</option>
          {paymentTerms.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <select
          className="h-9 w-full rounded-md border border-white/10 bg-slate-900/50 px-2 text-sm"
          value={local.currency_id ?? ""}
          onChange={(e) => {
            const currency_id = e.target.value || null
            push({ currency_id })
          }}
        >
          <option value="">—</option>
          {currencies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2 tabular-nums text-slate-400">
        {Number(local.balance).toLocaleString("he-IL", {
          minimumFractionDigits: 2,
        })}
      </td>
      <td className="p-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={onDelete}
          className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
        >
          <Trash2 className="size-4" />
        </Button>
      </td>
    </tr>
  )
}

function PartsTab({
  initial,
  suppliers,
  q,
  setQ,
  refresh,
}: {
  initial: MasterDataSupplierPartRow[]
  suppliers: MasterDataSupplierV2Row[]
  q: string
  setQ: (v: string) => void
  refresh: () => void
}) {
  const supMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of suppliers) m.set(s.id, s.name)
    return m
  }, [suppliers])

  const rows = useMemo(
    () =>
      filterRows(
        initial,
        q,
        (r) =>
          `${supMap.get(r.supplier_id) ?? ""} ${r.part_number_supplier} ${r.manufacturer} ${r.description_32_chars}`
      ),
    [initial, q, supMap]
  )

  const [draft, setDraft] = useState({
    supplier_id: "",
    part_number_supplier: "",
    manufacturer: "",
    supplier_name_text: "",
    description_32_chars: "",
    description_48_chars: "",
  })
  const [busy, setBusy] = useState<string | null>(null)

  async function save(row: MasterDataSupplierPartRow) {
    setBusy(row.id)
    try {
      const res = await updateSupplierPartAction({
        id: row.id,
        supplier_id: row.supplier_id,
        part_number_supplier: row.part_number_supplier,
        manufacturer: row.manufacturer,
        supplier_name_text: row.supplier_name_text,
        description_32_chars: row.description_32_chars,
        description_48_chars: row.description_48_chars,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("עודכן")
      refresh()
    } finally {
      setBusy(null)
    }
  }

  async function add() {
    if (!draft.supplier_id) {
      toast.error("נא לבחור ספק")
      return
    }
    setBusy("new")
    try {
      const res = await createSupplierPartAction(draft)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("נוסף מק״ט")
      setDraft({
        supplier_id: "",
        part_number_supplier: "",
        manufacturer: "",
        supplier_name_text: "",
        description_32_chars: "",
        description_48_chars: "",
      })
      refresh()
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    if (!confirm("למחוק שורה?")) return
    setBusy(id)
    try {
      const res = await deleteSupplierPartAction(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("נמחק")
      refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cn("space-y-4 p-4 md:p-6", glass)}>
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש לפי ספק, מק״ט, יצרן..."
          className="h-11 rounded-xl border-white/10 bg-slate-900/60 pr-10 text-slate-100"
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[1100px] text-right text-sm">
          <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="p-2 font-semibold">ספק</th>
              <th className="p-2 font-semibold">מק״ט ספק</th>
              <th className="p-2 font-semibold">יצרן</th>
              <th className="p-2 font-semibold">שם טקסט</th>
              <th className="p-2 font-semibold">תיאור 32</th>
              <th className="p-2 font-semibold">תיאור 48</th>
              <th className="w-12 p-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <PartRow
                key={r.id}
                row={r}
                suppliers={suppliers}
                busy={busy === r.id}
                onSave={(row) => void save(row)}
                onDelete={() => void remove(r.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 lg:grid-cols-3">
        <select
          className="h-10 rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm"
          value={draft.supplier_id}
          onChange={(e) =>
            setDraft((d) => ({ ...d, supplier_id: e.target.value }))
          }
        >
          <option value="">בחר ספק</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Input
          placeholder="מק״ט ספק"
          value={draft.part_number_supplier}
          onChange={(e) =>
            setDraft((d) => ({ ...d, part_number_supplier: e.target.value }))
          }
          className="border-white/10 bg-slate-900/60"
        />
        <Input
          placeholder="יצרן"
          value={draft.manufacturer}
          onChange={(e) =>
            setDraft((d) => ({ ...d, manufacturer: e.target.value }))
          }
          className="border-white/10 bg-slate-900/60"
        />
        <Input
          placeholder="שם ספק (טקסט)"
          value={draft.supplier_name_text}
          onChange={(e) =>
            setDraft((d) => ({ ...d, supplier_name_text: e.target.value }))
          }
          className="border-white/10 bg-slate-900/60"
        />
        <Input
          placeholder="תיאור עד 32 תווים"
          maxLength={32}
          value={draft.description_32_chars}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              description_32_chars: e.target.value.slice(0, 32),
            }))
          }
          className="border-white/10 bg-slate-900/60"
        />
        <Input
          placeholder="תיאור עד 48 תווים"
          maxLength={48}
          value={draft.description_48_chars}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              description_48_chars: e.target.value.slice(0, 48),
            }))
          }
          className="border-white/10 bg-slate-900/60"
        />
        <Button
          type="button"
          disabled={busy === "new"}
          onClick={() => void add()}
          className="h-10 bg-gradient-to-l from-blue-600 to-emerald-600 font-semibold text-white lg:col-span-3"
        >
          הוסף מק״ט ספק
        </Button>
      </div>
    </div>
  )
}

function PartRow({
  row,
  suppliers,
  busy,
  onSave,
  onDelete,
}: {
  row: MasterDataSupplierPartRow
  suppliers: MasterDataSupplierV2Row[]
  busy: boolean
  onSave: (row: MasterDataSupplierPartRow) => void
  onDelete: () => void
}) {
  const [local, setLocal] = useState(row)
  useEffect(() => {
    setLocal(row)
  }, [row])
  return (
    <tr className="hover:bg-card/[0.03]">
      <td className="p-1">
        <select
          className="h-9 w-full rounded-md border border-white/10 bg-slate-900/50 px-2 text-xs"
          value={local.supplier_id}
          onChange={(e) => {
            const supplier_id = e.target.value
            setLocal((s) => {
              const merged = { ...s, supplier_id }
              queueMicrotask(() => onSave(merged))
              return merged
            })
          }}
        >
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </td>
      <td className="p-1">
        <Input
          value={local.part_number_supplier}
          onChange={(e) =>
            setLocal((s) => ({ ...s, part_number_supplier: e.target.value }))
          }
          onBlur={() => onSave(local)}
          className="h-9 border-white/10 bg-slate-900/50 text-xs"
        />
      </td>
      <td className="p-1">
        <Input
          value={local.manufacturer}
          onChange={(e) =>
            setLocal((s) => ({ ...s, manufacturer: e.target.value }))
          }
          onBlur={() => onSave(local)}
          className="h-9 border-white/10 bg-slate-900/50 text-xs"
        />
      </td>
      <td className="p-1">
        <Input
          value={local.supplier_name_text}
          onChange={(e) =>
            setLocal((s) => ({ ...s, supplier_name_text: e.target.value }))
          }
          onBlur={() => onSave(local)}
          className="h-9 border-white/10 bg-slate-900/50 text-xs"
        />
      </td>
      <td className="p-1">
        <Input
          maxLength={32}
          value={local.description_32_chars}
          onChange={(e) =>
            setLocal((s) => ({
              ...s,
              description_32_chars: e.target.value.slice(0, 32),
            }))
          }
          onBlur={() => onSave(local)}
          className="h-9 border-white/10 bg-slate-900/50 text-xs"
        />
      </td>
      <td className="p-1">
        <Input
          maxLength={48}
          value={local.description_48_chars}
          onChange={(e) =>
            setLocal((s) => ({
              ...s,
              description_48_chars: e.target.value.slice(0, 48),
            }))
          }
          onBlur={() => onSave(local)}
          className="h-9 border-white/10 bg-slate-900/50 text-xs"
        />
      </td>
      <td className="p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={onDelete}
          className="text-red-400 hover:bg-red-500/10"
        >
          <Trash2 className="size-4" />
        </Button>
      </td>
    </tr>
  )
}

function UomTab({
  initial,
  q,
  setQ,
  refresh,
}: {
  initial: MasterDataUomRow[]
  q: string
  setQ: (v: string) => void
  refresh: () => void
}) {
  const rows = useMemo(
    () =>
      filterRows(
        initial,
        q,
        (r) => `${r.code} ${r.description_he} ${r.name_en}`
      ),
    [initial, q]
  )
  const [draft, setDraft] = useState({
    code: "",
    description_he: "",
    name_en: "",
  })
  const [busy, setBusy] = useState<string | null>(null)

  async function save(row: MasterDataUomRow) {
    setBusy(row.id)
    try {
      const res = await updateUnitOfMeasureAction({
        id: row.id,
        code: row.code,
        description_he: row.description_he,
        name_en: row.name_en,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("עודכן")
      refresh()
    } finally {
      setBusy(null)
    }
  }

  async function add() {
    setBusy("new")
    try {
      const res = await createUnitOfMeasureAction(draft)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("נוספה יחידה")
      setDraft({ code: "", description_he: "", name_en: "" })
      refresh()
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    if (!confirm("למחוק?")) return
    setBusy(id)
    try {
      const res = await deleteUnitOfMeasureAction(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("נמחק")
      refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cn("space-y-4 p-4 md:p-6", glass)}>
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש קוד / תיאור / אנגלית..."
          className="h-11 rounded-xl border-white/10 bg-slate-900/60 pr-10 text-slate-100"
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[720px] text-right text-sm">
          <thead className="bg-slate-900/80 text-[11px] uppercase text-slate-400">
            <tr>
              <th className="p-2">קוד</th>
              <th className="p-2">תיאור (עברית)</th>
              <th className="p-2">שם (אנגלית)</th>
              <th className="w-12 p-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <UomRow
                key={r.id}
                row={r}
                busy={busy === r.id}
                onSave={(row) => void save(row)}
                onDelete={() => void remove(r.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2 rounded-xl border border-emerald-500/20 p-4">
        <Input
          placeholder="קוד"
          value={draft.code}
          onChange={(e) =>
            setDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))
          }
          className="h-10 max-w-[120px] border-white/10 bg-slate-900/60"
        />
        <Input
          placeholder="תיאור עברית"
          value={draft.description_he}
          onChange={(e) =>
            setDraft((d) => ({ ...d, description_he: e.target.value }))
          }
          className="h-10 min-w-[200px] flex-1 border-white/10 bg-slate-900/60"
        />
        <Input
          placeholder="Name EN"
          value={draft.name_en}
          onChange={(e) =>
            setDraft((d) => ({ ...d, name_en: e.target.value }))
          }
          className="h-10 min-w-[160px] flex-1 border-white/10 bg-slate-900/60"
        />
        <Button
          type="button"
          disabled={busy === "new"}
          onClick={() => void add()}
          className="h-10 bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
        >
          הוסף
        </Button>
      </div>
    </div>
  )
}

function UomRow({
  row,
  busy,
  onSave,
  onDelete,
}: {
  row: MasterDataUomRow
  busy: boolean
  onSave: (row: MasterDataUomRow) => void
  onDelete: () => void
}) {
  const [local, setLocal] = useState(row)
  useEffect(() => {
    setLocal(row)
  }, [row])
  return (
    <tr>
      <td className="p-1">
        <Input
          value={local.code}
          onChange={(e) =>
            setLocal((s) => ({
              ...s,
              code: e.target.value.toUpperCase(),
            }))
          }
          onBlur={() => onSave(local)}
          className="h-9 border-white/10 bg-slate-900/50 font-mono text-xs"
        />
      </td>
      <td className="p-1">
        <Input
          value={local.description_he}
          onChange={(e) =>
            setLocal((s) => ({ ...s, description_he: e.target.value }))
          }
          onBlur={() => onSave(local)}
          className="h-9 border-white/10 bg-slate-900/50 text-xs"
        />
      </td>
      <td className="p-1">
        <Input
          value={local.name_en}
          onChange={(e) =>
            setLocal((s) => ({ ...s, name_en: e.target.value }))
          }
          onBlur={() => onSave(local)}
          className="h-9 border-white/10 bg-slate-900/50 text-xs"
        />
      </td>
      <td className="p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={onDelete}
          className="text-red-400"
        >
          <Trash2 className="size-4" />
        </Button>
      </td>
    </tr>
  )
}

function CurrenciesTab({
  initial,
  q,
  setQ,
  refresh,
}: {
  initial: MasterDataCurrencyRow[]
  q: string
  setQ: (v: string) => void
  refresh: () => void
}) {
  const rows = useMemo(
    () =>
      filterRows(
        initial,
        q,
        (r) => `${r.code} ${r.name_he} ${r.symbol}`
      ),
    [initial, q]
  )
  const [draft, setDraft] = useState({ code: "", name_he: "", symbol: "" })
  const [busy, setBusy] = useState<string | null>(null)

  async function save(row: MasterDataCurrencyRow) {
    setBusy(row.id)
    try {
      const res = await updateCurrencyAction({
        id: row.id,
        code: row.code,
        name_he: row.name_he,
        symbol: row.symbol,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("עודכן")
      refresh()
    } finally {
      setBusy(null)
    }
  }

  async function add() {
    setBusy("new")
    try {
      const res = await createCurrencyAction(draft)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("נוסף מטבע")
      setDraft({ code: "", name_he: "", symbol: "" })
      refresh()
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    if (!confirm("למחוק מטבע?")) return
    setBusy(id)
    try {
      const res = await deleteCurrencyAction(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("נמחק")
      refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cn("space-y-4 p-4 md:p-6", glass)}>
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש קוד / שם / סמל..."
          className="h-11 rounded-xl border-white/10 bg-slate-900/60 pr-10 text-slate-100"
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[560px] text-right text-sm">
          <thead className="bg-slate-900/80 text-[11px] uppercase text-slate-400">
            <tr>
              <th className="p-2">קוד</th>
              <th className="p-2">שם בעברית</th>
              <th className="p-2">סמל</th>
              <th className="w-12 p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <CurrencyRow
                key={r.id}
                row={r}
                busy={busy === r.id}
                onSave={(row) => void save(row)}
                onDelete={() => void remove(r.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2 rounded-xl border border-blue-500/20 p-4">
        <Input
          placeholder="קוד"
          value={draft.code}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              code: e.target.value.toUpperCase(),
            }))
          }
          className="h-10 max-w-[100px] border-white/10 bg-slate-900/60"
        />
        <Input
          placeholder="שם בעברית"
          value={draft.name_he}
          onChange={(e) =>
            setDraft((d) => ({ ...d, name_he: e.target.value }))
          }
          className="h-10 min-w-[200px] flex-1 border-white/10 bg-slate-900/60"
        />
        <Input
          placeholder="סמל"
          value={draft.symbol}
          onChange={(e) =>
            setDraft((d) => ({ ...d, symbol: e.target.value }))
          }
          className="h-10 w-24 border-white/10 bg-slate-900/60"
        />
        <Button
          type="button"
          disabled={busy === "new"}
          onClick={() => void add()}
          className="h-10 bg-blue-600 font-semibold text-white hover:bg-blue-500"
        >
          הוסף
        </Button>
      </div>
    </div>
  )
}

function CurrencyRow({
  row,
  busy,
  onSave,
  onDelete,
}: {
  row: MasterDataCurrencyRow
  busy: boolean
  onSave: (row: MasterDataCurrencyRow) => void
  onDelete: () => void
}) {
  const [local, setLocal] = useState(row)
  useEffect(() => {
    setLocal(row)
  }, [row])
  return (
    <tr>
      <td className="p-1">
        <Input
          value={local.code}
          onChange={(e) =>
            setLocal((s) => ({
              ...s,
              code: e.target.value.toUpperCase(),
            }))
          }
          onBlur={() => onSave(local)}
          className="h-9 border-white/10 bg-slate-900/50 font-mono text-xs"
        />
      </td>
      <td className="p-1">
        <Input
          value={local.name_he}
          onChange={(e) =>
            setLocal((s) => ({ ...s, name_he: e.target.value }))
          }
          onBlur={() => onSave(local)}
          className="h-9 border-white/10 bg-slate-900/50 text-xs"
        />
      </td>
      <td className="p-1">
        <Input
          value={local.symbol}
          onChange={(e) =>
            setLocal((s) => ({ ...s, symbol: e.target.value }))
          }
          onBlur={() => onSave(local)}
          className="h-9 border-white/10 bg-slate-900/50 text-xs"
        />
      </td>
      <td className="p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={onDelete}
          className="text-red-400"
        >
          <Trash2 className="size-4" />
        </Button>
      </td>
    </tr>
  )
}
