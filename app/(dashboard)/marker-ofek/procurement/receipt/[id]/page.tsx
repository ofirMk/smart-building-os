"use client"

import imageCompression from "browser-image-compression"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import * as React from "react"
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Camera,
  Check,
  ClipboardCheck,
  Loader2,
  Package,
  Truck,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  MoContextCommentButton,
  useMoCommentPresence,
} from "@/components/marker-ofek/mo-context-comment"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type ProjectEmbed = { name: string; internal_project_code: string }
type EntityEmbed = { name: string }

type PoLineRow = {
  id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total_price: number
  created_at: string
}

type PoDetail = {
  id: string
  po_number: string
  status: string
  project_id: string
  supplier_id: string
  projects: ProjectEmbed | ProjectEmbed[] | null
  entities: EntityEmbed | EntityEmbed[] | null
  po_line_items: PoLineRow[] | PoLineRow[] | null
}

type GoodsReceiptNested = {
  id: string
  receipt_date?: string
  delivery_note_image_url?: string | null
  goods_receipt_items:
    | { po_line_item_id: string; quantity_received: number }
    | { po_line_item_id: string; quantity_received: number }[]
    | null
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function embedMany<T>(x: T | T[] | null | undefined): T[] {
  if (x == null) return []
  return Array.isArray(x) ? x : [x]
}

function parseQty(s: string): number {
  const n = parseFloat(String(s).replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

function roundQty(n: number): number {
  return Math.round(n * 10000) / 10000
}

function fileExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]{1,8}$/i.test(fromName)) return fromName
  if (file.type === "image/png") return "png"
  if (file.type === "image/webp") return "webp"
  if (file.type === "image/heic" || file.type === "image/heif") return "heic"
  return "jpg"
}

const qtyDisplay = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
})

const ALLOWED_PO_STATUS = new Set([
  "approved",
  "sent",
  "partial_receipt",
])

const DELIVERY_PHOTO_COMPRESSION = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
} as const

