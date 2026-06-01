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
  ExternalLink,
  FilePlus2,
  Loader2,
  Sparkles,
} from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  createVariationDraft,
  triggerAiBookletGeneration,
} from "./actions"

// ─────────────────────────────────────────────────────────────────────────────
// Row contract (matches the page's Supabase SELECT)
// ─────────────────────────────────────────────────────────────────────────────

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
}: {
  projectId: string
  initialRows: VariationRow[]
}) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [generatingId, setGeneratingId] = React.useState<string | null>(null)

  const form = useForm<DraftFormValues>({
    resolver: zodResolver(draftSchema),
    defaultValues: {
      title: "",
      description: "",
      attachedPdfUrlsText: "",
    },
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
                const hasBooklet = !!row.pdf_url
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
                      <Badge className={cn("font-semibold", statusTone(row.status))}>
                        {statusLabel(row.status)}
                      </Badge>
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
