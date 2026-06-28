"use client"

/**
 * LandedCostWizardDialog — Phase 13 UI
 *
 * A 3-step dialog wizard for creating and posting a Landed Cost document:
 *   Step 1 — Enter cost lines (type, amount, allocation method)
 *   Step 2 — Preview allocation table (auto-calculated after creation)
 *   Step 3 — Confirm posting → irreversible
 *
 * Usage:
 *   <LandedCostWizardDialog grId="..." grNumber="GR-001" trigger={<Button>הוסף עלויות נחיתה</Button>} />
 */

import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

// ─── Types ────────────────────────────────────────────────────────────────────

type CostType = "FREIGHT" | "CUSTOMS" | "INSURANCE" | "AGENT_FEE" | "OTHER"
type AllocMethod = "BY_VALUE" | "BY_QUANTITY"

const COST_TYPE_LABELS: Record<CostType, string> = {
  FREIGHT: "הובלה / משלוח",
  CUSTOMS: "מכס",
  INSURANCE: "ביטוח",
  AGENT_FEE: "עמלת סוכן",
  OTHER: "אחר",
}

const ALLOC_METHOD_LABELS: Record<AllocMethod, string> = {
  BY_VALUE: "לפי שווי שורה",
  BY_QUANTITY: "לפי כמות",
}

type CostLine = {
  cost_type: CostType
  description: string
  amount: string
  allocation_method: AllocMethod
}

type AllocationRow = {
  id: string
  gr_line_id: string
  item_id: string | null
  allocated_amount: number
  allocation_basis_value: number
}

type LandedCostDocument = {
  id: string
  total_amount: number
  erp_landed_cost_lines: Array<{ cost_type: string; amount: number }>
  erp_landed_cost_allocations: AllocationRow[]
}

type Props = {
  grId: string
  grNumber: string
  trigger: React.ReactNode
}

const emptyLine = (): CostLine => ({
  cost_type: "FREIGHT",
  description: "",
  amount: "",
  allocation_method: "BY_VALUE",
})

// ─── Component ────────────────────────────────────────────────────────────────

