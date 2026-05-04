"use client"

/**
 * PoLineEditDialog — Phase B''' (Inline line editing)
 * ----------------------------------------------------
 * Dialog לעריכת שורת PO בודדת. נפתח מתוך ה-LinesTab של מסך הפרט.
 *
 *   - מוצג רק כאשר ה-PO ב-DRAFT (`canEdit=true`). אחרת — הכפתור מוסתר.
 *   - PATCH ל-/api/procurement/orders/{poId}/lines/{lineId}, diff-only
 *     payload (רק שדות שהשתנו). null = "נקה את הערך"; undefined = "אל תיגע".
 *   - הצגת total_price מחושב בזמן אמת בתוך ה-dialog (UI hint; ה-DB
 *     הוא source of truth ויחשב אותו מחדש כ-generated column).
 *   - Toast של 400 (validation) / 409 (status guard / budget overrun) /
 *     500 — עם הודעות בעברית מהשרת.
 *
 * שדות לא-עריכים (project, budget, item) דורשים flow ייעודי של
 * cancel + recreate; אין לחשוף אותם כאן.
 */

import * as React from "react"
import { Pencil, Save, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { masterDataFetch } from "@/lib/erp/master-data-browser"

// ---------------------------------------------------------------------------
// Public input — מצומצם ל-fields שה-dialog זקוק להם בפועל. הקריאות
// המקוריות ב-LinesTab עוברות את ProcurementOrderDetailLineDto, וה-caller
// יבחר את התת-קבוצה.
// ---------------------------------------------------------------------------

export type EditableLine = {
  id: string
  description: string
  quantity: number
  unitPrice: number
  discountPct: number
  supplyDate: string | null
  uom: string | null
  supplierSku: string | null
  supplierSkuDescription: string | null
  manufacturerName: string | null
  lineNotes: string | null
}

type FormState = {
  description: string
  quantity: string
  unitPrice: string
  discountPct: string
  supplyDate: string
  uom: string
  supplierSku: string
  supplierSkuDescription: string
  manufacturerName: string
  lineNotes: string
}

function formFromLine(line: EditableLine): FormState {
  return {
    description: line.description ?? "",
    quantity: String(line.quantity ?? 0),
    unitPrice: String(line.unitPrice ?? 0),
    discountPct: String(line.discountPct ?? 0),
    supplyDate: line.supplyDate ? line.supplyDate.slice(0, 10) : "",
    uom: line.uom ?? "",
    supplierSku: line.supplierSku ?? "",
    supplierSkuDescription: line.supplierSkuDescription ?? "",
    manufacturerName: line.manufacturerName ?? "",
    lineNotes: line.lineNotes ?? "",
  }
}

/**
 * בנה patch מינימלי. החוקים:
 *   - שדה מספרי שלא השתנה (אחרי normalization) → לא נכלל.
 *   - שדה מחרוזת optional ריק → null (מחיקת ערך).
 *   - שדה description ריק → לא נכלל (יתפוס בoolידציה).
 */
function buildLinePatch(
  form: FormState,
  base: EditableLine
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  const newDesc = form.description.trim()
  if (newDesc && newDesc !== base.description) patch.description = newDesc

  const newQty = Number(form.quantity)
  if (!Number.isNaN(newQty) && newQty !== base.quantity) patch.quantity = newQty

  const newPrice = Number(form.unitPrice)
  if (!Number.isNaN(newPrice) && newPrice !== base.unitPrice)
    patch.unitPrice = newPrice

  const newDisc = Number(form.discountPct)
  if (!Number.isNaN(newDisc) && newDisc !== base.discountPct)
    patch.discountPct = newDisc

  const baseSupplyDate = base.supplyDate ? base.supplyDate.slice(0, 10) : ""
  if (form.supplyDate !== baseSupplyDate) {
    patch.supplyDate = form.supplyDate || null
  }

  // השוואת string-or-null שדות
  const stringFields: Array<
    [keyof FormState, keyof EditableLine, "uom" | "supplierSku" | "supplierSkuDescription" | "manufacturerName" | "lineNotes"]
  > = [
    ["uom", "uom", "uom"],
    ["supplierSku", "supplierSku", "supplierSku"],
    ["supplierSkuDescription", "supplierSkuDescription", "supplierSkuDescription"],
    ["manufacturerName", "manufacturerName", "manufacturerName"],
    ["lineNotes", "lineNotes", "lineNotes"],
  ]
  for (const [formKey, baseKey, payloadKey] of stringFields) {
    const formVal = (form[formKey] ?? "").trim()
    const baseVal = (base[baseKey] as string | null) ?? ""
    if (formVal !== baseVal) {
      patch[payloadKey] = formVal === "" ? null : formVal
    }
  }

  return patch
}

const numberFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PoLineEditDialog({
  poId,
  line,
  currency,
  canEdit,
  onChanged,
}: {
  poId: string
  line: EditableLine
  currency: string
  /** רק כאשר ה-PO ב-DRAFT. הוסיים/Lock למעלה ב-LinesTab. */
  canEdit: boolean
  onChanged: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(() => formFromLine(line))
  const [saving, setSaving] = React.useState(false)

  // Reset הטופס בכל פתיחה (מבטיח שה-form לא יישא ערכים stale).
  React.useEffect(() => {
    if (open) setForm(formFromLine(line))
  }, [open, line])

  if (!canEdit) return null

  const patch = buildLinePatch(form, line)
  const dirty = Object.keys(patch).length > 0

  const previewQty = Number(form.quantity)
  const previewPrice = Number(form.unitPrice)
  const previewTotal =
    !Number.isNaN(previewQty) && !Number.isNaN(previewPrice)
      ? previewQty * previewPrice
      : line.unitPrice * line.quantity

  const handleSave = async () => {
    if (!form.description.trim()) {
      toast.error("תיאור השורה חובה")
      return
    }
    if (Number.isNaN(previewQty) || previewQty < 0) {
      toast.error("כמות לא תקינה")
      return
    }
    if (Number.isNaN(previewPrice) || previewPrice < 0) {
      toast.error("מחיר יחידה לא תקין")
      return
    }
    if (!dirty) {
      toast.info("אין שינויים לשמירה")
      setOpen(false)
      return
    }
    setSaving(true)
    try {
      await masterDataFetch(
        `/api/procurement/orders/${encodeURIComponent(poId)}/lines/${encodeURIComponent(line.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      )
      toast.success("השורה עודכנה")
      setOpen(false)
      onChanged()
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "עדכון השורה נכשל"
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={(props) => (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="size-7 p-0"
            title="עריכת שורה"
            {...props}
          >
            <Pencil className="size-3.5" aria-hidden />
            <span className="sr-only">עריכת שורה</span>
          </Button>
        )}
      />
      <DialogContent className="sm:max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>עריכת שורת ההזמנה</DialogTitle>
          <DialogDescription>
            ניתן לערוך כמות, מחיר, הנחה, תאריך אספקה ושדות תיאור-ספק.
            שינויים בפריט / תקציב / פרויקט דורשים ביטול ויצירת שורה חדשה.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <FieldGroup label="תיאור" fullWidth>
            <Input
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              maxLength={512}
              dir="rtl"
            />
          </FieldGroup>

          <FieldGroup label="כמות">
            <Input
              type="number"
              min={0}
              step="0.001"
              value={form.quantity}
              onChange={(e) =>
                setForm((f) => ({ ...f, quantity: e.target.value }))
              }
              dir="ltr"
            />
          </FieldGroup>

          <FieldGroup label={`מחיר יחידה (${currency})`}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.unitPrice}
              onChange={(e) =>
                setForm((f) => ({ ...f, unitPrice: e.target.value }))
              }
              dir="ltr"
            />
          </FieldGroup>

          <FieldGroup label="הנחה (%)">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.discountPct}
              onChange={(e) =>
                setForm((f) => ({ ...f, discountPct: e.target.value }))
              }
              dir="ltr"
            />
          </FieldGroup>

          <FieldGroup label="תאריך אספקה">
            <Input
              type="date"
              value={form.supplyDate}
              onChange={(e) =>
                setForm((f) => ({ ...f, supplyDate: e.target.value }))
              }
              dir="ltr"
            />
          </FieldGroup>

          <FieldGroup label="יחידת מידה (UoM)">
            <Input
              value={form.uom}
              onChange={(e) =>
                setForm((f) => ({ ...f, uom: e.target.value }))
              }
              maxLength={32}
              dir="rtl"
              placeholder="יחידה / ק&quot;ג / מטר…"
            />
          </FieldGroup>

          <FieldGroup label='מק"ט ספק'>
            <Input
              value={form.supplierSku}
              onChange={(e) =>
                setForm((f) => ({ ...f, supplierSku: e.target.value }))
              }
              maxLength={64}
              dir="ltr"
              className="font-mono"
            />
          </FieldGroup>

          <FieldGroup label="תיאור הספק">
            <Input
              value={form.supplierSkuDescription}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  supplierSkuDescription: e.target.value,
                }))
              }
              maxLength={256}
              dir="rtl"
            />
          </FieldGroup>

          <FieldGroup label="יצרן" fullWidth>
            <Input
              value={form.manufacturerName}
              onChange={(e) =>
                setForm((f) => ({ ...f, manufacturerName: e.target.value }))
              }
              maxLength={128}
              dir="rtl"
            />
          </FieldGroup>

          <FieldGroup label="הערות לשורה" fullWidth>
            <Textarea
              value={form.lineNotes}
              onChange={(e) =>
                setForm((f) => ({ ...f, lineNotes: e.target.value }))
              }
              rows={3}
              dir="rtl"
            />
          </FieldGroup>
        </div>

        {/* Total preview — מחושב לקליינט בלבד; ה-DB יחשב מחדש */}
        <div className="mt-2 flex items-center justify-between rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">סה&quot;כ שורה (תצוגה מקדימה)</span>
          <span className="font-mono font-semibold tabular-nums">
            {numberFormatter.format(previewTotal)} {currency}
          </span>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose
            render={(props) => (
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                className="gap-1.5"
                {...props}
              >
                <X className="size-4" aria-hidden />
                ביטול
              </Button>
            )}
          />
          <Button
            type="button"
            disabled={saving || !dirty}
            onClick={() => void handleSave()}
            className="gap-1.5"
          >
            <Save className="size-4" aria-hidden />
            {saving ? "שומר…" : "שמירה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FieldGroup({
  label,
  children,
  fullWidth,
}: {
  label: string
  children: React.ReactNode
  fullWidth?: boolean
}) {
  return (
    <div className={fullWidth ? "space-y-1 sm:col-span-2" : "space-y-1"}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
