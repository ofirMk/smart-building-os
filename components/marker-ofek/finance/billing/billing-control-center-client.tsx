"use client"

import * as React from "react"
import {
  FileText,
  GitBranch,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Truck,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
  createFinalTaxInvoiceAction,
  fetchBillingBudgetContextAction,
  fetchBillingPrefillFromSourceAction,
  fetchPullSourcesForProjectAction,
  fetchWbsNodesForProjectAction,
} from "@/lib/holden-erp/billing-actions"
import { cn } from "@/lib/utils"
import type { BillingDocumentKind, BillingLineInput, BillingTransactionMode } from "@/types/billing-control"
import type { GlAccountRow } from "@/types/holden-finance"
import type {
  MasterDataCurrencyRow,
  MasterDataSupplierPartRow,
  MasterDataUomRow,
} from "@/types/master-data"

const VAT_RATE = 0.17

const glass =
  "rounded-2xl border border-white/[0.07] bg-white/[0.035] shadow-[0_8px_44px_-16px_rgba(0,0,0,0.55)] backdrop-blur-2xl ring-1 ring-white/[0.06]"

function roundMoney(n: number) {
  return Math.round(n * 100) / 100
}

type LineState = BillingLineInput & { id: string }

function newLine(): LineState {
  return {
    id: crypto.randomUUID(),
    supplierPartId: null,
    description: "",
    uomId: null,
    quantity: 1,
    unitPrice: 0,
    discountPercent: 0,
    netUnitPrice: 0,
    lineTotal: 0,
    wbsNodeId: null,
  }
}

function recalcLine(l: LineState): LineState {
  const qty = Math.max(1e-6, Number(l.quantity) || 0)
  const up = Number(l.unitPrice) || 0
  const d = Math.min(100, Math.max(0, Number(l.discountPercent) || 0))
  const net = roundMoney(up * (1 - d / 100))
  const lt = roundMoney(qty * net)
  return { ...l, quantity: qty, discountPercent: d, netUnitPrice: net, lineTotal: lt }
}

const DOC_LABEL: Record<BillingDocumentKind, string> = {
  tax_invoice: "חשבונית מס",
  credit_note: "חשבונית זיכוי",
  proforma: "חשבון עסקה (פרופורמה)",
}

type Workspace = {
  accounts: GlAccountRow[]
  currencies: MasterDataCurrencyRow[]
  uoms: MasterDataUomRow[]
  parts: MasterDataSupplierPartRow[]
  projects: Array<{ id: string, name: string, internal_project_code: string }>
  agents: Array<{ id: string, label: string }>
  fx: Record<string, number>
}

type Props = {
  workspace: Workspace
}

