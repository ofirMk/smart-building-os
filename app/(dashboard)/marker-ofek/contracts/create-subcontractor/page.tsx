"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Info, Save } from "lucide-react"
import { toast } from "sonner"

import {
  HRAgentPanel,
  type HrAgentRiskItem,
  type HrAgentSuggestions,
} from "@/components/marker-ofek/hr-agent-panel"
import { RiskCard } from "@/components/marker-ofek/risk-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useDiamondNavigation } from "@/hooks/use-diamond-navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"

const SUBCONTRACTOR_TRADE_OPTIONS = [
  { value: "elec", label: "חשמל ותשתיות" },
  { value: "fire", label: "גילוי אש וכריזה" },
  { value: "low", label: "מתח נמוך" },
] as const

function subcontractorTradeLabel(value: string): string {
  const row = SUBCONTRACTOR_TRADE_OPTIONS.find((o) => o.value === value)
  return row?.label ?? value
}

const fieldSelectClass =
  "h-auto w-full min-w-0 border-slate-200 bg-slate-50 py-6 text-lg"
const fieldInputClass =
  "border-slate-200 bg-slate-50 py-6 text-lg"

type ProjectRow = { id: string; name: string }

export default function CreateSubcontractorContractPage() {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false)
  const [laborOnly, setLaborOnly] = React.useState(false)
  const [paymentModel, setPaymentModel] = React.useState("btb")
  const [contractKind, setContractKind] = React.useState("")
  const [contractTypeAlert, setContractTypeAlert] = React.useState<
    string | null
  >(null)
  const [trade, setTrade] = React.useState("")
  const [formState, setFormState] = React.useState({ paymentTerms: "" })
  const [extractedData, setExtractedData] =
    React.useState<HrAgentSuggestions | null>(null)
  const [risks, setRisks] = React.useState<HrAgentRiskItem[]>([])
  const [projects, setProjects] = React.useState<ProjectRow[]>([])
  const [loadingProjects, setLoadingProjects] = React.useState(true)
  const [parentProjectId, setParentProjectId] = React.useState("")
  const [subName, setSubName] = React.useState("")
  const [backToBackNotes, setBackToBackNotes] = React.useState("")
  const [pdfSaveOk, setPdfSaveOk] = React.useState(true)
  const [backToBackAlert, setBackToBackAlert] = React.useState<
    string | null
  >(null)
  const [analysisDone, setAnalysisDone] = React.useState(false)

  useDiamondNavigation("projects")

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

  const parentProjectLabel = React.useMemo(
    () => projects.find((p) => p.id === parentProjectId)?.name?.trim() ?? "",
    [projects, parentProjectId]
  )

  const agentMetadata = React.useMemo(
    () => ({
      laborOnly,
      paymentModel,
      shoftefPlusDays: formState.paymentTerms || undefined,
      ...(trade ? { trade: subcontractorTradeLabel(trade) } : {}),
      ...(contractKind === "lump-sum" || contractKind === "measurement"
        ? { contractType: contractKind }
        : {}),
      ...(parentProjectLabel
        ? { parentProjectName: parentProjectLabel }
        : {}),
      ...(backToBackNotes.trim()
        ? { backToBackNotes: backToBackNotes.trim() }
        : {}),
    }),
    [
      laborOnly,
      paymentModel,
      formState.paymentTerms,
      trade,
      contractKind,
      parentProjectLabel,
      backToBackNotes,
    ]
  )

  const formValidForSave =
    Boolean(parentProjectId.trim()) &&
    Boolean(subName.trim()) &&
    (contractKind === "lump-sum" || contractKind === "measurement") &&
    pdfSaveOk

  function handleSaveContract() {
    if (!formValidForSave) {
      toast.error(
        "יש למלא פרויקט אב, שם קבלן וסוג חוזה, ולהשלים ניתוח מסמכים (או „דלג על ניתוח”) לפני שמירה."
      )
      return
    }
    toast.info(
      "שמירת חוזה קבלן לשרת תתווסף בשלב הבא — הטופס והניתוח מוכנים לבדיקה."
    )
  }

  const applyValue = React.useCallback(
    (field: keyof typeof formState, val: string | number) => {
      setFormState((prev) => ({
        ...prev,
        [field]: typeof val === "number" ? String(val) : val,
      }))
    },
    []
  )

  return (
    <div className="flex min-h-0 flex-col bg-white" dir="rtl">
      <main className="ms-2 flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/50 p-6 lg:p-8">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-sm text-slate-400">
              <Link
                href="/marker-ofek/contracts/select-type"
                className="flex items-center gap-1 transition-colors hover:text-slate-600"
              >
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                חזרה לבחירה
              </Link>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              הקמת חוזה קבלן / ספק
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3 lg:gap-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-full px-6"
            >
              טיוטה
            </Button>
            <Button
              type="button"
              className="gap-2 rounded-full bg-green-600 px-8 shadow-lg transition-transform hover:bg-green-700 active:scale-95 disabled:opacity-50"
              disabled={!formValidForSave}
              title={
                !formValidForSave
                  ? "מלאו שדות חובה והשלימו ניתוח מסמכים כשהועלו קבצים"
                  : undefined
              }
              onClick={() => handleSaveContract()}
            >
              <Save className="h-4 w-4 shrink-0" aria-hidden />
              שמור חוזה
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-visible">
          <div className="form-stack mx-auto w-full max-w-5xl p-8 lg:p-12">
            <section className="grid grid-cols-1 gap-12 overflow-visible border-b border-slate-100 pb-12 md:grid-cols-2">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-800">
                  פרטי הפרויקט
                </h2>
                <p className="text-sm text-slate-500 italic">
                  שיוך הקבלן לחוזה המזמין הקיים במערכת
                </p>
              </div>
              <div className="space-y-6 overflow-visible">
                <div className="grid gap-2">
                  <Label
                    htmlFor="parentContract"
                    className="flex justify-between font-semibold text-slate-600"
                  >
                    <span>שיוך לחוזה מזמין (פרויקט אב)</span>
                    <span className="text-[10px] font-light text-slate-400">
                      F2 · הקמה מהירה
                    </span>
                  </Label>
                  <Select
                    value={parentProjectId || undefined}
                    onValueChange={(v) => setParentProjectId(v ?? "")}
                    disabled={loadingProjects}
                  >
                    <SelectTrigger
                      id="parentContract"
                      className={fieldSelectClass}
                    >
                      <SelectValue
                        placeholder={
                          loadingProjects
                            ? "טוען פרויקטים…"
                            : "בחרו פרויקט אב מהרשימה"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent
                      className="z-[100] border-slate-100 bg-white shadow-xl"
                      align="end"
                      diamondEntity="projects"
                    >
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name?.trim() || p.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="subName" className="font-semibold text-slate-600">
                    שם הקבלן / חברה
                  </Label>
                  <Input
                    id="subName"
                    placeholder="למשל: גילוי אש בע״מ"
                    className={fieldInputClass}
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="trade" className="font-semibold text-slate-600">
                    תחום עבודה
                  </Label>
                  <Select
                    value={trade || undefined}
                    onValueChange={(v) => setTrade(v ?? "")}
                  >
                    <SelectTrigger id="trade" className={fieldSelectClass}>
                      <SelectValue placeholder="בחר תחום" />
                    </SelectTrigger>
                    <SelectContent
                      className="z-[100] border-slate-200 bg-white"
                      align="end"
                    >
                      {SUBCONTRACTOR_TRADE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label
                    htmlFor="backToBackNotes"
                    className="font-semibold text-slate-600"
                  >
                    תקציר / הערות מזמין (חוזה אב) להשוואת גב־אל־גב
                  </Label>
                  <Textarea
                    id="backToBackNotes"
                    placeholder="למשל: תשלום 45 יום, עיכבון 5%, ביטוח עד סיום + 12 חודש…"
                    className="min-h-[120px] border-slate-200 bg-slate-50/80 text-base font-light leading-relaxed"
                    value={backToBackNotes}
                    onChange={(e) => setBackToBackNotes(e.target.value)}
                  />
                  <p className="text-xs font-light text-slate-500">
                    הטקסט נשלח למודל הניתוח יחד עם שם פרויקט האב; להשוואה מלאה
                    מומלץ להעלות גם את מסמכי חוזה המזמין בחבילה.
                  </p>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-12 border-b border-slate-100 pb-12 md:grid-cols-2">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-800">
                  תנאי התקשרות
                </h2>
                <p className="text-sm text-slate-500 italic">
                  הגדרת היקף העבודה והתמורה הכספית
                </p>
              </div>
              <div className="space-y-8">
                <div className="flex items-center justify-between rounded-2xl border border-green-100 bg-green-50/50 p-4">
                  <div className="space-y-1 pe-4">
                    <Label
                      htmlFor="labor-only"
                      className="text-lg font-bold text-green-900"
                    >
                      ביצוע בלבד (ללא חומר)
                    </Label>
                    <p className="text-sm text-green-800/80">
                      הפעילו אם הציוד מסופק על ידי מרקר אופק
                    </p>
                  </div>
                  <Switch
                    id="labor-only"
                    checked={laborOnly}
                    onCheckedChange={setLaborOnly}
                    className="data-[state=checked]:bg-green-600"
                  />
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label
                      htmlFor="contractAmount"
                      className="block w-full text-end font-semibold text-slate-600"
                    >
                      סכום חוזה (₪)
                    </Label>
                    <Input
                      id="contractAmount"
                      type="number"
                      placeholder="0"
                      min={0}
                      dir="ltr"
                      className={cn(
                        fieldInputClass,
                        "text-start font-mono text-xl"
                      )}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor="paymentModel"
                      className="block w-full text-end font-semibold text-slate-600"
                    >
                      תנאי תשלום
                    </Label>
                    <Select
                      value={paymentModel}
                      onValueChange={(v) => setPaymentModel(v ?? "btb")}
                    >
                      <SelectTrigger
                        id="paymentModel"
                        className={fieldSelectClass}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        className="z-[100] border-slate-200 bg-white"
                        align="end"
                      >
                        <SelectItem value="btb">
                          גב אל גב מול המזמין
                        </SelectItem>
                        <SelectItem value="direct">שוטף פלוס קבוע</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid w-full gap-2">
                  <Label
                    htmlFor="contract-kind"
                    className="w-full text-end font-semibold text-slate-600"
                  >
                    סוג חוזה
                  </Label>
                  <Select
                    value={contractKind || undefined}
                    onValueChange={(v) => setContractKind(v ?? "")}
                  >
                    <SelectTrigger id="contract-kind" className={fieldSelectClass}>
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

                <div className="grid w-full gap-2">
                  <Label
                    htmlFor="payment-shoftef"
                    className="block w-full text-end font-semibold text-slate-600"
                  >
                    תנאי תשלום (שוטף+ — ימים)
                  </Label>
                  <div className="group relative">
                    <Input
                      id="payment-shoftef"
                      type="number"
                      min={0}
                      value={formState.paymentTerms}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          paymentTerms: e.target.value,
                        }))
                      }
                      placeholder={
                        extractedData?.paymentTerms?.value != null
                          ? `הצעה מהניתוח: ${extractedData.paymentTerms.value}`
                          : "מספר ימים"
                      }
                      dir="ltr"
                      className={cn(
                        fieldInputClass,
                        "text-start font-mono text-xl",
                        extractedData?.paymentTerms?.value != null &&
                          "border-slate-200/90 bg-slate-50/60 ring-1 ring-slate-200/50"
                      )}
                    />
                    {extractedData?.paymentTerms?.value != null ? (
                      <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                        <button
                          type="button"
                          className="pointer-events-auto rounded-full border border-slate-200/80 bg-white/90 px-3 py-1.5 text-[10px] font-medium text-slate-500 shadow-sm hover:bg-slate-50"
                          title={extractedData.paymentTerms.source}
                          onClick={() => {
                            const v = extractedData.paymentTerms?.value
                            if (v == null) return
                            applyValue("paymentTerms", v)
                          }}
                        >
                          לאישור הערך
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {extractedData?.paymentTerms?.value != null ? (
                    <p className="ai-ghost-suggestion mt-3 text-xs">
                      מקור: {extractedData.paymentTerms.source}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <div className="flex gap-3 rounded-2xl border border-amber-100 bg-amber-50/80 p-4">
              <Info
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
                aria-hidden
              />
              <div className="text-sm leading-relaxed text-amber-950">
                <p className="mb-1 font-bold">שים לב</p>
                <p>
                  במצב{" "}
                  <strong>
                    {laborOnly ? "ביצוע בלבד" : "חומר וגם ביצוע"}
                  </strong>
                  , ודאו שכתב הכמויות שמועלה לניתוח המסמכים תואם להגדרות כדי
                  למנוע כפל תשלומים או פערים באספקה.
                </p>
              </div>
            </div>

            <section className="space-y-4 border-t border-slate-100 pt-12">
              <h2 className="text-xl font-bold text-slate-800">
                ניתוח מסמכים להשוואה
              </h2>
              <p className="text-sm font-light text-slate-500">
                העלאת קבצים חוסמת שמירה עד להרצת ניתוח או לחיצה על „דלג על
                ניתוח” בכרטיס המסמכים.
              </p>
              <HRAgentPanel
                mode="subcontractor"
                metadata={agentMetadata}
                primaryActionLabel="בצע ניתוח חוזי חכם"
                hideResultsColumn
                pdfGateForSave
                onPdfSaveGateSatisfied={setPdfSaveOk}
                onSuggestionsFound={setExtractedData}
                onRisksFound={setRisks}
                onContractTypeMismatch={setContractTypeAlert}
                onBackToBackMismatch={setBackToBackAlert}
                onAnalysisFinished={({ success }) => {
                  setAnalysisDone(success)
                  if (success) setIsSidebarOpen(true)
                }}
              />
            </section>
          </div>
        </div>
      </main>

      <aside
        className={cn(
          "fixed top-0 start-0 z-40 h-full border-e border-slate-200 bg-white shadow-2xl transition-all duration-500 ease-in-out",
          isSidebarOpen ? "w-96" : "w-2"
        )}
        onMouseEnter={() => setIsSidebarOpen(true)}
        onMouseLeave={() => setIsSidebarOpen(false)}
      >
        {isSidebarOpen ? (
          <div className="overflow-visible p-6 transition-opacity delay-200">
            <h2 className="mb-6 text-sm font-bold text-slate-600">
              בקרת סיכונים
            </h2>
            {contractTypeAlert ? (
              <Alert variant="warning" className="mb-6 text-end">
                <AlertTitle>סוג חוזה — אי-התאמה למסמך</AlertTitle>
                <AlertDescription>{contractTypeAlert}</AlertDescription>
              </Alert>
            ) : null}
            {backToBackAlert ? (
              <Alert variant="warning" className="mb-6 text-end">
                <AlertTitle>גב־אל־גב — פער מול חוזה המזמין</AlertTitle>
                <AlertDescription>{backToBackAlert}</AlertDescription>
              </Alert>
            ) : null}
            {!analysisDone && risks.length === 0 && !contractTypeAlert ? (
              <p className="mb-4 text-xs text-slate-500">
                הריצו ניתוח מסמכים כדי למלא את סרגל הסיכונים.
              </p>
            ) : null}
            {risks.length === 0 ? (
              <p className="text-xs leading-relaxed text-slate-500">
                הרחיבו את הסרגל והריצו ניתוח. כרטיסיות סיכון יופיעו כאן כשיזוהו
                בנתונים המובנים.
              </p>
            ) : (
              <div className="space-y-1">
                {risks.map((r, i) => (
                  <RiskCard
                    key={`${r.title}-${i}`}
                    title={r.title}
                    level={r.level}
                    source={r.source}
                    recommendation={r.recommendation}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  )
}
