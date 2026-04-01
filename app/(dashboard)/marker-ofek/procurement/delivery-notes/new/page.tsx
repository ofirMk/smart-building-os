"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowRight,
  ClipboardSignature,
  Loader2,
  Truck,
} from "lucide-react"
import { toast } from "sonner"

import { saveDeliveryNote } from "./actions"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"

type PoListRow = {
  id: string
  po_number: string
  order_date: string
  status: string
  entities: { name: string } | { name: string }[] | null
}

type PoLineRow = {
  id: string
  description: string
  quantity: number
  unit: string | null
  created_at: string
}

type GoodsReceiptNested = {
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

const OPEN_STATUSES = new Set(["approved", "sent", "partial_receipt"])

const qtyDisplay = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
})

function roundQty(n: number): number {
  return Math.round(n * 10000) / 10000
}

function parseQty(s: string): number {
  const n = parseFloat(String(s).replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

export default function NewDeliveryNotePage() {
  const [poOptions, setPoOptions] = React.useState<PoListRow[]>([])
  const [loadingPos, setLoadingPos] = React.useState(true)
  const [poId, setPoId] = React.useState("")

  const [lines, setLines] = React.useState<PoLineRow[]>([])
  const [remainingByLine, setRemainingByLine] = React.useState<
    Record<string, number>
  >({})
  const [loadingLines, setLoadingLines] = React.useState(false)

  const [deliveryNoteNumber, setDeliveryNoteNumber] = React.useState("")
  const [receiptDate, setReceiptDate] = React.useState(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  })
  const [receivedBy, setReceivedBy] = React.useState("")
  const [shortageNotes, setShortageNotes] = React.useState("")
  const [receivedQty, setReceivedQty] = React.useState<Record<string, string>>(
    {}
  )

  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingPos(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from("purchase_orders")
          .select(
            `
            id,
            po_number,
            order_date,
            status,
            entities ( name )
          `
          )
          .eq("is_deleted", false)
          .in("status", ["approved", "sent", "partial_receipt"])
          .order("created_at", { ascending: false })
          .limit(100)

        if (error) throw error
        if (!cancelled) {
          setPoOptions((data as PoListRow[]) ?? [])
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(formatError(e))
        }
      } finally {
        if (!cancelled) setLoadingPos(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!poId) {
      setLines([])
      setRemainingByLine({})
      setReceivedQty({})
      return
    }
    let cancelled = false
    void (async () => {
      setLoadingLines(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data: poRow, error: poErr } = await supabase
          .from("purchase_orders")
          .select(
            `
            id,
            status,
            po_line_items (
              id,
              description,
              quantity,
              unit,
              created_at
            ),
            goods_receipts (
              goods_receipt_items ( po_line_item_id, quantity_received )
            )
          `
          )
          .eq("id", poId)
          .eq("is_deleted", false)
          .maybeSingle()

        if (poErr) throw poErr
        if (!poRow || cancelled) {
          if (!cancelled) {
            setLines([])
            setRemainingByLine({})
            setReceivedQty({})
          }
          return
        }

        const status = (poRow as { status: string }).status
        if (!OPEN_STATUSES.has(status)) {
          toast.error("ההזמנה אינה פתוחה לקבלה")
          if (!cancelled) {
            setLines([])
            setRemainingByLine({})
            setReceivedQty({})
          }
          return
        }

        const raw = poRow as {
          po_line_items: PoLineRow[] | PoLineRow[] | null
          goods_receipts: GoodsReceiptNested[] | GoodsReceiptNested | null
        }
        const lineList = embedMany(raw.po_line_items).sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )

        const prior: Record<string, number> = {}
        for (const li of lineList) {
          prior[li.id] = 0
        }
        for (const rec of embedMany(raw.goods_receipts)) {
          for (const row of embedMany(rec.goods_receipt_items)) {
            const lid = row.po_line_item_id
            const q = Number(row.quantity_received) || 0
            prior[lid] = (prior[lid] ?? 0) + q
          }
        }

        const remaining: Record<string, number> = {}
        const inputs: Record<string, string> = {}
        for (const li of lineList) {
          const ordered = Number(li.quantity) || 0
          const p = prior[li.id] ?? 0
          remaining[li.id] = Math.max(0, roundQty(ordered - p))
          inputs[li.id] = "0"
        }

        if (!cancelled) {
          setLines(lineList)
          setRemainingByLine(remaining)
          setReceivedQty(inputs)
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(formatError(e))
          setLines([])
          setRemainingByLine({})
          setReceivedQty({})
        }
      } finally {
        if (!cancelled) setLoadingLines(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [poId])

  function resetForm() {
    setPoId("")
    setLines([])
    setRemainingByLine({})
    setReceivedQty({})
    setDeliveryNoteNumber("")
    setReceiptDate(new Date().toISOString().slice(0, 10))
    setReceivedBy("")
    setShortageNotes("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!poId) {
      toast.error("נא לבחור הזמנת רכש")
      return
    }
    if (!receivedBy.trim()) {
      toast.error("נא למלא שם המקבל בשטח")
      return
    }

    const payloadLines = lines.map((li) => ({
      poLineItemId: li.id,
      quantityReceived: roundQty(parseQty(receivedQty[li.id] ?? "0")),
    }))

    setSubmitting(true)
    try {
      const res = await saveDeliveryNote({
        poId,
        deliveryNoteNumber,
        receiptDate,
        receivedBy: receivedBy.trim(),
        shortageNotes,
        lines: payloadLines,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("תעודת המשלוח נקלטה והקבלה נשמרה.")
      resetForm()
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-12 pt-2"
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
          <span className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-800 dark:text-amber-300">
            <Truck className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              מודול 2.2 · קליטת סחורה
            </p>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              רישום תעודת משלוח
            </h1>
          </div>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          בחרו הזמנת רכש פתוחה, הזינו פרטי תעודת משלוח ורשמו כמויות שהתקבלו לפי שורות
          ההזמנה. הנתונים נשמרים כ־
          <span className="font-mono text-xs">goods_receipts</span> /{" "}
          <span className="font-mono text-xs">goods_receipt_items</span> במסד.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="text-start">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardSignature
                className="size-5 text-muted-foreground"
                aria-hidden
              />
              פרטי תעודה
            </CardTitle>
            <CardDescription>
              הזמנה, מספר תעודת משלוח, תאריך אספקה ושם המקבל בשטח
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2 text-start md:col-span-2">
              <Label htmlFor="dn-po">הזמנת רכש (ספק · מספר · תאריך)</Label>
              <Select
                value={poId || undefined}
                onValueChange={(v) => setPoId(v ?? "")}
                disabled={loadingPos}
              >
                <SelectTrigger id="dn-po" className="w-full">
                  <SelectValue placeholder="בחרו הזמנה…" />
                </SelectTrigger>
                <SelectContent>
                  {poOptions.map((p) => {
                    const ent = embedOne(p.entities)
                    const label = `${ent?.name ?? "ספק"} · ${p.po_number} · ${new Date(p.order_date).toLocaleDateString("he-IL")}`
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {label}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 text-start">
              <Label htmlFor="dn-number">מספר תעודת משלוח</Label>
              <Input
                id="dn-number"
                value={deliveryNoteNumber}
                onChange={(e) => setDeliveryNoteNumber(e.target.value)}
                placeholder="למשל: TM-2026-0142"
              />
            </div>
            <div className="space-y-2 text-start">
              <Label htmlFor="dn-date">תאריך אספקה</Label>
              <Input
                id="dn-date"
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </div>
            <div className="space-y-2 text-start md:col-span-2">
              <Label htmlFor="dn-received-by">שם המקבל בשטח</Label>
              <Input
                id="dn-received-by"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="שם איש קשר באתר"
                autoComplete="name"
              />
            </div>
            <div className="space-y-2 text-start md:col-span-2">
              <Label htmlFor="dn-shortage">הערות חוסר (חובה אם נקלטה כמות נמוכה מהיתרה)</Label>
              <Textarea
                id="dn-shortage"
                rows={2}
                value={shortageNotes}
                onChange={(e) => setShortageNotes(e.target.value)}
                placeholder="למשל: חסרו 5 יחידות בגלל חוסר במלאי הספק…"
                className="resize-y min-h-[72px]"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="text-start">
            <CardTitle className="text-lg">שורות הזמנה</CardTitle>
            <CardDescription>
              כמות שהתקבלה — ברירת מחדל 0; לא ניתן לחרוג מהיתרה מול ההזמנה וקבלות
              קודמות
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!poId ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                בחרו הזמנת רכש כדי לטעון שורות
              </p>
            ) : loadingLines ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden />
                טוען שורות…
              </div>
            ) : lines.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                אין שורות בהזמנה זו
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[200px] text-start">
                        תיאור
                      </TableHead>
                      <TableHead className="text-start">יחידה</TableHead>
                      <TableHead className="tabular-nums text-start">
                        כמות בהזמנה
                      </TableHead>
                      <TableHead className="tabular-nums text-start">
                        יתרה לקבלה
                      </TableHead>
                      <TableHead className="w-36 text-start">
                        כמות שהתקבלה
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((li) => {
                      const rem = remainingByLine[li.id] ?? 0
                      const ord = Number(li.quantity) || 0
                      return (
                        <TableRow key={li.id}>
                          <TableCell className="max-w-[320px] text-start text-sm">
                            {li.description}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {(li.unit ?? "—").trim() || "—"}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {qtyDisplay.format(ord)}
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {qtyDisplay.format(rem)}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="any"
                              className="h-8 tabular-nums"
                              value={receivedQty[li.id] ?? "0"}
                              onChange={(e) =>
                                setReceivedQty((prev) => ({
                                  ...prev,
                                  [li.id]: e.target.value,
                                }))
                              }
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            type="submit"
            size="lg"
            disabled={submitting || !poId || lines.length === 0}
            className="gap-2"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            קלוט סחורה ושמור תעודת משלוח
          </Button>
        </div>
      </form>
    </div>
  )
}
