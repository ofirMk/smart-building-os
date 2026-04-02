"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowRight,
  Check,
  CirclePlus,
  FileDown,
  FileScan,
  Loader2,
  Receipt,
  Scale,
} from "lucide-react"
import { toast } from "sonner"

import {
  processInvoiceAI,
  type InvoiceAiParsed,
  type InvoiceAiSourceFile,
} from "../actions/invoice-ai-actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AiProgressBar } from "@/components/shared/ai-progress-bar"
import { SupplierNameLink } from "@/components/marker-ofek/supplier-name-link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAiScanner } from "@/hooks/use-ai-scanner"
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
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"

type PoOption = {
  id: string
  po_number: string
  order_date: string
  total_amount: number
  project_id: string | null
  entities: { name: string } | { name: string }[] | null
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const OPEN_PO = ["approved", "sent", "partial_receipt"] as const

const INVOICE_AI_SCAN_STORAGE_KEY =
  "marker-ofek:procurement:invoice-ai:lastScan"
const AI_SCAN_COMMUNICATION_ERROR =
  "שגיאת תקשורת עם מנוע ה-AI. אנא בדוק את יתרת החשבון או הגדרות המודל."

function readInvoiceAiScanFromSession(): {
  parsed: InvoiceAiParsed
  invoiceId: string | null
  sourceFile: InvoiceAiSourceFile | null
} | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(INVOICE_AI_SCAN_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as {
      parsed: InvoiceAiParsed
      invoiceId: string | null
      sourceFile?: InvoiceAiSourceFile | null
    }
    if (!data?.parsed || typeof data.parsed !== "object") return null
    return {
      parsed: data.parsed,
      invoiceId: data.invoiceId,
      sourceFile: data.sourceFile ?? null,
    }
  } catch {
    return null
  }
}

function writeInvoiceAiScanToSession(
  parsed: InvoiceAiParsed,
  invoiceId: string | null,
  sourceFile: InvoiceAiSourceFile | null
) {
  try {
    sessionStorage.setItem(
      INVOICE_AI_SCAN_STORAGE_KEY,
      JSON.stringify({ parsed, invoiceId, sourceFile })
    )
  } catch {
    /* quota / private mode */
  }
}

