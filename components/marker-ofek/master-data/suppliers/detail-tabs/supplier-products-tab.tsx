"use client"

/**
 * Suppliers Master/Detail → Detail tab: מוצרים ומחירים (עריכה).
 *
 * Fetches from `/api/master-data/suppliers/[id]/items` (the canonical
 * `erp_md_supplier_items` bridge table). Supports inline row editing and
 * adding new product links via a dialog.
 */

import * as React from "react"
import { Check, Edit2, Loader2, Package, Plus, RefreshCcw, Star, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  MasterDetailTabEmpty,
  MasterDetailTabError,
  MasterDetailTabLoading,
} from "@/components/infrastructure/master-detail/master-detail-shell"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiFetch } from "@/lib/utils/api-client"
import { cn } from "@/lib/utils"
import type { SupplierItemDto } from "@/app/api/master-data/suppliers/[id]/items/route"

// ─────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────

type MasterItemLookup = {
  id: string
  itemNumber: string
  description: string
  unitOfMeasure: string
}

type EditValues = {
  supplierSku: string
  basePrice: string
  discountPercentage: string
  currency: string
  uom: string
  validFrom: string
  validTo: string
  isPreferred: boolean
}

type AddValues = EditValues & { itemId: string }

const EMPTY_ADD: AddValues = {
  itemId: "",
  supplierSku: "",
  basePrice: "0",
  discountPercentage: "0",
  currency: "ILS",
  uom: "",
  validFrom: "",
  validTo: "",
  isPreferred: false,
}

function toEdit(item: SupplierItemDto): EditValues {
  return {
    supplierSku: item.supplierSku ?? "",
    basePrice: String(item.basePrice),
    discountPercentage: String(item.discountPercentage),
    currency: item.currency,
    uom: item.uom ?? "",
    validFrom: item.validFrom ?? "",
    validTo: item.validTo ?? "",
    isPreferred: item.isPreferred,
  }
}

const itemSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  itemNumber: z.string().nullable(),
  itemDescription: z.string().nullable(),
  itemUom: z.string().nullable(),
  supplierSku: z.string().nullable(),
  manufacturerSku: z.string().nullable().optional(),
  manufacturerName: z.string().nullable().optional(),
  manufacturerFullName: z.string().nullable().optional(),
  leadTimeDays: z.number().nullable().optional(),
  basePrice: z.number(),
  netUnitPrice: z.number().nullable(),
  discountPercentage: z.number(),
  currency: z.string(),
  uom: z.string().nullable(),
  isPreferred: z.boolean(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
})

const itemsSchema = z.array(itemSchema)

