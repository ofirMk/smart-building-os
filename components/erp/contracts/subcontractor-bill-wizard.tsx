"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  RefreshCw,
  Save,
} from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

export type BoqLineForWizard = {
  id: string
  lineNo: number
  sectionCode: string
  description: string
  uom: string
  quantity: number
  unitPrice: number
  totalLinePrice: number
}

export type ContractForWizard = {
  id: string
  contractNumber: string
  retentionPct: number
  insurancePct: number
  advancePaymentAmount: number
  advanceRecoveryMethod: string | null
  advanceRecoveryPct: number
  rawMaterialOffsetCommissionPct: number
  vatPct?: number
}

type LineEntry = {
  boqLineId: string
  cumulativePct: number          // 0–100, user editable
  cumulativeAmount: number       // derived: totalLinePrice × pct/100
  submittedAmount: number        // auto-mirrors cumulativeAmount
}

type WaterfallResult = {
  billId: string
  cumulativeExecuted: number
  escalation: number
  retention: number
  insurance: number
  advanceRecovery: number
  rmoTotal: number
  previousBilled: number
  amountToPay: number
  vat: number
  grandTotal: number
  isFinal: boolean
  computedAt: string
}

type WizardStep = "enter_lines" | "review_waterfall" | "done"

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  lines,
  result,
  loading,
}: {
  contract: ContractForWizard
  lines: LineEntry[]
  result: WaterfallResult | null
  loading: boolean
}) {
  // Live client-side estimate before the RPC runs
  const totalCumulative = lines.reduce((s, l) => s + l.cumulativeAmount, 0)

  const estRetention = Math.round(totalCumulative * (contract.retentionPct / 100) * 100) / 100
  const estInsurance = Math.round(totalCumulative * (contract.insurancePct / 100) * 100) / 100
  const vatPct = contract.vatPct ?? 17

  const r = result

  return (
    <Card className="sticky top-4 h-fit" dir="rtl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="size-4 text-primary" />
          מפל מים פיננסי
          {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {/* Gross executed */}
        <WfRow
          label="סה״כ ביצוע מצטבר"
          value={r ? ils(r.cumulativeExecuted) : ils(totalCumulative)}
          highlight="base"
        />
        <WfRow
          label={`הצמדה`}
          value={r ? ils(r.escalation) : "—"}
          sub
        />

        <Separator className="my-1" />

        {/* Deductions */}
        <p className="text-xs font-semibold text-muted-foreground">ניכויים</p>
        <WfRow
          label={`עכבון (${pct(contract.retentionPct)})`}
          value={r ? ils(r.retention) : `~${ils(estRetention)}`}
          deduction
          estimate={!r}
        />
        <WfRow
          label={`ביטוח (${pct(contract.insurancePct)})`}
          value={r ? ils(r.insurance) : `~${ils(estInsurance)}`}
          deduction
          estimate={!r}
        />
        <WfRow
          label="שחרור מקדמה"
          value={r ? ils(r.advanceRecovery) : "—"}
          deduction
        />
        <WfRow
          label="קיזוז חומר גלם"
          value={r ? ils(r.rmoTotal) : "—"}
          deduction
        />
        <WfRow
          label="חשבונות קודמים"
          value={r ? ils(r.previousBilled) : "—"}
          deduction
        />

        <Separator className="my-1" />

        {/* Net + VAT */}
        <WfRow
          label="לתשלום (לפני מע״ו)"
          value={r ? ils(r.amountToPay) : "—"}
          highlight="net"
        />
        <WfRow
          label={`מע״מ (${vatPct}%)`}
          value={r ? ils(r.vat) : "—"}
          sub
        />

        <Separator className="my-1" />

        <WfRow
          label="סה״כ לתשלום"
          value={r ? ils(r.grandTotal) : "—"}
          highlight="total"
        />

        {!r && (
          <p className="pt-2 text-center text-[11px] text-muted-foreground">
            ערכים עם ~ הם הערכה בלבד.
            <br />
            לחץ על &quot;שמור וחשב&quot; לתוצאה מדויקת.
          </p>
        )}
        {r && (
          <p className="pt-2 text-center text-[11px] text-muted-foreground">
            חושב ב-{new Date(r.computedAt).toLocaleTimeString("he-IL")}
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
  highlight?: "base" | "net" | "total"
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-2",
        sub && "pl-3 text-xs text-muted-foreground",
        highlight === "total" && "font-bold text-base",
        highlight === "net" && "font-semibold"
      )}
    >
      <span className={cn("truncate", deduction && "text-destructive/80")}>
        {label}
      </span>
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

// ─── Main Wizard ─────────────────────────────────────────────────────────────

export function SubcontractorBillWizard({
  contractId,
  contract,
  boqLines,
}: {
  contractId: string
  contract: ContractForWizard
  boqLines: BoqLineForWizard[]
}) {
  const router = useRouter()

  const [executionMonth, setExecutionMonth] = React.useState<string>(
    new Date().toISOString().slice(0, 7) // YYYY-MM
  )
  const [billDate, setBillDate] = React.useState<string>(
    new Date().toISOString().slice(0, 10)
  )
  const [vatPct, setVatPct] = React.useState<number>(contract.vatPct ?? 17)
  const [isFinal, setIsFinal] = React.useState(false)
  const [step, setStep] = React.useState<WizardStep>("enter_lines")

  // Line entries keyed by boqLineId
  const [entries, setEntries] = React.useState<Map<string, LineEntry>>(
    () =>
      new Map(
        boqLines.map((l) => [
          l.id,
          {
            boqLineId: l.id,
            cumulativePct: 0,
            cumulativeAmount: 0,
            submittedAmount: 0,
          },
        ])
      )
  )

  const [saving, setSaving] = React.useState(false)
  const [calculating, setCalculating] = React.useState(false)
  const [savedBillId, setSavedBillId] = React.useState<string | null>(null)
  const [waterfall, setWaterfall] = React.useState<WaterfallResult | null>(null)

  // ── Entry helpers ──────────────────────────────────────────────────────
  function setPct(boqLineId: string, pctVal: number) {
    setEntries((prev) => {
      const next = new Map(prev)
      const line = boqLines.find((l) => l.id === boqLineId)
      const amt =
        line != null
          ? Math.round(line.totalLinePrice * (pctVal / 100) * 100) / 100
          : 0
      next.set(boqLineId, {
        boqLineId,
        cumulativePct: pctVal,
        cumulativeAmount: amt,
        submittedAmount: amt,
      })
      return next
    })
  }

  const lineEntriesArray = React.useMemo(
    () =>
      boqLines.map((l) => entries.get(l.id) ?? {
        boqLineId: l.id,
        cumulativePct: 0,
        cumulativeAmount: 0,
        submittedAmount: 0,
      }),
    [boqLines, entries]
  )

  const totalSubmitted = lineEntriesArray.reduce((s, l) => s + l.cumulativeAmount, 0)

  // ── Save + Calculate ───────────────────────────────────────────────────
  async function handleSaveAndCalculate() {
    if (!executionMonth.match(/^\d{4}-\d{2}$/)) {
      toast.error("יש להזין חודש ביצוע בפורמט YYYY-MM")
      return
    }

    setSaving(true)
    try {
      // Step 1: Create bill header
      let billId = savedBillId
      if (!billId) {
        const createRes = await fetch(
          `/api/erp/subcontractor-contracts/${contractId}/bills`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              executionMonth,
              billDate,
              vatPct,
              isFinal,
            }),
          }
        )
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({ error: "שגיאה ביצירת חשבון" }))
          throw new Error((err as { error: string }).error)
        }
        const created = await createRes.json() as { data: { id: string } }
        billId = created.data.id
        setSavedBillId(billId)
      }

      // Step 2: Upsert lines
      const putRes = await fetch(
        `/api/erp/subcontractor-contracts/${contractId}/bills/${billId}/lines`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines: lineEntriesArray.map((l) => ({
              boqLineId: l.boqLineId,
              cumulativePct: l.cumulativePct,
              cumulativeQty: 0,
              cumulativeAmount: l.cumulativeAmount,
              submittedAmount: l.submittedAmount,
            })),
          }),
        }
      )
      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({ error: "שגיאה בשמירת שורות" }))
        throw new Error((err as { error: string }).error)
      }

      setSaving(false)
      setCalculating(true)

      // Step 3: Trigger waterfall calculation
      const calcRes = await fetch(
        `/api/erp/subcontractor-contracts/${contractId}/bills/${billId}/calculate`,
        { method: "POST" }
      )
      if (!calcRes.ok) {
        const err = await calcRes.json().catch(() => ({ error: "שגיאה בחישוב מפל מים" }))
        throw new Error((err as { error: string }).error)
      }
      const calcData = await calcRes.json() as {
        waterfall: {
          cumulative_executed: number
          escalation: number
          retention: number
          insurance: number
          advance_recovery: number
          rmo_total: number
          previous_billed: number
          amount_to_pay: number
          vat: number
          grand_total: number
          is_final: boolean
          computed_at: string
        }
      }

      const wf = calcData.waterfall
      setWaterfall({
        billId: billId,
        cumulativeExecuted: Number(wf.cumulative_executed ?? 0),
        escalation: Number(wf.escalation ?? 0),
        retention: Number(wf.retention ?? 0),
        insurance: Number(wf.insurance ?? 0),
        advanceRecovery: Number(wf.advance_recovery ?? 0),
        rmoTotal: Number(wf.rmo_total ?? 0),
        previousBilled: Number(wf.previous_billed ?? 0),
        amountToPay: Number(wf.amount_to_pay ?? 0),
        vat: Number(wf.vat ?? 0),
        grandTotal: Number(wf.grand_total ?? 0),
        isFinal: Boolean(wf.is_final),
        computedAt: wf.computed_at ?? new Date().toISOString(),
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

  // ── Submit bill ──────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!savedBillId) return
    setSaving(true)
    try {
      const res = await fetch(
        `/api/erp/subcontractor-contracts/${contractId}/bills/${savedBillId}`,
        {
          method: "PATCH",
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

  // ── Done screen ────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div
        className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center"
        dir="rtl"
      >
        <CheckCircle2 className="size-12 text-emerald-500" />
        <h2 className="text-xl font-semibold">החשבון הוגש בהצלחה</h2>
        {waterfall && (
          <p className="text-muted-foreground">
            סה&quot;כ לתשלום:{" "}
            <span className="font-semibold text-foreground">
              {ils(waterfall.grandTotal)}
            </span>
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
                  `/marker-ofek/contracts/${contractId}/bills/${savedBillId}`
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

  // ── Main layout ────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0" dir="rtl">
      {/* Header bar */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div>
            <h1 className="text-base font-semibold leading-tight">
              חשבון חלקי חדש — {contract.contractNumber}
            </h1>
            <p className="text-xs text-muted-foreground">
              הזנת אחוזי ביצוע וחישוב מפל מים
            </p>
          </div>

          <div className="flex items-center gap-2">
            {step === "review_waterfall" && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setWaterfall(null)
                  setStep("enter_lines")
                }}
              >
                ← ערוך שורות
              </Button>
            )}

            {step === "enter_lines" && (
              <Button
                size="sm"
                disabled={busy || totalSubmitted === 0}
                onClick={handleSaveAndCalculate}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Calculator className="size-4" />
                )}
                {saving ? "שומר…" : calculating ? "מחשב…" : "שמור וחשב"}
              </Button>
            )}

            {step === "review_waterfall" && (
              <Button
                size="sm"
                disabled={busy}
                onClick={handleSubmit}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileText className="size-4" />
                )}
                הגש חשבון
              </Button>
            )}
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex gap-0 border-t border-border">
          <StepTab
            n={1}
            label="הזנת ביצוע"
            active={step === "enter_lines"}
            done={step === "review_waterfall"}
          />
          <StepTab
            n={2}
            label="סקירת מפל מים"
            active={step === "review_waterfall"}
            done={false}
          />
        </div>
      </div>

      {/* Body */}
      <div className="grid flex-1 grid-cols-1 gap-6 overflow-auto p-6 lg:grid-cols-[1fr_300px]">
        {/* Left: inputs + spreadsheet */}
        <div className="flex flex-col gap-5 min-w-0">
          {/* Bill meta */}
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="exec-month" className="text-xs">
                  חודש ביצוע *
                </Label>
                <Input
                  id="exec-month"
                  type="month"
                  value={executionMonth}
                  onChange={(e) => setExecutionMonth(e.target.value)}
                  disabled={step !== "enter_lines" || !!savedBillId}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bill-date" className="text-xs">
                  תאריך חשבון
                </Label>
                <Input
                  id="bill-date"
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  disabled={step !== "enter_lines" || !!savedBillId}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vat-pct" className="text-xs">
                  מע&quot;מ %
                </Label>
                <Input
                  id="vat-pct"
                  type="number"
                  min={0}
                  max={100}
                  value={vatPct}
                  onChange={(e) => setVatPct(Number(e.target.value))}
                  disabled={step !== "enter_lines" || !!savedBillId}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch
                  id="is-final"
                  checked={isFinal}
                  onCheckedChange={setIsFinal}
                  disabled={step !== "enter_lines"}
                />
                <Label htmlFor="is-final" className="text-xs leading-tight">
                  חשבון סופי
                  <span className="block text-[10px] text-muted-foreground">
                    מפסיק מקדמה + שחרור עכבון
                  </span>
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* RMO hint */}
          {step === "review_waterfall" && waterfall && waterfall.rmoTotal > 0 && (
            <Alert>
              <RefreshCw className="size-4" />
              <AlertTitle>קיזוז חומר גלם זוהה</AlertTitle>
              <AlertDescription>
                {ils(waterfall.rmoTotal)} נוכה אוטומטית. לחץ &quot;חשב מחדש קיזוזי חו&quot;ג&quot; אחרי שמוסיפים הזמנות חדשות.
              </AlertDescription>
            </Alert>
          )}

          {/* BOQ Spreadsheet */}
          <Card className="overflow-hidden">
            <CardHeader className="border-b py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">כתב כמויות — ביצוע מצטבר</CardTitle>
                <Badge variant="secondary" className="tabular-nums">
                  {ils(totalSubmitted)}
                </Badge>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs [&>th]:h-8 [&>th]:py-1 [&>th]:font-medium [&>th]:text-muted-foreground">
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead className="min-w-[180px]">תיאור</TableHead>
                    <TableHead className="w-16 text-center">יח׳</TableHead>
                    <TableHead className="w-24 text-left">כמות</TableHead>
                    <TableHead className="w-28 text-left">מחיר ליחידה</TableHead>
                    <TableHead className="w-28 text-left">סה״כ חוזה</TableHead>
                    <TableHead className="w-28 text-center bg-amber-50/50 dark:bg-amber-950/20">
                      % מצטבר
                    </TableHead>
                    <TableHead className="w-32 text-left bg-amber-50/50 dark:bg-amber-950/20">
                      סכום מצטבר
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boqLines.map((line) => {
                    const entry = entries.get(line.id) ?? {
                      boqLineId: line.id,
                      cumulativePct: 0,
                      cumulativeAmount: 0,
                      submittedAmount: 0,
                    }
                    const isEditable = step === "enter_lines"

                    return (
                      <TableRow
                        key={line.id}
                        className="text-sm [&>td]:py-1 [&>td]:h-9"
                      >
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {line.lineNo}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <p className="truncate" title={line.description}>
                            {line.description}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {line.sectionCode}
                          </p>
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {line.uom}
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">
                          {line.quantity.toLocaleString("he-IL")}
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">
                          {ils(line.unitPrice)}
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">
                          {ils(line.totalLinePrice)}
                        </TableCell>
                        {/* Editable cumulative % */}
                        <TableCell className="bg-amber-50/50 dark:bg-amber-950/20 px-2">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              value={entry.cumulativePct}
                              onChange={(e) => {
                                const val = Math.min(
                                  100,
                                  Math.max(0, parseFloat(e.target.value) || 0)
                                )
                                setPct(line.id, val)
                              }}
                              disabled={!isEditable}
                              className={cn(
                                "h-7 w-full border-0 bg-transparent text-center text-sm tabular-nums focus-visible:ring-1",
                                !isEditable && "cursor-not-allowed opacity-60"
                              )}
                            />
                            <span className="shrink-0 text-xs text-muted-foreground">%</span>
                          </div>
                        </TableCell>
                        {/* Derived amount */}
                        <TableCell className="bg-amber-50/50 dark:bg-amber-950/20 tabular-nums text-sm font-medium">
                          {entry.cumulativeAmount > 0
                            ? ils(entry.cumulativeAmount)
                            : "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>

        {/* Right: waterfall sidebar */}
        <WaterfallCard
          contract={{ ...contract, vatPct }}
          lines={lineEntriesArray}
          result={waterfall}
          loading={calculating}
        />
      </div>
    </div>
  )
}

// ─── Step tab ─────────────────────────────────────────────────────────────────

function StepTab({
  n,
  label,
  active,
  done,
}: {
  n: number
  label: string
  active: boolean
  done: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-xs border-b-2 transition-colors",
        active
          ? "border-primary text-primary font-medium"
          : done
          ? "border-emerald-500 text-emerald-600"
          : "border-transparent text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
          active
            ? "bg-primary text-primary-foreground"
            : done
            ? "bg-emerald-500 text-white"
            : "bg-muted text-muted-foreground"
        )}
      >
        {done ? <CheckCircle2 className="size-3" /> : n}
      </span>
      {label}
    </div>
  )
}
