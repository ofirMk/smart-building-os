"use client"

/**
 * Phase 8.2 — Native Goods Receipt Workspace
 *
 * זה הממשק של המחסנאי. זרימה של שני שלבים:
 *
 *   שלב א' — **איתור**: בחירת PO פתוחה לקליטה מתוך רשימה שמסוננת ב-API
 *   ל-`SENT_TO_SUPPLIER` ו-`PARTIALLY_RECEIVED` בלבד. רואים את מספר
 *   ההזמנה הרשמי, הספק, הפרויקט וכמה שורות עוד פתוחות.
 *
 *   שלב ב' — **קליטה**: טבלת שורות דינמית שמחשבת לכל שורה
 *   `remaining = ordered - alreadyReceived`. המחסנאי יכול:
 *     • להשאיר את ברירת המחדל (קליטה מלאה) וללחוץ אחד "אשר".
 *     • להוריד כמות ידנית (קליטה חלקית).
 *     • לסמן כמות כנדחית (פגומה) + סיבה.
 *     • ללחוץ "אפס שורה" אם לא קיבל כלום.
 *
 *   שליחה: POST ל-`/api/procurement/goods-receipt` עם רק שורות שיש בהן
 *   פעילות (received > 0 || rejected > 0).
 *
 *   אחרי הצלחה: toast, איפוס לשלב א', רענון רשימת ה-POs.
 *
 * ## מחליף
 *   את ה-workspace הישן של Phase 2.2 שעבד על MOCK
 *   (`GOODS_RECEIPT_MOCK_PURCHASE_ORDERS`). מחזיק את אותן פיצ'רי UI אבל
 *   על התשתית הקנונית של Phase 8 (RLS, erp_purchase_orders/lines,
 *   erp_goods_receipts, RPC erp_complete_goods_receipt).
 */

import * as React from "react"
import {
  CheckCircle2,
  ClipboardCheck,
  Inbox,
  Loader2,
  Package,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  RotateCcw,
  Truck,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
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
import { readActiveCompanyIdFromCookie } from "@/lib/company-context"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// DTOs (mirror של ה-API — לא מייבאים מ-route handlers כדי לא לגרור server deps)
// ─────────────────────────────────────────────────────────────────────────────

type OpenForReceiptPoDto = {
  id: string
  poNumber: string
  officialPoNumber: string | null
  title: string
  status: "SENT_TO_SUPPLIER" | "PARTIALLY_RECEIVED"
  issuedAt: string | null
  supplierName: string | null
  projectName: string | null
  openLineCount: number
}

type ReceiptContextLineDto = {
  id: string
  itemId: string | null
  itemNumber: string | null
  itemSku: string | null
  description: string
  orderedQty: number
  receivedQty: number
  remainingQty: number
}

type ReceiptContextDto = {
  id: string
  poNumber: string
  officialPoNumber: string | null
  title: string
  status: string
  currency: string
  supplier: { id: string; name: string } | null
  project: { id: string; name: string | null } | null
  lines: ReceiptContextLineDto[]
}

type CompleteGoodsReceiptResponse = {
  goodsReceiptId: string
  grNumber: string
  newGrStatus: string
  purchaseOrderId: string
  newPoStatus: string
  totalOrderedQty: number
  totalReceivedQty: number
}

type LineInputState = {
  received: string
  rejected: string
  rejectReason: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const numberFormatter = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 3,
})

