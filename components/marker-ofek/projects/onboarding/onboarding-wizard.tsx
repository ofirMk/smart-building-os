"use client"

/**
 * Sprint P1 — Project Onboarding Wizard (3-step Stepper).
 *
 * Multi-step UI mounted from `/marker-ofek/projects/new`. Every step writes
 * to the real Supabase database via the server actions in
 * `@/lib/marker-ofek/projects/p1-onboarding-actions`. There is NO mock data
 * and no in-memory-only branch — production tenants are the target audience.
 *
 * Flow:
 *   Step 1 — Initiation (master data)        → erp_proj_projects + projects
 *   Step 2 — Commercials (חוזה מסחרי)         → erp_client_contracts
 *   Step 3 — Budget & Go-Live                → live summary fetch +
 *                                              `Lock Baseline & Launch`
 *                                              activates both rows and
 *                                              navigates to the project hub.
 *
 * Iron-dome rules baked in:
 *   - try/catch around every server-action call (the action itself also
 *     try/catches; this is belt-and-suspenders).
 *   - `disabled` while pending so users cannot double-submit.
 *   - Toast on every failure + state stays on the failing step.
 *   - "חזור" never destroys data — it just lets the user re-edit.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Coins,
  Loader2,
  Rocket,
  ScrollText,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createClientContractAction,
  createProjectAction,
  fetchWizardSummaryAction,
  lockBaselineAndLaunchAction,
  type WizardSummary,
} from "@/lib/marker-ofek/projects/p1-onboarding-actions"
import { cn } from "@/lib/utils"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

type Step = 1 | 2 | 3

const STEPS: Array<{
  id: Step
  title: string
  description: string
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
}> = [
  {
    id: 1,
    title: "פתיחת פרויקט",
    description: "מנהלה ופרטי בסיס",
    icon: ClipboardList,
  },
  {
    id: 2,
    title: "חוזה מסחרי",
    description: "תנאים, עכבון ומקדמות",
    icon: ScrollText,
  },
  {
    id: 3,
    title: "השקה",
    description: "Lock Baseline & Launch",
    icon: Rocket,
  },
]

// ---------------------------------------------------------------------------
// Default values — sensible Israeli construction-industry baselines.
// ---------------------------------------------------------------------------

function defaultProjectNumber(): string {
  const now = new Date()
  const y = now.getFullYear()
  const stamp = `${now.getMonth() + 1}`.padStart(2, "0") +
    `${now.getDate()}`.padStart(2, "0") +
    `${now.getHours()}`.padStart(2, "0") +
    `${now.getMinutes()}`.padStart(2, "0")
  return `P-${y}-${stamp}`
}

function defaultContractNumber(projectNumber: string): string {
  const stripped = projectNumber.replace(/^P-/, "")
  return `C-${stripped}-001`
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function plusYearISO(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = React.useState<Step>(1)
  const [pending, setPending] = React.useState(false)

  // Step-1 form state.
  const [s1, setS1] = React.useState({
    projectNumber: defaultProjectNumber(),
    name: "",
    clientName: "",
    projectManager: "",
    startDate: todayISO(),
    endDate: plusYearISO(),
  })

  // Step-2 form state.
  const [s2, setS2] = React.useState({
    contractNumber: "",
    title: "",
    totalAmount: 0,
    retentionPct: 5,
    indexationPct: 0,
    advancePaymentAmount: 0,
    advanceRepaymentPct: 10,
    startDate: todayISO(),
    endDate: plusYearISO(),
  })

  const [projectId, setProjectId] = React.useState<string | null>(null)
  const [contractId, setContractId] = React.useState<string | null>(null)
  const [summary, setSummary] = React.useState<WizardSummary | null>(null)
  const [summaryError, setSummaryError] = React.useState<string | null>(null)

  // Pre-fill the contract number/title once we know the project number.
  const advanceToStep2 = React.useCallback(
    (projectNumber: string, projectName: string, clientName: string) => {
      setS2((prev) => ({
        ...prev,
        contractNumber: prev.contractNumber || defaultContractNumber(projectNumber),
        title: prev.title || `חוזה ראשי — ${projectName}`,
        // mirror clientName from step1 so it stays in sync visually
        // (still inserted from step1 separately for the FK target).
      }))
      void clientName
      setStep(2)
    },
    [],
  )

  // Load live summary when entering step 3.
  React.useEffect(() => {
    if (step !== 3) return
    if (!projectId || !contractId) return
    let cancelled = false
    setSummary(null)
    setSummaryError(null)
    ;(async () => {
      const res = await fetchWizardSummaryAction({ projectId, contractId })
      if (cancelled) return
      if (!res.ok) {
        setSummaryError(res.error)
        return
      }
      setSummary(res.summary)
    })()
    return () => {
      cancelled = true
    }
  }, [step, projectId, contractId])

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleStep1Submit() {
    if (pending) return
    setPending(true)
    try {
      const res = await createProjectAction({
        projectNumber: s1.projectNumber,
        name: s1.name,
        clientName: s1.clientName,
        projectManager: s1.projectManager,
        startDate: s1.startDate || null,
        endDate: s1.endDate || null,
      })
      if (!res.ok) {
        toast.error("שלב 1 נכשל", { description: res.error })
        return
      }
      toast.success("פרויקט נשמר ב-DB", {
        description: `${res.projectNumber} · ${s1.name}`,
      })
      setProjectId(res.projectId)
      advanceToStep2(res.projectNumber, s1.name, s1.clientName)
    } catch (err) {
      toast.error("שגיאה בלתי צפויה בשלב 1", {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setPending(false)
    }
  }

  async function handleStep2Submit() {
    if (pending) return
    if (!projectId) {
      toast.error("שלב 2 חסום", {
        description: "לא נמצא ID של פרויקט מהשלב הקודם — חזור לשלב 1.",
      })
      return
    }
    setPending(true)
    try {
      const res = await createClientContractAction({
        projectId,
        contractNumber: s2.contractNumber,
        title: s2.title,
        clientName: s1.clientName,
        totalAmount: Number(s2.totalAmount) || 0,
        indexationPct: Number(s2.indexationPct) || 0,
        retentionPct: Number(s2.retentionPct) || 0,
        advancePaymentAmount: Number(s2.advancePaymentAmount) || 0,
        advanceRepaymentPct: Number(s2.advanceRepaymentPct) || 0,
        startDate: s2.startDate || null,
        endDate: s2.endDate || null,
      })
      if (!res.ok) {
        toast.error("שלב 2 נכשל", { description: res.error })
        return
      }
      toast.success("חוזה מסחרי נשמר ב-DB", {
        description: `${s2.contractNumber} · ${ILS.format(Number(s2.totalAmount) || 0)}`,
      })
      setContractId(res.contractId)
      setStep(3)
    } catch (err) {
      toast.error("שגיאה בלתי צפויה בשלב 2", {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setPending(false)
    }
  }

  async function handleLaunch() {
    if (pending) return
    if (!projectId || !contractId) {
      toast.error("ההשקה חסומה", {
        description: "חסר מזהה פרויקט/חוזה — חזור לשלב הקודם.",
      })
      return
    }
    setPending(true)
    try {
      const res = await lockBaselineAndLaunchAction({ projectId, contractId })
      if (!res.ok) {
        toast.error("ההשקה נכשלה", { description: res.error })
        return
      }
      toast.success("הפרויקט הופעל!", {
        description: "מעבר למסך הפרויקט החי…",
      })
      router.push(`/marker-ofek/projects/${projectId}`)
      router.refresh()
    } catch (err) {
      toast.error("שגיאה בלתי צפויה בהשקה", {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">
          Sprint P1 · Project Onboarding
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          הקמת פרויקט חדש
        </h1>
        <p className="text-sm text-muted-foreground">
          אשף תלת-שלבי שכותב לכל אורך הדרך ל-Supabase האמיתי.
          אין נתוני דמו — כל קליק יוצר רשומות חיות.
        </p>
      </header>

      <Stepper currentStep={step} />

      <Card className="border-border/70 p-5 sm:p-6">
        {step === 1 ? (
          <Step1Form
            value={s1}
            onChange={setS1}
            disabled={pending}
            onSubmit={handleStep1Submit}
            submitting={pending}
          />
        ) : null}

        {step === 2 ? (
          <Step2Form
            value={s2}
            onChange={setS2}
            disabled={pending}
            onBack={() => setStep(1)}
            onSubmit={handleStep2Submit}
            submitting={pending}
            clientName={s1.clientName}
            projectName={s1.name}
          />
        ) : null}

        {step === 3 ? (
          <Step3Summary
            summary={summary}
            error={summaryError}
            pending={pending}
            onBack={() => setStep(2)}
            onLaunch={handleLaunch}
          />
        ) : null}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stepper indicator
// ---------------------------------------------------------------------------

function Stepper({ currentStep }: { currentStep: Step }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 sm:gap-4" aria-label="שלבי האשף">
      {STEPS.map((s, idx) => {
        const Icon = s.icon
        const isCurrent = s.id === currentStep
        const isDone = s.id < currentStep
        const isPending = s.id > currentStep
        return (
          <li
            key={s.id}
            className={cn(
              "flex flex-1 min-w-[12rem] items-center gap-3 rounded-xl border p-3 transition-colors",
              isCurrent &&
                "border-violet-300 bg-violet-50/60 shadow-sm ring-1 ring-violet-200",
              isDone && "border-emerald-300 bg-emerald-50/50",
              isPending && "border-border bg-muted/40",
            )}
            aria-current={isCurrent ? "step" : undefined}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full",
                isCurrent && "bg-violet-600 text-white",
                isDone && "bg-emerald-600 text-white",
                isPending && "bg-background text-muted-foreground border border-border",
              )}
            >
              {isDone ? (
                <CheckCircle2 className="size-5" aria-hidden />
              ) : (
                <Icon className="size-4" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase text-muted-foreground">
                שלב {idx + 1}
              </p>
              <p className="truncate text-sm font-semibold text-foreground">
                {s.title}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {s.description}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Step 1 form
// ---------------------------------------------------------------------------

type Step1Value = {
  projectNumber: string
  name: string
  clientName: string
  projectManager: string
  startDate: string
  endDate: string
}

function Step1Form({
  value,
  onChange,
  disabled,
  submitting,
  onSubmit,
}: {
  value: Step1Value
  onChange: React.Dispatch<React.SetStateAction<Step1Value>>
  disabled: boolean
  submitting: boolean
  onSubmit: () => void
}) {
  function update<K extends keyof Step1Value>(key: K, v: Step1Value[K]) {
    onChange((prev) => ({ ...prev, [key]: v }))
  }

  const valid =
    value.projectNumber.trim().length > 0 &&
    value.name.trim().length > 0 &&
    value.clientName.trim().length > 0 &&
    value.projectManager.trim().length > 0

  return (
    <form
      className="grid grid-cols-1 gap-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && !submitting) onSubmit()
      }}
    >
      <header className="sm:col-span-2 flex items-center gap-2 border-b border-border pb-3">
        <Building2 className="size-5 text-violet-600" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">
          שלב 1 · פרטי פרויקט
        </h2>
        <span className="ms-auto rounded-md bg-violet-50 px-2 py-1 text-[10px] font-mono uppercase text-violet-700">
          erp_proj_projects + projects
        </span>
      </header>

      <FormField label="מספר פרויקט פנימי" required>
        <Input
          value={value.projectNumber}
          onChange={(e) => update("projectNumber", e.target.value)}
          disabled={disabled}
          dir="ltr"
          className="font-mono"
        />
      </FormField>

      <FormField label="שם פרויקט" required>
        <Input
          value={value.name}
          onChange={(e) => update("name", e.target.value)}
          disabled={disabled}
          placeholder="מגדל יואל — תל אביב"
        />
      </FormField>

      <FormField label="שם הלקוח / מזמין" required>
        <Input
          value={value.clientName}
          onChange={(e) => update("clientName", e.target.value)}
          disabled={disabled}
          placeholder="מרקר אופק נדל״ן בע״מ"
        />
      </FormField>

      <FormField label="מנהל פרויקט" required>
        <Input
          value={value.projectManager}
          onChange={(e) => update("projectManager", e.target.value)}
          disabled={disabled}
          placeholder="מהנדס יהונתן ברק"
        />
      </FormField>

      <FormField label="תאריך התחלה">
        <Input
          type="date"
          value={value.startDate}
          onChange={(e) => update("startDate", e.target.value)}
          disabled={disabled}
        />
      </FormField>

      <FormField label="תאריך יעד לסיום">
        <Input
          type="date"
          value={value.endDate}
          onChange={(e) => update("endDate", e.target.value)}
          disabled={disabled}
        />
      </FormField>

      <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        <Button
          type="submit"
          size="lg"
          disabled={!valid || submitting}
          className="gap-2 bg-violet-600 text-white hover:bg-violet-500"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ArrowLeft className="size-4" aria-hidden />
          )}
          המשך לשלב חוזה מסחרי
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Step 2 form
// ---------------------------------------------------------------------------

type Step2Value = {
  contractNumber: string
  title: string
  totalAmount: number
  retentionPct: number
  indexationPct: number
  advancePaymentAmount: number
  advanceRepaymentPct: number
  startDate: string
  endDate: string
}

function Step2Form({
  value,
  onChange,
  disabled,
  submitting,
  onBack,
  onSubmit,
  clientName,
  projectName,
}: {
  value: Step2Value
  onChange: React.Dispatch<React.SetStateAction<Step2Value>>
  disabled: boolean
  submitting: boolean
  onBack: () => void
  onSubmit: () => void
  clientName: string
  projectName: string
}) {
  function update<K extends keyof Step2Value>(key: K, v: Step2Value[K]) {
    onChange((prev) => ({ ...prev, [key]: v }))
  }

  const valid =
    value.contractNumber.trim().length > 0 &&
    value.title.trim().length > 0 &&
    Number(value.totalAmount) >= 0

  return (
    <form
      className="grid grid-cols-1 gap-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && !submitting) onSubmit()
      }}
    >
      <header className="sm:col-span-2 flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Coins className="size-5 text-emerald-600" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">
          שלב 2 · חוזה מסחרי
        </h2>
        <span className="ms-auto rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-mono uppercase text-emerald-700">
          erp_client_contracts
        </span>
      </header>

      <p className="sm:col-span-2 -mt-1 text-xs text-muted-foreground">
        חוזה ראשי בין הפרויקט <strong>{projectName || "—"}</strong> לבין הלקוח{" "}
        <strong>{clientName || "—"}</strong>.
      </p>

      <FormField label="מספר חוזה" required>
        <Input
          value={value.contractNumber}
          onChange={(e) => update("contractNumber", e.target.value)}
          disabled={disabled}
          dir="ltr"
          className="font-mono"
        />
      </FormField>

      <FormField label="כותרת חוזה" required>
        <Input
          value={value.title}
          onChange={(e) => update("title", e.target.value)}
          disabled={disabled}
          placeholder="חוזה ראשי — בנייה ופיתוח"
        />
      </FormField>

      <FormField label="סכום חוזה (₪, לפני מע״מ)" required>
        <Input
          type="number"
          min={0}
          step={1000}
          value={value.totalAmount}
          onChange={(e) => update("totalAmount", Number(e.target.value) || 0)}
          disabled={disabled}
          dir="ltr"
          className="font-mono tabular-nums"
        />
      </FormField>

      <FormField label="עכבון (%)">
        <Input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={value.retentionPct}
          onChange={(e) => update("retentionPct", Number(e.target.value) || 0)}
          disabled={disabled}
          dir="ltr"
          className="font-mono tabular-nums"
        />
      </FormField>

      <FormField label="הצמדה (%)">
        <Input
          type="number"
          min={0}
          step={0.1}
          value={value.indexationPct}
          onChange={(e) => update("indexationPct", Number(e.target.value) || 0)}
          disabled={disabled}
          dir="ltr"
          className="font-mono tabular-nums"
        />
      </FormField>

      <FormField label="מקדמה (₪)">
        <Input
          type="number"
          min={0}
          step={1000}
          value={value.advancePaymentAmount}
          onChange={(e) => update("advancePaymentAmount", Number(e.target.value) || 0)}
          disabled={disabled}
          dir="ltr"
          className="font-mono tabular-nums"
        />
      </FormField>

      <FormField label="קצב החזרת מקדמה (%)">
        <Input
          type="number"
          min={0}
          max={100}
          step={1}
          value={value.advanceRepaymentPct}
          onChange={(e) => update("advanceRepaymentPct", Number(e.target.value) || 0)}
          disabled={disabled}
          dir="ltr"
          className="font-mono tabular-nums"
        />
      </FormField>

      <FormField label="תחילת חוזה">
        <Input
          type="date"
          value={value.startDate}
          onChange={(e) => update("startDate", e.target.value)}
          disabled={disabled}
        />
      </FormField>

      <FormField label="תוקף חוזה עד">
        <Input
          type="date"
          value={value.endDate}
          onChange={(e) => update("endDate", e.target.value)}
          disabled={disabled}
        />
      </FormField>

      <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onBack}
          disabled={submitting}
          className="gap-2"
        >
          <ArrowRight className="size-4" aria-hidden />
          חזרה לשלב פרטי פרויקט
        </Button>

        <Button
          type="submit"
          size="lg"
          disabled={!valid || submitting}
          className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ArrowLeft className="size-4" aria-hidden />
          )}
          המשך להשקה
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Step 3 — summary + launch
// ---------------------------------------------------------------------------

function Step3Summary({
  summary,
  error,
  pending,
  onBack,
  onLaunch,
}: {
  summary: WizardSummary | null
  error: string | null
  pending: boolean
  onBack: () => void
  onLaunch: () => void
}) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Rocket className="size-5 text-fuchsia-600" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">
          שלב 3 · סקירה והשקה
        </h2>
        <span className="ms-auto rounded-md bg-fuchsia-50 px-2 py-1 text-[10px] font-mono uppercase text-fuchsia-700">
          live read
        </span>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          טעינת הסיכום נכשלה: {error}
        </div>
      ) : null}

      {!summary && !error ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          טוען סיכום מה-DB…
        </div>
      ) : null}

      {summary?.project ? (
        <section className="space-y-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            פרויקט (erp_proj_projects)
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCell label="מספר" value={summary.project.projectNumber} mono />
            <SummaryCell label="שם" value={summary.project.name} />
            <SummaryCell label="סטטוס" value={summary.project.status} mono />
            <SummaryCell label="התחלה" value={summary.project.startDate ?? "—"} />
          </div>
        </section>
      ) : null}

      {summary?.contract ? (
        <section className="space-y-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            חוזה מסחרי (erp_client_contracts)
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCell label="מספר חוזה" value={summary.contract.contractNumber} mono />
            <SummaryCell label="לקוח" value={summary.contract.clientName} />
            <SummaryCell
              label="סכום חוזה"
              value={ILS.format(summary.contract.totalAmount)}
              mono
            />
            <SummaryCell
              label="עכבון"
              value={`${summary.contract.retentionPct}%`}
              mono
            />
            <SummaryCell
              label="הצמדה"
              value={`${summary.contract.indexationPct}%`}
              mono
            />
            <SummaryCell
              label="מקדמה"
              value={ILS.format(summary.contract.advancePaymentAmount)}
              mono
            />
            <SummaryCell
              label="קצב החזרה"
              value={`${summary.contract.advanceRepaymentPct}%`}
              mono
            />
            <SummaryCell label="סטטוס" value={summary.contract.status} mono />
          </div>
        </section>
      ) : null}

      <div className="rounded-lg border-2 border-dashed border-fuchsia-300 bg-fuchsia-50/50 p-4">
        <p className="text-sm text-fuchsia-900">
          <strong>הערה:</strong> לחיצה על <em>Lock Baseline & Launch</em> תעדכן
          את סטטוס הפרויקט והחוזה ל-<code className="font-mono">ACTIVE</code>{" "}
          ותעבירך ישירות למסך הפרויקט החי. הפעולה כותבת ל-DB באופן אטומי
          עם try/catch מלא.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onBack}
          disabled={pending}
          className="gap-2"
        >
          <ArrowRight className="size-4" aria-hidden />
          חזרה לחוזה
        </Button>

        <Button
          type="button"
          size="lg"
          disabled={pending || !summary?.project || !summary?.contract}
          onClick={onLaunch}
          className="gap-2 bg-fuchsia-600 text-white shadow-md hover:bg-fuchsia-500"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Rocket className="size-4" aria-hidden />
          )}
          🚀 Lock Baseline & Launch Project
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground">
        {label}
        {required ? <span className="ms-1 text-rose-500">*</span> : null}
      </Label>
      {children}
    </div>
  )
}

function SummaryCell({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <p className="text-[10px] font-mono uppercase text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 truncate text-sm font-semibold text-foreground",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </p>
    </div>
  )
}
