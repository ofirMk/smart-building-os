"use client"

import dynamic from "next/dynamic"
import * as React from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Plus,
  Shield,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import {
  MoTaxInvoicePdfDocument,
  type MoTaxInvoicePdfLine,
} from "@/components/marker-ofek/invoices/mo-tax-invoice-pdf"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAiAssistantScreenContext } from "@/components/dashboard/ai-assistant-screen-context"
import { TaxIdMismatchDraggableAlert } from "@/components/marker-ofek/finance/tax-id-mismatch-alert"
import {
  type FinanceInvoiceLine,
  type FinanceTotals,
  createFinanceClientRow,
  markFinanceInvoicePaid,
  requestFinanceInvoiceAllocation,
  saveFinanceInvoiceDraft,
} from "@/lib/finance/finance-invoice-actions"
import { ALLOCATION_REQUIRED_ABOVE_NIS } from "@/lib/finance/israel-tax-api"
import { verifyClientTaxIdAgainstGovernmentRegistry } from "@/lib/finance/tax-id-verify-actions"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-slate-500">
        טוען תצוגה…
      </div>
    ),
  }
)

type ClientRow = {
  id: string
  name: string
  tax_id: string | null
  address: string | null
  email: string | null
  payment_terms_days: number | null
}

type ProjectRow = { id: string; name: string }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type InvoiceCommanderClientProps = {
  defaultVatPercent: number
  nextInvoiceNumberHint: number | null
  /** מילוי אוטומטי מניווט קולי / query string */
  voicePrefill?: { clientName?: string; amount?: number } | null
  company: {
    company_name: string
    legal_id: string | null
    vat_registration_number: string | null
    address: string | null
  }
}