function parseQty(input: string): number {
  if (!input?.trim()) return 0
  const n = Number(input.replace(",", "."))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function buildDefaultLineInputs(
  lines: ReceiptContextLineDto[],
): Record<string, LineInputState> {
  const out: Record<string, LineInputState> = {}
  for (const l of lines) {
    out[l.id] = {
      received: l.remainingQty > 0 ? String(l.remainingQty) : "0",
      rejected: "0",
      rejectReason: "",
    }
  }
  return out
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case "SENT_TO_SUPPLIER":
      return "נשלח לספק"
    case "PARTIALLY_RECEIVED":
      return "נקלט חלקית"
    case "APPROVED":
      return "מאושר"
    case "FULLY_RECEIVED":
      return "נקלט במלואו"
    default:
      return status
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "SENT_TO_SUPPLIER":
      return "bg-indigo-500/15 text-indigo-700 border-indigo-500/30"
    case "PARTIALLY_RECEIVED":
      return "bg-amber-500/15 text-amber-800 border-amber-500/30"
    case "FULLY_RECEIVED":
      return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
    case "APPROVED":
      return "bg-sky-500/15 text-sky-700 border-sky-500/30"
    default:
      return "bg-slate-500/15 text-slate-700 border-slate-500/30"
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function GoodsReceiptWorkspace() {
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [availablePos, setAvailablePos] = React.useState<
    OpenForReceiptPoDto[] | null
  >(null)
  const [posError, setPosError] = React.useState<string | null>(null)
  const [loadingPos, setLoadingPos] = React.useState(false)

  const [selectedPoId, setSelectedPoId] = React.useState<string | null>(null)
  const [context, setContext] = React.useState<ReceiptContextDto | null>(null)
  const [contextError, setContextError] = React.useState<string | null>(null)
  const [loadingContext, setLoadingContext] = React.useState(false)

  const [lineInputs, setLineInputs] = React.useState<
    Record<string, LineInputState>
  >({})
  const [vendorDeliveryNote, setVendorDeliveryNote] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  // Mount: קוראים ל-cookie וטוענים את ה-POs הפתוחים.
  React.useEffect(() => {
    setCompanyId(readActiveCompanyIdFromCookie())
  }, [])

  const loadPos = React.useCallback(async () => {
    setLoadingPos(true)
    setPosError(null)
    try {
      const data = await masterDataFetch<OpenForReceiptPoDto[]>(
        "/api/procurement/orders/open-for-receipt",
      )
      setAvailablePos(data)
    } catch (e: unknown) {
      setPosError(e instanceof Error ? e.message : "שגיאת טעינת הזמנות")
    } finally {
      setLoadingPos(false)
    }
  }, [])

  React.useEffect(() => {
    if (!companyId) return
    void loadPos()
  }, [companyId, loadPos])

  // Loader של ההקשר כאשר בוחרים PO.
  const loadContext = React.useCallback(
    async (poId: string) => {
      setLoadingContext(true)
      setContextError(null)
      setContext(null)
      try {
        const data = await masterDataFetch<ReceiptContextDto>(
          `/api/procurement/orders/${encodeURIComponent(poId)}/receipt-context`,
        )
        setContext(data)
        setLineInputs(buildDefaultLineInputs(data.lines))
        setVendorDeliveryNote("")
        setNotes("")
      } catch (e: unknown) {
        setContextError(
          e instanceof Error ? e.message : "טעינת שורות ה-PO נכשלה",
        )
      } finally {
        setLoadingContext(false)
      }
    },
    [],
  )

  const handlePoChange = React.useCallback(
    (poId: string) => {
      setSelectedPoId(poId)
      void loadContext(poId)
    },
    [loadContext],
  )

  const handleLineChange = React.useCallback(
    (lineId: string, patch: Partial<LineInputState>) => {
      setLineInputs((prev) => ({
        ...prev,
        [lineId]: { ...prev[lineId]!, ...patch },
      }))
    },
    [],
  )

  const handleResetLine = React.useCallback((lineId: string) => {
    setLineInputs((prev) => ({
      ...prev,
      [lineId]: { received: "0", rejected: "0", rejectReason: "" },
    }))
  }, [])

  const handleFillRemaining = React.useCallback(
    (lineId: string, remaining: number) => {
      setLineInputs((prev) => ({
        ...prev,
        [lineId]: {
          ...prev[lineId]!,
          received: String(remaining),
          rejected: "0",
          rejectReason: "",
        },
      }))
    },
    [],
  )

  // סיכום תצוגה: כמה שורות "נגעו" בהן (receive > 0 || reject > 0)
  const summary = React.useMemo(() => {
    if (!context) {
      return { activeLines: 0, totalReceived: 0, totalRejected: 0 }
    }
    let activeLines = 0
    let totalReceived = 0
    let totalRejected = 0
    for (const line of context.lines) {
      const inp = lineInputs[line.id]
      if (!inp) continue
      const r = parseQty(inp.received)
      const j = parseQty(inp.rejected)
      if (r > 0 || j > 0) activeLines += 1
      totalReceived += r
      totalRejected += j
    }
    return { activeLines, totalReceived, totalRejected }
  }, [context, lineInputs])

  // וולידציה (עיוורת ל-submit) — מחזיר רשימת הודעות שגיאה בעברית.
  const validationErrors = React.useMemo(() => {
    if (!context) return [] as string[]
    const errors: string[] = []
    for (const line of context.lines) {
      const inp = lineInputs[line.id]
      if (!inp) continue
      const r = parseQty(inp.received)
      const j = parseQty(inp.rejected)
      if (r + j > line.remainingQty + 1e-6) {
        errors.push(
          `שורה "${line.description}" — סה"כ ${numberFormatter.format(r + j)} חורג מהיתרה (${numberFormatter.format(line.remainingQty)})`,
        )
      }
      if (j > 0 && !inp.rejectReason.trim()) {
        errors.push(`שורה "${line.description}" — חסרה סיבת דחייה`)
      }
    }
    if (summary.activeLines === 0) {
      errors.push("לא הוזנו כמויות לקליטה בשום שורה")
    }
    return errors
  }, [context, lineInputs, summary.activeLines])

  const canSubmit =
    Boolean(context) && !submitting && validationErrors.length === 0

  const handleSubmit = React.useCallback(async () => {
    if (!context || !canSubmit) return
    setSubmitting(true)
    try {
      const activeLines = context.lines
        .map((line) => {
          const inp = lineInputs[line.id]
          if (!inp) return null
          const r = parseQty(inp.received)
          const j = parseQty(inp.rejected)
          if (r === 0 && j === 0) return null
          return {
            purchaseOrderLineId: line.id,
            receivedQty: r,
            rejectedQty: j,
            rejectReason: inp.rejectReason.trim() || null,
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)

      const companyIdFromCookie = readActiveCompanyIdFromCookie()
      const res = await fetch("/api/procurement/goods-receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(companyIdFromCookie
            ? { "x-active-company-id": companyIdFromCookie }
            : {}),
        },
        credentials: "same-origin",
        body: JSON.stringify({
          purchaseOrderId: context.id,
          vendorDeliveryNote: vendorDeliveryNote.trim() || null,
          notes: notes.trim() || null,
          lines: activeLines,
        }),
      })

      const body = (await res.json().catch(() => null)) as {
        data?: CompleteGoodsReceiptResponse
        error?: string
      } | null

      if (!res.ok || !body?.data) {
        throw new Error(body?.error ?? `שגיאה ${res.status}`)
      }

      const result = body.data
      const poLabel =
        context.officialPoNumber ?? context.poNumber
      if (result.newPoStatus === "FULLY_RECEIVED") {
        toast.success(
          `תעודה ${result.grNumber} נקלטה · PO ${poLabel} נסגרה (התקבלה במלואה)`,
        )
      } else if (result.newPoStatus === "PARTIALLY_RECEIVED") {
        toast.success(
          `תעודה ${result.grNumber} נקלטה · PO ${poLabel} במצב קליטה חלקית`,
        )
      } else {
        toast.success(`תעודה ${result.grNumber} נקלטה בהצלחה`)
      }

      // איפוס לשלב א' ורענון ה-POs הפתוחים.
      setSelectedPoId(null)
      setContext(null)
      setLineInputs({})
      setVendorDeliveryNote("")
      setNotes("")
      void loadPos()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "שליחת קליטה נכשלה")
    } finally {
      setSubmitting(false)
    }
  }, [canSubmit, context, lineInputs, loadPos, notes, vendorDeliveryNote])

  // ───────── render ─────────

  if (!companyId) {
    return (
      <LoadingBanner>טוען הקשר חברה פעילה…</LoadingBanner>
    )
  }

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col gap-4 p-4">
      {/* Page header */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
            <Truck className="size-5 text-emerald-700" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold">קליטת סחורה במחסן</h1>
            <p className="text-xs text-muted-foreground">
              Phase 8.2 — קליטה פיזית מול הזמנת רכש, עם סגירה אוטומטית של ה-PO.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={loadPos}
          disabled={loadingPos}
          className="gap-2"
        >
          <RefreshCw
            className={cn("size-4", loadingPos && "animate-spin")}
            aria-hidden
          />
          רענן הזמנות
        </Button>
      </header>

      {/* Stage 1 — PO selector */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle>שלב א׳ — בחירת הזמנת רכש לקליטה</CardTitle>
          </div>
          <CardDescription>
            מוצגות רק הזמנות במצב &quot;נשלח לספק&quot; או &quot;נקלט חלקית&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {posError ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-800">
              {posError}
            </div>
          ) : null}

          {loadingPos ? (
            <LoadingBanner>טוען הזמנות פתוחות…</LoadingBanner>
          ) : availablePos && availablePos.length === 0 ? (
            <EmptyInbox />
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="po-select" className="text-sm">
                הזמנת רכש
              </Label>
              <Select
                value={selectedPoId ?? ""}
                onValueChange={(v) => {
                  if (typeof v === "string" && v.length > 0) handlePoChange(v)
                }}
              >
                <SelectTrigger id="po-select" className="w-full" dir="rtl">
                  <SelectValue placeholder="בחר הזמנה…" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {(availablePos ?? []).map((po) => (
                    <SelectItem key={po.id} value={po.id}>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">
                          {po.officialPoNumber ?? po.poNumber}
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span>{po.title}</span>
                        {po.supplierName ? (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-muted-foreground">
                              {po.supplierName}
                            </span>
                          </>
                        ) : null}
                        <Badge
                          variant="outline"
                          className={cn("ms-1", statusBadgeClass(po.status))}
                        >
                          {formatStatusLabel(po.status)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-slate-300 bg-slate-50 text-slate-700"
                        >
                          {po.openLineCount} שורות פתוחות
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stage 2 — line-by-line receive */}
      {selectedPoId ? (
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader>
            <div className="flex items-center gap-2">
              <PackageOpen className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle>שלב ב׳ — פירוט קליטה</CardTitle>
            </div>
            {context ? (
              <CardDescription className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>
                  הזמנה:{" "}
                  <b>{context.officialPoNumber ?? context.poNumber}</b>
                </span>
                {context.supplier ? (
                  <span>
                    ספק: <b>{context.supplier.name}</b>
                  </span>
                ) : null}
                {context.project?.name ? (
                  <span>
                    פרויקט: <b>{context.project.name}</b>
                  </span>
                ) : null}
                <Badge
                  variant="outline"
                  className={statusBadgeClass(context.status)}
                >
                  {formatStatusLabel(context.status)}
                </Badge>
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
            {loadingContext ? (
              <LoadingBanner>טוען שורות ההזמנה…</LoadingBanner>
            ) : contextError ? (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-800">
                {contextError}
              </div>
            ) : context ? (
              <ReceiveLinesTable
                lines={context.lines}
                inputs={lineInputs}
                onChange={handleLineChange}
                onReset={handleResetLine}
                onFillRemaining={handleFillRemaining}
              />
            ) : null}

            {context ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="vendor-delivery-note">
                    מספר תעודת משלוח מהספק
                  </Label>
                  <Input
                    id="vendor-delivery-note"
                    dir="ltr"
                    className="text-start"
                    value={vendorDeliveryNote}
                    onChange={(e) => setVendorDeliveryNote(e.target.value)}
                    placeholder="לדוגמה: DN-45712"
                    disabled={submitting}
                    maxLength={128}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="warehouse-notes">הערות מחסנאי (רשות)</Label>
                  <Textarea
                    id="warehouse-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="למשל: ארגז #3 פגום, דווח לסמנכ״ל רכש."
                    disabled={submitting}
                    maxLength={2000}
                  />
                </div>
              </div>
            ) : null}

            {context && validationErrors.length > 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900">
                <div className="mb-1 font-semibold">לפני שליחה יש לתקן:</div>
                <ul className="list-disc space-y-0.5 ps-5">
                  {validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {context ? (
              <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    שורות נקלטות: <b>{summary.activeLines}</b>
                  </span>
                  <span>
                    סה״כ כמות נקלטת:{" "}
                    <b>{numberFormatter.format(summary.totalReceived)}</b>
                  </span>
                  {summary.totalRejected > 0 ? (
                    <span className="text-rose-700">
                      נדחה:{" "}
                      <b>{numberFormatter.format(summary.totalRejected)}</b>
                    </span>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="lg"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="gap-2"
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <PackageCheck className="size-4" aria-hidden />
                  )}
                  אשר וקלוט סחורה
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Lines table
// ─────────────────────────────────────────────────────────────────────────────

function ReceiveLinesTable({
  lines,
  inputs,
  onChange,
  onReset,
  onFillRemaining,
}: {
  lines: ReceiptContextLineDto[]
  inputs: Record<string, LineInputState>
  onChange: (lineId: string, patch: Partial<LineInputState>) => void
  onReset: (lineId: string) => void
  onFillRemaining: (lineId: string, remaining: number) => void
}) {
  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        ל-PO אין שורות.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[12%]">מק״ט</TableHead>
            <TableHead>תיאור</TableHead>
            <TableHead className="w-[8%] text-center">הוזמן</TableHead>
            <TableHead className="w-[10%] text-center">התקבל בעבר</TableHead>
            <TableHead className="w-[10%] text-center">נותר לקבלה</TableHead>
            <TableHead className="w-[14%]">כמות נקלטת כעת</TableHead>
            <TableHead className="w-[12%]">כמות נדחית</TableHead>
            <TableHead className="w-[16%]">סיבת דחייה</TableHead>
            <TableHead className="w-[8%] text-center">פעולות</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => {
            const inp = inputs[line.id] ?? {
              received: "0",
              rejected: "0",
              rejectReason: "",
            }
            const receivedNum = parseQty(inp.received)
            const rejectedNum = parseQty(inp.rejected)
            const sum = receivedNum + rejectedNum
            const over = sum > line.remainingQty + 1e-6
            const isClosed = line.remainingQty <= 0

            return (
              <TableRow
                key={line.id}
                className={cn(
                  isClosed && "bg-emerald-50/40",
                  over && "bg-rose-50/40",
                )}
              >
                <TableCell
                  className="font-mono text-xs"
                  dir="ltr"
                >
                  {line.itemNumber ?? line.itemSku ?? "—"}
                </TableCell>
                <TableCell className="text-sm">{line.description}</TableCell>
                <TableCell className="text-center tabular-nums">
                  {numberFormatter.format(line.orderedQty)}
                </TableCell>
                <TableCell className="text-center tabular-nums text-muted-foreground">
                  {line.receivedQty > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Package className="size-3" aria-hidden />
                      {numberFormatter.format(line.receivedQty)}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {isClosed ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                    >
                      <CheckCircle2 className="me-1 size-3" aria-hidden />
                      הושלם
                    </Badge>
                  ) : (
                    <span className="font-semibold text-emerald-800">
                      {numberFormatter.format(line.remainingQty)}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.001"
                    max={line.remainingQty || undefined}
                    value={inp.received}
                    onChange={(e) =>
                      onChange(line.id, { received: e.target.value })
                    }
                    disabled={isClosed}
                    className={cn(
                      "h-8 text-center",
                      over &&
                        "border-rose-500/60 focus-visible:border-rose-500",
                    )}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.001"
                    value={inp.rejected}
                    onChange={(e) =>
                      onChange(line.id, { rejected: e.target.value })
                    }
                    disabled={isClosed}
                    className={cn(
                      "h-8 text-center",
                      rejectedNum > 0 && "border-rose-400 text-rose-800",
                    )}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={inp.rejectReason}
                    onChange={(e) =>
                      onChange(line.id, { rejectReason: e.target.value })
                    }
                    disabled={isClosed || rejectedNum === 0}
                    placeholder={
                      rejectedNum > 0
                        ? "למשל: פגום באריזה"
                        : "—"
                    }
                    maxLength={500}
                    className="h-8"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex justify-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="מלא יתרה"
                      disabled={isClosed}
                      onClick={() =>
                        onFillRemaining(line.id, line.remainingQty)
                      }
                      className="h-7 w-7"
                    >
                      <PackageCheck className="size-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="אפס שורה"
                      onClick={() => onReset(line.id)}
                      disabled={isClosed}
                      className="h-7 w-7"
                    >
                      <RotateCcw className="size-4" aria-hidden />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function LoadingBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {children}
    </div>
  )
}

function EmptyInbox() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
      <div className="rounded-full bg-emerald-500/10 p-3">
        <ClipboardCheck className="size-6 text-emerald-700" aria-hidden />
      </div>
      <div className="text-sm font-medium">אין כרגע הזמנות פתוחות לקליטה</div>
      <div className="text-xs text-muted-foreground">
        ברגע שהזמנת רכש תישלח לספק, היא תופיע כאן אוטומטית.
      </div>
    </div>
  )
}