async function fetchItems(supplierId: string): Promise<SupplierItemDto[]> {
  const res = await apiFetch(`/api/master-data/suppliers/${supplierId}/items`, { method: "GET" })
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(b?.error ?? `שגיאה ${res.status}`)
  }
  const body = (await res.json()) as { data?: unknown[] }
  return itemsSchema.parse(body.data ?? []) as SupplierItemDto[]
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function SupplierProductsTab({ supplierId }: { supplierId: string | null }) {
  const [items, setItems] = React.useState<SupplierItemDto[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editingValues, setEditingValues] = React.useState<EditValues | null>(null)
  const [savingId, setSavingId] = React.useState<string | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const [showAdd, setShowAdd] = React.useState(false)
  const [addValues, setAddValues] = React.useState<AddValues>(EMPTY_ADD)
  const [addSaving, setAddSaving] = React.useState(false)
  const [catalog, setCatalog] = React.useState<MasterItemLookup[]>([])
  const [catalogLoading, setCatalogLoading] = React.useState(false)

  // ── Load items ────────────────────────────────────────────────────────

  const load = React.useCallback((id: string) => {
    setLoading(true)
    setError(null)
    fetchItems(id)
      .then(setItems)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "טעינת מוצרים נכשלה")
        setItems([])
      })
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    if (!supplierId) return
    setEditingId(null)
    setEditingValues(null)
    load(supplierId)
  }, [supplierId, load])

  // ── Load catalog when dialog opens ───────────────────────────────────

  React.useEffect(() => {
    if (!showAdd) return
    if (catalog.length > 0) return
    setCatalogLoading(true)
    apiFetch("/api/erp/master-data/items", { method: "GET" })
      .then(async (res) => {
        const body = (await res.json()) as {
          data?: Array<{
            id: string
            item_number?: string
            description?: string
            unit_of_measure?: string
          }>
        }
        setCatalog(
          (body.data ?? []).map((r) => ({
            id: r.id,
            itemNumber: r.item_number ?? "",
            description: r.description ?? "",
            unitOfMeasure: r.unit_of_measure ?? "",
          })),
        )
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "טעינת קטלוג נכשלה")
      })
      .finally(() => setCatalogLoading(false))
  }, [showAdd, catalog.length])

  // ── Callbacks ─────────────────────────────────────────────────────────

  const handleSave = React.useCallback(
    async (itemId: string) => {
      if (!supplierId || !editingValues) return
      setSavingId(itemId)
      try {
        const res = await apiFetch(
          `/api/master-data/suppliers/${supplierId}/items/${itemId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              supplierSku: editingValues.supplierSku || null,
              basePrice: parseFloat(editingValues.basePrice) || 0,
              discountPercentage: parseFloat(editingValues.discountPercentage) || 0,
              currency: editingValues.currency.toUpperCase() || "ILS",
              uom: editingValues.uom || null,
              validFrom: editingValues.validFrom || null,
              validTo: editingValues.validTo || null,
              isPreferred: editingValues.isPreferred,
            }),
          },
        )
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(b?.error ?? `שגיאה ${res.status}`)
        }
        const b = (await res.json()) as { data?: SupplierItemDto }
        if (b.data) setItems((prev) => prev.map((it) => (it.id === itemId ? b.data! : it)))
        setEditingId(null)
        setEditingValues(null)
        toast.success("הפריט עודכן בהצלחה")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "עדכון פריט נכשל")
      } finally {
        setSavingId(null)
      }
    },
    [supplierId, editingValues],
  )

  const handleDelete = React.useCallback(
    async (itemId: string) => {
      if (!supplierId) return
      setDeletingId(itemId)
      try {
        const res = await apiFetch(
          `/api/master-data/suppliers/${supplierId}/items/${itemId}`,
          { method: "DELETE" },
        )
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(b?.error ?? `שגיאה ${res.status}`)
        }
        setItems((prev) => prev.filter((it) => it.id !== itemId))
        if (editingId === itemId) { setEditingId(null); setEditingValues(null) }
        toast.success("הפריט הוסר מהספק")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "מחיקת פריט נכשלה")
      } finally {
        setDeletingId(null)
      }
    },
    [supplierId, editingId],
  )

  const handleAdd = React.useCallback(async () => {
    if (!supplierId) return
    if (!addValues.itemId) { toast.error("יש לבחור פריט"); return }
    setAddSaving(true)
    try {
      const res = await apiFetch(`/api/master-data/suppliers/${supplierId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: addValues.itemId,
          supplierSku: addValues.supplierSku || null,
          basePrice: parseFloat(addValues.basePrice) || 0,
          discountPercentage: parseFloat(addValues.discountPercentage) || 0,
          currency: addValues.currency.toUpperCase() || "ILS",
          uom: addValues.uom || null,
          validFrom: addValues.validFrom || null,
          validTo: addValues.validTo || null,
          isPreferred: addValues.isPreferred,
        }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(b?.error ?? `שגיאה ${res.status}`)
      }
      const b = (await res.json()) as { data?: SupplierItemDto }
      if (b.data) setItems((prev) => [b.data!, ...prev])
      setShowAdd(false)
      setAddValues(EMPTY_ADD)
      toast.success("הפריט נוסף לספק בהצלחה")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "הוספת פריט נכשלה")
    } finally {
      setAddSaving(false)
    }
  }, [supplierId, addValues])

  // ── Render guards ─────────────────────────────────────────────────────

  if (!supplierId) {
    return <MasterDetailTabEmpty>בחר ספק במסך האב כדי לראות את מוצריו.</MasterDetailTabEmpty>
  }
  if (loading) return <MasterDetailTabLoading>טוען מוצרים…</MasterDetailTabLoading>
  if (error) return <MasterDetailTabError>{error}</MasterDetailTabError>

  // ── Table columns config ──────────────────────────────────────────────

  const ERP_INPUT = "h-7 rounded-md border border-input bg-background px-2 text-xs focus:ring-1 focus:ring-primary"

  return (
    <div className="flex h-full min-h-0 flex-col gap-0" dir="rtl">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <p className="text-sm font-medium text-foreground">
          מוצרים ומחירים
          {items.length > 0 && (
            <span className="ms-2 text-xs font-normal text-muted-foreground">{items.length} פריטים</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm" variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            disabled={loading}
            onClick={() => { if (supplierId) load(supplierId) }}
          >
            {loading
              ? <Loader2 className="size-3.5 animate-spin" aria-hidden />
              : <RefreshCcw className="size-3.5" aria-hidden />}
            רענן
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1 bg-[#00A76F] px-2 text-xs text-white hover:bg-[#029c67]"
            onClick={() => { setAddValues(EMPTY_ADD); setShowAdd(true) }}
          >
            <Plus className="size-3.5" aria-hidden />
            הוסף מוצר
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Package className="size-8 text-muted-foreground/40" aria-hidden />
          <p className="text-sm">לא הוגדרו מוצרים לספק זה</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-8" />
                <TableHead className="min-w-[6rem]">מק"ט</TableHead>
                <TableHead className="min-w-[14rem]">תאור</TableHead>
                <TableHead className="min-w-[7rem]">מק"ט ספק</TableHead>
                <TableHead className="min-w-[7rem]">מק"ט יצרן</TableHead>
                <TableHead className="min-w-[8rem]">יצרן</TableHead>
                <TableHead className="min-w-[5rem] text-center">א"ס (יום)</TableHead>
                <TableHead className="min-w-[6rem] text-end">מחיר בסיס</TableHead>
                <TableHead className="min-w-[5rem] text-end">הנחה %</TableHead>
                <TableHead className="min-w-[6rem] text-end">מחיר נטו</TableHead>
                <TableHead className="min-w-[4rem]">מטבע</TableHead>
                <TableHead className="min-w-[4rem]">י"מ</TableHead>
                <TableHead className="min-w-[6rem]">מ-</TableHead>
                <TableHead className="min-w-[6rem]">עד</TableHead>
                <TableHead className="w-[6rem] text-center">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isEditing = editingId === item.id
                const isSaving = savingId === item.id
                const isDeleting = deletingId === item.id

                return (
                  <TableRow
                    key={item.id}
                    className={cn(
                      "transition-colors",
                      isEditing && "bg-primary/5 dark:bg-primary/10",
                    )}
                  >
                    {/* Preferred star */}
                    <TableCell className="w-8 text-center">
                      {isEditing ? (
                        <input
                          type="checkbox"
                          title="מועדף"
                          checked={editingValues?.isPreferred ?? false}
                          onChange={(e) =>
                            setEditingValues((v) => v ? { ...v, isPreferred: e.target.checked } : v)
                          }
                          className="size-3.5 cursor-pointer rounded accent-primary"
                        />
                      ) : item.isPreferred ? (
                        <Star className="mx-auto size-3.5 fill-amber-400 text-amber-400" aria-label="מועדף" />
                      ) : null}
                    </TableCell>

                    {/* Item number (read-only) */}
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {item.itemNumber ?? "—"}
                    </TableCell>

                    {/* Description (read-only) */}
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {item.itemDescription ?? "—"}
                    </TableCell>

                    {/* Supplier SKU */}
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={editingValues?.supplierSku ?? ""}
                          onChange={(e) =>
                            setEditingValues((v) => v ? { ...v, supplierSku: e.target.value } : v)
                          }
                          className={cn(ERP_INPUT, "w-24")}
                          placeholder="SKU"
                          dir="ltr"
                        />
                      ) : (
                        <span className="font-mono text-xs">{item.supplierSku ?? "—"}</span>
                      )}
                    </TableCell>

                    {/* Manufacturer SKU (read-only display) */}
                    <TableCell>
                      <span className="font-mono text-xs">{item.manufacturerSku ?? "—"}</span>
                    </TableCell>

                    {/* Manufacturer name (read-only display) */}
                    <TableCell className="max-w-[120px] truncate text-xs text-muted-foreground">
                      {item.manufacturerName ?? "—"}
                    </TableCell>

                    {/* Lead time days (read-only display) */}
                    <TableCell className="text-center font-mono text-xs">
                      {item.leadTimeDays != null ? item.leadTimeDays : "—"}
                    </TableCell>

                    {/* Base price */}
                    <TableCell className="text-end">
                      {isEditing ? (
                        <Input
                          type="number" min="0" step="0.01"
                          value={editingValues?.basePrice ?? "0"}
                          onChange={(e) =>
                            setEditingValues((v) => v ? { ...v, basePrice: e.target.value } : v)
                          }
                          className={cn(ERP_INPUT, "w-24 text-end")}
                        />
                      ) : (
                        <span className="tabular-nums">{item.basePrice.toFixed(2)}</span>
                      )}
                    </TableCell>

                    {/* Discount */}
                    <TableCell className="text-end">
                      {isEditing ? (
                        <Input
                          type="number" min="0" max="100" step="0.1"
                          value={editingValues?.discountPercentage ?? "0"}
                          onChange={(e) =>
                            setEditingValues((v) => v ? { ...v, discountPercentage: e.target.value } : v)
                          }
                          className={cn(ERP_INPUT, "w-20 text-end")}
                        />
                      ) : (
                        <span className="tabular-nums">
                          {item.discountPercentage > 0 ? `${item.discountPercentage}%` : "—"}
                        </span>
                      )}
                    </TableCell>

                    {/* Net price (generated, read-only) */}
                    <TableCell className="text-end font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {item.netUnitPrice != null ? item.netUnitPrice.toFixed(4) : "—"}
                    </TableCell>

                    {/* Currency */}
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={editingValues?.currency ?? "ILS"}
                          onChange={(e) =>
                            setEditingValues((v) => v ? { ...v, currency: e.target.value.toUpperCase() } : v)
                          }
                          className={cn(ERP_INPUT, "w-14 font-mono uppercase")}
                          maxLength={3}
                        />
                      ) : (
                        <span className="font-mono text-xs">{item.currency}</span>
                      )}
                    </TableCell>

                    {/* UOM */}
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={editingValues?.uom ?? ""}
                          onChange={(e) =>
                            setEditingValues((v) => v ? { ...v, uom: e.target.value } : v)
                          }
                          className={cn(ERP_INPUT, "w-14")}
                          placeholder="יח'"
                        />
                      ) : (
                        <span className="text-xs">{item.uom ?? item.itemUom ?? "—"}</span>
                      )}
                    </TableCell>

                    {/* Valid from */}
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="date"
                          value={editingValues?.validFrom ?? ""}
                          onChange={(e) =>
                            setEditingValues((v) => v ? { ...v, validFrom: e.target.value } : v)
                          }
                          className={cn(ERP_INPUT, "w-32")}
                        />
                      ) : (
                        <span className="text-xs tabular-nums">{item.validFrom ?? "—"}</span>
                      )}
                    </TableCell>

                    {/* Valid to */}
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="date"
                          value={editingValues?.validTo ?? ""}
                          onChange={(e) =>
                            setEditingValues((v) => v ? { ...v, validTo: e.target.value } : v)
                          }
                          className={cn(ERP_INPUT, "w-32")}
                        />
                      ) : (
                        <span className="text-xs tabular-nums">{item.validTo ?? "—"}</span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        {isEditing ? (
                          <>
                            <Button
                              size="icon" variant="ghost"
                              className="size-6 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                              disabled={isSaving}
                              onClick={() => void handleSave(item.id)}
                              aria-label="שמור"
                            >
                              {isSaving
                                ? <Loader2 className="size-3 animate-spin" />
                                : <Check className="size-3" />}
                            </Button>
                            <Button
                              size="icon" variant="ghost"
                              className="size-6 text-muted-foreground hover:bg-muted"
                              disabled={isSaving}
                              onClick={() => { setEditingId(null); setEditingValues(null) }}
                              aria-label="בטל"
                            >
                              <X className="size-3" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon" variant="ghost"
                              className="size-6 text-muted-foreground hover:bg-muted"
                              disabled={!!editingId || isDeleting}
                              onClick={() => { setEditingId(item.id); setEditingValues(toEdit(item)) }}
                              aria-label="ערוך"
                            >
                              <Edit2 className="size-3" />
                            </Button>
                            <Button
                              size="icon" variant="ghost"
                              className="size-6 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"
                              disabled={!!editingId || isDeleting}
                              onClick={() => void handleDelete(item.id)}
                              aria-label="מחק"
                            >
                              {isDeleting
                                ? <Loader2 className="size-3 animate-spin" />
                                : <Trash2 className="size-3" />}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Add Product Dialog ─────────────────────────────────────────── */}
      <Dialog
        open={showAdd}
        onOpenChange={(open) => {
          if (!open) { setShowAdd(false); setAddValues(EMPTY_ADD) }
        }}
      >
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוסף מוצר לספק</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            {/* Item selector */}
            <div className="grid gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">פריט מקטלוג *</label>
              {catalogLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  טוען קטלוג…
                </div>
              ) : (
                <select
                  value={addValues.itemId}
                  onChange={(e) => setAddValues((v) => ({ ...v, itemId: e.target.value }))}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">— בחר פריט —</option>
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.itemNumber} · {c.description}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Supplier SKU */}
            <div className="grid gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">מק"ט ספק (אופציונלי)</label>
              <Input
                value={addValues.supplierSku}
                onChange={(e) => setAddValues((v) => ({ ...v, supplierSku: e.target.value }))}
                placeholder="xxxxxx"
                className="h-8 text-xs"
                dir="ltr"
              />
            </div>

            {/* Price row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">מחיר בסיס *</label>
                <Input
                  type="number" min="0" step="0.01"
                  value={addValues.basePrice}
                  onChange={(e) => setAddValues((v) => ({ ...v, basePrice: e.target.value }))}
                  className="h-8 text-end text-xs"
                />
              </div>
              <div className="grid gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">הנחה %</label>
                <Input
                  type="number" min="0" max="100" step="0.1"
                  value={addValues.discountPercentage}
                  onChange={(e) => setAddValues((v) => ({ ...v, discountPercentage: e.target.value }))}
                  className="h-8 text-end text-xs"
                />
              </div>
              <div className="grid gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">מטבע</label>
                <Input
                  value={addValues.currency}
                  onChange={(e) => setAddValues((v) => ({ ...v, currency: e.target.value.toUpperCase() }))}
                  maxLength={3}
                  className="h-8 font-mono uppercase text-xs"
                />
              </div>
            </div>

            {/* UOM + validity */}
            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">יחידת מידה</label>
                <Input
                  value={addValues.uom}
                  onChange={(e) => setAddValues((v) => ({ ...v, uom: e.target.value }))}
                  placeholder="יח'"
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">תוקף מ-</label>
                <Input
                  type="date"
                  value={addValues.validFrom}
                  onChange={(e) => setAddValues((v) => ({ ...v, validFrom: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">תוקף עד</label>
                <Input
                  type="date"
                  value={addValues.validTo}
                  onChange={(e) => setAddValues((v) => ({ ...v, validTo: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Is preferred */}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={addValues.isPreferred}
                onChange={(e) => setAddValues((v) => ({ ...v, isPreferred: e.target.checked }))}
                className="size-4 rounded accent-primary"
              />
              ספק מועדף לפריט זה
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowAdd(false); setAddValues(EMPTY_ADD) }}
              disabled={addSaving}
            >
              בטל
            </Button>
            <Button
              className="gap-1.5 bg-[#00A76F] text-white hover:bg-[#029c67]"
              onClick={() => void handleAdd()}
              disabled={addSaving || !addValues.itemId}
            >
              {addSaving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              הוסף מוצר
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
