"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, Loader2, Save } from "lucide-react"
import { z } from "zod"

import { FormStatusGuard, useFormStatusGuard } from "@/components/erp/shared/form-status-guard"
import {
  ERP_DENSE_INPUT_CLASS,
  ERP_DENSE_LABEL_CLASS,
} from "@/components/layout/DenseMasterDetailTemplate"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useEffectivePrice } from "@/lib/hooks/use-effective-price"
import { apiGet } from "@/lib/utils/api-client"
import type { ErpClientContractLine } from "@/types/erp"

type SupplierOption = { id: string; supplierNum: string; name: string }
type ItemOption = { id: string; itemNumber: string; description: string }

const supplierLookupSchema = z.array(
  z.object({
    id: z.string(),
    supplierNum: z.string(),
    name: z.string(),
  })
)
const itemLookupSchema = z.array(
  z.object({
    id: z.string(),
    itemNumber: z.string(),
    description: z.string(),
  })
)

export type LineEditorSubmitPayload = {
  description: string
  quantity: number
  unitPrice: number
  supplierId: string | null
  itemId: string | null
  requestManagerApproval: boolean
}

type ClientContractLineEditorProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  line: ErpClientContractLine | null
  suppliers: SupplierOption[]
  items: ItemOption[]
  defaultSupplierId?: string | null
  working: boolean
  onSubmit: (payload: LineEditorSubmitPayload) => Promise<void> | void
}

