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
import { createMoTaxInvoiceAction } from "@/lib/marker-ofek/mo-invoice-create-action"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"

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
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function InvoiceGeneratorClient({
  defaultVatPercent,
  nextInvoiceNumberHint,
  company,
}: InvoiceGeneratorClientProps) {
  const router = useRouter()
  useDiamondNavigation("customers")

  const [clients, setClients] = React.useState<EntityOpt[]>([])
  const [projects, setProjects] = React.useState<ProjectOpt[]>([])
  const [contracts, setContracts] = React.useState<ContractOpt[]>([])
  const [loadingRefs, setLoadingRefs] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const [entityId, setEntityId] = React.useState("")
  const [projectId, setProjectId] = React.useState("")
  const [contractId, setContractId] = React.useState("")
  const [issueDate, setIssueDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [copyLabel, setCopyLabel] = React.useState<"מקור" | "העתק">("מקור")
  const [vatRate, setVatRate] = React.useState(String(defaultVatPercent))

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
        const [cRes, pRes] = await Promise.all([
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
        ])
        if (cRes.error) throw cRes.error
        if (pRes.error) throw pRes.error
        if (!cancelled) {
          setClients((cRes.data as EntityOpt[]) ?? [])
          setProjects((pRes.data as ProjectOpt[]) ?? [])
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
        projectId: projectId.trim() || null,
        contractId: contractId.trim() || null,
        issueDate,
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

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-white" dir="rtl">
      <header className="shrink-0 border-b border-slate-100 px-6 py-5 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-400">
              כספים · הפקת מסמכים
            </p>
            <h1 className="mt-1 text-2xl font-extralight text-slate-900">
              מחולל חשבוניות
            </h1>
            <p className="mt-2 max-w-xl text-sm font-light text-slate-500">
              חשבונית מס לפי ניהול ספרים. פרויקט וחוזה אופציונליים — ללא שיוך
              מסווגים כהכנסה כללית.
            </p>
          </div>
          <Button
            render={<Link href="/marker-ofek/finance" />}
            variant="outline"
            className="rounded-full"
          >
            חזרה לכספים
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <div className="order-2 min-h-[50vh] border-t border-slate-100 bg-slate-50/50 lg:order-1 lg:border-t-0 lg:border-e">
          <div className="sticky top-0 flex h-full min-h-[560px] flex-col p-4 lg:min-h-[calc(100dvh-12rem)]">
            <p className="mb-2 text-center text-[10px] font-semibold tracking-wide text-slate-400">
              תצוגת מסמך חיה
            </p>
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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

        <div className="order-1 min-h-0 overflow-y-auto p-6 lg:order-2 lg:p-10">
          {loadingRefs ? (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              טוען רשימות…
            </div>
          ) : null}

          <div className="mx-auto max-w-xl space-y-8">
            <section className="space-y-4">
              <h2 className="text-xs font-semibold tracking-wide text-slate-400">
                לקוח (חובה)
              </h2>
              <div className="grid gap-2">
                <Label className="flex justify-between text-slate-600">
                  <span>מזמין / לקוח</span>
                  <span className="text-[10px] font-normal text-slate-400">
                    F2 — לקוח מזדמן
                  </span>
                </Label>
                <Select
                  value={entityId || undefined}
                  onValueChange={(v) => setEntityId(v ?? "")}
                >
                  <SelectTrigger className="h-12 border-slate-200 bg-slate-50/80">
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
              <h2 className="text-xs font-semibold tracking-wide text-slate-400">
                מסמך ומע״מ
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="issue-date">תאריך הנפקה</Label>
                  <Input
                    id="issue-date"
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="h-12 border-slate-200"
                    dir="ltr"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>תווית עותק</Label>
                  <Select
                    value={copyLabel}
                    onValueChange={(v) =>
                      setCopyLabel(v === "העתק" ? "העתק" : "מקור")
                    }
                  >
                    <SelectTrigger className="h-12 border-slate-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end" className="z-[120]">
                      <SelectItem value="מקור">מקור</SelectItem>
                      <SelectItem value="העתק">העתק</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="vat-rate">שיעור מע״מ (%)</Label>
                  <Input
                    id="vat-rate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    className="h-12 border-slate-200 font-mono text-base"
                    dir="ltr"
                  />
                  <p className="text-[11px] font-light text-slate-500">
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

            <section className="rounded-xl border border-slate-100 bg-white px-4 py-5">
              <div className="flex justify-between text-sm text-slate-600">
                <span>סכום לפני מע״מ</span>
                <span className="font-mono tabular-nums" dir="ltr">
                  {subtotal.toFixed(2)} ₪
                </span>
              </div>
              <div className="mt-2 flex justify-between text-sm text-slate-600">
                <span>מע״מ ({vatPct}%)</span>
                <span className="font-mono tabular-nums" dir="ltr">
                  {vatAmount.toFixed(2)} ₪
                </span>
              </div>
              <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-base text-slate-900">
                <span>לתשלום</span>
                <span className="font-mono tabular-nums" dir="ltr">
                  {grandTotal.toFixed(2)} ₪
                </span>
              </div>
            </section>

            <Button
              type="button"
              size="lg"
              className="mb-10 h-12 w-full rounded-full bg-slate-900 text-base font-normal hover:bg-slate-800"
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
    </div>
  )
}