export default function GoodsReceiptPage() {
  const params = useParams()
  const router = useRouter()
  const poId = typeof params.id === "string" ? params.id : ""

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [po, setPo] = React.useState<PoDetail | null>(null)
  const [receivedByLine, setReceivedByLine] = React.useState<
    Record<string, number>
  >({})
  const [receivedQtyInput, setReceivedQtyInput] = React.useState<
    Record<string, string>
  >({})

  const [deliveryNoteNumber, setDeliveryNoteNumber] = React.useState("")
  const [receiptDate, setReceiptDate] = React.useState(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  })
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [shortageNotes, setShortageNotes] = React.useState("")
  const [deliveryPhoto, setDeliveryPhoto] = React.useState<File | null>(null)
  const [compressingPhoto, setCompressingPhoto] = React.useState(false)
  const [photoPreviewUrl, setPhotoPreviewUrl] = React.useState<string | null>(
    null
  )
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!deliveryPhoto) {
      setPhotoPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(deliveryPhoto)
    setPhotoPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [deliveryPhoto])

  React.useEffect(() => {
    if (!poId) {
      setLoading(false)
      setError("מזהה הזמנה חסר")
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()

        const { data: poRow, error: poErr } = await supabase
          .from("purchase_orders")
          .select(
            `
            id,
            po_number,
            status,
            project_id,
            supplier_id,
            projects ( name, internal_project_code ),
            entities ( name ),
            po_line_items (
              id,
              description,
              quantity,
              unit,
              unit_price,
              total_price,
              created_at
            ),
            goods_receipts (
              id,
              receipt_date,
              delivery_note_image_url,
              goods_receipt_items ( po_line_item_id, quantity_received )
            )
          `
          )
          .eq("id", poId)
          .eq("is_deleted", false)
          .maybeSingle()

        if (poErr) throw poErr
        if (!poRow) {
          if (!cancelled) {
            setPo(null)
            setError("הזמנת הרכש לא נמצאה")
          }
          return
        }

        const rawPo = poRow as PoDetail & {
          goods_receipts?: GoodsReceiptNested[] | GoodsReceiptNested | null
        }
        const { goods_receipts: grNested, ...poOnly } = rawPo
        const p = poOnly as PoDetail
        if (!ALLOWED_PO_STATUS.has(p.status)) {
          if (!cancelled) {
            setPo(null)
            setError("לא ניתן לקלוט סחורה להזמנה בסטטוס זה (טיוטה או סגורה).")
          }
          return
        }

        const priorByLine: Record<string, number> = {}
        const lines = embedMany(p.po_line_items).sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
        for (const li of lines) {
          priorByLine[li.id] = 0
        }

        for (const rec of embedMany(grNested)) {
          for (const row of embedMany(rec.goods_receipt_items)) {
            const lid = row.po_line_item_id
            const q = Number(row.quantity_received) || 0
            priorByLine[lid] = (priorByLine[lid] ?? 0) + q
          }
        }

        if (!cancelled) {
          setPo(p)
          setReceivedByLine(priorByLine)
          const inputs: Record<string, string> = {}
          for (const li of lines) {
            const ordered = Number(li.quantity) || 0
            const prior = priorByLine[li.id] ?? 0
            const remaining = Math.max(0, roundQty(ordered - prior))
            inputs[li.id] = remaining > 0 ? String(remaining) : "0"
          }
          setReceivedQtyInput(inputs)
        }
      } catch (e) {
        if (!cancelled) {
          setPo(null)
          setError(
            formatError(e) ||
              "שגיאה בטעינת הנתונים — ודאו שהרצתם את marker_ofek_goods_receipt_items.sql"
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [poId])

  async function handleConfirmReceipt() {
    if (!po || !poId) return
    if (compressingPhoto) {
      toast.error("המתינו לסיום דחיסת התמונה לפני האישור.")
      return
    }

    const lines = embedMany(po.po_line_items).sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    if (lines.length === 0) {
      toast.error("אין שורות בהזמנה")
      return
    }

    const rows: { po_line_item_id: string; qty: number; remaining: number }[] =
      []
    for (const li of lines) {
      const ordered = Number(li.quantity) || 0
      const prior = receivedByLine[li.id] ?? 0
      const remaining = Math.max(0, roundQty(ordered - prior))
      const entered = roundQty(parseQty(receivedQtyInput[li.id] ?? "0"))
      rows.push({ po_line_item_id: li.id, qty: entered, remaining })
    }

    if (!rows.some((r) => r.qty > 0)) {
      toast.error("יש להזין כמות שהתקבלה גדולה מ-0 בלפחות שורה אחת")
      return
    }

    for (const r of rows) {
      if (r.qty < 0) {
        toast.error("כמות לא יכולה להיות שלילית")
        return
      }
      if (r.qty > r.remaining + 1e-9) {
        toast.error(
          "כמות שהתקבלה חורגת מהיתרה לשורה — בדקו מול כמות בהזמנה וקבלות קודמות"
        )
        return
      }
    }

    const needsShortageNotes = rows.some(
      (r) => r.qty > 0 && r.qty + 1e-9 < r.remaining
    )
    if (needsShortageNotes && !shortageNotes.trim()) {
      toast.error(
        "במשלוח חלקי יש למלא הערות לחוסר (לפחות שורה אחת עם כמות נמוכה מהיתרה)."
      )
      return
    }

    setIsSubmitting(true)
    const supabase = createSupabaseBrowserClient()

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const receivedByLabel = user?.email ?? null

      const { data: receipt, error: recErr } = await supabase
        .from("goods_receipts")
        .insert({
          po_id: poId,
          receipt_date: receiptDate || new Date().toISOString().slice(0, 10),
          delivery_note_number: deliveryNoteNumber.trim() || null,
          received_by: receivedByLabel,
          shortage_notes: needsShortageNotes ? shortageNotes.trim() : null,
        })
        .select("id")
        .single()

      if (recErr) throw recErr
      if (!receipt?.id) throw new Error("לא נשמרה קבלת סחורה")

      const itemPayload = rows
        .filter((r) => r.qty > 0)
        .map((r) => ({
          goods_receipt_id: receipt.id,
          po_line_item_id: r.po_line_item_id,
          quantity_received: r.qty,
        }))

      const { error: itemsErr } = await supabase
        .from("goods_receipt_items")
        .insert(itemPayload)

      if (itemsErr) {
        await supabase.from("goods_receipts").delete().eq("id", receipt.id)
        throw itemsErr
      }

      if (deliveryPhoto) {
        const path = `${poId}/${receipt.id}/${Date.now()}.${fileExtension(deliveryPhoto)}`
        const { error: upErr } = await supabase.storage
          .from("delivery-notes")
          .upload(path, deliveryPhoto, {
            contentType: deliveryPhoto.type || "image/jpeg",
            upsert: false,
          })
        if (upErr) {
          console.error("[Marker Ofek] העלאת תמונת תעודה", upErr)
          toast.message("קבלה נשמרה ללא תמונה", {
            description: `העלאה ל-Storage נכשלה: ${upErr.message}. ודאו bucket delivery-notes והרצת marker_ofek_procurement_logistics_aging.sql`,
          })
        } else {
          const { data: pub } = supabase.storage
            .from("delivery-notes")
            .getPublicUrl(path)
          const { error: imgUpdErr } = await supabase
            .from("goods_receipts")
            .update({ delivery_note_image_url: pub.publicUrl })
            .eq("id", receipt.id)
          if (imgUpdErr) console.error(imgUpdErr)
        }
      }

      const { data: allReceipts } = await supabase
        .from("goods_receipts")
        .select("id")
        .eq("po_id", poId)

      const allIds = (allReceipts ?? []).map((x: { id: string }) => x.id)
      const { data: allItems } = await supabase
        .from("goods_receipt_items")
        .select("po_line_item_id, quantity_received")
        .in("goods_receipt_id", allIds)

      const cumulative: Record<string, number> = {}
      for (const li of lines) cumulative[li.id] = 0
      for (const row of allItems ?? []) {
        const lid = (row as { po_line_item_id: string }).po_line_item_id
        const q = Number((row as { quantity_received: number }).quantity_received) || 0
        cumulative[lid] = (cumulative[lid] ?? 0) + q
      }

      let allComplete = true
      for (const li of lines) {
        const ordered = Number(li.quantity) || 0
        const got = cumulative[li.id] ?? 0
        if (got + 1e-6 < ordered) {
          allComplete = false
          break
        }
      }

      const nextStatus = allComplete ? "closed" : "partial_receipt"
      const { error: updErr } = await supabase
        .from("purchase_orders")
        .update({ status: nextStatus })
        .eq("id", poId)
        .eq("is_deleted", false)

      if (updErr) throw updErr

      toast.success(
        allComplete
          ? "קבלת הסחורה נרשמה — ההזמנה נסגרה (כל הכמויות התקבלו)."
          : "קבלת הסחורה נרשמה — סטטוס ההזמנה: קבלה חלקית."
      )
      router.push("/marker-ofek/procurement")
      router.refresh()
    } catch (e) {
      console.error("[Marker Ofek] קבלת סחורה נכשלה", e)
      toast.error(`שמירה נכשלה: ${formatError(e)}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const poLineIdsForComments = React.useMemo(() => {
    if (!po) return []
    return embedMany(po.po_line_items).map((l) => l.id)
  }, [po])

  const { hasComment: poLineHasComment } = useMoCommentPresence(
    po?.project_id ?? null,
    "po_line",
    poLineIdsForComments
  )

  const receiptCommentProjectName = React.useMemo(() => {
    const p = po ? embedOne(po.projects) : null
    return p?.name ?? "פרויקט"
  }, [po])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <p className="text-sm">טוען הזמנה…</p>
      </div>
    )
  }

  if (error || !po) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <p className="text-destructive">{error ?? "לא ניתן לטעון"}</p>
        <Button variant="outline" render={<Link href="/marker-ofek/procurement" />}>
          חזרה לרכש
        </Button>
      </div>
    )
  }

  const project = embedOne(po.projects)
  const supplier = embedOne(po.entities)
  const lines = embedMany(po.po_line_items).sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const hasPartialShipment = lines.some((li) => {
    const ordered = Number(li.quantity) || 0
    const prior = receivedByLine[li.id] ?? 0
    const remaining = Math.max(0, roundQty(ordered - prior))
    const entered = roundQty(parseQty(receivedQtyInput[li.id] ?? "0"))
    return remaining > 0 && entered > 0 && entered + 1e-9 < remaining
  })

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-1 pb-12 sm:px-0">
      <Link
        href="/marker-ofek/procurement"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לרכש וספקים
      </Link>

      <header className="pharmacy-hero-card p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-400/90">
              קבלת סחורה
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[#1e293b] sm:text-3xl">
              הזמנה {po.po_number}
            </h1>
          </div>
          <div className="grid w-full gap-4 text-sm text-[#1e293b] sm:max-w-sm">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
              <div>
                <p className="text-xs text-slate-400">פרויקט</p>
                <p className="font-medium">{project?.name ?? "—"}</p>
                {project?.internal_project_code ? (
                  <p className="font-mono text-xs text-slate-400">
                    {project.internal_project_code}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Truck className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
              <div>
                <p className="text-xs text-slate-400">ספק</p>
                <p className="font-medium">{supplier?.name ?? "—"}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600">
              <ClipboardCheck className="size-5" aria-hidden />
            </div>
            <div>
              <CardTitle>פרטי קבלה</CardTitle>
              <CardDescription>
                מספר תעודת משלוח ותאריך קבלה בפועל.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 pt-6 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="delivery-note">מספר תעודת משלוח</Label>
            <Input
              id="delivery-note"
              value={deliveryNoteNumber}
              onChange={(e) => setDeliveryNoteNumber(e.target.value)}
              placeholder="למשל: TM-4521"
              dir="ltr"
              disabled={isSubmitting}
              className="font-mono"
            />
          </div>
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="receipt-date">תאריך קבלה</Label>
            <Input
              id="receipt-date"
              type="date"
              value={receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
              disabled={isSubmitting}
              className="max-w-full sm:max-w-xs"
            />
          </div>
          <div className="space-y-3 sm:col-span-2">
            <Label>צילום תעודת משלוח</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={isSubmitting || compressingPhoto}
              onChange={(e) => {
                const inputEl = e.target
                const f = inputEl.files?.[0] ?? null
                inputEl.value = ""
                if (!f) {
                  setDeliveryPhoto(null)
                  return
                }
                if (!f.type.startsWith("image/")) {
                  toast.error("נא לבחור קובץ תמונה בלבד.")
                  setDeliveryPhoto(null)
                  return
                }
                void (async () => {
                  setCompressingPhoto(true)
                  setDeliveryPhoto(null)
                  try {
                    const compressed = await imageCompression(
                      f,
                      DELIVERY_PHOTO_COMPRESSION
                    )
                    setDeliveryPhoto(compressed)
                  } catch (err) {
                    console.error("[delivery note] compression", err)
                    toast.error(
                      formatError(err) || "דחיסת התמונה נכשלה — נסו צילום אחר."
                    )
                    setDeliveryPhoto(null)
                  } finally {
                    setCompressingPhoto(false)
                  }
                })()
              }}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full gap-2 border-dashed sm:w-auto"
                disabled={isSubmitting || compressingPhoto}
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="size-4 shrink-0" aria-hidden />
                צילום / בחירת תמונה
              </Button>
              {compressingPhoto ? (
                <div
                  className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground sm:w-auto"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  דוחסים תמונה…
                </div>
              ) : null}
              {deliveryPhoto ? (
                <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-md">
                  <div className="relative overflow-hidden rounded-lg border border-border/60 bg-muted/20">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL חתימה מ-Supabase */}
                    <img
                      src={photoPreviewUrl ?? ""}
                      alt="תצוגה מקדימה של תעודת משלוח"
                      className="max-h-48 w-full object-contain object-center sm:max-h-56"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-fit gap-1 text-muted-foreground"
                    disabled={isSubmitting || compressingPhoto}
                    onClick={() => setDeliveryPhoto(null)}
                  >
                    <X className="size-3.5" aria-hidden />
                    הסרת תמונה
                  </Button>
                </div>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              התמונה נדחסת במכשיר (עד ~1MB, עד 1920px) לפני העלאה ל-bucket{" "}
              <code className="rounded bg-muted px-1">delivery-notes</code>
              .
            </p>
          </div>
        </CardContent>
      </Card>

      {hasPartialShipment ? (
        <Alert variant="warning" className="border-amber-500/50">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertTitle>משלוח חלקי</AlertTitle>
          <AlertDescription>
            יש לפחות שורה שבה הכמות המתקבלת נמוכה מהיתרה לקליטה. נא לתעד את סיבת
            החוסר בשדה &quot;הערות לחוסר&quot; לפני האישור — המידע יוצג בלוח הרכש.
          </AlertDescription>
        </Alert>
      ) : null}

      {hasPartialShipment ? (
        <Card className="border-amber-500/35 shadow-sm">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-base">הערות לחוסר (חובה)</CardTitle>
            <CardDescription>
              פירוט קצר: סיבת אי-השלמה, צפי להשלמה, אישור ספק וכו׳.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Textarea
              value={shortageNotes}
              onChange={(e) => setShortageNotes(e.target.value)}
              disabled={isSubmitting}
              placeholder="למשל: חוסר במלאי — צפי אספקה 05/04…"
              className="min-h-[100px] resize-y text-sm"
              required={hasPartialShipment}
              aria-required={hasPartialShipment}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60">
          <div className="flex items-center gap-2">
            <Package className="size-5 text-muted-foreground" aria-hidden />
            <CardTitle>שורות הזמנה — כמויות לקליטה</CardTitle>
          </div>
          <CardDescription>
            ברירת המחדל לכל שורה היא היתרה (הוזמן פחות מה שכבר התקבל).
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="hidden md:block">
            <div className="overflow-x-auto rounded-lg border border-border/50">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-11 px-0 text-center">
                      <span className="sr-only">הערות</span>
                    </TableHead>
                    <TableHead>תיאור</TableHead>
                    <TableHead className="text-end">כמות בהזמנה</TableHead>
                    <TableHead className="text-end">התקבל עד כה</TableHead>
                    <TableHead className="text-end">יתרה</TableHead>
                    <TableHead className="min-w-[8rem] text-end">
                      כמות שהתקבלה
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((li) => {
                    const ordered = Number(li.quantity) || 0
                    const prior = receivedByLine[li.id] ?? 0
                    const remaining = Math.max(0, roundQty(ordered - prior))
                    return (
                      <TableRow key={li.id}>
                        <TableCell className="w-11 p-1 align-top">
                          <MoContextCommentButton
                            projectId={po.project_id}
                            projectName={receiptCommentProjectName}
                            contextType="po_line"
                            contextId={li.id}
                            contextLabel={`שורת רכש: ${li.description.slice(0, 48)}${li.description.length > 48 ? "…" : ""}`}
                            hasComment={poLineHasComment(li.id)}
                          />
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <span className="font-medium">{li.description}</span>
                          {li.unit ? (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              יחידה: {li.unit}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {qtyDisplay.format(ordered)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {qtyDisplay.format(prior)}
                        </TableCell>
                        <TableCell className="text-end font-medium tabular-nums text-emerald-700">
                          {qtyDisplay.format(remaining)}
                        </TableCell>
                        <TableCell className="text-end">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min={0}
                            max={remaining}
                            value={receivedQtyInput[li.id] ?? ""}
                            onChange={(e) =>
                              setReceivedQtyInput((prev) => ({
                                ...prev,
                                [li.id]: e.target.value,
                              }))
                            }
                            disabled={isSubmitting || remaining <= 0}
                            className="ms-auto h-9 w-full max-w-[7.5rem] text-end"
                            aria-label={`כמות שהתקבלה עבור ${li.description}`}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <ul className="flex flex-col gap-4 md:hidden">
            {lines.map((li) => {
              const ordered = Number(li.quantity) || 0
              const prior = receivedByLine[li.id] ?? 0
              const remaining = Math.max(0, roundQty(ordered - prior))
              return (
                <li
                  key={li.id}
                  className="rounded-xl border border-border/60 bg-card/60 p-4 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{li.description}</p>
                    <MoContextCommentButton
                      projectId={po.project_id}
                      projectName={receiptCommentProjectName}
                      contextType="po_line"
                      contextId={li.id}
                      contextLabel={`שורת רכש: ${li.description.slice(0, 48)}${li.description.length > 48 ? "…" : ""}`}
                      hasComment={poLineHasComment(li.id)}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>בהזמנה</span>
                    <span className="text-end tabular-nums text-foreground">
                      {qtyDisplay.format(ordered)} {li.unit ?? ""}
                    </span>
                    <span>התקבל עד כה</span>
                    <span className="text-end tabular-nums text-foreground">
                      {qtyDisplay.format(prior)}
                    </span>
                    <span className="font-medium text-emerald-700">
                      יתרה
                    </span>
                    <span className="text-end font-semibold tabular-nums text-emerald-700">
                      {qtyDisplay.format(remaining)}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Label htmlFor={`mob-qty-${li.id}`} className="text-xs">
                      כמות שהתקבלה
                    </Label>
                    <Input
                      id={`mob-qty-${li.id}`}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      max={remaining}
                      value={receivedQtyInput[li.id] ?? ""}
                      onChange={(e) =>
                        setReceivedQtyInput((prev) => ({
                          ...prev,
                          [li.id]: e.target.value,
                        }))
                      }
                      disabled={isSubmitting || remaining <= 0}
                      className="h-10 w-full text-end"
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-xl border border-border/80 bg-background/95 p-3 shadow-lg backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 sm:flex-row sm:justify-end sm:gap-3">
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          disabled={isSubmitting || compressingPhoto}
          render={<Link href="/marker-ofek/procurement" />}
        >
          ביטול
        </Button>
        <Button
          type="button"
          className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-500 sm:w-auto"
          disabled={isSubmitting || compressingPhoto}
          onClick={() => void handleConfirmReceipt()}
        >
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Check className="size-4" aria-hidden />
          )}
          {isSubmitting ? "שומרים…" : "אשר קבלת סחורה"}
        </Button>
      </div>
    </div>
  )
}
