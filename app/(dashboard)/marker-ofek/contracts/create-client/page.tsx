"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { FilePlus, Loader2, Save } from "lucide-react"
import { toast } from "sonner"

import {
  HRAgentPanel,
  type HrAgentRiskItem,
  type HrAgentSuggestions,
} from "@/components/marker-ofek/hr-agent-panel"
import { RiskCard } from "@/components/marker-ofek/risk-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { submitClientContractWizardAction } from "@/lib/marker-ofek/marker-client-contract-wizard-action"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"

const DRAFT_KEY = "marker-ofek:create-client-contract:draft"

function contractTypeLabelHe(code: string): string {
  if (code === "lump-sum") return "פאושלי / גלובלי"
  if (code === "measurement") return "לפי מדידה / כמויות"
  return code
}

type CustomerRow = { id: string; name: string }
type ProjectRow = { id: string; name: string }

type DraftShape = {
  projectId: string
  projectName: string
  customerId: string
  contractType: string
  paymentTerms: string
  retentionPct: string
}

function loadDraft(): DraftShape | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as DraftShape
  } catch {
    return null
  }
}

function saveDraft(d: DraftShape) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d))
  } catch {
    /* ignore */
  }
}

function CustomerSelectFooter() {
  return (
    <div className="mt-2 flex justify-center rounded-lg border-t border-slate-100 bg-slate-50 px-4 py-4">
      <span className="text-center text-[11px] font-light leading-relaxed text-slate-500">
        F2 להקמת לקוח חדש
      </span>
    </div>
  )
}

function ProjectSelectFooter() {
  return (
    <div className="mt-2 flex justify-center rounded-lg border-t border-slate-100 bg-slate-50 px-4 py-4">
      <span className="text-center text-[11px] font-light leading-relaxed text-slate-500">
        F2 להקמת פרויקט חדש
      </span>
    </div>
  )
}

