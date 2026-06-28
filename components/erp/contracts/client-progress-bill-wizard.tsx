"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Calculator,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  TrendingUp,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContractLineForWizard = {
  id: string
  lineNumber: number
  boqRef: string | null
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  lastApprovedPct: number   // cumulative % approved in previous bills
  lastApprovedAmount: number
  retainageExempt: boolean
}

export type ClientContractForWizard = {
  id: string
  contractNumber: string
  clientName: string
  totalAmount: number
  retentionPct: number
  advanceRepaymentPct: number
  indexationPct: number
  advancePaymentAmount: number
}

type LineEntry = {
  contractLineId: string
  submittedPct: number     // 0–100, user editable
  submittedAmount: number  // derived: totalPrice × pct/100
}

type WaterfallData = {
  submittedTotalAmount: number
  indexedSubmittedAmount: number
  retentionDeductedAmount: number
  advanceRepaymentAmount: number
  netApprovedPayable: number
  // full RPC JSONB (optional)
  raw: Record<string, unknown> | null
}

type WizardStep = "enter_lines" | "review_waterfall" | "done"

// ─── Formatters ───────────────────────────────────────────────────────────────

function ils(n: number): string {
  return n.toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function pct(n: number): string {
  return `${n.toFixed(2)}%`
}

// ─── Waterfall card ───────────────────────────────────────────────────────────

function WaterfallCard({
  contract,
  totalSubmitted,
  wf,
  loading,
}: {
  contract: ClientContractForWizard
  totalSubmitted: number
  wf: WaterfallData | null
  loading: boolean
}) {
  const estRetention =
    Math.round(totalSubmitted * (contract.retentionPct / 100) * 100) / 100
  const estAdvance =
    Math.round(totalSubmitted * (contract.advanceRepaymentPct / 100) * 100) / 100

  return (
    <Card className="sticky top-4 h-fit" dir="rtl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="size-4 text-primary" />
          סיכום חשבון
          {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <WfRow
          label="סה״כ הגשה"
          value={wf ? ils(wf.submittedTotalAmount) : ils(totalSubmitted)}
          highlight="base"
        />
        {contract.indexationPct > 0 && (
          <WfRow
            label={`הצמדה (${pct(contract.indexationPct)})`}
            value={wf ? ils(wf.indexedSubmittedAmount) : "—"}
            sub
          />
        )}

        <Separator className="my-1" />
        <p className="text-xs font-semibold text-muted-foreground">ניכויים</p>

        <WfRow
          label={`עכבון (${pct(contract.retentionPct)})`}
          value={wf ? ils(wf.retentionDeductedAmount) : `~${ils(estRetention)}`}
          deduction
          estimate={!wf}
        />
        <WfRow
          label={`שחרור מקדמה (${pct(contract.advanceRepaymentPct)})`}
          value={wf ? ils(wf.advanceRepaymentAmount) : `~${ils(estAdvance)}`}
          deduction
          estimate={!wf}
        />

        <Separator className="my-1" />

        <WfRow
          label="נטו לתשלום"
          value={
            wf
              ? ils(wf.netApprovedPayable)
              : `~${ils(Math.max(0, totalSubmitted - estRetention - estAdvance))}`
          }
          highlight="total"
          estimate={!wf}
        />

        {!wf && (
          <p className="pt-2 text-center text-[11px] text-muted-foreground">
            ערכים עם ~ הם הערכה.
            <br />
            לחץ &quot;שמור וחשב&quot; לתוצאה מדויקת.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function WfRow({
  label,
  value,
  deduction,
  sub,
  estimate,
  highlight,
}: {
  label: string
  value: string
  deduction?: boolean
  sub?: boolean
  estimate?: boolean
  highlight?: "base" | "total"
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-2",
        sub && "pl-3 text-xs text-muted-foreground",
        highlight === "total" && "font-bold text-base"
      )}
    >
      <span className={cn("truncate", deduction && "text-destructive/80")}>{label}</span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          deduction && "text-destructive",
          estimate && "italic opacity-70"
        )}
      >
        {deduction && value !== "—" ? `(${value})` : value}
      </span>
    </div>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function ClientProgressBillWizard({
  contractId,
  contract,
  contractLines,
}: {
  contractId: string
  contract: ClientContractForWizard
  contractLines: ContractLineForWizard[]
}) {
  const router = useRouter()

  // Bill meta
  const [billNumber, setBillNumber] = React.useState<string>("")
  const [periodStart, setPeriodStart] = React.useState<string>(
    new Date().toISOString().slice(0, 10)
  )
  const [periodEnd, setPeriodEnd] = React.useState<string>(
    new Date().toISOString().slice(0, 10)
  )

  const [step, setStep] = React.useState<WizardStep>("enter_lines")

  // Line entries keyed by contractLineId
  const [entries, setEntries] = React.useState<Map<string, LineEntry>>(
    () =>
      new Map(
        contractLines.map((l) => [
          l.id,
          { contractLineId: l.id, submittedPct: 0, submittedAmount: 0 },
        ])
      )
  )

  const [saving, setSaving] = React.useState(false)
  const [calculating, setCalculating] = React.useState(false)
  const [savedBillId, setSavedBillId] = React.useState<string | null>(null)
  const [wf, setWf] = React.useState<WaterfallData | null>(null)

  // ── Helpers ────────────────────────────────────────────────────────────────
  function setPctForLine(lineId: string, pctVal: number) {
    setEntries((prev) => {
      const next = new Map(prev)
      const line = contractLines.find((l) => l.id === lineId)
      const amt =
        line != null
          ? Math.round(line.totalPrice * (pctVal / 100) * 100) / 100
          : 0
      next.set(lineId, { contractLineId: lineId, submittedPct: pctVal, submittedAmount: amt })
      return next
    })
  }

  const lineEntriesArray = React.useMemo(
    () =>
      contractLines.map(
        (l) =>
          entries.get(l.id) ?? { contractLineId: l.id, submittedPct: 0, submittedAmount: 0 }
      ),
    [contractLines, entries]
  )

  const totalSubmitted = lineEntriesArray.reduce((s, l) => s + l.submittedAmount, 0)

  // ── Save + Calculate ───────────────────────────────────────────────────────
  async function handleSaveAndCalculate() {
    if (!billNumber.trim()) {
      toast.error("יש להזין מספר חשבון")
      return
    }
    if (totalSubmitted === 0) {
      toast.error("יש להזין אחוז ביצוע לפחות לשורה אחת")
      return
    }

    setSaving(true)
    try {
      // 1. Create bill header
      let billId = savedBillId
      if (!billId) {
        const createRes = await fetch(
          `/api/erp/client-contracts/${contractId}/progress-bills`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              billNumber: billNumber.trim(),
              periodStart,
              periodEnd,
              status: "DRAFT",
            }),
          }
        )
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({ error: "שגיאה ביצירת חשבון" }))
          throw new Error((err as { error: string }).error)
        }
        const created = (await createRes.json()) as { data: { id: string } }
        billId = created.data.id
        setSavedBillId(billId)
      }

      // 2. Bulk upsert lines
      const nonZeroLines = lineEntriesArray.filter((l) => l.submittedAmount > 0)
      if (nonZeroLines.length > 0) {
        const putRes = await fetch(
          `/api/erp/client-contracts/${contractId}/progress-bills/${billId}/lines`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lines: nonZeroLines.map((l) => {
                const line = contractLines.find((cl) => cl.id === l.contractLineId)
                return {
                  contractLineId: l.contractLineId,
                  submittedPercent: l.submittedPct,
                  submittedQuantity:
                    line != null
                      ? Math.round(line.quantity * (l.submittedPct / 100) * 1000) / 1000
                      : 0,
                  submittedAmount: l.submittedAmount,
                }
              }),
            }),
          }
        )
        if (!putRes.ok) {
          const err = await putRes.json().catch(() => ({ error: "שגיאה בשמירת שורות" }))
          throw new Error((err as { error: string }).error)
        }
      }

      setSaving(false)
      setCalculating(true)

      // 3. Trigger full waterfall
      const calcRes = await fetch(
        `/api/erp/client-contracts/${contractId}/progress-bills/${billId}/calculate?mode=full`,
        { method: "POST" }
      )
      if (!calcRes.ok) {
        const err = await calcRes.json().catch(() => ({ error: "שגיאה בחישוב מפל מים" }))
        throw new Error((err as { error: string }).error)
      }
      const calcData = (await calcRes.json()) as { mode: string; waterfall: Record<string, unknown> }

      // 4. Re-fetch the bill to get populated header columns
      const billRes = await fetch(
        `/api/erp/client-contracts/${contractId}/progress-bills/${billId}`
      )
      const billJson = billRes.ok
        ? ((await billRes.json()) as {
            data: {
              submittedTotalAmount: number
              indexedSubmittedAmount: number
              retentionDeductedAmount: number
              advanceRepaymentAmount: number
              netApprovedPayable: number
            }
          })
        : null

      setWf({
        submittedTotalAmount: billJson?.data.submittedTotalAmount ?? totalSubmitted,
        indexedSubmittedAmount: billJson?.data.indexedSubmittedAmount ?? totalSubmitted,
        retentionDeductedAmount: billJson?.data.retentionDeductedAmount ?? 0,
        advanceRepaymentAmount: billJson?.data.advanceRepaymentAmount ?? 0,
        netApprovedPayable: billJson?.data.netApprovedPayable ?? totalSubmitted,
        raw: calcData.waterfall ?? null,
      })

      setStep("review_waterfall")
      toast.success("החשבון חושב בהצלחה")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה לא ידועה")
    } finally {
      setSaving(false)
      setCalculating(false)
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!savedBillId) return
    setSaving(true)
    try {
      const res = await fetch(
        `/api/erp/client-contracts/${contractId}/progress-bills/${savedBillId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "SUBMITTED" }),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "שגיאה בהגשת חשבון" }))
        throw new Error((err as { error: string }).error)
      }
      setStep("done")
      toast.success("החשבון הוגש בהצלחה")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה לא ידועה")
    } finally {
      setSaving(false)
    }
  }

  const busy = saving || calculating

  // ── Done ───────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div
        className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center"
        dir="rtl"
      >
        <CheckCircle2 className="size-12 text-emerald-500" />
        <h2 className="text-xl font-semibold">החשבון הוגש בהצלחה</h2>
        {wf && (
          <p className="text-muted-foreground">
            נטו לתשלום:{" "}
            <span className="font-semibold text-foreground">{ils(wf.netApprovedPayable)}</span>
          </p>
        )}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push(`/marker-ofek/contracts/${contractId}`)}
          >
            חזור לחוזה
          </Button>
          {savedBillId && (
            <Button
              onClick={() =>
                router.push(
                  `/marker-ofek/contracts/${contractId}/progress-billings/${savedBillId}`
                )
              }
            >
              פתח חשבון
              <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    )
  }

  // ── Main layout ────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div>
            <h1 className="text-base font-semibold leading-tight">
              חשבון התקדמות חדש — {contract.contractNumber}
            </h1>
            <p className="text-xs text-muted-foreground">
              {contract.clientName} · {ils(contract.totalAmount)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {step === "review_waterfall" && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setWf(null)
                  setStep("enter_lines")
                }}
              >
                ← ערוך שורות
              </Button>
            )}

            {step === "enter_lines" && (
              <Button
                size="sm"
                disabled={busy || totalSubmitted === 0 || !billNumber.trim()}
                onClick={handleSaveAndCalculate}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <Calculator className="size-4" />
                    שמור וחשב
                  </>
                )}
              </Button>
            )}

            {step === "review_waterfall" && (
              <Button size="sm" disabled={busy} onClick={handleSubmit}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <FileText className="size-4" />
                    הגש חשבון
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex gap-6 border-t border-border px-6 py-2 text-xs text-muted-foreground">
          <span className={cn("font-medium", step === "enter_lines" && "text-foreground")}>
            1. הזנת ביצוע
          </span>
          <span className="opacity-40">›</span>
          <span className={cn("font-medium", step === "review_waterfall" && "text-foreground")}>
            2. אישור סיכום
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 gap-6 p-6">
        {/* Left: Meta + Spreadsheet */}
        <div className="flex flex-1 flex-col gap-4 overflow-auto">

          {/* Bill meta (only on step 1) */}
          {step === "enter_lines" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">פרטי חשבון</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="billNumber">מספר חשבון *</Label>
                    <Input
                      id="billNumber"
                      value={billNumber}
                      onChange={(e) => setBillNumber(e.target.value)}
                      placeholder="לדוגמה: חשבון-001"
                      disabled={!!savedBillId}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="periodStart">תחילת תקופה</Label>
                    <Input
                      id="periodStart"
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      disabled={!!savedBillId}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="periodEnd">סוף תקופה</Label>
                    <Input
                      id="periodEnd"
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      disabled={!!savedBillId}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary banner on step 2 */}
          {step === "review_waterfall" && wf && (
            <Alert className="border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30">
              <TrendingUp className="size-4 text-emerald-600" />
              <AlertTitle className="text-emerald-700 dark:text-emerald-400">
                חשבון #{billNumber} חושב
              </AlertTitle>
              <AlertDescription className="text-emerald-600 dark:text-emerald-500">
                נטו לתשלום:{" "}
                <span className="font-semibold">{ils(wf.netApprovedPayable)}</span>. לחץ
                &quot;הגש חשבון&quot; להגשה רשמית.
              </AlertDescription>
            </Alert>
          )}

          {/* BOQ Spreadsheet */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">שורות חוזה</CardTitle>
                <Badge variant="secondary" className="text-xs tabular-nums">
                  {ils(totalSubmitted)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="w-12 text-right">#</TableHead>
                      <TableHead className="text-right">תיאור</TableHead>
                      <TableHead className="w-20 text-right">יחידה</TableHead>
                      <TableHead className="w-24 text-right">כמות</TableHead>
                      <TableHead className="w-28 text-right">מחיר יחידה</TableHead>
                      <TableHead className="w-32 text-right">סכום חוזה</TableHead>
                      <TableHead className="w-20 text-right">קודם %</TableHead>
                      <TableHead className="w-24 bg-amber-50 text-right dark:bg-amber-950/30">
                        הגשה %
                      </TableHead>
                      <TableHead className="w-32 text-right">סכום הגשה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contractLines.map((line) => {
                      const entry = lineEntriesArray.find(
                        (e) => e.contractLineId === line.id
                      ) ?? { contractLineId: line.id, submittedPct: 0, submittedAmount: 0 }
                      const isReadOnly = step === "review_waterfall"

                      return (
                        <TableRow
                          key={line.id}
                          className={cn(
                            "text-sm",
                            entry.submittedPct > 0 && "bg-amber-50/30 dark:bg-amber-950/10"
                          )}
                        >
                          <TableCell className="text-right text-muted-foreground">
                            {line.lineNumber}
                          </TableCell>
                          <TableCell className="max-w-[240px]">
                            <div className="truncate font-medium">{line.description}</div>
                            {line.boqRef && (
                              <div className="text-xs text-muted-foreground">{line.boqRef}</div>
                            )}
                            {line.retainageExempt && (
                              <Badge variant="outline" className="mt-0.5 text-[10px]">
                                פטור עכבון
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">—</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {line.quantity.toLocaleString("he-IL")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {ils(line.unitPrice)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {ils(line.totalPrice)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {pct(line.lastApprovedPct)}
                          </TableCell>
                          <TableCell className="bg-amber-50 p-1 dark:bg-amber-950/30">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={0.01}
                              value={entry.submittedPct === 0 ? "" : entry.submittedPct}
                              placeholder="0"
                              disabled={isReadOnly}
                              className="h-7 w-20 text-right tabular-nums text-sm"
                              onChange={(e) => {
                                const val = Math.min(
                                  100,
                                  Math.max(0, parseFloat(e.target.value) || 0)
                                )
                                setPctForLine(line.id, val)
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {entry.submittedAmount > 0 ? (
                              <span className="font-medium text-amber-700 dark:text-amber-400">
                                {ils(entry.submittedAmount)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Waterfall sidebar */}
        <div className="w-72 shrink-0">
          <WaterfallCard
            contract={contract}
            totalSubmitted={totalSubmitted}
            wf={wf}
            loading={busy}
          />
        </div>
      </div>
    </div>
  )
}
