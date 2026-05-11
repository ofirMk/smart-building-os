"use client"

/**
 * InvestorCommandCenter — the **CEO Command Center** hero for the project hub.
 *
 * תפקיד: לתת למנכ"ל מסך בולט — KPI פיננסי, חיסכון AI בולט, אבני דרך,
 * ו-AI Copilot חי בנגיעה — מבלי להפר את שאר חוויית הניהול הקיימת ב-`ProjectMasterHub360`.
 *
 * **Mock-data only** — אסור לקרוא ל-DB. כל הערכים מתחת קבועים, כדי שהמסך ייראה זהה
 * גם כשהפרויקט בסביבת dev/empty.
 *
 * Live Audio UI מוטמע בכפתור המיקרופון: 5 בריקסים דקים מטה-מעלה עם stagger ב-`animationDelay`
 * שמדמים גלי קול.
 *
 * Attachments — הדראוור תומך צירוף תמונות (PNG / JPG / WebP) ו-PDF זהה להודעת ה-API
 * דרך `useChat`. הזרימה מתבצעת דרך אותו ה-endpoint שמשתמש ה Autonomous-PO Copilot.
 */

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import {
  BarChart3,
  Bot,
  Briefcase,
  Coins,
  Layers,
  FileText,
  ImageIcon,
  Landmark,
  Mic,
  MicOff,
  Paperclip,
  Printer,
  ReceiptText,
  Send,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { playMicStart, playMicStop, playSuccess } from "@/lib/audio-sfx"
import { readActiveCompanyIdFromCookie } from "@/lib/company-context"
import { getSpeechRecognitionConstructor } from "@/lib/speech-recognition"
import { cn } from "@/lib/utils"
import {
  DEMO_AP_PAYMENT_RUN_ID,
  DEMO_BANK_RECONCILIATION_ID,
  DEMO_CONTRACT_PROJECT_ID,
  DEMO_CONTROL_PERIOD_ID,
  DEMO_PLANNING_EDITION_ID,
  DEMO_PURCHASE_ORDER_ID,
  DEMO_SUBCONTRACTOR_BILL_ID,
  DEMO_SUBCONTRACTOR_CONTRACT_ID,
} from "@/types/erp"

// ============================================================================
// Mock data — investor-grade numbers
// ============================================================================

const MOCK_KPI = {
  budgetApproved: 10_000_000,
  budgetUsed: 4_200_000,
  aiSavings: 84_000,
  /** Forecast vs plan (AI Copilot inferred). */
  forecastVarianceIls: -126_000, // negative = under-budget = good
  progressPct: 41,
}

type Milestone = {
  id: string
  label: string
  pct: number
  status: "done" | "in-progress" | "upcoming"
}

const MOCK_MILESTONES: Milestone[] = [
  { id: "m-1", label: "אישורי היתר", pct: 100, status: "done" },
  { id: "m-2", label: "ביצוע מרתפים", pct: 60, status: "in-progress" },
  { id: "m-3", label: "שלד עליון", pct: 18, status: "in-progress" },
  { id: "m-4", label: "מעטפת + גמר", pct: 0, status: "upcoming" },
  { id: "m-5", label: "מסירה ללקוח", pct: 0, status: "upcoming" },
]

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

// ============================================================================
// Component
// ============================================================================

export function InvestorCommandCenter({
  projectId,
  projectName,
  internalCode,
}: {
  projectId: string
  projectName: string
  internalCode: string | null
}) {
  return (
    <section
      dir="rtl"
      className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.18)]"
      data-ceo-command-center="hero"
    >
      {/* Decorative gradient halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-72 w-72 rounded-full bg-gradient-to-br from-emerald-300/30 via-cyan-300/20 to-transparent blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-gradient-to-tr from-violet-400/25 via-fuchsia-300/20 to-transparent blur-3xl"
      />

      <header className="relative mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <Badge
            variant="secondary"
            className="border border-emerald-200 bg-emerald-50 text-emerald-700"
          >
            <Sparkles className="me-1 size-3" />
            מרכז שליטה פרויקט
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {projectName}
          </h2>
          {internalCode ? (
            <p className="text-xs text-muted-foreground">
              קוד פנימי <span className="font-mono">{internalCode}</span>
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {/* Demo: print the seeded subcontractor contract (one-click for pitch) */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            data-demo-link="subcontractor-contract-print"
            render={
              <a
                href={`/print/contracts/${DEMO_SUBCONTRACTOR_CONTRACT_ID}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <Printer className="size-4" aria-hidden />
            חוזה קבלן משנה (PDF)
          </Button>
          {/* Demo: print the seeded subcontractor partial bill (cumulative + waterfall) */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            data-demo-link="subcontractor-bill-print"
            render={
              <a
                href={`/print/bills/${DEMO_SUBCONTRACTOR_BILL_ID}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <ReceiptText className="size-4" aria-hidden />
            חשבון קבלן מצטבר (PDF)
          </Button>
          {/* Demo: print the seeded Purchase Order (change-order on top of the contract) */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"
            data-demo-link="purchase-order-print"
            render={
              <a
                href={`/print/purchase-orders/${DEMO_PURCHASE_ORDER_ID}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <ShoppingCart className="size-4" aria-hidden />
            הזמנת רכש (PDF)
          </Button>
          {/* Demo: print the seeded bank reconciliation report (Sprint A.1 — Financial Closure) */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
            data-demo-link="bank-reconciliation-print"
            render={
              <a
                href={`/print/bank-reconciliations/${DEMO_BANK_RECONCILIATION_ID}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <Landmark className="size-4" aria-hidden />
            דוח התאמת בנק (PDF)
          </Button>
          {/* Demo: print the seeded AP Payment Run report (Sprint A.2 — MASAV) */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            data-demo-link="payment-run-print"
            render={
              <a
                href={`/print/payment-runs/${DEMO_AP_PAYMENT_RUN_ID}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <Coins className="size-4" aria-hidden />
            קובץ מס&quot;ב + דוח תשלום (PDF)
          </Button>
          {/* Demo: live Contract Workspace (Sprint A.3) — navigates to interactive demo */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100"
            data-demo-link="contract-workspace-live"
            render={
              <a
                href={`/marker-ofek/projects/${DEMO_CONTRACT_PROJECT_ID}/contracts/${DEMO_SUBCONTRACTOR_CONTRACT_ID}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <Briefcase className="size-4" aria-hidden />
            סביבת עבודה — חוזים וחשבונות קבלן
          </Button>
          {/* Demo: live Project Planning Workspace (Sprint A.4 — Priority pivot) */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100"
            data-demo-link="project-planning-live"
            render={
              <a
                href={`/marker-ofek/projects/${DEMO_CONTRACT_PROJECT_ID}/planning?edition=${DEMO_PLANNING_EDITION_ID}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <Layers className="size-4" aria-hidden />
            תכנון פרויקט ותמחור (WBS)
          </Button>
          {/* Demo: live Cost Control Cockpit (Sprint A.5 — MedaTech §6) */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
            data-demo-link="cost-control-live"
            render={
              <a
                href={`/marker-ofek/projects/${DEMO_CONTRACT_PROJECT_ID}/cost-control?period=${DEMO_CONTROL_PERIOD_ID}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <BarChart3 className="size-4" aria-hidden />
            בקרת תקציב — מתוכנן/מתחייב/בוצע
          </Button>
          <CopilotDrawer projectId={projectId} projectName={projectName} />
        </div>
      </header>

      {/* Bento KPI grid */}
      <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          tone="indigo"
          icon={<Wallet className="size-5" />}
          label="תקציב מאושר"
          value={ILS.format(MOCK_KPI.budgetApproved)}
          hint="לפי כתב כמויות חתום"
        />
        <KpiTile
          tone="amber"
          icon={<Coins className="size-5" />}
          label="תקציב שנוצל"
          value={ILS.format(MOCK_KPI.budgetUsed)}
          hint={`${Math.round(
            (MOCK_KPI.budgetUsed / MOCK_KPI.budgetApproved) * 100,
          )}% מהמסגרת`}
          progressPct={Math.round(
            (MOCK_KPI.budgetUsed / MOCK_KPI.budgetApproved) * 100,
          )}
        />
        <KpiTile
          tone="emerald"
          icon={<TrendingUp className="size-5" />}
          label="חיסכון מוערך ע״י AI"
          value={`+${ILS.format(MOCK_KPI.aiSavings)}`}
          hint="ניתוב חכם של רכש + מניעת חריגות"
          glow
        />
        <KpiTile
          tone="sky"
          icon={<TrendingDown className="size-5" />}
          label="סטיית תחזית"
          value={ILS.format(MOCK_KPI.forecastVarianceIls)}
          hint="מתחת לתכנון — תחזית AI"
        />
      </div>

      {/* Milestones strip */}
      <div className="relative mt-6 rounded-2xl border border-border bg-card/70 p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              אבני דרך
            </p>
            <h3 className="text-base font-semibold text-foreground">
              התקדמות הפרויקט · {MOCK_KPI.progressPct}%
            </h3>
          </div>
          <Badge
            variant="outline"
            className="border-emerald-300 bg-emerald-50 text-emerald-700"
          >
            On-Track
          </Badge>
        </div>
        <Progress value={MOCK_KPI.progressPct} className="h-2" />
        <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {MOCK_MILESTONES.map((m) => (
            <li
              key={m.id}
              className={cn(
                "rounded-xl border bg-card p-3 text-sm shadow-sm",
                m.status === "done" &&
                  "border-emerald-300 bg-emerald-50 text-emerald-900",
                m.status === "in-progress" &&
                  "border-amber-300 bg-amber-50 text-amber-900",
                m.status === "upcoming" &&
                  "border-border text-muted-foreground",
              )}
            >
              <div className="text-xs font-medium opacity-75">{m.label}</div>
              <div className="mt-1 text-lg font-semibold leading-none">
                {m.pct}%
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ============================================================================
// KPI Tile
// ============================================================================

const TONE_CLASS = {
  indigo: "from-indigo-500/10 to-transparent ring-indigo-200",
  amber: "from-amber-500/10 to-transparent ring-amber-200",
  emerald: "from-emerald-500/15 to-transparent ring-emerald-300",
  sky: "from-sky-500/10 to-transparent ring-sky-200",
} as const

const TONE_TEXT = {
  indigo: "text-indigo-700",
  amber: "text-amber-700",
  emerald: "text-emerald-700",
  sky: "text-sky-700",
} as const

function KpiTile({
  tone,
  icon,
  label,
  value,
  hint,
  progressPct,
  glow = false,
}: {
  tone: keyof typeof TONE_CLASS
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  progressPct?: number
  glow?: boolean
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-0 bg-gradient-to-br p-5 shadow-sm ring-1",
        TONE_CLASS[tone],
        "bg-card",
      )}
    >
      {glow ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-pulse bg-emerald-400/10"
        />
      ) : null}
      <div className="relative flex items-center justify-between">
        <span className={cn("text-xs font-medium", TONE_TEXT[tone])}>
          {label}
        </span>
        <span
          className={cn(
            "rounded-full bg-card p-1.5 ring-1 ring-border",
            TONE_TEXT[tone],
          )}
        >
          {icon}
        </span>
      </div>
      <div
        className={cn(
          "relative mt-3 text-2xl font-bold tracking-tight",
          tone === "emerald" ? "text-emerald-600" : "text-foreground",
        )}
      >
        {value}
      </div>
      {hint ? (
        <p className="relative mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {typeof progressPct === "number" ? (
        <div className="relative mt-3">
          <Progress value={progressPct} className="h-1.5" />
        </div>
      ) : null}
    </Card>
  )
}

// ============================================================================
// Copilot Drawer (Sheet) — chat + live audio waveform on mic
// ============================================================================

const COPILOT_INTRO_MESSAGE: UIMessage = {
  id: "investor-copilot-intro",
  role: "assistant",
  parts: [
    {
      type: "text",
      text:
        "שלום, אני סוכן ה-AI של הפרויקט. " +
        "אני יודע לקרוא תוכניות, לחלץ כמויות מ-DWG/DXF, ולהוציא הזמנת רכש מדויקת " +
        "תוך שניות. נסה: 'הזמן 100 מ' תעלת חשמל למפלס -1' או צרף תוכנית.",
    },
  ],
}

function CopilotDrawer({
  projectId,
  projectName,
}: {
  projectId: string
  projectName: string
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        size="lg"
        type="button"
        onClick={() => setOpen(true)}
        className="group relative overflow-hidden bg-gradient-to-l from-emerald-500 via-emerald-600 to-cyan-600 text-white shadow-lg shadow-emerald-500/30 hover:from-emerald-600 hover:to-cyan-700"
      >
        <span
          aria-hidden
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        />
        <Bot className="me-2 size-5" />
        פתח AI Copilot
        <span className="ms-2 inline-flex h-2 w-2 animate-pulse rounded-full bg-white" />
      </Button>
      <SheetContent
        side="left"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        dir="rtl"
      >
        <SheetHeader className="border-b bg-gradient-to-l from-emerald-50 to-cyan-50 p-4">
          <SheetTitle className="flex items-center gap-2 text-emerald-700">
            <Bot className="size-5" />
            AI Copilot · {projectName}
          </SheetTitle>
          <SheetDescription>
            פרויקט מקושר אוטומטית · הקלטה חיה · Vision + Vector Extraction
          </SheetDescription>
        </SheetHeader>
        <CopilotChat
          projectId={projectId}
          projectName={projectName}
          onClose={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}

// ============================================================================
// CopilotChat — stripped down conversation UI with live audio waveform
// ============================================================================

function CopilotChat({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string
  projectName: string
  onClose: () => void
}) {
  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/procurement/autonomous-po/chat",
        headers: () => {
          const cid = readActiveCompanyIdFromCookie()
          const out: Record<string, string> = {}
          if (cid) {
            out["x-company-id"] = cid
            out["x-active-company-id"] = cid
          }
          return out
        },
      }),
    [],
  )

  const { messages, sendMessage, status } = useChat({
    transport,
    messages: [COPILOT_INTRO_MESSAGE],
  })
  const busy = status === "submitted" || status === "streaming"

  const [input, setInput] = React.useState("")
  const [listening, setListening] = React.useState(false)
  const [speechSupported, setSpeechSupported] = React.useState(false)
  const recognitionRef = React.useRef<SpeechRecognition | null>(null)
  const speechFinalsRef = React.useRef("")
  const scrollRef = React.useRef<HTMLDivElement | null>(null)

  // ----- Attachments -----
  // The Copilot drawer accepts the same image/PDF set as the Autonomous-PO
  // chat (mirrored intentionally so the underlying AI tools route identically).
  // Only images are sent verbatim; PDFs are flagged here but not pre-rendered
  // — the API already accepts `application/pdf` MIME for engineering drawings.
  const [attachments, setAttachments] = React.useState<File[]>([])
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const MAX_BYTES = 10 * 1024 * 1024 // 10MB
  const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf"

  React.useEffect(() => {
    setSpeechSupported(!!getSpeechRecognitionConstructor())
  }, [])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages.length])

  // Play a success chime whenever the AI just finished streaming a reply
  // (status transitions away from "streaming"/"submitted" → "ready").
  // We track previous status with a ref to fire only on the falling edge.
  const prevStatusRef = React.useRef(status)
  React.useEffect(() => {
    const wasBusy =
      prevStatusRef.current === "streaming" ||
      prevStatusRef.current === "submitted"
    const isIdle = status === "ready"
    if (wasBusy && isIdle && messages.length > 1) {
      try {
        playSuccess()
      } catch {
        /* SFX is best-effort. */
      }
    }
    prevStatusRef.current = status
  }, [status, messages.length])

  const stopListening = React.useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* no-op */
    }
    setListening(false)
    // Audible release cue.
    try {
      playMicStop()
    } catch {
      /* SFX is best-effort; never break UX. */
    }
  }, [])

  function startListening() {
    const Ctor = getSpeechRecognitionConstructor()
    if (!Ctor) return
    // Synth bloop — plays through speakers immediately on user gesture.
    try {
      playMicStart()
    } catch {
      /* SFX is best-effort. */
    }
    const rec = new Ctor()
    rec.lang = "he-IL"
    rec.continuous = true
    rec.interimResults = true
    speechFinalsRef.current = input
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        const t = r[0]?.transcript ?? ""
        if (r.isFinal) {
          speechFinalsRef.current = (
            (speechFinalsRef.current ? speechFinalsRef.current + " " : "") + t
          ).trim()
        } else {
          interim += t
        }
      }
      setInput(
        (speechFinalsRef.current + (interim ? " " + interim : "")).trim(),
      )
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  // Object-URL previews for image attachments. We rebuild the full list on
  // every change so URLs stay 1:1 with `attachments` and revoke cleanly on
  // unmount / remove. PDFs render with a generic icon (no URL needed).
  const previewUrls = React.useMemo(
    () =>
      attachments.map((f) =>
        f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
      ),
    [attachments],
  )
  React.useEffect(() => {
    return () => {
      previewUrls.forEach((u) => {
        if (u) URL.revokeObjectURL(u)
      })
    }
  }, [previewUrls])

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list || list.length === 0) return
    const next: File[] = []
    let rejectedSize = false
    let rejectedType = false
    for (const f of Array.from(list)) {
      const mime = (f.type || "").toLowerCase()
      const allowed =
        mime.startsWith("image/") || mime === "application/pdf"
      if (!allowed) {
        rejectedType = true
        continue
      }
      if (f.size > MAX_BYTES) {
        rejectedSize = true
        continue
      }
      next.push(f)
    }
    if (next.length > 0) setAttachments((prev) => [...prev, ...next])
    if (rejectedType) {
      // Lightweight inline notice via console; toast plumbing is intentionally
      // avoided in the drawer to keep the dependency surface minimal.
      console.warn("[copilot:attach] rejected unsupported file type(s)")
    }
    if (rejectedSize) {
      console.warn("[copilot:attach] rejected oversized file(s) (>10MB)")
    }
    e.target.value = ""
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx))
  }

  /** Convert an array of File into a FileList via DataTransfer (browser-only). */
  function filesToFileList(files: File[]): FileList {
    const dt = new DataTransfer()
    for (const f of files) dt.items.add(f)
    return dt.files
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if ((!text && attachments.length === 0) || busy) return
    if (listening) stopListening()

    // Inject hidden project context — system prompt sees project mention
    // even when the user typed only the request.
    const baseText = text || "נא לנתח את הקובץ המצורף."
    const wrapped =
      `[PROJECT_CONTEXT: id="${projectId}" name="${projectName}"]\n` + baseText

    const files =
      attachments.length > 0 ? filesToFileList(attachments) : undefined

    void sendMessage({ text: wrapped, files })
    setInput("")
    setAttachments([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto bg-muted/30 p-4"
      >
        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} />
        ))}
        {busy ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-emerald-500" />
            <span>הסוכן חושב…</span>
          </div>
        ) : null}
      </div>

      {/* composer */}
      <form
        onSubmit={handleSubmit}
        className="border-t bg-card p-3"
      >
        {listening ? (
          <div className="mb-2 flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
            <LiveAudioWaveform />
            <span className="text-xs font-medium text-rose-700">
              מקליט · דבר חופשי בעברית
            </span>
            <button
              type="button"
              onClick={stopListening}
              className="ms-auto rounded-md p-1 text-rose-700 hover:bg-rose-100"
              aria-label="עצור הקלטה"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        {/* Attachment thumbnails */}
        {attachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((f, idx) => {
              const url = previewUrls[idx]
              const isPdf = f.type === "application/pdf"
              return (
                <div
                  key={`${f.name}-${idx}`}
                  className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-border bg-card"
                  title={f.name}
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={f.name}
                      className="h-full w-full object-cover"
                    />
                  ) : isPdf ? (
                    <FileText className="h-6 w-6 text-rose-600" aria-hidden />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    aria-label={`הסר ${f.name}`}
                    className="absolute end-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={handleFilePicked}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            aria-label="צירוף תוכנית / תמונה / PDF"
            title="צירוף PNG / JPG / WebP / PDF (עד 10MB לקובץ)"
            className="shrink-0"
          >
            <Paperclip className="size-4" />
          </Button>
          {speechSupported ? (
            <Button
              type="button"
              variant={listening ? "destructive" : "outline"}
              size="icon"
              onClick={listening ? stopListening : startListening}
              aria-label={listening ? "עצור הקלטה" : "הקלט הודעה"}
              className={cn(
                "shrink-0 transition-transform",
                listening && "scale-110 ring-4 ring-rose-300/60",
              )}
            >
              {listening ? (
                <MicOff className="size-4" />
              ) : (
                <Mic className="size-4" />
              )}
            </Button>
          ) : null}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="הזמן 100 מ' תעלת חשמל למפלס -1, או צרף תוכנית…"
            rows={2}
            className="min-h-[2.5rem] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as unknown as React.FormEvent)
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={(!input.trim() && attachments.length === 0) || busy}
            className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
            aria-label="שלח"
          >
            <Send className="size-4" />
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>פרויקט מקושר אוטומטית · תמיכה בתמונות ו-PDF</span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            סגור
          </button>
        </div>
      </form>
    </div>
  )
}

// ============================================================================
// Live audio waveform — pure CSS, 5 bars, staggered animation
// ============================================================================

const WAVE_BAR_DELAYS = ["0s", "0.12s", "0.24s", "0.36s", "0.48s"]

function LiveAudioWaveform() {
  return (
    <div
      className="flex h-6 items-center gap-1"
      role="img"
      aria-label="גלי סאונד חיים"
    >
      {WAVE_BAR_DELAYS.map((delay, i) => (
        <span
          key={i}
          className="block w-1 rounded-full bg-rose-500"
          style={{
            animation: "icc-wave 900ms ease-in-out infinite",
            animationDelay: delay,
            height: "100%",
          }}
        />
      ))}
      <style jsx>{`
        @keyframes icc-wave {
          0%,
          100% {
            transform: scaleY(0.35);
          }
          50% {
            transform: scaleY(1);
          }
        }
      `}</style>
    </div>
  )
}

// ============================================================================
// ChatBubble — minimal renderer for UIMessage parts
// ============================================================================

function ChatBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user"
  const text = (message.parts ?? [])
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("\n")
    // strip the hidden PROJECT_CONTEXT marker from the bubble
    .replace(/^\s*\[PROJECT_CONTEXT:[^\]]*\]\s*\n?/, "")
    .trim()
  if (!text) return null

  return (
    <div className={cn("flex", isUser ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          isUser
            ? "bg-emerald-600 text-white"
            : "border border-border bg-card text-foreground",
        )}
      >
        {text.split("\n").map((line, i) => (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}