export default function CreateClientContractPage() {
  useDiamondNavigation("customers")
  const router = useRouter()

  const [customers, setCustomers] = React.useState<CustomerRow[]>([])
  const [projects, setProjects] = React.useState<ProjectRow[]>([])
  const [loadingCustomers, setLoadingCustomers] = React.useState(true)
  const [loadingProjects, setLoadingProjects] = React.useState(true)
  const [projectId, setProjectId] = React.useState("")
  const [projectName, setProjectName] = React.useState("")
  const [customerId, setCustomerId] = React.useState("")
  const [contractType, setContractType] = React.useState("")
  const [paymentTerms, setPaymentTerms] = React.useState("")
  const [retentionPct, setRetentionPct] = React.useState("")
  const [risks, setRisks] = React.useState<HrAgentRiskItem[]>([])
  const [extractedData, setExtractedData] =
    React.useState<HrAgentSuggestions | null>(null)
  const [analysisDone, setAnalysisDone] = React.useState(false)
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [contractTypeAlert, setContractTypeAlert] = React.useState<
    string | null
  >(null)
  const [pdfSaveOk, setPdfSaveOk] = React.useState(true)
  const [savingContract, setSavingContract] = React.useState(false)

  React.useEffect(() => {
    const d = loadDraft()
    if (d) {
      setProjectId(
        typeof d.projectId === "string" ? d.projectId : ""
      )
      setProjectName(d.projectName)
      setCustomerId(d.customerId)
      const ct = d.contractType
      setContractType(
        ct === "lump-sum" || ct === "measurement" ? ct : ""
      )
      setPaymentTerms(d.paymentTerms)
      setRetentionPct(d.retentionPct)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingCustomers(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from("entities")
          .select("id, name")
          .eq("type", "client")
          .eq("is_deleted", false)
          .order("name", { ascending: true })
          .limit(500)
        if (error) throw error
        if (!cancelled) {
          setCustomers((data ?? []) as CustomerRow[])
        }
      } catch (e) {
        if (!cancelled) toast.error(formatError(e))
      } finally {
        if (!cancelled) setLoadingCustomers(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingProjects(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from("projects")
          .select("id, name")
          .eq("is_deleted", false)
          .order("name", { ascending: true })
          .limit(500)
        if (error) throw error
        if (!cancelled) {
          setProjects((data ?? []) as ProjectRow[])
        }
      } catch (e) {
        if (!cancelled) toast.error(formatError(e))
      } finally {
        if (!cancelled) setLoadingProjects(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      saveDraft({
        projectId,
        projectName,
        customerId,
        contractType,
        paymentTerms,
        retentionPct,
      })
    }, 300)
    return () => window.clearTimeout(t)
  }, [
    projectId,
    projectName,
    customerId,
    contractType,
    paymentTerms,
    retentionPct,
  ])

  const applyValue = React.useCallback(
    (field: keyof DraftShape, val: string) => {
      if (field === "projectId") setProjectId(val)
      else if (field === "projectName") setProjectName(val)
      else if (field === "customerId") setCustomerId(val)
      else if (field === "contractType") setContractType(val)
      else if (field === "paymentTerms") setPaymentTerms(val)
      else if (field === "retentionPct") setRetentionPct(val)
    },
    []
  )

  React.useEffect(() => {
    if (!extractedData) return
    const pt = extractedData.paymentTerms?.value
    if (pt != null && paymentTerms.trim() === "") {
      applyValue("paymentTerms", String(pt))
    }
    const rt = extractedData.retention?.value
    if (rt != null && retentionPct.trim() === "") {
      applyValue("retentionPct", String(rt))
    }
  }, [extractedData, paymentTerms, retentionPct, applyValue])

  const customerLabel = React.useMemo(
    () => customers.find((c) => c.id === customerId)?.name?.trim() ?? "",
    [customers, customerId]
  )

  const agentExtraContext = React.useMemo(() => {
    const lines: string[] = []
    const pn = projectName.trim()
    if (pn) lines.push(`שם פרויקט: ${pn}`)
    if (customerLabel) lines.push(`מזמין נבחר: ${customerLabel}`)
    if (contractType === "lump-sum" || contractType === "measurement") {
      lines.push(
        `סוג חוזה שנבחר בטופס: ${contractTypeLabelHe(contractType)}`
      )
    }
    const pt = paymentTerms.trim()
    if (pt) lines.push(`שוטף+ (ימים): ${pt}`)
    const rp = retentionPct.trim()
    if (rp) lines.push(`אחוז עיכבון: ${rp}`)
    return lines.join("\n")
  }, [
    projectName,
    customerLabel,
    contractType,
    paymentTerms,
    retentionPct,
  ])

  const formValidForSave =
    Boolean(projectId.trim()) &&
    Boolean(customerId.trim()) &&
    (contractType === "lump-sum" || contractType === "measurement") &&
    pdfSaveOk

  async function handleSaveContract() {
    if (!formValidForSave || savingContract) return
    setSavingContract(true)
    try {
      const res = await submitClientContractWizardAction({
        projectId: projectId.trim(),
        clientEntityId: customerId.trim(),
        contractKind:
          contractType === "measurement" ? "measurement" : "lump-sum",
        contractDisplayName: projectName.trim() || null,
        retentionPct: retentionPct.trim() === "" ? 0 : retentionPct,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("החוזה נשמר כטיוטה במערכת")
      router.push(`/marker-ofek/contracts/${res.contractId}/edit`)
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSavingContract(false)
    }
  }

  return (
    <div
      className="flex h-screen min-h-0 overflow-hidden bg-white"
      dir="rtl"
    >
      <main className="ms-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-6 border-b border-slate-100 bg-white px-8 py-8 lg:px-12">
          <div className="min-w-0 space-y-2">
            <div className="text-sm font-light text-slate-400">
              <Link
                href="/marker-ofek/contracts/select-type"
                className="transition-colors hover:text-slate-600"
              >
                חזרה לבחירת סוג חוזה
              </Link>
            </div>
            <h1 className="text-3xl font-extralight tracking-tight text-slate-900">
              יצירת חוזה מזמין חדש
            </h1>
            <p className="max-w-xl text-sm font-light leading-relaxed text-slate-500">
              בחירת מזמין מהמערכת, פרטי פרויקט וניתוח חוזים — F2 להקמת לקוח,
              Escape לחזרה לטופס עם הטיוטה השמורה.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-4">
            <Button
              variant="outline"
              className="rounded-full px-8"
              render={<Link href="/marker-ofek/contracts/select-type" />}
            >
              ביטול
            </Button>
            <Button
              type="button"
              className="gap-2 rounded-full bg-slate-900 px-10 hover:bg-slate-800"
              disabled={!formValidForSave || savingContract}
              onClick={() => void handleSaveContract()}
            >
              {savingContract ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              שמור חוזה במערכת
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="form-stack mx-auto w-full max-w-6xl px-8 py-10 lg:px-12 lg:py-14">
            <section className="grid grid-cols-1 gap-12 overflow-visible border-b border-slate-100 pb-12 lg:grid-cols-2">
              <div className="space-y-3">
                <h2 className="form-section-heading text-slate-800">
                  פרטי פרויקט ומזמין
                </h2>
                <p className="form-section-lead max-w-md">
                  מזמינים נטענים מטבלת הישויות (סוג לקוח). חסר שם ברשימה? F2
                  פותח הקמת מזמין חדש.
                </p>
              </div>
              <div className="space-y-8 overflow-visible">
                <div className="grid gap-3">
                  <Label
                    htmlFor="project-system-select"
                    className="flex flex-wrap items-center justify-between gap-2 font-medium text-slate-700"
                  >
                    <span>פרויקט במערכת (חובה)</span>
                    <span className="text-[10px] font-light text-slate-400">
                      F2 · הקמה מהירה
                    </span>
                  </Label>
                  {loadingProjects ? (
                    <p className="flex items-center gap-2 text-sm font-light text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      טוען פרויקטים…
                    </p>
                  ) : projects.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-sm font-light leading-relaxed text-slate-600">
                      אין פרויקטים. F2 לפתיחת הקמת פרויקט, או הוסיפו פרויקט
                      ממסך הפרויקטים.
                    </p>
                  ) : (
                    <Select
                      value={projectId || undefined}
                      onValueChange={(v) => setProjectId(v ?? "")}
                    >
                      <SelectTrigger
                        id="project-system-select"
                        className="min-h-12 w-full border-slate-200 bg-slate-50/50 py-3 text-base font-light"
                      >
                        <SelectValue placeholder="בחרו פרויקט מהרשימה" />
                      </SelectTrigger>
                      <SelectContent
                        className="z-[100] border-slate-100 bg-white shadow-xl"
                        align="end"
                        diamondEntity="projects"
                        footer={<ProjectSelectFooter />}
                      >
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="grid gap-3">
                  <Label
                    htmlFor="projectName"
                    className="block w-full text-end font-medium text-slate-700"
                  >
                    שם תצוגה לחוזה (אופציונלי)
                  </Label>
                  <Input
                    id="projectName"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="לדוגמה: עיר היין אשקלון — שלב א׳"
                    className="min-h-12 border-slate-200 bg-slate-50/50 py-3 text-base font-light"
                  />
                </div>

                <div className="grid gap-3">
                  <Label
                    htmlFor="customer-select"
                    className="flex flex-wrap items-center justify-between gap-2 font-medium text-slate-700"
                  >
                    <span>שם המזמין</span>
                    <span className="text-[10px] font-light text-slate-400">
                      F2 · הקמה מהירה
                    </span>
                  </Label>
                  {loadingCustomers ? (
                    <p className="flex items-center gap-2 text-sm font-light text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      טוען מזמינים…
                    </p>
                  ) : customers.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-sm font-light leading-relaxed text-slate-600">
                      אין מזמינים רשומים. לחצו F2 להקמת לקוח חדש, או הוסיפו ישות
                      מסוג לקוח בניהול הישויות.
                    </p>
                  ) : (
                    <Select
                      value={customerId || undefined}
                      onValueChange={(v) => setCustomerId(v ?? "")}
                    >
                      <SelectTrigger
                        id="customer-select"
                        className="min-h-12 w-full border-slate-200 bg-slate-50/50 py-3 text-base font-light"
                      >
                        <SelectValue placeholder="בחרו מזמין מהרשימה" />
                      </SelectTrigger>
                      <SelectContent
                        className="z-[100] border-slate-100 bg-white shadow-xl"
                        align="end"
                        diamondEntity="customers"
                        footer={<CustomerSelectFooter />}
                      >
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label
                    htmlFor="contract-type"
                    className="w-full text-end font-semibold text-slate-600"
                  >
                    סוג חוזה
                  </Label>
                  <Select
                    value={contractType || undefined}
                    onValueChange={(v) => setContractType(v ?? "")}
                  >
                    <SelectTrigger
                      id="contract-type"
                      className="min-h-[3rem] w-full border-slate-200 bg-slate-50 py-6 text-end text-lg font-light"
                    >
                      <SelectValue
                        placeholder="בחר סוג חוזה…"
                        className="justify-end text-end"
                      />
                    </SelectTrigger>
                    <SelectContent
                      className="z-[100] border-slate-200 bg-white"
                      align="end"
                    >
                      <SelectItem
                        value="lump-sum"
                        className="justify-end text-end"
                      >
                        פאושלי / גלובלי
                      </SelectItem>
                      <SelectItem
                        value="measurement"
                        className="justify-end text-end"
                      >
                        לפי מדידה / כמויות
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                  <div className="grid gap-3">
                    <Label
                      htmlFor="paymentTerms"
                      className="block w-full text-end font-medium text-slate-700"
                    >
                      תנאי תשלום (שוטף+ — ימים)
                    </Label>
                    <Input
                      id="paymentTerms"
                      type="number"
                      min={0}
                      value={paymentTerms}
                      onChange={(e) => setPaymentTerms(e.target.value)}
                      placeholder={
                        extractedData?.paymentTerms?.value != null
                          ? `הצעה מהניתוח: ${extractedData.paymentTerms.value}`
                          : "מספר ימים"
                      }
                      dir="ltr"
                      className={cn(
                        "min-h-12 border-slate-200 bg-slate-50/50 py-3 text-start font-mono text-base font-light",
                        extractedData?.paymentTerms?.value != null &&
                          "border-slate-200/90 bg-slate-50/70 ring-1 ring-slate-200/50"
                      )}
                    />
                    {extractedData?.paymentTerms?.value != null ? (
                      <p className="ai-ghost-suggestion text-xs">
                        מקור: {extractedData.paymentTerms.source}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-3">
                    <Label
                      htmlFor="retentionPct"
                      className="block w-full text-end font-medium text-slate-700"
                    >
                      אחוז עיכבון
                    </Label>
                    <Input
                      id="retentionPct"
                      type="number"
                      min={0}
                      max={100}
                      value={retentionPct}
                      onChange={(e) => setRetentionPct(e.target.value)}
                      placeholder={
                        extractedData?.retention?.value != null
                          ? `הצעה: ${extractedData.retention.value}%`
                          : "לדוגמה: 5"
                      }
                      dir="ltr"
                      className="min-h-12 border-slate-200 bg-slate-50/50 py-3 text-start font-mono text-base font-light"
                    />
                    {extractedData?.retention?.value != null ? (
                      <p className="ai-ghost-suggestion text-xs">
                        מקור: {extractedData.retention.source}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-6">
                <FilePlus className="h-6 w-6 text-slate-500" aria-hidden />
                <div>
                  <h2 className="form-section-heading text-slate-800">
                    ניתוח מסמכי חוזה
                  </h2>
                  <p className="form-section-lead mt-2 max-w-2xl">
                    העלאת PDF חוסמת שמירה עד להרצת ניתוח או לחיצה על „דלג על ניתוח”
                    בכרטיס המסמכים.
                  </p>
                </div>
              </div>
              <HRAgentPanel
                mode="client"
                extraContext={agentExtraContext}
                primaryActionLabel="בצע ניתוח חוזי חכם"
                hideResultsColumn
                pdfGateForSave
                onPdfSaveGateSatisfied={setPdfSaveOk}
                onSuggestionsFound={setExtractedData}
                onRisksFound={setRisks}
                onContractTypeMismatch={setContractTypeAlert}
                onAnalysisFinished={({ success }) => {
                  setAnalysisDone(success)
                  if (success) setSidebarOpen(true)
                }}
              />
            </section>
          </div>
        </div>
      </main>

      <aside
        className={cn(
          "fixed top-0 start-0 z-40 h-full border-e border-slate-200 bg-white shadow-2xl transition-all duration-500 ease-in-out",
          analysisDone && sidebarOpen ? "w-[min(100%,24rem)]" : "w-0 overflow-hidden border-transparent opacity-0"
        )}
        aria-hidden={!analysisDone || !sidebarOpen}
      >
        {analysisDone && sidebarOpen ? (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-8">
              <h2 className="text-sm font-light tracking-wide text-slate-500">
                מצפן סיכונים
              </h2>
              <p className="mt-2 text-lg font-extralight text-slate-800">
                ממצאים מהניתוח
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-6">
              {contractTypeAlert ? (
                <Alert variant="warning" className="mb-6 text-end">
                  <AlertTitle>סוג חוזה — אי-התאמה למסמך</AlertTitle>
                  <AlertDescription>{contractTypeAlert}</AlertDescription>
                </Alert>
              ) : null}
              {risks.length === 0 ? (
                <p className="text-sm font-light leading-relaxed text-slate-500">
                  לא זוהו סיכונים מובנים בפלט הניתוח. אם הופיעה הודעת הצלחה,
                  ניתן להריץ שוב עם פחות קבצים או לבדוק את תוכן המסמכים.
                </p>
              ) : (
                <ul className="space-y-4">
                  {risks.map((r, i) => (
                    <li key={`${r.title}-${i}`}>
                      <RiskCard
                        title={r.title}
                        level={r.level}
                        source={r.source}
                        recommendation={r.recommendation}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </aside>

      {analysisDone && sidebarOpen ? (
        <button
          type="button"
          aria-label="הסתרת סרגל סיכונים"
          className="fixed top-1/2 left-[min(24rem,100%)] z-50 h-24 w-2 -translate-y-1/2 rounded-e-md border border-slate-200 bg-slate-100 hover:bg-slate-200"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {analysisDone && !sidebarOpen ? (
        <button
          type="button"
          className="fixed top-1/2 left-0 z-50 flex min-h-[6rem] w-10 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-e-md border border-slate-200 bg-slate-900 px-1 text-[10px] font-medium leading-tight text-white hover:bg-slate-800"
          onClick={() => setSidebarOpen(true)}
        >
          <span>ממצאים</span>
        </button>
      ) : null}
    </div>
  )
}
