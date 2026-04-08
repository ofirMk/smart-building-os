"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
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
import { useDiamondNavigation } from "@/hooks/use-diamond-navigation"
import { createMoFinanceClientAction } from "@/lib/marker-ofek/mo-finance-client-actions"
import { createMoTaxInvoiceAction } from "@/lib/marker-ofek/mo-invoice-create-action"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[520px] items-center justify-center text-sm text-slate-400">
        טוען תצוגת מסמך…
      </div>
    ),
  }
)

type EntityOpt = { id: string; name: string; legal_id: string | null; address: string | null }
type ProjectOpt = { id: string; name: string }
type ContractOpt = {
  id: string
  project_id: string
  contract_type: string
  entities: { name: string } | { name: string }[] | null
}

type FinanceClientOpt = {
  id: string
  name: string
  entity_id: string | null
  email: string | null
  payment_terms: string | null
}

function embedEntityName(
  e: { name: string } | { name: string }[] | null | undefined
): string | null {
  if (e == null) return null
  const row = Array.isArray(e) ? e[0] : e
  return row?.name?.trim() || null
}

export type InvoiceGeneratorClientProps = {
  defaultVatPercent: number
  nextInvoiceNumberHint: number | null
  company: {
    company_name: string
    legal_id: string | null
    vat_registration_number: string | null
    address: string | null
  }
  /** מסלול מודול כספים — כרטיסים סימטריים, אמרלד/slate */
  variant?: "standard" | "financeDiamond"
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function InvoiceGeneratorClient({
  defaultVatPercent,
  nextInvoiceNumberHint,
  company,
  variant = "standard",
}: InvoiceGeneratorClientProps) {
  const router = useRouter()
  useDiamondNavigation("customers")

  const [clients, setClients] = React.useState<EntityOpt[]>([])
  const [financeClients, setFinanceClients] = React.useState<FinanceClientOpt[]>(
    []
  )
  const [projects, setProjects] = React.useState<ProjectOpt[]>([])
  const [contracts, setContracts] = React.useState<ContractOpt[]>([])
  const [loadingRefs, setLoadingRefs] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const [entityId, setEntityId] = React.useState("")
  const [financeClientId, setFinanceClientId] = React.useState("")
  const [projectId, setProjectId] = React.useState("")
  const [contractId, setContractId] = React.useState("")
  const [issueDate, setIssueDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [dueDate, setDueDate] = React.useState("")
  const [copyLabel, setCopyLabel] = React.useState<"מקור" | "העתק">("מקור")
  const [vatRate, setVatRate] = React.useState(String(defaultVatPercent))

  const [newFcOpen, setNewFcOpen] = React.useState(false)
  const [newFcSaving, setNewFcSaving] = React.useState(false)
  const [newFcName, setNewFcName] = React.useState("")
  const [newFcEmail, setNewFcEmail] = React.useState("")
  const [newFcAddress, setNewFcAddress] = React.useState("")
  const [newFcPaymentTerms, setNewFcPaymentTerms] = React.useState("")
  const [newFcEntityId, setNewFcEntityId] = React.useState("")

  const [lines, setLines] = React.useState<
    { id: string; description: string; quantity: string; unitPrice: string }[]
  >([
    {
      id: crypto.randomUUID(),
      description: "",
      quantity: "1",
      unitPrice: "",
    },
  ])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingRefs(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const [cRes, pRes, fcRes] = await Promise.all([
          supabase
            .from("entities")
            .select("id, name, legal_id, address")
            .eq("type", "client")
            .eq("is_deleted", false)
            .order("name", { ascending: true })
            .limit(500),
          supabase
            .from("projects")
            .select("id, name")
            .eq("is_deleted", false)
            .order("name", { ascending: true })
            .limit(500),
          supabase
            .from("mo_finance_clients")
            .select("id, name, entity_id, email, payment_terms")
            .eq("is_deleted", false)
            .order("name", { ascending: true })
            .limit(500),
        ])
        if (cRes.error) throw cRes.error
        if (pRes.error) throw pRes.error
        if (!cancelled) {
          setClients((cRes.data as EntityOpt[]) ?? [])
          setProjects((pRes.data as ProjectOpt[]) ?? [])
          if (!fcRes.error) {
            setFinanceClients((fcRes.data as FinanceClientOpt[]) ?? [])
          } else if (
            !String(fcRes.error.message).includes("does not exist") &&
            !String(fcRes.error.message).includes("schema cache")
          ) {
            throw fcRes.error
          }
        }
      } catch (e) {
        if (!cancelled) toast.error(formatError(e))
      } finally {
        if (!cancelled) setLoadingRefs(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const effectiveProjectId = projectId.trim() || null

  React.useEffect(() => {
    if (!effectiveProjectId) {
      setContracts([])
      setContractId("")
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from("contracts")
          .select("id, project_id, contract_type, entities ( name )")
          .eq("project_id", effectiveProjectId)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(200)
        if (error) throw error
        if (!cancelled) {
          const list = (data ?? []) as ContractOpt[]
          setContracts(list)
          setContractId((prev) => {
            if (prev && list.some((c) => c.id === prev)) return prev
            return ""
          })
        }
      } catch (e) {
        if (!cancelled) toast.error(formatError(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [effectiveProjectId])

  const vatPct = roundMoney(parseFloat(vatRate.replace(",", ".")) || 0)

  const parsedLines = React.useMemo(() => {
    const out: MoTaxInvoicePdfLine[] = []
    for (const row of lines) {
      const qty = roundMoney(parseFloat(row.quantity.replace(",", ".")) || 0)
      const up = roundMoney(parseFloat(row.unitPrice.replace(",", ".")) || 0)
      if (qty <= 0 || row.description.trim() === "") continue
      out.push({
        description: row.description.trim(),
        quantity: qty,
        unitPrice: up,
        lineTotal: roundMoney(qty * up),
        vatRatePercent: vatPct,
      })
    }
    return out
  }, [lines])

  const subtotal = React.useMemo(
    () => roundMoney(parsedLines.reduce((s, l) => s + l.lineTotal, 0)),
    [parsedLines]
  )
  const vatAmount = React.useMemo(
    () => roundMoney(subtotal * (vatPct / 100)),
    [subtotal, vatPct]
  )
  const grandTotal = React.useMemo(
    () => roundMoney(subtotal + vatAmount),
    [subtotal, vatAmount]
  )

  const customer = clients.find((c) => c.id === entityId)
  const project = projects.find((p) => p.id === projectId)
  const contract = contracts.find((c) => c.id === contractId)

  const contractLabelText = contract
    ? `${embedEntityName(contract.entities) || "חוזה"} · ${contract.contract_type}`
    : null

  const incomeKind =
    !effectiveProjectId && !contractId
      ? "הכנסה כללית"
      : "הכנסה מקושרת לפרויקט / חוזה"

  const pdfProps = React.useMemo(
    () => ({
      copyLabel,
      previewInvoiceNumber: nextInvoiceNumberHint,
      issueDate,
      companyName: company.company_name || "—",
      companyLegalId: company.legal_id,
      companyVatNumber: company.vat_registration_number,
      companyAddress: company.address,
      customerName: customer?.name?.trim() || "—",
      customerLegalId: customer?.legal_id ?? null,
      customerAddress: customer?.address ?? null,
      projectLabel: project?.name?.trim() ?? null,
      contractLabel: contractLabelText,
      incomeKindLabel: incomeKind,
      lines: parsedLines,
      subtotal,
      vatRatePercent: vatPct,
      vatAmount,
      grandTotal,
      digitalSignatureSha256: null as string | null,
    }),
    [
      copyLabel,
      nextInvoiceNumberHint,
      issueDate,
      company,
      customer,
      project,
      contractLabelText,
      incomeKind,
      parsedLines,
      subtotal,
      vatPct,
      vatAmount,
      grandTotal,
    ]
  )

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description: "",
        quantity: "1",
        unitPrice: "",
      },
    ])
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)))
  }

  async function handleIssue() {
    if (!entityId.trim()) {
      toast.error("יש לבחור לקוח (חובה).")
      return
    }
    if (parsedLines.length === 0) {
      toast.error("מלאו לפחות שורה אחת עם תיאור וכמות חיובית.")
      return
    }
    setSaving(true)
    try {
      const res = await createMoTaxInvoiceAction({
        entityId: entityId.trim(),
        financeClientId: financeClientId.trim() || null,
        projectId: projectId.trim() || null,
        contractId: contractId.trim() || null,
        issueDate,
        dueDate: dueDate.trim() || null,
        documentCopyLabel: copyLabel,
        vatRatePercent: vatPct,
        lines: parsedLines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`חשבונית מס הופקה — מספר ${res.invoiceNumber}`)
      router.push(`/marker-ofek/finance/invoices/${res.invoiceId}/print`)
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateFinanceClient() {
    if (!newFcName.trim()) {
      toast.error("נא למלא שם לקוח במאגר.")
      return
    }
    setNewFcSaving(true)
    try {
      const res = await createMoFinanceClientAction({
        name: newFcName.trim(),
        email: newFcEmail.trim() || null,
        address: newFcAddress.trim() || null,
        paymentTerms: newFcPaymentTerms.trim() || null,
        entityId: newFcEntityId.trim() || null,
        companyProfileId: null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setFinanceClients((prev) => [
        ...prev,
        {
          id: res.id,
          name: newFcName.trim(),
          entity_id: newFcEntityId.trim() || null,
          email: newFcEmail.trim() || null,
          payment_terms: newFcPaymentTerms.trim() || null,
        },
      ])
      setFinanceClientId(res.id)
      if (newFcEntityId.trim()) setEntityId(newFcEntityId.trim())
      setNewFcOpen(false)
      setNewFcName("")
      setNewFcEmail("")
      setNewFcAddress("")
      setNewFcPaymentTerms("")
      setNewFcEntityId("")
      toast.success("לקוח נשמר במאגר החשבונאות")
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setNewFcSaving(false)
    }
  }

  const diamond = variant === "financeDiamond"

  return (
    <div
      className={cn(
        "flex min-h-[calc(100dvh-4rem)] flex-col",
        diamond ? "bg-slate-950 text-slate-100" : "bg-white"
      )}
      dir="rtl"
    >
      <header
        className={cn(
          "shrink-0 px-6 py-5 lg:px-10",
          diamond
            ? "border-b border-emerald-500/20 bg-slate-900"
            : "border-b border-slate-100"
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p
              className={cn(
                "text-[10px] font-semibold tracking-[0.2em]",
                diamond ? "text-emerald-400/90" : "text-slate-400"
              )}
            >
              כספים · הפקת מסמכים
            </p>
            <h1
              className={cn(
                "mt-1 text-2xl font-extralight tracking-tight",
                diamond ? "text-white" : "text-slate-900"
              )}
            >
              מחולל חשבוניות
            </h1>
            <p
              className={cn(
                "mt-2 max-w-xl text-sm font-light",
                diamond ? "text-slate-400" : "text-slate-500"
              )}
            >
              חשבונית מס מלאה בתוך Holden Group OS — ללא יצוא לתוכנת הנה״ח החיצונית.
              פרויקט וחוזה אופציונליים; ללא שיוך מסווגים כהכנסה כללית.
            </p>
          </div>
          <Button
            render={<Link href="/marker-ofek/finance" />}
            variant="outline"
            className={cn(
              "rounded-full",
              diamond &&
                "border-emerald-500/40 bg-slate-900 text-emerald-100 hover:bg-emerald-950/40"
            )}
          >
            חזרה לכספים
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <div
          className={cn(
            "order-2 min-h-[50vh] border-t lg:order-1 lg:border-t-0 lg:border-e",
            diamond
              ? "border-emerald-500/15 bg-slate-900/50"
              : "border-slate-100 bg-slate-50/50"
          )}
        >
          <div className="sticky top-0 flex h-full min-h-[560px] flex-col p-4 lg:min-h-[calc(100dvh-12rem)]">
            <p
              className={cn(
                "mb-2 text-center text-[10px] font-semibold tracking-wide",
                diamond ? "text-emerald-500/80" : "text-slate-400"
              )}
            >
              תצוגת מסמך חיה
            </p>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-hidden rounded-xl border shadow-2xl",
                diamond
                  ? "border-emerald-500/25 bg-slate-900"
                  : "border-slate-200 bg-white shadow-sm"
              )}
            >
              <PDFViewer
                width="100%"
                height="100%"
                showToolbar={false}
                className="h-full min-h-[520px] border-0"
              >
                <MoTaxInvoicePdfDocument {...pdfProps} />
              </PDFViewer>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "order-1 min-h-0 overflow-y-auto p-6 lg:order-2 lg:p-10",
            diamond && "bg-slate-950"
          )}
        >
          {loadingRefs ? (
            <div
              className={cn(
                "flex items-center gap-2",
                diamond ? "text-emerald-200/70" : "text-slate-400"
              )}
            >
              <Loader2 className="size-5 animate-spin" aria-hidden />
              טוען רשימות…
            </div>
          ) : null}

          <div className="mx-auto max-w-xl space-y-8">
            <section
              className={cn(
                "space-y-4 rounded-2xl border p-4 sm:p-5",
                diamond
                  ? "border-emerald-500/20 bg-slate-900/80 shadow-xl"
                  : "border-transparent"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2
                  className={cn(
                    "text-xs font-semibold tracking-wide",
                    diamond ? "text-emerald-400/90" : "text-slate-400"
                  )}
                >
                  מאגר לקוחות (חשבונאות)
                </h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "rounded-full text-xs",
                    diamond &&
                      "border-emerald-500/35 text-emerald-100 hover:bg-emerald-950/50"
                  )}
                  onClick={() => setNewFcOpen(true)}
                >
                  + לקוח חדש
                </Button>
              </div>
              <div className="grid gap-2">
                <Label className={diamond ? "text-slate-300" : "text-slate-600"}>
                  רשומת מאגר (אופציונלי)
                </Label>
                <Select
                  value={financeClientId || "__none__"}
                  onValueChange={(v) => {
                    const id = !v || v === "__none__" ? "" : v
                    setFinanceClientId(id)
                    if (id) {
                      const fc = financeClients.find((x) => x.id === id)
                      if (fc?.entity_id) setEntityId(fc.entity_id)
                    }
                  }}
                >
                  <SelectTrigger
                    className={cn(
                      "h-12",
                      diamond
                        ? "border-emerald-500/25 bg-slate-950 text-slate-100"
                        : "border-slate-200 bg-white"
                    )}
                  >
                    <SelectValue placeholder="ללא — רק ישות מזמין" />
                  </SelectTrigger>
                  <SelectContent align="end" className="z-[120]">
                    <SelectItem value="__none__">ללא</SelectItem>
                    {financeClients.map((fc) => (
                      <SelectItem key={fc.id} value={fc.id}>
                        {fc.name}
                        {fc.payment_terms ? ` · ${fc.payment_terms}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p
                  className={cn(
                    "text-[11px]",
                    diamond ? "text-slate-500" : "text-slate-500"
                  )}
                >
                  שדות דוא״ל ותנאי תשלום לגילוי חובות; קישור לישות מזמין ממלא אוטומטית את
                  בחירת הלקוח.
                </p>
              </div>
            </section>

            <section className="space-y-4">
              <h2
                className={cn(
                  "text-xs font-semibold tracking-wide",
                  diamond ? "text-emerald-400/90" : "text-slate-400"
                )}
              >
                לקוח (חובה)
              </h2>
              <div className="grid gap-2">
                <Label
                  className={cn(
                    "flex justify-between",
                    diamond ? "text-slate-300" : "text-slate-600"
                  )}
                >
                  <span>מזמין / לקוח</span>
                  <span
                    className={cn(
                      "text-[10px] font-normal",
                      diamond ? "text-slate-500" : "text-slate-400"
                    )}
                  >
                    F2 — לקוח מזדמן
                  </span>
                </Label>
                <Select
                  value={entityId || undefined}
                  onValueChange={(v) => setEntityId(v ?? "")}
                >
                  <SelectTrigger
                    className={cn(
                      "h-12",
                      diamond
                        ? "border-emerald-500/25 bg-slate-950 text-slate-100"
                        : "border-slate-200 bg-slate-50/80"
                    )}
                  >
                    <SelectValue placeholder="בחרו לקוח מהרשימה" />
                  </SelectTrigger>
                  <SelectContent
                    align="end"
                    className="z-[120]"
                    diamondEntity="customers"
                  >
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-xs font-semibold tracking-wide text-slate-400">
                שיוך (אופציונלי)
              </h2>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>פרויקט</Label>
                  <Select
                    value={projectId || "__none__"}
                    onValueChange={(v) =>
                      setProjectId(!v || v === "__none__" ? "" : v)
                    }
                  >
                    <SelectTrigger className="h-12 border-slate-200 bg-white">
                      <SelectValue placeholder="ללא — הכנסה כללית" />
                    </SelectTrigger>
                    <SelectContent align="end" className="z-[120]">
                      <SelectItem value="__none__">ללא — הכנסה כללית</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>חוזה</Label>
                  <Select
                    value={contractId || "__none__"}
                    onValueChange={(v) =>
                      setContractId(!v || v === "__none__" ? "" : v)
                    }
                    disabled={!effectiveProjectId}
                  >
                    <SelectTrigger className="h-12 border-slate-200 bg-white">
                      <SelectValue placeholder="ללא חוזה" />
                    </SelectTrigger>
                    <SelectContent align="end" className="z-[120]">
                      <SelectItem value="__none__">ללא חוזה</SelectItem>
                      {contracts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {embedEntityName(c.entities) || "חוזה"} ·{" "}
                          {c.contract_type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2
                className={cn(
                  "text-xs font-semibold tracking-wide",
                  diamond ? "text-emerald-400/90" : "text-slate-400"
                )}
              >
                מסמך ומע״מ
              </h2>
              <p
                className={cn(
                  "rounded-lg border px-3 py-2 text-[11px] leading-relaxed",
                  diamond
                    ? "border-emerald-500/20 bg-slate-900/60 text-slate-400"
                    : "border-slate-100 bg-slate-50 text-slate-600"
                )}
              >
                סוג מסמך במסך זה:{" "}
                <strong className={diamond ? "text-emerald-400" : "text-emerald-700"}>
                  חשבונית מס
                </strong>
                (מסלול מלא עם מע״מ). קבלות, חשבונית־מס־קבלה וזיכויים — מהמסכים
                המקושרים לחוזה או בהרחבה עתידית של המודול.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label
                    htmlFor="issue-date"
                    className={diamond ? "text-slate-300" : undefined}
                  >
                    תאריך הנפקה
                  </Label>
                  <Input
                    id="issue-date"
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className={cn(
                      "h-12",
                      diamond
                        ? "border-emerald-500/25 bg-slate-950 text-slate-100"
                        : "border-slate-200"
                    )}
                    dir="ltr"
                  />
                </div>
                <div className="grid gap-2">
                  <Label
                    htmlFor="due-date"
                    className={diamond ? "text-slate-300" : undefined}
                  >
                    תאריך יעד לתשלום
                  </Label>
                  <Input
                    id="due-date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={cn(
                      "h-12",
                      diamond
                        ? "border-emerald-500/25 bg-slate-950 text-slate-100"
                        : "border-slate-200"
                    )}
                    dir="ltr"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className={diamond ? "text-slate-300" : undefined}>
                    תווית עותק
                  </Label>
                  <Select
                    value={copyLabel}
                    onValueChange={(v) =>
                      setCopyLabel(v === "העתק" ? "העתק" : "מקור")
                    }
                  >
                    <SelectTrigger
                      className={cn(
                        "h-12",
                        diamond
                          ? "border-emerald-500/25 bg-slate-950 text-slate-100"
                          : "border-slate-200 bg-white"
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end" className="z-[120]">
                      <SelectItem value="מקור">מקור</SelectItem>
                      <SelectItem value="העתק">העתק</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label
                    htmlFor="vat-rate"
                    className={diamond ? "text-slate-300" : undefined}
                  >
                    שיעור מע״מ (%)
                  </Label>
                  <Input
                    id="vat-rate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    className={cn(
                      "h-12 font-mono text-base",
                      diamond
                        ? "border-emerald-500/25 bg-slate-950 text-slate-100"
                        : "border-slate-200"
                    )}
                    dir="ltr"
                  />
                  <p
                    className={cn(
                      "text-[11px] font-light",
                      diamond ? "text-slate-500" : "text-slate-500"
                    )}
                  >
                    ברירת מחדל מהגדרות המערכת; ניתן לעריכה לפי הוראת רשות המסים.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold tracking-wide text-slate-400">
                  שורות
                </h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 rounded-full"
                  onClick={addLine}
                >
                  <Plus className="size-3.5" aria-hidden />
                  שורה
                </Button>
              </div>
              <div className="space-y-3">
                {lines.map((row, idx) => (
                  <div
                    key={row.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/40 p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">
                        שורה {idx + 1}
                      </span>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-rose-500"
                        onClick={() => removeLine(row.id)}
                        aria-label="הסר שורה"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="grid gap-3">
                      <Input
                        placeholder="תיאור"
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
                        className="border-slate-200 bg-white"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[10px] text-slate-500">
                            כמות
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={row.quantity}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((r) =>
                                  r.id === row.id
                                    ? { ...r, quantity: e.target.value }
                                    : r
                                )
                              )
                            }
                            className="mt-1 border-slate-200 bg-white font-mono"
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-500">
                            מחיר יחידה
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.unitPrice}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((r) =>
                                  r.id === row.id
                                    ? { ...r, unitPrice: e.target.value }
                                    : r
                                )
                              )
                            }
                            className="mt-1 border-slate-200 bg-white font-mono"
                            dir="ltr"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section
              className={cn(
                "rounded-xl border px-4 py-5 shadow-xl",
                diamond
                  ? "border-emerald-500/25 bg-slate-900/90"
                  : "border-slate-100 bg-white"
              )}
            >
              <div
                className={cn(
                  "flex justify-between text-sm",
                  diamond ? "text-slate-300" : "text-slate-600"
                )}
              >
                <span>סכום לפני מע״מ</span>
                <span className="font-mono tabular-nums" dir="ltr">
                  {subtotal.toFixed(2)} ₪
                </span>
              </div>
              <div
                className={cn(
                  "mt-2 flex justify-between text-sm",
                  diamond ? "text-slate-300" : "text-slate-600"
                )}
              >
                <span>מע״מ ({vatPct}%)</span>
                <span className="font-mono tabular-nums" dir="ltr">
                  {vatAmount.toFixed(2)} ₪
                </span>
              </div>
              <div
                className={cn(
                  "mt-3 flex justify-between border-t pt-3 text-base",
                  diamond
                    ? "border-emerald-500/20 text-white"
                    : "border-slate-100 text-slate-900"
                )}
              >
                <span>לתשלום</span>
                <span className="font-mono tabular-nums" dir="ltr">
                  {grandTotal.toFixed(2)} ₪
                </span>
              </div>
            </section>

            <Button
              type="button"
              size="lg"
              className={cn(
                "mb-10 h-12 w-full rounded-full text-base font-normal",
                diamond
                  ? "bg-gradient-to-l from-emerald-600 to-emerald-700 text-white shadow-lg shadow-emerald-900/30 hover:from-emerald-500 hover:to-emerald-600"
                  : "bg-slate-900 text-white hover:bg-slate-800"
              )}
              disabled={saving}
              onClick={() => void handleIssue()}
            >
              {saving ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                "הפק חשבונית מס"
              )}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={newFcOpen} onOpenChange={setNewFcOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>לקוח חדש — מאגר חשבונאות</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nfc-name">שם לקוח / חברה</Label>
              <Input
                id="nfc-name"
                value={newFcName}
                onChange={(e) => setNewFcName(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nfc-email">דוא״ל</Label>
              <Input
                id="nfc-email"
                type="email"
                value={newFcEmail}
                onChange={(e) => setNewFcEmail(e.target.value)}
                className="h-11"
                dir="ltr"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nfc-addr">כתובת</Label>
              <Input
                id="nfc-addr"
                value={newFcAddress}
                onChange={(e) => setNewFcAddress(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nfc-terms">תנאי תשלום</Label>
              <Input
                id="nfc-terms"
                placeholder="למשל: שוטף+45, צ׳ק ביד"
                value={newFcPaymentTerms}
                onChange={(e) => setNewFcPaymentTerms(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>קישור לישות מזמין (אופציונלי)</Label>
              <Select
                value={newFcEntityId || "__none__"}
                onValueChange={(v) =>
                  setNewFcEntityId(!v || v === "__none__" ? "" : v)
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="ללא" />
                </SelectTrigger>
                <SelectContent align="end" className="z-[200]">
                  <SelectItem value="__none__">ללא</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewFcOpen(false)}
            >
              ביטול
            </Button>
            <Button
              type="button"
              disabled={newFcSaving}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => void handleCreateFinanceClient()}
            >
              {newFcSaving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                "שמור"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