export function InvoiceCommanderClient({
  defaultVatPercent,
  nextInvoiceNumberHint,
  voicePrefill = null,
  company,
}: InvoiceCommanderClientProps) {
  const [clients, setClients] = React.useState<ClientRow[]>([])
  const [projects, setProjects] = React.useState<ProjectRow[]>([])
  const [loadingRefs, setLoadingRefs] = React.useState(true)

  const [clientId, setClientId] = React.useState("")
  const [clientQuery, setClientQuery] = React.useState("")
  const [projectId, setProjectId] = React.useState("")
  const [docType, setDocType] = React.useState<
    "TAX_INVOICE" | "TRANSACTION" | "CREDIT"
  >("TAX_INVOICE")

  const [savedInvoiceId, setSavedInvoiceId] = React.useState<string | null>(null)
  const [invoiceNumber, setInvoiceNumber] = React.useState<number | null>(
    nextInvoiceNumberHint
  )
  const [status, setStatus] = React.useState<
    "DRAFT" | "PENDING_ALLOCATION" | "APPROVED" | "PAID"
  >("DRAFT")
  const [allocationNumber, setAllocationNumber] = React.useState<string | null>(
    null
  )
  const [taxAuthorityRef, setTaxAuthorityRef] = React.useState<string | null>(
    null
  )

  const [issueDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [dueDate, setDueDate] = React.useState("")

  const [lines, setLines] = React.useState<
    {
      id: string
      description: string
      qty: string
      unit_price: string
      vat_rate: string
    }[]
  >([
    {
      id: crypto.randomUUID(),
      description: "",
      qty: "1",
      unit_price: "",
      vat_rate: String(defaultVatPercent),
    },
  ])

  const [saving, setSaving] = React.useState(false)
  const [allocating, setAllocating] = React.useState(false)
  const [newClientOpen, setNewClientOpen] = React.useState(false)
  const [newClientName, setNewClientName] = React.useState("")
  const [newClientTax, setNewClientTax] = React.useState("")
  const [newClientSaving, setNewClientSaving] = React.useState(false)

  const screenCtx = useAiAssistantScreenContext()
  const verifyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [taxMismatchOpen, setTaxMismatchOpen] = React.useState(false)
  const [taxMismatchMsg, setTaxMismatchMsg] = React.useState("")
  const [taxMismatchReg, setTaxMismatchReg] = React.useState<string | null>(null)

  const runTaxVerify = React.useCallback(async (taxId: string, name: string) => {
    const digits = taxId.replace(/\D/g, "")
    if (digits.length < 8 || !name.trim()) {
      setTaxMismatchOpen(false)
      return
    }
    const res = await verifyClientTaxIdAgainstGovernmentRegistry({
      taxId: digits,
      clientName: name.trim(),
    })
    if (!res.ok) {
      setTaxMismatchOpen(false)
      return
    }
    if (res.match) {
      setTaxMismatchOpen(false)
      return
    }
    setTaxMismatchMsg(res.message)
    setTaxMismatchReg(res.registryName ?? null)
    setTaxMismatchOpen(true)
  }, [])

  React.useEffect(() => {
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
    verifyTimerRef.current = setTimeout(() => {
      if (newClientOpen) {
        void runTaxVerify(newClientTax, newClientName)
        return
      }
      const c = clients.find((x) => x.id === clientId)
      if (!c?.tax_id?.trim() || !c.name?.trim()) {
        setTaxMismatchOpen(false)
        return
      }
      void runTaxVerify(c.tax_id, c.name)
    }, 650)
    return () => {
      if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
    }
  }, [
    newClientOpen,
    newClientTax,
    newClientName,
    clientId,
    clients,
    runTaxVerify,
  ])

  React.useEffect(() => {
    if (!screenCtx) return
    const c = clients.find((x) => x.id === clientId)
    const p = projects.find((x) => x.id === projectId)
    const linesBrief = lines
      .filter((l) => l.description.trim() !== "")
      .slice(0, 10)
      .map((l) => `${l.description.slice(0, 60)} ×${l.qty}`)
      .join(" · ")
    const draftHint =
      newClientOpen && (newClientTax.trim() !== "" || newClientName.trim() !== "")
        ? ` | טיוטת לקוח חדש: «${newClientName}» ח.פ ${newClientTax}`
        : ""
    screenCtx.setDigest(
      `מסך חשבונית מס (פיקוד חשבוניות). סטטוס: ${status}. לקוח: ${c?.name ?? "לא נבחר"}${draftHint}. ח.פ במערכת: ${c?.tax_id ?? "—"}. פרויקט: ${p?.name ?? "ללא"}. מספר חשבונית: ${invoiceNumber ?? nextInvoiceNumberHint ?? "—"}. שורות: ${linesBrief}`
    )
    return () => {
      screenCtx.setDigest(null)
    }
  }, [
    screenCtx,
    clients,
    clientId,
    projects,
    projectId,
    lines,
    status,
    invoiceNumber,
    nextInvoiceNumberHint,
    newClientOpen,
    newClientTax,
    newClientName,
  ])

  const voiceClientAppliedRef = React.useRef(false)
  const voiceAmountAppliedRef = React.useRef(false)

  React.useEffect(() => {
    if (
      voiceClientAppliedRef.current ||
      loadingRefs ||
      !voicePrefill?.clientName?.trim()
    ) {
      return
    }
    const name = voicePrefill.clientName.trim()
    if (clients.length === 0) {
      setClientQuery(name)
      voiceClientAppliedRef.current = true
      return
    }
    const lower = name.toLowerCase()
    const exact = clients.find((c) => c.name.trim().toLowerCase() === lower)
    const fuzzy = clients.find(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        lower.includes(c.name.toLowerCase())
    )
    const pick = exact ?? fuzzy
    if (pick) {
      setClientId(pick.id)
      setClientQuery(pick.name)
    } else {
      setClientQuery(name)
    }
    voiceClientAppliedRef.current = true
  }, [loadingRefs, voicePrefill?.clientName, clients, voicePrefill])

  React.useEffect(() => {
    if (
      voiceAmountAppliedRef.current ||
      loadingRefs ||
      voicePrefill?.amount === undefined ||
      !Number.isFinite(voicePrefill.amount) ||
      voicePrefill.amount < 0
    ) {
      return
    }
    const amt = voicePrefill.amount
    setLines((prev) => {
      if (prev.length === 0) return prev
      const [first, ...rest] = prev
      return [
        {
          ...first,
          qty: "1",
          unit_price: String(amt),
        },
        ...rest,
      ]
    })
    voiceAmountAppliedRef.current = true
  }, [loadingRefs, voicePrefill?.amount, voicePrefill])

  React.useEffect(() => {
    let c = false
    void (async () => {
      setLoadingRefs(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const [cr, pr] = await Promise.all([
          supabase
            .from("finance_clients")
            .select("id, name, tax_id, address, email, payment_terms_days")
            .eq("is_deleted", false)
            .order("name", { ascending: true })
            .limit(500),
          supabase
            .from("projects")
            .select("id, name")
            .eq("is_deleted", false)
            .order("name", { ascending: true })
            .limit(500),
        ])
        if (cr.error) {
          if (
            !String(cr.error.message).includes("does not exist") &&
            !String(cr.error.message).includes("schema cache")
          ) {
            throw cr.error
          }
        }
        if (pr.error) throw pr.error
        if (!c) {
          setClients((cr.data as ClientRow[]) ?? [])
          setProjects((pr.data as ProjectRow[]) ?? [])
        }
      } catch (e) {
        if (!c) toast.error(formatError(e))
      } finally {
        if (!c) setLoadingRefs(false)
      }
    })()
    return () => {
      c = true
    }
  }, [])

  const parsedLines = React.useMemo(() => {
    const out: FinanceInvoiceLine[] = []
    const sign = docType === "CREDIT" ? -1 : 1
    for (const row of lines) {
      const qty = round2(parseFloat(String(row.qty).replace(",", ".")) || 0)
      const up = round2(parseFloat(String(row.unit_price).replace(",", ".")) || 0)
      const vr = round2(parseFloat(String(row.vat_rate).replace(",", ".")) || 0)
      if (qty === 0 || row.description.trim() === "") continue
      const net = round2(qty * up * sign)
      const vatPart = round2(net * (vr / 100))
      const total = round2(net + vatPart)
      out.push({
        description: row.description.trim(),
        qty,
        unit_price: round2(up * sign),
        vat_rate: vr,
        total,
      })
    }
    return out
  }, [lines, docType])

  const totals = React.useMemo((): FinanceTotals => {
    let sub = 0
    let vat = 0
    let tot = 0
    const sign = docType === "CREDIT" ? -1 : 1
    for (const row of lines) {
      const qty = round2(parseFloat(String(row.qty).replace(",", ".")) || 0)
      const up = round2(parseFloat(String(row.unit_price).replace(",", ".")) || 0)
      const vr = round2(parseFloat(String(row.vat_rate).replace(",", ".")) || 0)
      if (qty === 0 || row.description.trim() === "") continue
      const net = round2(qty * up * sign)
      const vatPart = round2(net * (vr / 100))
      sub = round2(sub + net)
      vat = round2(vat + vatPart)
      tot = round2(tot + net + vatPart)
    }
    return { subtotal: sub, vat, total: tot }
  }, [lines, docType])

  const selectedClient = clients.find((x) => x.id === clientId)
  const needsAllocation =
    Math.abs(totals.total) > ALLOCATION_REQUIRED_ABOVE_NIS

  const pdfLinesSimple: MoTaxInvoicePdfLine[] = React.useMemo(() => {
    return parsedLines.map((l) => {
      const net = round2(l.qty * l.unit_price)
      return {
        description: l.description,
        quantity: Math.abs(l.qty),
        unitPrice: Math.abs(l.unit_price),
        lineTotal: Math.abs(net),
        vatRatePercent: l.vat_rate,
      }
    })
  }, [parsedLines])

  const vatPctDisplay = React.useMemo(() => {
    if (parsedLines.length === 0) return defaultVatPercent
    return round2(
      parsedLines.reduce((s, l) => s + l.vat_rate, 0) / parsedLines.length
    )
  }, [parsedLines, defaultVatPercent])

  const customer = selectedClient
  const issueDateDisplay = React.useMemo(() => {
    try {
      return new Date(`${issueDate}T12:00:00`).toLocaleDateString("he-IL", {
        dateStyle: "long",
      })
    } catch {
      return issueDate
    }
  }, [issueDate])

  const pdfProps = React.useMemo(
    () => ({
      copyLabel: "מקור" as const,
      previewInvoiceNumber: invoiceNumber,
      issueDate,
      companyName: company.company_name || "—",
      companyLegalId: company.legal_id,
      companyVatNumber: company.vat_registration_number,
      companyAddress: company.address,
      customerName: customer?.name?.trim() || "—",
      customerLegalId: customer?.tax_id ?? null,
      customerAddress: customer?.address ?? null,
      projectLabel:
        projects.find((p) => p.id === projectId)?.name?.trim() ?? null,
      contractLabel: null,
      incomeKindLabel:
        docType === "TAX_INVOICE"
          ? "חשבונית מס"
          : docType === "TRANSACTION"
            ? "עסקה / תקבול"
            : "חשבונית זיכוי",
      lines: pdfLinesSimple,
      subtotal: Math.abs(totals.subtotal),
      vatRatePercent: vatPctDisplay,
      vatAmount: Math.abs(totals.vat),
      grandTotal: Math.abs(totals.total),
      digitalSignatureSha256: null as string | null,
      allocationNumber,
      taxAuthorityRef,
      dueDate: dueDate || null,
    }),
    [
      invoiceNumber,
      issueDate,
      company,
      customer,
      projects,
      projectId,
      docType,
      pdfLinesSimple,
      totals,
      vatPctDisplay,
      allocationNumber,
      taxAuthorityRef,
      dueDate,
    ]
  )

  const filteredClients = React.useMemo(() => {
    const q = clientQuery.trim().toLowerCase()
    if (!q) return clients.slice(0, 80)
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.tax_id && c.tax_id.toLowerCase().includes(q))
      )
      .slice(0, 80)
  }, [clients, clientQuery])

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description: "",
        qty: "1",
        unit_price: "",
        vat_rate: String(defaultVatPercent),
      },
    ])
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)))
  }

  async function handleSaveDraft() {
    if (!clientId.trim()) {
      toast.error("נא לבחור לקוח.")
      return
    }
    if (parsedLines.length === 0) {
      toast.error("נא למלא לפחות שורה אחת.")
      return
    }
    setSaving(true)
    try {
      const res = await saveFinanceInvoiceDraft({
        id: savedInvoiceId,
        clientId: clientId.trim(),
        projectId: projectId.trim() || null,
        type: docType,
        items: parsedLines,
        totals,
        dueDate: dueDate.trim() || null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setSavedInvoiceId(res.invoiceId)
      setInvoiceNumber(res.invoiceNumber)
      setStatus("DRAFT")
      toast.success(`טיוטה נשמרה — מספר ${res.invoiceNumber}`)
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleAllocation() {
    if (!savedInvoiceId) {
      toast.error("שמרו טיוטה לפני בקשת הקצאה.")
      return
    }
    setAllocating(true)
    try {
      const res = await requestFinanceInvoiceAllocation(savedInvoiceId)
      if (!res.ok) {
        if ("pending" in res && res.pending) {
          setStatus("PENDING_ALLOCATION")
          toast.message(res.error, { duration: 6000 })
        } else {
          toast.error(res.error)
        }
        return
      }
      setAllocationNumber(res.allocationNumber)
      setTaxAuthorityRef(res.taxAuthorityRef)
      setStatus(res.status)
      toast.success(`הוקצה: ${res.allocationNumber}`)
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setAllocating(false)
    }
  }

  async function handlePaid() {
    if (!savedInvoiceId) return
    setSaving(true)
    try {
      const res = await markFinanceInvoicePaid(savedInvoiceId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setStatus("PAID")
      toast.success("סומן כשולם")
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  const [pdfDownloading, setPdfDownloading] = React.useState(false)
  const handleGeneratePdf = React.useCallback(async () => {
    setPdfDownloading(true)
    try {
      const { pdf } = await import("@react-pdf/renderer")
      const blob = await pdf(
        <MoTaxInvoicePdfDocument {...pdfProps} />
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `חשבונית-${invoiceNumber ?? "טיוטה"}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success("הורדת PDF")
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setPdfDownloading(false)
    }
  }, [pdfProps, invoiceNumber])

  async function handleCreateClient() {
    if (!newClientName.trim()) {
      toast.error("שם לקוח חובה")
      return
    }
    setNewClientSaving(true)
    try {
      const res = await createFinanceClientRow({
        name: newClientName.trim(),
        tax_id: newClientTax.trim() || null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setClients((prev) => [
        ...prev,
        {
          id: res.id,
          name: newClientName.trim(),
          tax_id: newClientTax.trim() || null,
          address: null,
          email: null,
          payment_terms_days: null,
        },
      ])
      setClientId(res.id)
      setNewClientOpen(false)
      setNewClientName("")
      setNewClientTax("")
      toast.success("לקוח נוסף")
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setNewClientSaving(false)
    }
  }

  const statusBadge = (() => {
    const base =
      "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
    switch (status) {
      case "PAID":
        return (
          <span
            className={cn(
              base,
              "border-emerald-500/40 bg-emerald-950/50 text-emerald-300"
            )}
          >
            <CheckCircle2 className="size-3.5" aria-hidden />
            שולם
          </span>
        )
      case "APPROVED":
        return (
          <span
            className={cn(
              base,
              "border-slate-600 bg-slate-800 text-slate-200"
            )}
          >
            <Shield className="size-3.5" aria-hidden />
            מאושר / הוקצה
          </span>
        )
      case "PENDING_ALLOCATION":
        return (
          <span
            className={cn(
              base,
              "border-amber-500/40 bg-amber-950/40 text-amber-200"
            )}
          >
            <AlertTriangle className="size-3.5" aria-hidden />
            ממתין להקצאה
          </span>
        )
      default:
        return (
          <span
            className={cn(
              base,
              "border-slate-600 bg-slate-900 text-slate-400"
            )}
          >
            טיוטה
          </span>
        )
    }
  })()

  const fieldLabel = "mb-1.5 block text-sm font-medium text-slate-400"
  const fieldInput = cn(
    "h-11 w-full rounded-lg border border-slate-700/80 bg-slate-950/25 px-3 text-base text-slate-100 shadow-sm",
    "placeholder:text-slate-500 transition-[border-color,box-shadow]",
    "focus-visible:border-emerald-500/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
  )

  return (
    <div
      className="flex min-h-[calc(100dvh-4rem)] flex-col bg-slate-950 text-slate-100"
      dir="rtl"
    >
      <header className="shrink-0 border-b border-slate-800 bg-slate-950 px-5 py-4 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-emerald-500/90">
              כספים · חשבונית מס
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                הפקת חשבונית מס
              </h1>
              {statusBadge}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
              מעל {ALLOCATION_REQUIRED_ABOVE_NIS.toLocaleString("he-IL")} ₪ נדרשת הקצאה
              מרשות המסים לפני סימון תשלום.
            </p>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-stretch">
        {/* מובייל: תצוגה למעלה · דסקטופ RTL: טופס ימין (~42%) */}
        <aside className="order-2 flex min-h-0 w-full flex-col border-slate-800 lg:order-1 lg:w-[42%] lg:max-w-xl lg:shrink-0 lg:border-s">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 lg:px-6">
            {loadingRefs ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="size-5 animate-spin" aria-hidden />
                טוען נתונים…
              </div>
            ) : null}

            {needsAllocation && !allocationNumber ? (
              <div className="mb-6 flex gap-3 rounded-xl border border-amber-500/25 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
                <AlertTriangle className="size-4 shrink-0 text-amber-400" />
                <span>
                  סכום מעל {ALLOCATION_REQUIRED_ABOVE_NIS.toLocaleString("he-IL")} ₪ —
                  נדרש מספר הקצאה לפני סימון תשלום.
                </span>
              </div>
            ) : null}

            <div className="space-y-6">
              <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-100">
                    פרטי לקוח
                  </h2>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 border-slate-600 bg-transparent text-sm text-slate-200 hover:bg-slate-800/80"
                    onClick={() => setNewClientOpen(true)}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    לקוח חדש
                  </Button>
                </div>
                <div className="grid gap-5">
                  <div>
                    <Label htmlFor="inv-client-search" className={fieldLabel}>
                      חיפוש לקוח
                    </Label>
                    <Input
                      id="inv-client-search"
                      value={clientQuery}
                      onChange={(e) => setClientQuery(e.target.value)}
                      placeholder="שם או ח.פ…"
                      className={fieldInput}
                    />
                  </div>
                  <div>
                    <Label className={fieldLabel}>בחירת לקוח</Label>
                    <Select
                      value={clientId || undefined}
                      onValueChange={(v) => {
                        const id = v ?? ""
                        setClientId(id)
                        const cl = clients.find((c) => c.id === id)
                        if (cl) setClientQuery(String(cl.name ?? ""))
                      }}
                    >
                      <SelectTrigger
                        className={cn(fieldInput, "flex h-11 items-center")}
                      >
                        <SelectValue placeholder="בחרו לקוח מהרשימה" />
                      </SelectTrigger>
                      <SelectContent className="z-[120] max-h-64">
                        {filteredClients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                            {c.tax_id ? ` · ${c.tax_id}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-lg border border-slate-800/80 bg-slate-950/20 px-4 py-3">
                    <p className="text-sm font-medium text-slate-300">
                      {selectedClient?.name?.trim() || "לא נבחר לקוח"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      <span className="text-slate-400">ח.פ / ע.מ: </span>
                      <span dir="ltr" className="font-mono text-slate-300">
                        {selectedClient?.tax_id?.trim() || "—"}
                      </span>
                    </p>
                    {selectedClient?.email ? (
                      <p className="mt-2 text-xs text-slate-500">
                        {selectedClient.email}
                        {selectedClient.payment_terms_days != null
                          ? ` · תנאי תשלום ${selectedClient.payment_terms_days} ימים`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm">
                <h2 className="mb-5 text-sm font-semibold text-slate-100">
                  פרטי חשבונית
                </h2>
                <div className="grid gap-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <span className={fieldLabel}>תאריך הנפקה</span>
                      <p className="flex h-11 items-center rounded-lg border border-slate-800/90 bg-slate-950/20 px-3 text-base text-slate-200">
                        {issueDateDisplay}
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="inv-due" className={fieldLabel}>
                        תאריך יעד לתשלום
                      </Label>
                      <Input
                        id="inv-due"
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className={cn(fieldInput, "font-mono")}
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className={fieldLabel}>סוג מסמך</Label>
                    <Select
                      value={docType}
                      onValueChange={(v) =>
                        setDocType(v as "TAX_INVOICE" | "TRANSACTION" | "CREDIT")
                      }
                    >
                      <SelectTrigger
                        className={cn(fieldInput, "flex h-11 items-center")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[120]">
                        <SelectItem value="TAX_INVOICE">חשבונית מס</SelectItem>
                        <SelectItem value="TRANSACTION">עסקה / תקבול</SelectItem>
                        <SelectItem value="CREDIT">זיכוי</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className={fieldLabel}>פרויקט (אופציונלי)</Label>
                    <Select
                      value={projectId || "__none__"}
                      onValueChange={(v) =>
                        setProjectId(!v || v === "__none__" ? "" : v)
                      }
                    >
                      <SelectTrigger
                        className={cn(fieldInput, "flex h-11 items-center")}
                      >
                        <SelectValue placeholder="ללא" />
                      </SelectTrigger>
                      <SelectContent className="z-[120]">
                        <SelectItem value="__none__">ללא</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-100">
                    שורות חיוב
                  </h2>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 border-slate-600 bg-transparent text-sm"
                    onClick={addLine}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    שורה
                  </Button>
                </div>
                <div className="space-y-4">
                  {lines.map((row, idx) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/20 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-400">
                          שורה {idx + 1}
                        </span>
                        <button
                          type="button"
                          className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-rose-400"
                          onClick={() => removeLine(row.id)}
                          aria-label="הסר שורה"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="mb-4">
                        <Label className={fieldLabel}>תיאור</Label>
                        <Input
                          placeholder="תיאור השירות או הפריט"
                          value={row.description}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((r) =>
                                r.id === row.id
                                  ? { ...r, description: e.target.value }
                                  : r
                              )
                            )
                          }
                          className={fieldInput}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div>
                          <Label className={fieldLabel}>כמות</Label>
                          <Input
                            className={cn(fieldInput, "font-mono")}
                            dir="ltr"
                            value={row.qty}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((r) =>
                                  r.id === row.id
                                    ? { ...r, qty: e.target.value }
                                    : r
                                )
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label className={fieldLabel}>מחיר לפני מע״מ</Label>
                          <Input
                            className={cn(fieldInput, "font-mono")}
                            dir="ltr"
                            value={row.unit_price}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((r) =>
                                  r.id === row.id
                                    ? { ...r, unit_price: e.target.value }
                                    : r
                                )
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label className={fieldLabel}>מע״מ %</Label>
                          <Input
                            className={cn(fieldInput, "font-mono")}
                            dir="ltr"
                            value={row.vat_rate}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((r) =>
                                  r.id === row.id
                                    ? { ...r, vat_rate: e.target.value }
                                    : r
                                )
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold text-slate-200">
                  סיכומים
                </h2>
                <div className="space-y-2 text-sm text-slate-400">
                  <div className="flex justify-between">
                    <span>לפני מע״מ</span>
                    <span className="font-mono tabular-nums text-slate-200" dir="ltr">
                      {totals.subtotal.toFixed(2)} ₪
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>מע״מ</span>
                    <span className="font-mono tabular-nums text-slate-200" dir="ltr">
                      {totals.vat.toFixed(2)} ₪
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-3 text-base font-medium text-white">
                    <span>סה״כ</span>
                    <span className="font-mono tabular-nums" dir="ltr">
                      {totals.total.toFixed(2)} ₪
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className="sticky bottom-0 z-20 border-t border-slate-800 bg-slate-950/90 px-5 py-4 backdrop-blur-md lg:static lg:border-t-0 lg:bg-transparent lg:px-6 lg:py-6 lg:backdrop-blur-none">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                type="button"
                className="h-11 shrink-0 rounded-lg bg-emerald-600 px-5 text-base font-medium text-white shadow-sm hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                disabled={pdfDownloading}
                onClick={() => void handleGeneratePdf()}
              >
                {pdfDownloading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <span className="inline-flex items-center gap-2">
                    הפק מסמך (PDF)
                    <Download className="size-4 shrink-0 opacity-90" aria-hidden />
                  </span>
                )}
              </Button>
              <Button
                type="button"
                className="h-11 shrink-0 rounded-lg border border-slate-600 bg-slate-700 px-5 text-base font-medium text-white hover:bg-slate-600"
                disabled={saving}
                onClick={() => void handleSaveDraft()}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "שמור טיוטה"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0 rounded-lg border-slate-600 text-slate-200"
                disabled={allocating || !savedInvoiceId}
                onClick={() => void handleAllocation()}
              >
                {allocating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "מספר הקצאה"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 shrink-0 text-slate-400 hover:bg-slate-800/80 hover:text-slate-100"
                disabled={
                  saving ||
                  !savedInvoiceId ||
                  (needsAllocation && !allocationNumber)
                }
                onClick={() => void handlePaid()}
              >
                סמן כשולם
              </Button>
            </div>
          </div>
        </aside>

        {/* תצוגת A4 — דסקטופ שמאל (~58%) */}
        <main className="order-1 flex min-h-[42vh] flex-col bg-slate-950 lg:order-2 lg:min-h-0 lg:flex-1 lg:basis-[58%]">
          <div className="sticky top-0 z-10 flex flex-col gap-3 p-5 lg:max-h-[calc(100dvh-8rem)] lg:overflow-hidden lg:p-6">
            <p className="text-center text-xs font-medium tracking-wide text-slate-500 lg:text-start">
              תצוגה חיה · A4
            </p>
            <div className="flex flex-1 items-start justify-center overflow-auto pb-4 lg:min-h-0 lg:items-stretch lg:pb-0">
              <div
                className="w-full max-w-[min(100%,520px)] overflow-hidden rounded-sm border border-slate-600/40 bg-white shadow-2xl shadow-black/40 lg:max-h-[calc(100dvh-11rem)]"
                style={{ aspectRatio: "210 / 297" }}
              >
                <div className="h-full min-h-[380px] w-full">
                  <PDFViewer width="100%" height="100%" showToolbar={false}>
                    <MoTaxInvoicePdfDocument {...pdfProps} />
                  </PDFViewer>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
        <DialogContent className="max-w-md border-slate-800 bg-slate-900 text-slate-100" dir="rtl">
          <DialogHeader>
            <DialogTitle>לקוח חדש</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label htmlFor="nc-name">שם</Label>
              <Input
                id="nc-name"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                className="bg-slate-950"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="nc-tax">ח.פ / ע.מ</Label>
              <Input
                id="nc-tax"
                value={newClientTax}
                onChange={(e) => setNewClientTax(e.target.value)}
                className="bg-slate-950"
                dir="ltr"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewClientOpen(false)}>
              ביטול
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={newClientSaving}
              onClick={() => void handleCreateClient()}
            >
              {newClientSaving ? <Loader2 className="size-4 animate-spin" /> : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaxIdMismatchDraggableAlert
        open={taxMismatchOpen}
        onDismiss={() => setTaxMismatchOpen(false)}
        registryName={taxMismatchReg}
        message={
          taxMismatchMsg ||
          "Attention: Tax ID mismatch detected."
        }
      />
    </div>
  )
}
