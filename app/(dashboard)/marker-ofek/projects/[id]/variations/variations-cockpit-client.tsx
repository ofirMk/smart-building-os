"use client"

/**
 * T13 — Variations Cockpit (client island).
 *
 * Responsibilities:
 *   1. Render data table of contract_variation_orders for the project.
 *   2. Open Sheet with RHF+Zod form for new draft (description critical for RAG).
 *   3. Action button per row:
 *      - status='draft'     → "הפק חוברת (AI)" — triggers ai-worker microservice.
 *      - status='submitted' → "צפה בחוברת" link to pdf_url.
 *   4. Non-blocking UX — sonner toast + per-row spinner state.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  CheckCircle2,
  ExternalLink,
  FilePlus2,
  Loader2,
  Lock,
  Sparkles,
} from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Badge } from "@/components/ui/badge"
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import {
  approveVariationPricing,
  createVariationDraft,
  triggerAiBookletGeneration,
} from "./actions"

// ─────────────────────────────────────────────────────────────────────────────
// Row contract (matches the page's Supabase SELECT)
// ─────────────────────────────────────────────────────────────────────────────

// T14 — אופציה ל-Select ה-"תמחר ואשר". נטען מ-page.tsx (RSC).
export type ContractOption = {
  id: string
  title: string
  status: string | null
}

export type VariationRow = {
  id: string
  vo_number: number
  title: string
  description: string | null
  status: string
  pdf_url: string | null
  ai_justification_text: string | null
  booklet_generated_at: string | null
  created_at: string
  // T14 — financial bridge fields
  approved_amount: number | string | null
  contract_id: string | null
  linked_partial_account_id: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod schema (v4 — uses `message`, not `invalid_type_error`)
// ─────────────────────────────────────────────────────────────────────────────

const draftSchema = z.object({
  title: z
    .string({ message: "שם החריג חובה" })
    .min(2, { message: "שם החריג קצר מדי" })
    .max(160, { message: "שם החריג ארוך מדי (160 תווים)" }),
  description: z
    .string({ message: "תיאור חובה" })
    .min(10, { message: "תיאור חייב להיות מפורט — לפחות 10 תווים" })
    .max(4000, { message: "תיאור ארוך מדי (עד 4000 תווים)" }),
  // לא optional — Zod v4 input/output mismatch מקשה על resolver typing.
  // ברירת-מחדל "" מועברת דרך useForm.defaultValues.
  attachedPdfUrlsText: z.string().max(2000, { message: "ארוך מדי" }),
})

type DraftFormValues = z.infer<typeof draftSchema>

// T14 — Approve & Pricing form (Zod v4 — `message` only).
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const approveSchema = z.object({
  // הסכום המאושר — מוליד (Hard Gate — מתאים לדרישה approvedAmount > 0).
  approvedAmount: z
    .number({ message: "סכום חובה" })
    .positive({ message: "הסכום חייב להיות חיובי" })
    .max(1e11, { message: "הסכום גבוה מדי" }),
  // חוזה משוייך (Hard Gate — סגירת הרפיית מ-T13: contract_id חובה באישור).
  contractId: z
    .string({ message: "חוזה חובה" })
    .regex(UUID_REGEX, { message: "חובה לבחור חוזה מהרשימה" }),
})
type ApproveFormValues = z.infer<typeof approveSchema>

const CURRENCY_FORMATTER = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

// ─────────────────────────────────────────────────────────────────────────────
// Status badge tone
// ─────────────────────────────────────────────────────────────────────────────

function statusTone(status: string): string {
  switch (status) {
    case "submitted":
      return "border-indigo-200 bg-indigo-50 text-indigo-900"
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-900"
    case "rejected":
      return "border-rose-200 bg-rose-50 text-rose-900"
    case "draft":
    default:
      return "border-slate-200 bg-slate-100 text-slate-700"
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "טיוטה"
    case "submitted":
      return "הוגש"
    case "approved":
      return "אושר"
    case "rejected":
      return "נדחה"
    default:
      return status
  }
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function VariationsCockpitClient({
  projectId,
  initialRows,
  contracts,
}: {
  projectId: string
  initialRows: VariationRow[]
  contracts: ContractOption[]
}) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [generatingId, setGeneratingId] = React.useState<string | null>(null)
  // T14 — PM approval state
  const [approveTarget, setApproveTarget] =
    React.useState<VariationRow | null>(null)

  const form = useForm<DraftFormValues>({
    resolver: zodResolver(draftSchema),
    defaultValues: {
      title: "",
      description: "",
      attachedPdfUrlsText: "",
    },
  })

  // T14 — Approve form. נפתח חדש פר חריג; defaultValues מתאפסים בכל פתיחה.
  const approveForm = useForm<ApproveFormValues>({
    resolver: zodResolver(approveSchema),
    defaultValues: { approvedAmount: 0, contractId: "" },
  })

  const onApproveSubmit = approveForm.handleSubmit(async (values) => {
    if (!approveTarget) return
    const t = toast.loading(`מאשר חריג #${approveTarget.vo_number}...`)
    try {
      const res = await approveVariationPricing({
        variationId: approveTarget.id,
        approvedAmount: values.approvedAmount,
        contractId: values.contractId,
      })
      if (!res.ok) {
        toast.error(res.error, { id: t, duration: 7000 })
        return
      }
      toast.success(
        `חריג #${res.data.voNumber} אושר — ${CURRENCY_FORMATTER.format(res.data.approvedAmount)} (Holden Books יוכל למשוך)`,
        { id: t, duration: 5000 },
      )
      approveForm.reset()
      setApproveTarget(null)
      router.refresh()
    } catch (exc) {
      const msg = exc instanceof Error ? exc.message : String(exc)
      toast.error(`כשל באישור: ${msg}`, { id: t, duration: 7000 })
    }
  })

  const onCreateSubmit = form.handleSubmit(async (values) => {
    const t = toast.loading("יוצר טיוטת חריג...")
    try {
      const res = await createVariationDraft({
        projectId,
        title: values.title,
        description: values.description,
      })
      if (!res.ok) {
        toast.error(res.error, { id: t })
        return
      }
      toast.success(`חריג #${res.data.voNumber} נוצר כטיוטה`, { id: t })
      form.reset()
      setSheetOpen(false)
      router.refresh()
    } catch (exc) {
      const msg = exc instanceof Error ? exc.message : String(exc)
      toast.error(`שגיאה: ${msg}`, { id: t })
    }
  })

  const handleGenerate = React.useCallback(
    async (row: VariationRow) => {
      if (generatingId) return // מניעת לחיצות כפולות גלובלית
      setGeneratingId(row.id)
      const t = toast.loading(
        `מפיק חוברת AI לחריג #${row.vo_number} — RAG + LLM + PDF merge (15-30s)`,
      )
      try {
        // Mock לינקים — בשלב זה נקרא מתוך description אם יש URLs,
        // אחרת מערך ריק. בעתיד יוחלף ב-UploadZone של DMS.
        const urls = extractUrls(row.description ?? "")
        const res = await triggerAiBookletGeneration({
          variationId: row.id,
          attachedPdfUrls: urls,
        })
        if (!res.ok) {
          toast.error(res.error, { id: t, duration: 8000 })
          return
        }
        toast.success(
          `חוברת הופקה (${res.data.pagesMerged} עמודים, ` +
            `${res.data.ragMatchesCount} סעיפים מ-RAG, ${res.data.elapsedSeconds.toFixed(1)}s)`,
          { id: t, duration: 6000 },
        )
        router.refresh()
      } catch (exc) {
        const msg = exc instanceof Error ? exc.message : String(exc)
        toast.error(`כשל בהפקת חוברת: ${msg}`, { id: t, duration: 8000 })
      } finally {
        setGeneratingId(null)
      }
    },
    [generatingId, router],
  )

  return (
    <section className="space-y-3" data-layout-region="variations-cockpit">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-600">
          סה&quot;כ {initialRows.length} חריגים בפרויקט
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-2"
          onClick={() => setSheetOpen(true)}
        >
          <FilePlus2 className="size-4" aria-hidden />
          דווח חריג מהשטח
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <Table dir="rtl">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-right">#</TableHead>
              <TableHead className="text-right">כותרת</TableHead>
              <TableHead className="text-right">תיאור</TableHead>
              <TableHead className="w-28 text-right">סטטוס</TableHead>
              <TableHead className="w-28 text-right">תאריך</TableHead>
              <TableHead className="w-64 text-right">פעולות</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-slate-500"
                >
                  אין חריגים בפרויקט. לחצו על &quot;דווח חריג מהשטח&quot;
                  כדי להתחיל.
                </TableCell>
              </TableRow>
            ) : (
              initialRows.map((row) => {
                const isGenerating = generatingId === row.id
                const isDraft = row.status === "draft"
                const isSubmitted = row.status === "submitted"
                const isApproved = row.status === "approved"
                const isLocked = !!row.linked_partial_account_id
                const hasBooklet = !!row.pdf_url
                const approvedAmount =
                  row.approved_amount != null
                    ? Number(row.approved_amount)
                    : null
                return (
                  <TableRow key={row.id} className="align-top">
                    <TableCell className="font-mono text-sm text-slate-700">
                      {row.vo_number}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {row.title || "—"}
                    </TableCell>
                    <TableCell className="max-w-[420px] text-sm text-slate-600">
                      <span className="line-clamp-2 whitespace-pre-wrap">
                        {row.description ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge className={cn("font-semibold", statusTone(row.status))}>
                          {statusLabel(row.status)}
                        </Badge>
                        {approvedAmount != null ? (
                          <span className="font-mono text-[10px] tabular-nums text-emerald-700">
                            {CURRENCY_FORMATTER.format(approvedAmount)}
                          </span>
                        ) : null}
                        {isLocked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <Lock className="size-2.5" aria-hidden />
                            נעול לחשבון חלקי
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {dateFormatter.format(new Date(row.created_at))}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        {isDraft ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={isGenerating || !!generatingId}
                            onClick={() => handleGenerate(row)}
                            className="gap-1.5 bg-gradient-to-l from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700"
                          >
                            {isGenerating ? (
                              <>
                                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                מפיק...
                              </>
                            ) : (
                              <>
                                <Sparkles className="size-3.5" aria-hidden />
                                הפק חוברת (AI)
                              </>
                            )}
                          </Button>
                        ) : null}
                        {hasBooklet && row.pdf_url ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            render={
                              <a
                                href={row.pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              />
                            }
                          >
                            <ExternalLink className="size-3.5" aria-hidden />
                            צפה בחוברת
                          </Button>
                        ) : null}
                        {/* T14 — PM Approval. רק אחרי שיש חוברת AI (submitted). */}
                        {isSubmitted ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() => {
                              approveForm.reset({
                                approvedAmount: 0,
                                contractId: row.contract_id ?? "",
                              })
                              setApproveTarget(row)
                            }}
                          >
                            <CheckCircle2 className="size-3.5" aria-hidden />
                            תמחר ואשר
                          </Button>
                        ) : null}
                        {isApproved && !isLocked ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
                            <CheckCircle2 className="size-3" aria-hidden />
                            ממתין למשיכה לחשבון חלקי
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ─── Sheet — Draft Form ─────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="w-[min(40rem,100vw)] sm:max-w-xl" dir="rtl">
          <SheetHeader>
            <SheetTitle>דיווח חריג חדש מהשטח</SheetTitle>
            <SheetDescription>
              התיאור הוא ה-input ל-RAG ול-LLM — ככל שיהיה מפורט יותר,
              ההצדקה הקבלנית שתופק תהיה חזקה יותר.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={onCreateSubmit} className="mt-4 space-y-4 px-4 pb-4">
            <div className="space-y-1.5">
              <Label htmlFor="t13-title" className="text-sm font-semibold">
                כותרת החריג <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="t13-title"
                placeholder='לדוגמה: "תוספת קונסטרוקציה ביציקה 3 — מבנה A"'
                {...form.register("title")}
              />
              {form.formState.errors.title?.message ? (
                <p className="text-xs text-rose-600">
                  {form.formState.errors.title.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="t13-description" className="text-sm font-semibold">
                תיאור מפורט <span className="text-rose-600">*</span>
              </Label>
              <Textarea
                id="t13-description"
                rows={8}
                placeholder="תארו במדויק: מה בוצע, מדוע נדרש (אילוץ הנדסי/דרישת מזמין/תקלה), היקף, ותאריך הביצוע. ככל שתפרטו — ההצדקה המשפטית תהיה מדויקת יותר."
                {...form.register("description")}
              />
              {form.formState.errors.description?.message ? (
                <p className="text-xs text-rose-600">
                  {form.formState.errors.description.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="t13-pdfs" className="text-sm font-semibold">
                לינקים לתוכניות שטח (PDF) — אופציונלי
              </Label>
              <Input
                id="t13-pdfs"
                placeholder="https://..., https://..."
                {...form.register("attachedPdfUrlsText")}
              />
              <p className="text-[11px] text-slate-500">
                לינקים מופרדים בפסיק. בשלב הבא: UploadZone דרך ה-DMS.
                כרגע ה-URLs האלה נשמרים בתוך התיאור ויוקלטו ע&quot;י מנוע
                החילוץ של ה-trigger.
              </p>
            </div>

            <SheetFooter className="flex-row justify-end gap-2 px-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
                disabled={form.formState.isSubmitting}
              >
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="gap-2"
              >
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    יוצר...
                  </>
                ) : (
                  "צור טיוטה"
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* ─── T14 — Approve & Pricing Sheet ─────────────────── */}
      <Sheet
        open={!!approveTarget}
        onOpenChange={(open) => {
          if (!open) {
            setApproveTarget(null)
            approveForm.reset()
          }
        }}
      >
        <SheetContent
          side="left"
          className="w-[min(34rem,100vw)] sm:max-w-lg"
          dir="rtl"
        >
          <SheetHeader>
            <SheetTitle>
              אישור ותמחור — חריג #{approveTarget?.vo_number ?? "—"}
            </SheetTitle>
            <SheetDescription>
              הסכום והחוזה ייכנסו לדוחות הפיננסיים מיד אחרי האישור.
              לאחר נעילה לחשבון חלקי — לא ניתן יותר לערוך (חוק zero
              double-billing).
            </SheetDescription>
          </SheetHeader>

          {approveTarget ? (
            <form onSubmit={onApproveSubmit} className="mt-4 space-y-4 px-4 pb-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="font-semibold text-slate-800">
                  {approveTarget.title}
                </div>
                <div className="mt-1 line-clamp-3 text-slate-600">
                  {approveTarget.description ?? "—"}
                </div>
                {approveTarget.pdf_url ? (
                  <a
                    href={approveTarget.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-indigo-700 hover:underline"
                  >
                    <ExternalLink className="size-3" aria-hidden />
                    פתח חוברת AI ברקע
                  </a>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="t14-amount" className="text-sm font-semibold">
                  סכום מאושר (₪) <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="t14-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0.01}
                  placeholder="לדוגמה: 38500"
                  {...approveForm.register("approvedAmount", {
                    valueAsNumber: true,
                  })}
                />
                {approveForm.formState.errors.approvedAmount?.message ? (
                  <p className="text-xs text-rose-600">
                    {approveForm.formState.errors.approvedAmount.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="t14-contract" className="text-sm font-semibold">
                  חוזה משוייך <span className="text-rose-600">*</span>
                </Label>
                {contracts.length === 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                    אין חוזים פעילים בפרויקט. צרו חוזה תחילה במסך{" "}
                    <a
                      href={`/marker-ofek/projects/${projectId}/contracts`}
                      className="font-semibold text-amber-950 underline hover:text-amber-700"
                    >
                      חוזים
                    </a>
                    , ולאחר מכן חזרו לאשר את החריג.
                  </div>
                ) : (
                  <Controller
                    control={approveForm.control}
                    name="contractId"
                    render={({ field }) => (
                      <Select
                        value={field.value || undefined}
                        onValueChange={(v) => field.onChange(v ?? "")}
                      >
                        <SelectTrigger
                          id="t14-contract"
                          className="w-full"
                          aria-label="בחירת חוזה לאישור החריג"
                        >
                          <SelectValue placeholder="בחרו חוזה מהרשימה" />
                        </SelectTrigger>
                        <SelectContent>
                          {contracts.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              <div className="flex flex-col items-start text-right">
                                <span className="font-medium">{c.title}</span>
                                {c.status ? (
                                  <span className="text-[10px] text-slate-500">
                                    {c.status}
                                  </span>
                                ) : null}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )}
                {approveForm.formState.errors.contractId?.message ? (
                  <p className="text-xs text-rose-600">
                    {approveForm.formState.errors.contractId.message}
                  </p>
                ) : null}
              </div>

              <SheetFooter className="flex-row justify-end gap-2 px-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setApproveTarget(null)}
                  disabled={approveForm.formState.isSubmitting}
                >
                  ביטול
                </Button>
                <Button
                  type="submit"
                  disabled={
                    approveForm.formState.isSubmitting || contracts.length === 0
                  }
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  title={
                    contracts.length === 0
                      ? "אין חוזים פעילים — צרו חוזה תחילה"
                      : undefined
                  }
                >
                  {approveForm.formState.isSubmitting ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      מאשר...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-3.5" aria-hidden />
                      אשר ותמחר
                    </>
                  )}
                </Button>
              </SheetFooter>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * חולץ URLs מתוך טקסט חופשי. משמש את handleGenerate כדי לקבל את
 * `attached_pdf_urls` עד שתחובר UploadZone אמיתית.
 */
function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s,;<>"']+/gi)
  return matches ? Array.from(new Set(matches)) : []
}