export function BillingControlCenterClient({ workspace }: Props) {
  const [issueDate, setIssueDate] = React.useState(
    () => new Date().toISOString().slice(0, 10)
  )
  const [documentKind, setDocumentKind] =
    React.useState<BillingDocumentKind>("tax_invoice")
  const [projectId, setProjectId] = React.useState<string>("")
  const [profitCenter, setProfitCenter] = React.useState("")
  const [transactionMode, setTransactionMode] =
    React.useState<BillingTransactionMode>("manual")
  const [agentId, setAgentId] = React.useState<string>("")
  const [currencyCode, setCurrencyCode] = React.useState("ILS")
  const [fxRate, setFxRate] = React.useState(1)
  const [customerName, setCustomerName] = React.useState("")
  const [headerMemo, setHeaderMemo] = React.useState("")
  const [incomeAccountId, setIncomeAccountId] = React.useState("")
  const [lines, setLines] = React.useState<LineState[]>(() => [recalcLine(newLine())])
  const [saving, setSaving] = React.useState(false)

  const [wbsNodes, setWbsNodes] = React.useState<Array<{ id: string, label: string }>>([])
  const [pullOpen, setPullOpen] = React.useState(false)
  const [pullLoading, setPullLoading] = React.useState(false)
  const [pullSources, setPullSources] = React.useState<{
    progressReports: Array<{
      id: string
      label: string
      totalPayable: number
      status: string | null
    }>
    purchaseOrders: Array<{ id: string, label: string, totalAmount: number }>
  }>({ progressReports: [], purchaseOrders: [] })

  const [sourceProgressReportId, setSourceProgressReportId] = React.useState<string | null>(null)
  const [sourcePurchaseOrderId, setSourcePurchaseOrderId] = React.useState<string | null>(null)

  const [partQuery, setPartQuery] = React.useState<Record<string, string>>({})

  const [budgetCtx, setBudgetCtx] = React.useState<{
    committedPoIls: number
    recognizedRevenueIls: number
  } | null>(null)

  React.useEffect(() => {
    const r = workspace.fx[currencyCode.toUpperCase()]
    if (r != null && Number.isFinite(r)) setFxRate(r)
  }, [currencyCode, workspace.fx])

  React.useEffect(() => {
    if (!projectId) {
      setWbsNodes([])
      setPullSources({ progressReports: [], purchaseOrders: [] })
      return
    }
    let cancelled = false
    void (async () => {
      const [wbs, pull] = await Promise.all([
        fetchWbsNodesForProjectAction(projectId),
        fetchPullSourcesForProjectAction(projectId),
      ])
      if (cancelled) return
      if (wbs.ok) setWbsNodes(wbs.nodes)
      if (pull.ok) {
        setPullSources({
          progressReports: pull.progressReports,
          purchaseOrders: pull.purchaseOrders,
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  React.useEffect(() => {
    if (!projectId) {
      setBudgetCtx(null)
      return
    }
    let cancelled = false
    void (async () => {
      const b = await fetchBillingBudgetContextAction(projectId)
      if (cancelled) return
      if (b.ok) {
        setBudgetCtx({
          committedPoIls: b.committedPoIls,
          recognizedRevenueIls: b.recognizedRevenueIls,
        })
      } else {
        setBudgetCtx(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  React.useEffect(() => {
    const p = workspace.projects.find((x) => x.id === projectId)
    if (p) {
      setProfitCenter(
        [p.internal_project_code, p.name].filter(Boolean).join(" · ")
      )
    }
  }, [projectId, workspace.projects])

  const subtotal = React.useMemo(
    () => roundMoney(lines.reduce((s, l) => s + l.lineTotal, 0)),
    [lines]
  )
  const vatAmount = React.useMemo(
    () => roundMoney(subtotal * VAT_RATE),
    [subtotal]
  )
  const totalAmount = React.useMemo(
    () => roundMoney(subtotal + vatAmount),
    [subtotal, vatAmount]
  )

  const incomeAccounts = React.useMemo(
    () => workspace.accounts.filter((a) => a.is_active),
    [workspace.accounts]
  )

  function updateLine(id: string, patch: Partial<LineState>) {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? recalcLine({ ...l, ...patch }) : l))
    )
  }

  function onPickPart(lineId: string, partId: string) {
    const part = workspace.parts.find((p) => p.id === partId)
    if (!part) return
    const desc = [
      part.manufacturer?.trim(),
      part.part_number_supplier?.trim(),
      (part.description_48_chars || part.description_32_chars || "").trim(),
    ]
      .filter(Boolean)
      .join(" · ")
    const uGuess = (() => {
      const blob = [
        part.description_32_chars,
        part.description_48_chars,
        part.manufacturer,
        part.part_number_supplier,
      ]
        .join(" ")
        .toUpperCase()
      const sorted = [...workspace.uoms].sort(
        (a, b) => b.code.length - a.code.length
      )
      for (const u of sorted) {
        const c = u.code.toUpperCase()
        if (c && blob.includes(c)) return u.id
      }
      const ea = workspace.uoms.find((u) => u.code === "EA")
      return ea?.id ?? workspace.uoms[0]?.id ?? null
    })()
    updateLine(lineId, {
      supplierPartId: partId,
      description: desc,
      uomId: uGuess ?? null,
    })
  }

  async function runPull(
    sourceType: "progress_report" | "purchase_order",
    sourceId: string
  ) {
    if (!projectId) {
      toast.error("בחרו פרויקט לפני משיכה")
      return
    }
    setPullLoading(true)
    const res = await fetchBillingPrefillFromSourceAction({
      projectId,
      sourceType,
      sourceId,
    })
    setPullLoading(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setCustomerName(res.customerName)
    setHeaderMemo(res.headerMemo)
    setLines(
      res.lines.map((ln) =>
        recalcLine({
          ...newLine(),
          supplierPartId: ln.supplierPartId,
          description: ln.description,
          uomId: ln.uomId,
          quantity: ln.quantity,
          unitPrice: ln.unitPrice,
          discountPercent: ln.discountPercent,
          netUnitPrice: ln.netUnitPrice,
          lineTotal: ln.lineTotal,
          wbsNodeId: ln.wbsNodeId,
        })
      )
    )
    if (sourceType === "progress_report") {
      setSourceProgressReportId(sourceId)
      setSourcePurchaseOrderId(null)
    } else {
      setSourcePurchaseOrderId(sourceId)
      setSourceProgressReportId(null)
    }
    setPullOpen(false)
    toast.success("הושלם מילוי מהפרויקט")
  }

  async function onFinalize(e: React.FormEvent) {
    e.preventDefault()
    if (!customerName.trim()) {
      toast.error("נא להזין שם לקוח")
      return
    }
    if (!incomeAccountId) {
      toast.error("נא לבחור חשבון הכנסות")
      return
    }
    if (lines.length === 0) {
      toast.error("נדרשות שורות")
      return
    }
    setSaving(true)
    const res = await createFinalTaxInvoiceAction({
      issueDate,
      customerName: customerName.trim(),
      headerMemo: headerMemo.trim(),
      projectId: projectId || null,
      profitCenterLabel: profitCenter.trim() || null,
      documentKind,
      transactionMode,
      agentUserId: agentId || null,
      currencyCode,
      fxRateToIls: fxRate,
      incomeGlAccountId: incomeAccountId,
      sourceProgressReportId,
      sourcePurchaseOrderId,
      lines: lines.map((l) => ({
        supplierPartId: l.supplierPartId,
        description: l.description,
        uomId: l.uomId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        netUnitPrice: l.netUnitPrice,
        lineTotal: l.lineTotal,
        wbsNodeId: l.wbsNodeId,
      })),
      subtotal,
      vatAmount,
      totalAmount,
    })
    setSaving(false)
    if (!res.success) {
      toast.error(res.error)
      return
    }
    toast.success(
      `הופקה חשבונית — יומן טיוטה ${res.draftJournalEntryId.slice(0, 8)} · הכרה ₪${res.recognizedRevenueIls.toFixed(2)}`
    )
    setLines([recalcLine(newLine())])
    setSourceProgressReportId(null)
    setSourcePurchaseOrderId(null)
  }

  const fmtMoney = React.useMemo(() => {
    try {
      return new Intl.NumberFormat("he-IL", {
        style: "currency",
        currency: currencyCode === "ILS" ? "ILS" : currencyCode,
        maximumFractionDigits: 2,
      })
    } catch {
      return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 })
    }
  }, [currencyCode])

  const wbsLabelById = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const n of wbsNodes) {
      m.set(n.id, n.label)
    }
    return m
  }, [wbsNodes])

  return (
    <div
      dir="rtl"
      className="min-h-[calc(100vh-6rem)] bg-gradient-to-br from-[#04080f] via-[#0b1422] to-[#071a28] text-slate-100"
    >
      <div className="mx-auto max-w-[1920px] px-4 py-6 md:px-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400/90">
              <Sparkles className="size-5" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                Billing Control Center
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white md:text-3xl">
              מרחב עבודת חיוב
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              A4 משמאל · לוח בקרה מימין · משיכה מדוחות מאושרים · שיוך WBS לכל שורה · יומן טיוטה
              מאוזן
            </p>
          </div>
        </header>

        {projectId && budgetCtx ? (
          <div className="mb-6 rounded-2xl border border-blue-500/20 bg-blue-950/20 px-4 py-3 text-sm text-slate-300 backdrop-blur-sm">
            <span className="font-medium text-blue-200/90">הקשר תקציב פרויקט · </span>
            <span className="text-slate-400">התחייבות רכש (PO) </span>
            <span className="font-mono tabular-nums text-white">
              {new Intl.NumberFormat("he-IL", {
                style: "currency",
                currency: "ILS",
                maximumFractionDigits: 0,
              }).format(budgetCtx.committedPoIls)}
            </span>
            <span className="mx-2 text-slate-600">|</span>
            <span className="text-slate-400">הכרה מצטברת </span>
            <span className="font-mono tabular-nums text-emerald-200/90">
              {new Intl.NumberFormat("he-IL", {
                style: "currency",
                currency: "ILS",
                maximumFractionDigits: 0,
              }).format(budgetCtx.recognizedRevenueIls)}
            </span>
          </div>
        ) : null}

        <div
          className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-10"
          dir="ltr"
        >
          <div className="order-1 space-y-2" dir="rtl">
            <p className="text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">
              תצוגת A4 חיה
            </p>
            <A4LivePreview
              documentKind={documentKind}
              customerName={customerName}
              issueDate={issueDate}
              lines={lines}
              subtotal={subtotal}
              vatAmount={vatAmount}
              totalAmount={totalAmount}
              currencyLabel={currencyCode}
              formatMoney={(n) => fmtMoney.format(n)}
              wbsLabelById={wbsLabelById}
            />
          </div>

          <div className="order-2 space-y-2" dir="rtl">
            <p className="text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-400/85">
              לוח בקרה
            </p>
          <form onSubmit={onFinalize} className="space-y-4">
            <div className={cn(glass, "p-5")}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-sm font-semibold text-slate-300">
                  כותרת מסמך
                </h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!projectId}
                  className="shrink-0 border-emerald-400/35 bg-gradient-to-l from-emerald-500/15 to-emerald-600/10 text-emerald-100 hover:from-emerald-500/25 hover:to-emerald-600/15"
                  onClick={() => setPullOpen(true)}
                >
                  <GitBranch className="size-4" />
                  <span className="ms-2">משיכה מהפרויקט</span>
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-slate-400">סוג מסמך</Label>
                  <Select
                    value={documentKind}
                    onValueChange={(v) =>
                      setDocumentKind(v as BillingDocumentKind)
                    }
                  >
                    <SelectTrigger className="border-white/10 bg-white/5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="tax_invoice">חשבונית מס</SelectItem>
                      <SelectItem value="credit_note">חשבונית זיכוי</SelectItem>
                      <SelectItem value="proforma">חשבון עסקה (פרופורמה)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-400">תאריך הפקה</Label>
                  <Input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="border-white/10 bg-white/5"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-slate-400">פרויקט / סניף · מרכז רווח</Label>
                  <Select
                    value={projectId || "__none__"}
                    onValueChange={(v) => {
                      const s = v ?? ""
                      setProjectId(s === "__none__" ? "" : s)
                    }}
                  >
                    <SelectTrigger className="border-white/10 bg-white/5">
                      <SelectValue placeholder="בחרו פרויקט" />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="__none__">—</SelectItem>
                      {workspace.projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.internal_project_code ? `${p.internal_project_code} · ` : ""}
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={profitCenter}
                    onChange={(e) => setProfitCenter(e.target.value)}
                    placeholder="תווית מרכז רווח (ניתן לעריכה)"
                    className="border-white/10 bg-white/5 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-400">סוג תנועה</Label>
                  <Select
                    value={transactionMode}
                    onValueChange={(v) =>
                      setTransactionMode(v as BillingTransactionMode)
                    }
                  >
                    <SelectTrigger className="border-white/10 bg-white/5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="manual">ידני</SelectItem>
                      <SelectItem value="auto">אוטומטי</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-400">סוכן / מנהל פרויקט</Label>
                  <Select
                    value={agentId || "__none__"}
                    onValueChange={(v) => {
                      const s = v ?? ""
                      setAgentId(s === "__none__" ? "" : s)
                    }}
                  >
                    <SelectTrigger className="border-white/10 bg-white/5">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="__none__">—</SelectItem>
                      {workspace.agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className={cn(glass, "p-5")}>
              <h2 className="mb-4 text-sm font-semibold text-slate-300">
                מטבע ושער
              </h2>
              <Dialog open={pullOpen} onOpenChange={setPullOpen}>
                  <DialogContent
                    className="max-h-[85vh] overflow-y-auto border-white/10 bg-[#0c1220] text-slate-100"
                    dir="rtl"
                  >
                    <DialogHeader>
                      <DialogTitle>בחירת מקור למילוי</DialogTitle>
                      <p className="text-xs text-slate-500">
                        דוחות התקדמות: רק סטטוס <span className="text-emerald-400/90">מאושר</span>{" "}
                        (approved)
                      </p>
                    </DialogHeader>
                    {pullLoading ? (
                      <Loader2 className="size-6 animate-spin text-emerald-400" />
                    ) : (
                      <div className="space-y-6 text-sm">
                        <div>
                          <p className="mb-2 font-medium text-slate-400">
                            דוחות התקדמות
                          </p>
                          <ul className="space-y-2">
                            {pullSources.progressReports.length === 0 ? (
                              <li className="text-slate-500">אין דוחות</li>
                            ) : null}
                            {pullSources.progressReports.map((r) => (
                              <li key={r.id}>
                                <button
                                  type="button"
                                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-start hover:bg-white/10"
                                  onClick={() =>
                                    void runPull("progress_report", r.id)
                                  }
                                >
                                  {r.label}{" "}
                                  <span className="text-slate-500">
                                    ({r.status ?? "—"})
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="mb-2 font-medium text-slate-400">
                            הזמנות רכש (PO)
                          </p>
                          <ul className="space-y-2">
                            {pullSources.purchaseOrders.length === 0 ? (
                              <li className="text-slate-500">אין הזמנות</li>
                            ) : null}
                            {pullSources.purchaseOrders.map((p) => (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-start hover:bg-white/10"
                                  onClick={() =>
                                    void runPull("purchase_order", p.id)
                                  }
                                >
                                  <Truck className="size-4 shrink-0 text-slate-500" />
                                  {p.label}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </DialogContent>
              </Dialog>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-slate-400">מטבע</Label>
                  <Select
                    value={currencyCode}
                    onValueChange={(v) => setCurrencyCode(v ?? "ILS")}
                  >
                    <SelectTrigger className="border-white/10 bg-white/5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {workspace.currencies.map((c) => (
                        <SelectItem key={c.id} value={c.code}>
                          {c.code} — {c.name_he}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-slate-400">שער ל-ILS (הצגה)</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <Input
                      type="number"
                      step="0.0000001"
                      min="0"
                      value={fxRate}
                      onChange={(e) =>
                        setFxRate(Number(e.target.value) || 1)
                      }
                      className="max-w-[200px] border-white/10 bg-white/5 font-mono"
                    />
                    <span className="text-xs text-slate-500">
                      ייחוס: ILS 1 · USD {workspace.fx.USD ?? "—"} · EUR{" "}
                      {workspace.fx.EUR ?? "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className={cn(glass, "p-5")}>
              <h2 className="mb-4 text-sm font-semibold text-slate-300">
                לקוח וחשבון הכנסות
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-slate-400">שם לקוח</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="border-white/10 bg-white/5"
                    required
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-slate-400">הערות כותרת</Label>
                  <Input
                    value={headerMemo}
                    onChange={(e) => setHeaderMemo(e.target.value)}
                    className="border-white/10 bg-white/5"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-slate-400">חשבון הכנסות</Label>
                  <Select
                    value={incomeAccountId || undefined}
                    onValueChange={(v) => setIncomeAccountId(v ?? "")}
                    required
                  >
                    <SelectTrigger className="border-white/10 bg-white/5">
                      <SelectValue placeholder="בחרו חשבון" />
                    </SelectTrigger>
                    <SelectContent dir="rtl" className="max-h-64">
                      {incomeAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.account_code} — {a.account_name_he}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className={cn(glass, "p-5")}>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-300">
                  שורות חיוב
                </h2>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-white/15 bg-white/5"
                  onClick={() => setLines((p) => [...p, recalcLine(newLine())])}
                >
                  <Plus className="size-4" />
                  שורה
                </Button>
              </div>
              <div className="space-y-4">
                {lines.map((line, idx) => {
                  const pq = partQuery[line.id] ?? ""
                  const filteredParts = workspace.parts.filter((pt) => {
                    const blob = [
                      pt.part_number_supplier,
                      pt.description_32_chars,
                      pt.manufacturer,
                    ]
                      .join(" ")
                      .toLowerCase()
                    return !pq.trim() || blob.includes(pq.trim().toLowerCase())
                  }).slice(0, 40)
                  return (
                    <div
                      key={line.id}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-sm"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">
                          שורה {idx + 1}
                        </span>
                        {lines.length > 1 ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8 text-slate-500 hover:text-red-400"
                            onClick={() =>
                              setLines((p) => p.filter((x) => x.id !== line.id))
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-500">
                            מק״ט ספק
                          </Label>
                          <Input
                            placeholder="חיפוש…"
                            value={pq}
                            onChange={(e) =>
                              setPartQuery((m) => ({
                                ...m,
                                [line.id]: e.target.value,
                              }))
                            }
                            className="mb-2 h-9 border-white/10 bg-white/5 text-xs"
                          />
                          <Select
                            value={line.supplierPartId || "__none__"}
                            onValueChange={(v) => {
                              const s = v ?? ""
                              if (s === "__none__") {
                                updateLine(line.id, { supplierPartId: null })
                              } else {
                                onPickPart(line.id, s)
                              }
                            }}
                          >
                            <SelectTrigger className="border-white/10 bg-white/5 text-xs">
                              <SelectValue placeholder="בחרו מק״ט" />
                            </SelectTrigger>
                            <SelectContent dir="rtl" className="max-h-56">
                              <SelectItem value="__none__">—</SelectItem>
                              {filteredParts.map((pt) => (
                                <SelectItem key={pt.id} value={pt.id}>
                                  {pt.part_number_supplier || pt.id.slice(0, 8)}{" "}
                                  · {(pt.description_32_chars || "").slice(0, 36)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-500">תיאור</Label>
                          <Input
                            value={line.description}
                            onChange={(e) =>
                              updateLine(line.id, { description: e.target.value })
                            }
                            className="border-white/10 bg-white/5"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-500">יחידה</Label>
                          <Select
                            value={line.uomId || "__none__"}
                            onValueChange={(v) =>
                              updateLine(line.id, {
                                uomId: v === "__none__" ? null : v,
                              })
                            }
                          >
                            <SelectTrigger className="border-white/10 bg-white/5 text-xs">
                              <SelectValue placeholder="UOM" />
                            </SelectTrigger>
                            <SelectContent dir="rtl">
                              <SelectItem value="__none__">—</SelectItem>
                              {workspace.uoms.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.code} ({u.description_he})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-500">כמות</Label>
                          <Input
                            type="number"
                            step="0.0001"
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(line.id, {
                                quantity: Number(e.target.value),
                              })
                            }
                            className="border-white/10 bg-white/5 font-mono text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-500">
                            מחיר יחידה
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) =>
                              updateLine(line.id, {
                                unitPrice: Number(e.target.value),
                              })
                            }
                            className="border-white/10 bg-white/5 font-mono text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-500">
                            הנחה %
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={line.discountPercent}
                            onChange={(e) =>
                              updateLine(line.id, {
                                discountPercent: Number(e.target.value),
                              })
                            }
                            className="border-white/10 bg-white/5 font-mono text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-slate-500">
                            מחיר נטו
                          </Label>
                          <div className="flex h-10 items-center rounded-md bg-white/5 px-3 font-mono text-sm text-emerald-200/90">
                            {roundMoney(line.netUnitPrice).toFixed(2)}
                          </div>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label className="text-[11px] text-slate-500">
                            משימת תקציב (WBS)
                          </Label>
                          {!projectId ? (
                            <p className="text-[11px] text-amber-200/70">
                              בחרו פרויקט כדי לטעון משימות תקציב
                            </p>
                          ) : null}
                          <Select
                            value={line.wbsNodeId || "__none__"}
                            disabled={!projectId}
                            onValueChange={(v) =>
                              updateLine(line.id, {
                                wbsNodeId: v === "__none__" ? null : v,
                              })
                            }
                          >
                            <SelectTrigger className="border-white/10 bg-white/5 text-xs">
                              <SelectValue placeholder="אבן דרך / משימה" />
                            </SelectTrigger>
                            <SelectContent dir="rtl">
                              <SelectItem value="__none__">—</SelectItem>
                              {wbsNodes.map((n) => (
                                <SelectItem key={n.id} value={n.id}>
                                  {n.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="md:col-span-2 space-y-1 border-t border-white/5 pt-2 text-[11px]">
                          <div className="flex justify-end text-sm">
                            <span className="text-slate-500">סכום שורה · </span>
                            <span className="ms-2 font-mono font-semibold text-white">
                              {fmtMoney.format(line.lineTotal)}
                            </span>
                          </div>
                          {projectId && budgetCtx && subtotal > 0 ? (
                            <div className="flex flex-wrap justify-between gap-2 text-slate-500">
                              <span>השפעה יחסית על התחייבות רכש (PO)</span>
                              <span className="font-mono text-blue-200/90">
                                {new Intl.NumberFormat("he-IL", {
                                  style: "currency",
                                  currency: "ILS",
                                  maximumFractionDigits: 0,
                                }).format(
                                  (line.lineTotal / subtotal) *
                                    budgetCtx.committedPoIls
                                )}
                              </span>
                            </div>
                          ) : null}
                          {projectId && budgetCtx && subtotal > 0 ? (
                            <div className="flex flex-wrap justify-between gap-2 text-slate-500">
                              <span>הכרה הכנסות (יחסי מסך זה, ILS)</span>
                              <span className="font-mono text-emerald-200/80">
                                {new Intl.NumberFormat("he-IL", {
                                  style: "currency",
                                  currency: "ILS",
                                  maximumFractionDigits: 0,
                                }).format(
                                  (line.lineTotal / subtotal) *
                                    roundMoney(totalAmount * fxRate)
                                )}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div
              className={cn(
                glass,
                "flex flex-wrap items-center justify-between gap-4 border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-slate-950/30 to-slate-950/50 p-5 shadow-[0_12px_48px_-12px_rgba(16,185,129,0.35)]"
              )}
            >
              <div className="text-sm text-slate-400">
                <span>סה״כ לפני מע״מ · </span>
                <span className="font-mono text-slate-100">
                  {fmtMoney.format(subtotal)}
                </span>
                <span className="mx-2">|</span>
                <span>מע״מ · </span>
                <span className="font-mono text-slate-100">
                  {fmtMoney.format(vatAmount)}
                </span>
                <span className="mx-2">|</span>
                <span className="text-emerald-300/90">לתשלום · </span>
                <span className="font-mono text-lg font-bold text-emerald-200">
                  {fmtMoney.format(totalAmount)}
                </span>
              </div>
              <Button
                type="submit"
                disabled={saving}
                className="h-12 min-w-[220px] rounded-xl bg-gradient-to-l from-emerald-500 via-emerald-400 to-teal-500 px-8 text-base font-semibold text-white shadow-[0_0_48px_-6px_rgba(16,185,129,0.85)] transition-all hover:from-emerald-400 hover:via-emerald-300 hover:to-teal-400"
              >
                {saving ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <FileText className="size-5" />
                )}
                <span className="ms-2">הפקה סופית מאוזנת</span>
              </Button>
            </div>
          </form>
          </div>
        </div>
      </div>
    </div>
  )
}

function A4LivePreview(props: {
  documentKind: BillingDocumentKind
  customerName: string
  issueDate: string
  lines: LineState[]
  subtotal: number
  vatAmount: number
  totalAmount: number
  currencyLabel: string
  formatMoney: (n: number) => string
  wbsLabelById: Map<string, string>
}) {
  const title = DOC_LABEL[props.documentKind]
  return (
    <div className="flex min-h-[520px] flex-col items-center justify-start lg:sticky lg:top-6">
      <div
        className="flex w-full max-w-md flex-col rounded-sm border border-white/60 bg-gradient-to-b from-white to-slate-50/98 p-10 text-slate-900 shadow-[0_28px_90px_-24px_rgba(16,185,129,0.18)] ring-1 ring-emerald-500/15"
        style={{ aspectRatio: "1 / 1.414", minHeight: 640 }}
        dir="rtl"
      >
        <header className="pb-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
            מרקר אופק יזמות בע״מ
          </p>
          <h3 className="mt-3 text-xl font-bold tracking-tight text-slate-900">
            {title}
          </h3>
        </header>
        <div className="space-y-3 border-b border-slate-200/60 pb-5 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">לכבוד</span>
            <span className="max-w-[60%] text-left font-medium leading-snug">
              {props.customerName.trim() || "שם לקוח"}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">תאריך</span>
            <span className="tabular-nums">{props.issueDate || "—"}</span>
          </div>
          <div className="flex justify-between gap-4 text-xs text-slate-500">
            <span>מטבע</span>
            <span>{props.currencyLabel}</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden pt-5">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="pb-2 text-right font-medium">תיאור / WBS</th>
                <th className="w-[28%] pb-2 text-left font-medium">סכום</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {props.lines.map((l) => {
                const wbs =
                  l.wbsNodeId && props.wbsLabelById.has(l.wbsNodeId)
                    ? props.wbsLabelById.get(l.wbsNodeId)
                    : null
                return (
                  <tr key={l.id} className="align-top">
                    <td className="py-2.5 pr-0 leading-snug">
                      <span className="block">{l.description.trim() || "—"}</span>
                      {wbs ? (
                        <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                          WBS · {wbs}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pl-0 text-left font-mono tabular-nums">
                      {props.formatMoney(l.lineTotal)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-auto space-y-2.5 pt-6 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>סכום לפני מע״מ</span>
            <span className="font-mono tabular-nums font-medium text-slate-900">
              {props.formatMoney(props.subtotal)}
            </span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>מע״מ {Math.round(VAT_RATE * 100)}%</span>
            <span className="font-mono tabular-nums font-medium text-slate-900">
              {props.formatMoney(props.vatAmount)}
            </span>
          </div>
          <div className="flex justify-between border-t border-slate-200/80 pt-3 text-base font-bold text-slate-900">
            <span>סה״כ</span>
            <span className="font-mono tabular-nums">
              {props.formatMoney(props.totalAmount)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