export function LandedCostWizardDialog({ grId, grNumber, trigger }: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [lines, setLines] = useState<CostLine[]>([emptyLine()])
  const [document, setDocument] = useState<LandedCostDocument | null>(null)
  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState(false)

  function reset() {
    setStep(1)
    setLines([emptyLine()])
    setDocument(null)
  }

  function openWizard() {
    reset()
    setOpen(true)
  }

  function setLine(i: number, k: keyof CostLine, v: string) {
    setLines((prev) => {
      const updated = [...prev]
      updated[i] = { ...updated[i], [k]: v }
      return updated
    })
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()])
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i))
  }

  // ── Step 1 → Step 2: create document + auto-allocate ─────────────────────

  async function createAndAllocate() {
    const validLines = lines.filter((l) => l.amount && Number(l.amount) > 0)
    if (!validLines.length) {
      toast.error("יש להזין לפחות עלות אחת עם סכום חיובי")
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/procurement/goods-receipt/${grId}/landed-costs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: validLines.map((l) => ({
            cost_type: l.cost_type,
            description: l.description || undefined,
            amount: Number(l.amount),
            allocation_method: l.allocation_method,
          })),
        }),
      })
      const json = (await res.json()) as { data?: LandedCostDocument; error?: string }
      if (!res.ok) {
        toast.error(json.error ?? "שגיאה ביצירת מסמך עלויות נחיתה")
        return
      }
      setDocument(json.data ?? null)
      setStep(2)
    } finally {
      setSaving(false)
    }
  }

  // ── Step 2 → Step 3: go to confirmation ───────────────────────────────────

  // ── Step 3: post ──────────────────────────────────────────────────────────

  async function handlePost() {
    if (!document) return
    setPosting(true)
    try {
      const res = await fetch(`/api/procurement/landed-costs/${document.id}/post`, {
        method: "POST",
      })
      const json = (await res.json()) as { data?: unknown; error?: string }
      if (!res.ok) {
        toast.error(json.error ?? "שגיאה ברישום עלויות נחיתה")
        return
      }
      toast.success("עלויות נחיתה נרשמו — עלות מלאי עודכנה")
      setOpen(false)
    } finally {
      setPosting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  const totalAmount = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0)
  const allocations = document?.erp_landed_cost_allocations ?? []

  return (
    <>
      <span onClick={openWizard} className="cursor-pointer">{trigger}</span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              עלויות נחיתה — {grNumber}
              <span className="ms-2 text-sm font-normal text-muted-foreground">
                שלב {step} מתוך 3
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* ── Step 1: Enter cost lines ─────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                הגדר את סוגי העלויות העקיפות לחלוקה על גבי פריטי הקבלה.
              </p>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_100px_130px_28px] gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">סוג עלות</Label>
                      <Select
                        value={l.cost_type}
                        onValueChange={(v) => setLine(i, "cost_type", v ?? "FREIGHT")}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(COST_TYPE_LABELS) as [CostType, string][]).map(
                            ([k, label]) => (
                              <SelectItem key={k} value={k}>
                                {label}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">תיאור (אופציונלי)</Label>
                      <Input
                        value={l.description}
                        onChange={(e) => setLine(i, "description", e.target.value)}
                        className="h-8 text-sm"
                        placeholder="לדוג׳ DHL מסין"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">סכום ₪</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.amount}
                        onChange={(e) => setLine(i, "amount", e.target.value)}
                        className="h-8 text-sm font-mono"
                        placeholder="0"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">שיטת הקצאה</Label>
                      <Select
                        value={l.allocation_method}
                        onValueChange={(v) => setLine(i, "allocation_method", v ?? "BY_VALUE")}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            Object.entries(ALLOC_METHOD_LABELS) as [AllocMethod, string][]
                          ).map(([k, label]) => (
                            <SelectItem key={k} value={k}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      disabled={lines.length === 1}
                      className="pb-0.5 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <Button size="sm" variant="outline" onClick={addLine} type="button">
                + הוסף שורה
              </Button>

              <div className="rounded-lg bg-muted px-3 py-2 text-sm font-medium">
                סה״כ עלויות: ₪{totalAmount.toLocaleString("he-IL", { minimumFractionDigits: 2 })}
              </div>
            </div>
          )}

          {/* ── Step 2: Preview allocations ──────────────────────────────── */}
          {step === 2 && document && (
            <div className="space-y-3 py-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">סה״כ: ₪{document.total_amount.toLocaleString("he-IL", { minimumFractionDigits: 2 })}</Badge>
                <p className="text-sm text-muted-foreground">
                  תצוגה מקדימה של חלוקת העלויות לשורות הקבלה.
                </p>
              </div>

              {allocations.length === 0 ? (
                <p className="text-sm text-amber-600">
                  לא נמצאו שורות קבלה לחלוקה — ודא שיש שורות קבלה בקבלה זו.
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">פריט</TableHead>
                        <TableHead className="text-right">בסיס הקצאה</TableHead>
                        <TableHead className="text-right">עלות מוקצת</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allocations.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs font-mono">
                            {a.item_id?.slice(0, 8) ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {Number(a.allocation_basis_value).toLocaleString("he-IL", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="font-mono font-medium text-emerald-700">
                            ₪{Number(a.allocated_amount).toLocaleString("he-IL", { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                לחץ &quot;המשך&quot; כדי לאשר ולרשום את עלויות הנחיתה. פעולה זו בלתי הפיכה.
              </p>
            </div>
          )}

          {/* ── Step 3: Confirm post ──────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <strong>אישור רישום סופי</strong>
                <p className="mt-1">
                  רישום עלויות הנחיתה יעדכן את עלות המלאי הסטנדרטית של הפריטים
                  שהתקבלו. פעולה זו <strong>בלתי הפיכה</strong>.
                </p>
                <p className="mt-1">
                  סה״כ עלות לרישום: ₪{(document?.total_amount ?? 0).toLocaleString("he-IL", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {step === 1 && (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  ביטול
                </Button>
                <Button onClick={() => void createAndAllocate()} disabled={saving}>
                  {saving ? "מחשב..." : "חשב הקצאה →"}
                </Button>
              </>
            )}
            {step === 2 && (
              <>
                <Button variant="outline" onClick={() => setStep(1)}>
                  ← חזרה
                </Button>
                <Button onClick={() => setStep(3)} disabled={allocations.length === 0}>
                  המשך לרישום →
                </Button>
              </>
            )}
            {step === 3 && (
              <>
                <Button variant="outline" onClick={() => setStep(2)}>
                  ← חזרה
                </Button>
                <Button
                  onClick={() => void handlePost()}
                  disabled={posting}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {posting ? "רושם..." : "✓ רשום עלויות נחיתה"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