function money(value: number): string {
  return Number(value || 0).toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function ClientContractLineEditor({
  open,
  onOpenChange,
  line,
  suppliers,
  items,
  defaultSupplierId,
  working,
  onSubmit,
}: ClientContractLineEditorProps) {
  const [description, setDescription] = React.useState<string>(line?.description ?? "")
  const [quantity, setQuantity] = React.useState<number>(line?.quantity ?? 0)
  const [unitPrice, setUnitPrice] = React.useState<number>(line?.unitPrice ?? 0)
  const [supplierId, setSupplierId] = React.useState<string | null>(
    line?.supplierId ?? defaultSupplierId ?? null
  )
  const [itemId, setItemId] = React.useState<string | null>(line?.itemId ?? null)
  const [lookupSuppliers, setLookupSuppliers] = React.useState<SupplierOption[]>(suppliers)
  const [lookupItems, setLookupItems] = React.useState<ItemOption[]>(items)
  const [lookupLoading, setLookupLoading] = React.useState(false)
  const [lookupError, setLookupError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setDescription(line?.description ?? "")
    setQuantity(line?.quantity ?? 0)
    setUnitPrice(line?.unitPrice ?? 0)
    setSupplierId(line?.supplierId ?? defaultSupplierId ?? null)
    setItemId(line?.itemId ?? null)
  }, [open, line, defaultSupplierId])

  React.useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLookupLoading(true)
    setLookupError(null)
    void (async () => {
      try {
        const [nextSuppliers, nextItems] = await Promise.all([
          apiGet<SupplierOption[]>("/api/erp/master-data/suppliers", {
            schema: supplierLookupSchema,
            signal: controller.signal,
          }),
          apiGet<ItemOption[]>("/api/erp/master-data/items", {
            schema: itemLookupSchema,
            signal: controller.signal,
          }),
        ])
        if (controller.signal.aborted) return
        setLookupSuppliers(nextSuppliers)
        setLookupItems(nextItems)
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof Error && error.name === "AbortError") return
        setLookupError(error instanceof Error ? error.message : "טעינת נתוני ייחוס נכשלה")
        setLookupSuppliers(suppliers)
        setLookupItems(items)
      } finally {
        if (!controller.signal.aborted) setLookupLoading(false)
      }
    })()
    return () => controller.abort()
  }, [open, suppliers, items])

  // Debounce the quantity used for the RPC lookup so we don't refetch on
  // every keystroke.
  const [debouncedQuantity, setDebouncedQuantity] = React.useState<number>(quantity)
  React.useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuantity(quantity), 250)
    return () => window.clearTimeout(handle)
  }, [quantity])

  const {
    data: effective,
    loading: loadingPrice,
    error: priceError,
  } = useEffectivePrice({
    itemId,
    supplierId,
    quantity: debouncedQuantity,
  })

  const estimatedUnitCost = effective?.unitPrice ?? 0
  const hasCost = Boolean(itemId && supplierId && estimatedUnitCost > 0)
  const estimatedTotalCost = estimatedUnitCost * quantity
  const totalPrice = unitPrice * quantity
  const totalProfit = totalPrice - estimatedTotalCost
  const profitMarginPct =
    unitPrice > 0 && hasCost ? ((unitPrice - estimatedUnitCost) / unitPrice) * 100 : 0
  const marginBreach = hasCost && unitPrice > 0 && unitPrice < estimatedUnitCost
  const guard = useFormStatusGuard({
    isStale: lookupLoading || Boolean(lookupError),
    hasHighVariance: marginBreach,
    staleMessage: lookupError ?? "טעינת ספקים/פריטים עדיין מתבצעת.",
    highVarianceMessage: "זוהתה חריגת מחיר. נדרש אישור מנהל לפני שמירה.",
  })

  async function handleSubmit() {
    if (!guard.assertReady()) return
    await onSubmit({
      description: description.trim(),
      quantity: Number.isFinite(quantity) ? quantity : 0,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      supplierId,
      itemId,
      requestManagerApproval: marginBreach,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <Save className="size-4 text-slate-600" />
            {line ? `עריכת שורת BOQ #${line.lineNumber}` : "שורת BOQ חדשה"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-4">
            <FormStatusGuard
              isStale={lookupLoading || Boolean(lookupError)}
              hasHighVariance={marginBreach}
              staleMessage={lookupError ?? undefined}
            />
          </div>
          <div className="md:col-span-4">
            <label className={ERP_DENSE_LABEL_CLASS}>תיאור</label>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={ERP_DENSE_INPUT_CLASS}
              disabled={working}
            />
          </div>

          <div className="md:col-span-2">
            <label className={ERP_DENSE_LABEL_CLASS}>ספק (לחישוב עלות)</label>
            <Select
              value={supplierId ?? ""}
              onValueChange={(value) => setSupplierId(value === "" ? null : value)}
              disabled={working}
            >
              <SelectTrigger className={ERP_DENSE_INPUT_CLASS}>
                <SelectValue placeholder="ירושה מהחוזה" />
              </SelectTrigger>
              <SelectContent>
                {lookupSuppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    <span className="font-mono text-[10px] text-slate-500 me-2">
                      {supplier.supplierNum}
                    </span>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <label className={ERP_DENSE_LABEL_CLASS}>פריט (SKU)</label>
            <Select
              value={itemId ?? ""}
              onValueChange={(value) => setItemId(value === "" ? null : value)}
              disabled={working}
            >
              <SelectTrigger className={ERP_DENSE_INPUT_CLASS}>
                <SelectValue placeholder="בחר פריט" />
              </SelectTrigger>
              <SelectContent>
                {lookupItems.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <span className="font-mono text-[10px] text-slate-500 me-2">
                      {item.itemNumber}
                    </span>
                    {item.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={ERP_DENSE_LABEL_CLASS}>כמות</label>
            <Input
              type="number"
              step="0.001"
              value={quantity}
              onChange={(event) =>
                setQuantity(event.target.value === "" ? 0 : Number(event.target.value))
              }
              className={ERP_DENSE_INPUT_CLASS}
              disabled={working}
            />
          </div>

          <div>
            <label className={ERP_DENSE_LABEL_CLASS}>מחיר מכירה ליחידה</label>
            <Input
              type="number"
              step="0.01"
              value={unitPrice}
              onChange={(event) =>
                setUnitPrice(event.target.value === "" ? 0 : Number(event.target.value))
              }
              className={
                marginBreach
                  ? `${ERP_DENSE_INPUT_CLASS} border-rose-300 focus-visible:ring-rose-400`
                  : ERP_DENSE_INPUT_CLASS
              }
              disabled={working}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-card p-2 text-xs">
            <p className="text-[11px] text-slate-500">סה&quot;כ מכירה</p>
            <p className="font-mono font-semibold">{money(totalPrice)}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-card p-2 text-xs">
            <p className="text-[11px] text-slate-500">מחיר ליחידה לפי מחירון</p>
            <p className="font-mono font-semibold">
              {hasCost ? money(estimatedUnitCost) : "—"}
              {loadingPrice ? (
                <Loader2 className="ms-1 inline size-3 animate-spin text-slate-400" />
              ) : null}
            </p>
          </div>
        </div>

        <div className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-background p-2 text-xs">
            <p className="text-[11px] text-slate-500">עלות משוערת</p>
            <p className="font-mono font-semibold">{hasCost ? money(estimatedTotalCost) : "—"}</p>
          </div>
          <div
            className={
              marginBreach
                ? "rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs"
                : "rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-xs"
            }
          >
            <p
              className={
                marginBreach ? "text-[11px] text-rose-800" : "text-[11px] text-emerald-800"
              }
            >
              רווח צפוי
            </p>
            <p
              className={
                marginBreach
                  ? "font-mono font-semibold text-rose-800"
                  : "font-mono font-semibold text-emerald-800"
              }
            >
              {hasCost ? money(totalProfit) : "—"}
            </p>
          </div>
          <div
            className={
              marginBreach
                ? "rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs"
                : "rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-xs"
            }
          >
            <p
              className={
                marginBreach ? "text-[11px] text-rose-800" : "text-[11px] text-emerald-800"
              }
            >
              מרווח רווחיות %
            </p>
            <p
              className={
                marginBreach
                  ? "font-mono font-semibold text-rose-800"
                  : "font-mono font-semibold text-emerald-800"
              }
            >
              {hasCost ? `${profitMarginPct.toFixed(2)}%` : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-card p-2 text-xs">
            <p className="text-[11px] text-slate-500">מקור מחיר</p>
            <p className="font-mono font-semibold">{effective?.source ?? "—"}</p>
          </div>
        </div>

        {priceError ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
            {priceError}
          </p>
        ) : null}

        {marginBreach ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
            <AlertTriangle className="mt-0.5 size-4" />
            <div>
              <p className="font-semibold">חריגת רווחיות - מחיר המכירה נמוך מעלות הספק</p>
              <p className="text-[11px] text-rose-700">
                שמירת השורה תדרוש אישור מנהל (Price Override).
              </p>
            </div>
          </div>
        ) : hasCost ? (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
            <CheckCircle2 className="mt-0.5 size-4" />
            <p>מחיר המכירה שומר על מרווח רווחיות חיובי.</p>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={working} onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button type="button" disabled={working || guard.blocked} onClick={() => void handleSubmit()}>
            {working ? <Loader2 className="me-1 size-4 animate-spin" /> : <Save className="me-1 size-4" />}
            שמירה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
