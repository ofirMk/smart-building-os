"use client"

/**
 * Sprint T1 — Open RFQs from BOQ Dialog (MedaTech §7.3.2 G1).
 *
 * Multi-step dialog wizard:
 *   1. Sub-tender details — code + contract type.
 *   2. Pick suppliers — multi-select from the provided list.
 *   3. Pick BOQ rows — multi-select from the provided list.
 *   4. Review + execute.
 *
 * The host page is responsible for supplying the master-data lists
 * (`suppliers`, `boqLines`) — this component is intentionally
 * data-source-agnostic so it can plug into any tender screen.
 */

import { Loader2 } from "lucide-react"
import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  openRfqsFromBoqAction,
  type RfqContractType,
} from "@/lib/marker-ofek/tenders/t1-tender-engine-actions"
import { cn } from "@/lib/utils"

const CONTRACT_TYPE_LABELS: Record<RfqContractType, string> = {
  NEW_CONTRACT: "חוזה חדש",
  FRAME_PO: "הזמנת מסגרת",
  PRICE_LIST: "מחירון ספק",
  AD_HOC: "ad-hoc",
}

interface SupplierOption {
  id: string
  name: string
  agreementType?: RfqContractType | "NONE"
}

interface BoqLineOption {
  id: string
  description: string
  quantity: number
  itemNumber?: string
}

interface OpenRfqsFromBoqDialogProps {
  projectId: string
  planningVersionId: string
  suppliers: ReadonlyArray<SupplierOption>
  boqLines: ReadonlyArray<BoqLineOption>
  triggerLabel?: string
  triggerVariant?: "default" | "outline" | "secondary" | "ghost"
  onSuccess?: (rfqIds: string[]) => void
}

type Step = 1 | 2 | 3 | 4