function clearInvoiceAiScanSession() {
  try {
    sessionStorage.removeItem(INVOICE_AI_SCAN_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(round2(a) - round2(b)) < 0.015
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function projectSequentialTag(internalProjectCode: string): string {
  const m = internalProjectCode.match(/(\d+)\s*$/)
  if (!m) return `#${internalProjectCode}`
  return `#${Number(m[1])}`
}

export default function NewInvoiceAiPage() {
  const isDevelopment = process.env.NODE_ENV === "development"
  const [pos, setPos] = React.useState<PoOption[]>([])
  const [projects, setProjects] = React.useState<
    Array<{ id: string; name: string; internal_project_code: string }>
  >([])
  const [loadingPos, setLoadingPos] = React.useState(true)
  const [poId, setPoId] = React.useState("")
  const [skipMatching, setSkipMatching] = React.useState(true)
  const [projectId, setProjectId] = React.useState("")

  const [invoiceFile, setInvoiceFile] = React.useState<File | null>(null)
  const [fileInputKey, setFileInputKey] = React.useState(0)
  const {
    isScanning,
    scanProgress,
    scanStatus,
    startScanSimulation,
    completeScan,
    resetScan,
    abortScan,
    getScanEpoch,
  } = useAiScanner()
  const [parsed, setParsed] = React.useState<InvoiceAiParsed | null>(null)
  const [invoiceId, setInvoiceId] = React.useState<string | null>(null)
  const [sourceFile, setSourceFile] =
    React.useState<InvoiceAiSourceFile | null>(null)
  const [syncSummary, setSyncSummary] = React.useState<{
    updatedItems: number
    newItemsAdded: number
    updatedSkus: number
    priceIncreases: Array<{
      lineIndex: number
      description: string
      previousPrice: number
      newPrice: number
      increasePct: number
    }>
  } | null>(null)
  const [awaitingConfirmation, setAwaitingConfirmation] = React.useState(false)
  const [openingSource, setOpeningSource] = React.useState(false)
  const [scanError, setScanError] = React.useState<string | null>(null)
  const [quickProjectOpen, setQuickProjectOpen] = React.useState(false)
  const [quickProjectName, setQuickProjectName] = React.useState("")
  const [creatingProject, setCreatingProject] = React.useState(false)
  const [debugGeminiKeyStatus, setDebugGeminiKeyStatus] = React.useState<
    "Exists" | "Missing"
  >("Missing")
  const projectSelectTriggerRef = React.useRef<HTMLButtonElement | null>(null)

  React.useLayoutEffect(() => {
    const stored = readInvoiceAiScanFromSession()
    if (!stored) return
    setParsed(stored.parsed)
    setInvoiceId(stored.invoiceId)
    setSourceFile(stored.sourceFile)
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingPos(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .schema("public")
          .from("purchase_orders")
          .select(
            `
            id,
            po_number,
            order_date,
            total_amount,
            project_id,
            entities ( name )
          `
          )
          .eq("is_deleted", false)
          .in("status", [...OPEN_PO])
          .order("created_at", { ascending: false })
          .limit(100)
        if (error) throw error
        if (!cancelled) setPos((data as PoOption[]) ?? [])
        const projectsRes = await supabase
          .schema("public")
          .from("projects")
          .select("id, name, internal_project_code")
          .eq("is_deleted", false)
          .order("name", { ascending: true })
        if (!cancelled && !projectsRes.error) {
          setProjects(
            (projectsRes.data as Array<{
              id: string
              name: string
              internal_project_code: string
            }>) ?? []
          )
        }
      } catch (e) {
        if (!cancelled) toast.error(formatError(e))
      } finally {
        if (!cancelled) setLoadingPos(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!isDevelopment) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/check-gemini", { cache: "no-store" })
        if (!cancelled) {
          setDebugGeminiKeyStatus(res.status === 503 ? "Missing" : "Exists")
        }
      } catch {
        if (!cancelled) setDebugGeminiKeyStatus("Missing")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isDevelopment])

  React.useEffect(() => {
    function onPageKeyDown(event: KeyboardEvent) {
      if (event.key === "F1") {
        const active = document.activeElement as HTMLElement | null
        const isProjectSelectFocused =
          active?.id === "inv-project" ||
          projectSelectTriggerRef.current?.contains(active ?? null)
        if (isProjectSelectFocused && skipMatching) {
          event.preventDefault()
          setQuickProjectOpen(true)
        }
        return
      }

      if (event.key === "Escape" && quickProjectOpen) {
        event.preventDefault()
        setQuickProjectOpen(false)
        requestAnimationFrame(() => {
          projectSelectTriggerRef.current?.focus()
        })
        return
      }

      if (
        quickProjectOpen &&
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter"
      ) {
        event.preventDefault()
        void createQuickProject()
      }
    }

    window.addEventListener("keydown", onPageKeyDown)
    return () => window.removeEventListener("keydown", onPageKeyDown)
  }, [quickProjectOpen, skipMatching, quickProjectName, creatingProject])

  const selectedPo = React.useMemo(
    () => pos.find((p) => p.id === poId) ?? null,
    [pos, poId]
  )
  const poTotal = selectedPo ? Number(selectedPo.total_amount) || 0 : null

  async function handleScan() {
    if (!invoiceFile) {
      toast.error("נא לבחור קובץ חשבונית")
      return
    }

    startScanSimulation("invoice")
    const epochAtStart = getScanEpoch()

    /** מאפשר ל-React לצייר isScanning לפני round-trip ארוך לשרת */
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })

    clearInvoiceAiScanSession()
    setScanError(null)
    setParsed(null)
    setInvoiceId(null)
    setSourceFile(null)
    setSyncSummary(null)
    setAwaitingConfirmation(false)

    try {
      const fd = new FormData()
      fd.set("file", invoiceFile)
      const res = await processInvoiceAI(
        fd,
        skipMatching ? undefined : poId.trim() ? poId.trim() : undefined,
        {
          previewOnly: true,
          projectId: skipMatching ? projectId : selectedPo?.project_id ?? null,
        }
      )

      if (getScanEpoch() !== epochAtStart) {
        return
      }

      if (!res.success) {
        resetScan()
        const err = res.error || AI_SCAN_COMMUNICATION_ERROR
        setScanError(err)
        toast.error(err)
        return
      }

      completeScan()

      if (getScanEpoch() !== epochAtStart) {
        resetScan()
        return
      }

      writeInvoiceAiScanToSession(
        res.parsed,
        res.invoiceId,
        res.sourceFile
      )
      setParsed(res.parsed)
      setInvoiceId(res.invoiceId)
      setSourceFile(res.sourceFile)
      setSyncSummary(res.syncSummary)
      setAwaitingConfirmation(res.requiresConfirmation)
      setScanError(null)
      toast.success("הבדיקה הושלמה. יש לאשר שמירה למסד הנתונים.")
    } catch (e) {
      if (getScanEpoch() !== epochAtStart) {
        return
      }
      abortScan()
      const err = formatError(e)
      setScanError(err)
      toast.error(err)
    } finally {
      if (getScanEpoch() === epochAtStart) {
        resetScan()
      }
    }
  }

  async function handleConfirmSave() {
    if (!invoiceFile) {
      toast.error("יש לבחור קובץ מחדש לפני שמירה")
      return
    }
    startScanSimulation("invoice")
    const epochAtStart = getScanEpoch()
    setScanError(null)
    try {
      const fd = new FormData()
      fd.set("file", invoiceFile)
      const res = await processInvoiceAI(
        fd,
        skipMatching ? undefined : poId.trim() ? poId.trim() : undefined,
        {
          previewOnly: false,
          projectId: skipMatching ? projectId : selectedPo?.project_id ?? null,
        }
      )
      if (getScanEpoch() !== epochAtStart) return
      if (!res.success) {
        const err = "שגיאת AI: " + (res.error || "בדוק חיבור שרת")
        setScanError(err)
        toast.error(err)
        return
      }
      writeInvoiceAiScanToSession(res.parsed, res.invoiceId, res.sourceFile)
      setParsed(res.parsed)
      setInvoiceId(res.invoiceId)
      setSourceFile(res.sourceFile)
      setSyncSummary(res.syncSummary)
      setAwaitingConfirmation(false)
      setScanError(null)
      setInvoiceFile(null)
      setFileInputKey((k) => k + 1)
      const newItemsAdded = res.syncSummary?.newItemsAdded ?? 0
      const supplierAction = res.syncSummary?.supplierActionLabel ?? "עודכן"
      toast.success(
        `הצלחה! ספק ${supplierAction}, ${newItemsAdded} מק"טים חדשים נוצרו, והחשבונית נשמרה במערכת.`
      )
    } catch (e) {
      const err = formatError(e)
      setScanError(err)
      toast.error(err)
    } finally {
      if (getScanEpoch() === epochAtStart) resetScan()
    }
  }

  const invoiceTotal =
    parsed?.total_amount != null && Number.isFinite(parsed.total_amount)
      ? round2(parsed.total_amount)
      : parsed?.items?.length
        ? round2(
            parsed.items.reduce((s, it) => s + (it.total_price ?? 0), 0)
          )
        : null

  const showThreeWay =
    Boolean(poId && selectedPo && parsed && invoiceTotal != null)
  const matched =
    showThreeWay &&
    poTotal != null &&
    invoiceTotal != null &&
    amountsMatch(invoiceTotal, poTotal)

  async function openSourceDocument() {
    if (!sourceFile) return
    setOpeningSource(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase.storage
        .from(sourceFile.bucket)
        .createSignedUrl(sourceFile.path, 3600)
      if (error || !data?.signedUrl) {
        toast.error(error?.message ?? "לא ניתן לפתוח את הקובץ")
        return
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer")
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setOpeningSource(false)
    }
  }

  async function createQuickProject() {
    const name = quickProjectName.trim()
    if (!name) {
      toast.error("יש להזין שם פרויקט")
      return
    }
    if (creatingProject) return
    setCreatingProject(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase
        .schema("public")
        .from("projects")
        .insert({
          name,
          client_name: null,
          tender_id: null,
          internal_project_code: "",
          address: null,
          status: "planning",
        })
        .select("id, name, internal_project_code")
        .single()
      if (error) throw error

      const created = data as {
        id: string
        name: string
        internal_project_code: string
      }
      setProjects((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "he"))
      )
      setProjectId(created.id)
      setSkipMatching(true)
      setQuickProjectName("")
      setQuickProjectOpen(false)
      toast.success(
        `הפרויקט נוצר ונבחר: ${projectSequentialTag(created.internal_project_code)} - ${created.name}`
      )
      requestAnimationFrame(() => {
        projectSelectTriggerRef.current?.focus()
      })
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setCreatingProject(false)
    }
  }

  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex w-full max-w-4xl flex-col gap-8 pb-12 pt-2"
    >
      <Link
        href="/marker-ofek/procurement"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לרכש
      </Link>

      <header className="space-y-2 text-start">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-800 dark:text-violet-300">
            <Receipt className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              מודול 2.3 · חשבוניות AI
            </p>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              קליטת חשבונית (סריקת AI)
            </h1>
          </div>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          העלאת PDF או תמונה — חילוץ שדות ב־Gemini 2.5 Flash ושמירה ב־
          <code className="rounded bg-muted px-1 text-xs">invoices</code>{" "}
          + upsert לטבלאות{" "}
          <code className="rounded bg-muted px-1 text-xs">items_catalog</code>{" "}
          ו־
          <code className="rounded bg-muted px-1 text-xs">supplier_items</code>
          .
        </p>
      </header>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="text-start">
          <CardTitle className="text-lg">קישור להזמנת רכש (אופציונלי)</CardTitle>
          <CardDescription>
            לשימוש בהשוואת סכומים (3-way) מול סכום ההזמנה
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="mb-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={skipMatching}
              onChange={(e) => {
                const next = e.target.checked
                setSkipMatching(next)
                if (next) setPoId("")
              }}
            />
            רכישה ישירה לפרויקט (דילוג על התאמה)
          </label>
          {skipMatching ? (
            <div className="mb-3 max-w-xl">
              <Label htmlFor="inv-project" className="mb-2 block">
                פרויקט לשיוך החשבונית
              </Label>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  לחץ F1 להקמה מהירה של פרויקט חדש
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setQuickProjectOpen(true)}
                >
                  <CirclePlus className="size-4" aria-hidden />
                  פרויקט מהיר
                </Button>
              </div>
              <Select
                value={projectId || ""}
                onValueChange={(v) => {
                  setProjectId(v ?? "")
                  clearInvoiceAiScanSession()
                  setParsed(null)
                  setInvoiceId(null)
                  setSourceFile(null)
                  setSyncSummary(null)
                  setAwaitingConfirmation(false)
                }}
              >
                <SelectTrigger
                  id="inv-project"
                  className="w-full"
                  ref={projectSelectTriggerRef}
                  onKeyDown={(e) => {
                    if (e.key !== "F1") return
                    e.preventDefault()
                    setQuickProjectOpen(true)
                  }}
                >
                  <SelectValue placeholder="בחרו פרויקט" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="inline-flex w-full items-center justify-between gap-2">
                        <span>{`${projectSequentialTag(p.internal_project_code)} - ${p.name}`}</span>
                        {projectId === p.id ? (
                          <Check className="size-4 text-emerald-500" aria-hidden />
                        ) : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <Label htmlFor="inv-po" className="sr-only">
            הזמנת רכש
          </Label>
          <Select
            value={poId || undefined}
            onValueChange={(v) => {
              setPoId(v ?? "")
              clearInvoiceAiScanSession()
              setParsed(null)
              setInvoiceId(null)
              setSourceFile(null)
              setSyncSummary(null)
              setAwaitingConfirmation(false)
            }}
            disabled={loadingPos || skipMatching}
          >
            <SelectTrigger id="inv-po" className="w-full max-w-xl">
              <SelectValue placeholder="ללא קישור להזמנה" />
            </SelectTrigger>
            <SelectContent>
              {pos.map((p) => {
                const ent = embedOne(p.entities)
                return (
                  <SelectItem key={p.id} value={p.id}>
                    {ent?.name ?? "ספק"} · {p.po_number} ·{" "}
                    {currencyFormatter.format(Number(p.total_amount) || 0)}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="text-start">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileScan className="size-5 text-muted-foreground" aria-hidden />
            העלאת חשבונית
          </CardTitle>
          <CardDescription>
            קובץ PDF או תמונה — נשמר ב-bucket tender_documents (נתיב invoice-ai/…)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {scanError ? (
            <Alert variant="warning">
              <AlertTitle>שגיאה בסריקת AI</AlertTitle>
              <AlertDescription>{scanError}</AlertDescription>
            </Alert>
          ) : null}
          <form
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
            }}
          >
            <div className="flex-1 space-y-2 text-start">
              <Label htmlFor="inv-file">קובץ</Label>
              <Input
                id="inv-file"
                key={fileInputKey}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                disabled={isScanning}
                onChange={(e) =>
                  setInvoiceFile(e.target.files?.[0] ?? null)
                }
              />
            </div>
            <Button
              type="button"
              className="gap-2 shrink-0"
              disabled={isScanning}
              onClick={(e) => {
                e.preventDefault()
                void handleScan()
              }}
            >
              {isScanning ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FileScan className="size-4" aria-hidden />
              )}
              סרוק חשבונית
            </Button>
          </form>
          {isDevelopment ? (
            <p className="text-xs text-muted-foreground">
              DEBUG: GEMINI_API_KEY: {debugGeminiKeyStatus}
            </p>
          ) : null}

          <div role="status" aria-live="polite" aria-busy={isScanning}>
            <AiProgressBar
              isScanning={isScanning}
              progress={scanProgress}
              status={scanStatus}
            />
          </div>
        </CardContent>
      </Card>

      {parsed ? (
        <>
          {syncSummary ? (
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="text-start">
                <CardTitle className="text-base">סיכום לפני שמירה</CardTitle>
                <CardDescription>
                  עודכנו {syncSummary.updatedItems} פריטים, נוספו {syncSummary.newItemsAdded} פריטים חדשים לקטלוג.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {syncSummary.priceIncreases.length > 0 ? (
                  <div className="rounded-md border border-red-400/50 bg-red-500/10 p-3">
                    <p className="font-medium text-red-700 dark:text-red-300">
                      זוהו עליות מחיר מעל 5%:
                    </p>
                    <ul className="mt-2 space-y-1 text-red-700 dark:text-red-300">
                      {syncSummary.priceIncreases.map((p) => (
                        <li key={`${p.lineIndex}-${p.description}`}>
                          {p.description}: {p.increasePct.toFixed(2)}%+
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-muted-foreground">לא זוהו עליות מחיר חריגות.</p>
                )}
                {awaitingConfirmation ? (
                  <Button type="button" className="gap-2" onClick={() => void handleConfirmSave()}>
                    אשר שמירה למסד הנתונים
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {showThreeWay ? (
            <Card
              className={
                matched
                  ? "border-emerald-500/50 bg-emerald-500/[0.07] shadow-sm"
                  : "border-destructive/45 bg-destructive/[0.06] shadow-sm"
              }
            >
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 text-start">
                <div className="flex items-center gap-2">
                  <Scale className="size-5 text-muted-foreground" aria-hidden />
                  <CardTitle className="text-base">השוואת 3-way (סכום)</CardTitle>
                </div>
                {matched ? (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    תואם
                  </Badge>
                ) : (
                  <Badge variant="destructive">אי-התאמה</Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-2 text-start text-sm">
                <p>
                  <span className="text-muted-foreground">סכום בחשבונית (מסריקה):</span>{" "}
                  <span className="font-semibold tabular-nums">
                    {invoiceTotal != null
                      ? currencyFormatter.format(invoiceTotal)
                      : "—"}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">סכום הזמנת רכש:</span>{" "}
                  <span className="font-semibold tabular-nums">
                    {poTotal != null
                      ? currencyFormatter.format(poTotal)
                      : "—"}
                  </span>
                </p>
                {!matched ? (
                  <Alert variant="warning" className="mt-2">
                    <AlertTitle>אי-התאמה</AlertTitle>
                    <AlertDescription>
                      ייתכן הבדל מע״מ, עיגולים או חשבונית חלקית. יש לוודא מול מסמכי
                      הרכש והקבלה.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Alert variant="info">
              <AlertTitle>ללא השוואת הזמנה</AlertTitle>
              <AlertDescription>
                לא נבחרה הזמנת רכש — דילוג על תצוגת 3-way. ניתן לבחור הזמנה ולסרוק
                שוב.
              </AlertDescription>
            </Alert>
          )}

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-col gap-3 text-start sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg">פרטים שחולצו</CardTitle>
                {invoiceId ? (
                  <CardDescription className="font-mono text-xs">
                    מזהה רשומה: {invoiceId}
                  </CardDescription>
                ) : null}
              </div>
              {sourceFile ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-2"
                  disabled={openingSource}
                  onClick={() => void openSourceDocument()}
                >
                  {openingSource ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <FileDown className="size-4" aria-hidden />
                  )}
                  מסמך מקורי (PDF / תמונה)
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-3 text-start text-sm sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">ספק</p>
                <SupplierNameLink supplierName={parsed.supplier_name ?? "—"} className="font-medium" />
              </div>
              <div>
                <p className="text-muted-foreground">מספר חשבונית</p>
                <p className="font-medium">{parsed.invoice_number ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">תאריך</p>
                <p className="font-medium">
                  {parsed.invoice_date
                    ? new Date(parsed.invoice_date).toLocaleDateString("he-IL")
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">סה״כ</p>
                <p className="font-semibold tabular-nums">
                  {parsed.total_amount != null
                    ? currencyFormatter.format(parsed.total_amount)
                    : invoiceTotal != null
                      ? currencyFormatter.format(invoiceTotal)
                      : "—"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="text-start">
              <CardTitle className="text-lg">שורות</CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-0">
              {parsed.items.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                  לא חולצו שורות (רק כותרת חשבונית)
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-start">תיאור</TableHead>
                        <TableHead className="text-start">כמות</TableHead>
                        <TableHead className="text-start">מחיר יחידה</TableHead>
                        <TableHead className="text-start">סה״כ שורה</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.items.map((it, i) => (
                        <TableRow key={i}>
                          <TableCell className="max-w-[240px] text-start text-sm">
                            {it.description}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {it.quantity}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            <span
                              className={
                                syncSummary?.priceIncreases.some((p) => p.lineIndex === i)
                                  ? "font-semibold text-red-600"
                                  : ""
                              }
                            >
                              {currencyFormatter.format(it.unit_price)}
                            </span>
                          </TableCell>
                          <TableCell className="tabular-nums font-medium">
                            {currencyFormatter.format(it.total_price)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      <Dialog open={quickProjectOpen} onOpenChange={setQuickProjectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>הקמה מהירה של פרויקט</DialogTitle>
            <DialogDescription>
              הזינו שם פרויקט. המספר הסידורי ייווצר אוטומטית במסד הנתונים.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quick-project-name">שם פרויקט</Label>
              <Input
                id="quick-project-name"
                value={quickProjectName}
                onChange={(e) => setQuickProjectName(e.target.value)}
                placeholder="לדוגמה: פרויקט הדגל"
                autoFocus
                disabled={creatingProject}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-project-seq">מספר סידורי</Label>
              <Input
                id="quick-project-seq"
                value="נוצר אוטומטית בעת שמירה"
                readOnly
                disabled
              />
            </div>
            <p className="text-xs text-muted-foreground">
              קיצורים: ESC לסגירה, Ctrl/Cmd+Enter לשמירה מהירה.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setQuickProjectOpen(false)
                requestAnimationFrame(() => {
                  projectSelectTriggerRef.current?.focus()
                })
              }}
              disabled={creatingProject}
            >
              ביטול
            </Button>
            <Button
              type="button"
              className="gap-2"
              onClick={() => void createQuickProject()}
              disabled={creatingProject}
            >
              {creatingProject ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              שמירה ובחירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