export function OpenRfqsFromBoqDialog({
  projectId,
  planningVersionId,
  suppliers,
  boqLines,
  triggerLabel = "פתח בקשות הצעת מחיר מכתב כמויות",
  triggerVariant = "default",
  onSuccess,
}: OpenRfqsFromBoqDialogProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [subTenderCode, setSubTenderCode] = useState("")
  const [contractType, setContractType] = useState<RfqContractType>(
    "NEW_CONTRACT",
  )
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(
    new Set(),
  )
  const [selectedBoqLines, setSelectedBoqLines] = useState<Set<string>>(
    new Set(),
  )
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<
    | { kind: "ok"; rfqsCreated: number; linesCreated: number; cap: number }
    | { kind: "err"; message: string }
    | null
  >(null)

  const reset = () => {
    setStep(1)
    setSubTenderCode("")
    setContractType("NEW_CONTRACT")
    setSelectedSuppliers(new Set())
    setSelectedBoqLines(new Set())
    setResult(null)
  }

  const toggle = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  const canAdvance = (() => {
    if (step === 1) return subTenderCode.trim().length > 0
    if (step === 2) return selectedSuppliers.size > 0
    if (step === 3) return selectedBoqLines.size > 0
    return true
  })()

  const handleSubmit = () => {
    setResult(null)
    startTransition(async () => {
      const res = await openRfqsFromBoqAction({
        projectId,
        planningVersionId,
        subTenderCode: subTenderCode.trim(),
        contractType,
        supplierIds: Array.from(selectedSuppliers),
        boqLineIds: Array.from(selectedBoqLines),
      })
      if (res.ok) {
        setResult({
          kind: "ok",
          rfqsCreated: res.rfqsCreated,
          linesCreated: res.linesCreated,
          cap: res.cap,
        })
        onSuccess?.(res.rfqIds)
      } else {
        setResult({ kind: "err", message: res.error })
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (typeof next === "boolean") {
          setOpen(next)
          if (!next) reset()
        }
      }}
    >
      <DialogTrigger
        render={(props) => (
          <Button {...props} variant={triggerVariant} size="sm">
            {triggerLabel}
          </Button>
        )}
      />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>פתיחת בקשות הצעת מחיר מכתב כמויות</DialogTitle>
          <DialogDescription>
            שלב {step} מתוך 4 — {step === 1
              ? "פרטי תת המכרז"
              : step === 2
                ? "בחירת קבלני משנה"
                : step === 3
                  ? "בחירת שורות כתב כמויות"
                  : "סיכום ואישור"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sub-tender-code">קוד תת מכרז</Label>
              <Input
                id="sub-tender-code"
                value={subTenderCode}
                onChange={(e) => setSubTenderCode(e.target.value)}
                placeholder="למשל: ST-INST-01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contract-type">סוג חוזה עתידי</Label>
              <Select
                value={contractType}
                onValueChange={(next) => {
                  if (next) setContractType(next as RfqContractType)
                }}
              >
                <SelectTrigger id="contract-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(CONTRACT_TYPE_LABELS) as RfqContractType[]
                  ).map((key) => (
                    <SelectItem key={key} value={key}>
                      {CONTRACT_TYPE_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <ScrollArea className="h-72 rounded-md border">
            <ul className="divide-y">
              {suppliers.length === 0 ? (
                <li className="p-3 text-sm text-muted-foreground">
                  אין קבלני משנה זמינים
                </li>
              ) : null}
              {suppliers.map((s) => {
                const checked = selectedSuppliers.has(s.id)
                return (
                  <li key={s.id} className="flex items-center gap-3 p-3">
                    <Checkbox
                      id={`sup-${s.id}`}
                      checked={checked}
                      onCheckedChange={() =>
                        setSelectedSuppliers((prev) => toggle(prev, s.id))
                      }
                    />
                    <Label
                      htmlFor={`sup-${s.id}`}
                      className="flex flex-1 cursor-pointer items-center justify-between"
                    >
                      <span className="font-medium">{s.name}</span>
                      {s.agreementType ? (
                        <span className="text-[11px] text-muted-foreground">
                          {s.agreementType}
                        </span>
                      ) : null}
                    </Label>
                  </li>
                )
              })}
            </ul>
          </ScrollArea>
        ) : null}

        {step === 3 ? (
          <ScrollArea className="h-72 rounded-md border">
            <ul className="divide-y">
              {boqLines.length === 0 ? (
                <li className="p-3 text-sm text-muted-foreground">
                  אין שורות כתב כמויות זמינות
                </li>
              ) : null}
              {boqLines.map((b) => {
                const checked = selectedBoqLines.has(b.id)
                return (
                  <li key={b.id} className="flex items-center gap-3 p-3">
                    <Checkbox
                      id={`boq-${b.id}`}
                      checked={checked}
                      onCheckedChange={() =>
                        setSelectedBoqLines((prev) => toggle(prev, b.id))
                      }
                    />
                    <Label
                      htmlFor={`boq-${b.id}`}
                      className="flex flex-1 cursor-pointer items-center justify-between gap-3"
                    >
                      <span>
                        {b.itemNumber ? (
                          <span className="me-2 font-mono text-[11px] text-muted-foreground">
                            {b.itemNumber}
                          </span>
                        ) : null}
                        <span>{b.description}</span>
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        כמות: {b.quantity}
                      </span>
                    </Label>
                  </li>
                )
              })}
            </ul>
          </ScrollArea>
        ) : null}

        {step === 4 ? (
          <div className="space-y-3 rounded-md border p-4 text-sm">
            <Row label="קוד תת מכרז" value={subTenderCode} />
            <Row label="סוג חוזה" value={CONTRACT_TYPE_LABELS[contractType]} />
            <Row
              label="קבלני משנה נבחרים"
              value={`${selectedSuppliers.size} קבלנים`}
            />
            <Row
              label="שורות כתב כמויות נבחרות"
              value={`${selectedBoqLines.size} שורות`}
            />
            <Row
              label="צפי מספר בקשות"
              value={String(selectedSuppliers.size)}
            />
            {result?.kind === "ok" ? (
              <p
                className="rounded-md bg-emerald-50 p-2 font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                role="status"
              >
                נוצרו {result.rfqsCreated} בקשות עם {result.linesCreated} שורות
                סה&quot;כ (קצה NumOfNewPprof = {result.cap}).
              </p>
            ) : null}
            {result?.kind === "err" ? (
              <p
                className="rounded-md bg-rose-50 p-2 font-medium text-rose-700 dark:bg-rose-900/20 dark:text-rose-300"
                role="alert"
              >
                שגיאה: {result.message}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="flex flex-row-reverse gap-2">
          {step < 4 ? (
            <>
              <Button
                onClick={() => setStep((s) => Math.min(4, s + 1) as Step)}
                disabled={!canAdvance}
              >
                המשך
              </Button>
              {step > 1 ? (
                <Button
                  variant="outline"
                  onClick={() => setStep((s) => Math.max(1, s - 1) as Step)}
                >
                  חזרה
                </Button>
              ) : null}
            </>
          ) : (
            <>
              {result?.kind !== "ok" ? (
                <Button onClick={handleSubmit} disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="ms-1 h-4 w-4 animate-spin" />
                  ) : null}
                  בצע
                </Button>
              ) : (
                <Button onClick={() => setOpen(false)}>סגור</Button>
              )}
              {result?.kind !== "ok" ? (
                <Button
                  variant="outline"
                  onClick={() => setStep(3)}
                  disabled={isPending}
                >
                  חזרה
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3")}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
