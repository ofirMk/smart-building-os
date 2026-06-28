"use client"

/**
 * PoAddLineDialog — הוסף שורה לפירוט הזמנת רכש
 *
 * Flow:
 *   1. חיפוש ובחירת פריט ממאגר מוצרים (erp_md_items) — לחצן F6 / search
 *   2. בחירת פריט → מסך בן ספקים עם מחיר נמוך ראשון (ItemSuppliersSheet)
 *   3. לחיצה על "בחר" בצד ספק → ממלאת מחיר + מק"ט ספק + יחידת מידה אוטומטית
 *   4. "הוסף שורה" → POST /api/procurement/orders/[id]/lines
 *   5. onChanged() → refetch ה-PO
 *
 * ניתן גם להוסיף שורה ידנית ללא קישור לפריט.
 */

import * as React from "react"
import { PackagePlus, Search, TrendingDown, X } from "lucide-react"
import { toast } from "sonner"

import { ItemSuppliersSheet, type SelectedPrice } from "@/components/marker-ofek/procurement/item-suppliers-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"
import { masterDataFetch } from "@/lib/erp/master-data-browser"

// ── Types ──────────────────────────────────────────────────────────────────

type ItemSearchResult = {
  id: string
  sku: string
  itemNumber: string
  description: string
  foreignDescription: string | null
  uom: string | null
  resolvedUnitPrice: number | null
  resolvedCurrency: string | null
  preferredUnitPrice: number | null
  cheapestUnitPrice: number | null
  activeSupplierCount: number
}

type FormState = {
  description: string
  quantity: string
  unitPrice: string
  discountPct: string
  uom: string
  supplierSku: string
  supplierSkuDescription: string
  manufacturerName: string
  supplyDate: string
  lineNotes: string
}

const DEFAULT_FORM: FormState = {
  description: "",
  quantity: "1",
  unitPrice: "0",
  discountPct: "0",
  uom: "",
  supplierSku: "",
  supplierSkuDescription: "",
  manufacturerName: "",
  supplyDate: "",
  lineNotes: "",
}

// ── Component ──────────────────────────────────────────────────────────────

export function PoAddLineDialog({
  poId,
  onChanged,
}: {
  poId: string
  onChanged: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving] = React.useState(false)

  // Selected master item
  const [selectedItem, setSelectedItem] = React.useState<ItemSearchResult | null>(null)

  // Item search
  const [searchQuery, setSearchQuery] = React.useState("")
  const [searchResults, setSearchResults] = React.useState<ItemSearchResult[]>([])
  const [searching, setSearching] = React.useState(false)
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Item search (debounced 300ms) ────────────────────────────────────────
  React.useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await masterDataFetch<ItemSearchResult[]>(
          `/api/master-data/items?q=${encodeURIComponent(searchQuery)}&limit=10`
        )
        setSearchResults(data)
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery])

  // ── Select item from search ──────────────────────────────────────────────
  const handleSelectItem = React.useCallback((item: ItemSearchResult) => {
    setSelectedItem(item)
    setSearchQuery("")
    setSearchResults([])
    setForm((prev) => ({
      ...prev,
      description: item.description,
      uom: item.uom ?? prev.uom,
      unitPrice: item.resolvedUnitPrice != null
        ? String(item.resolvedUnitPrice)
        : prev.unitPrice,
    }))
  }, [])

  // ── Select price from supplier sheet ────────────────────────────────────
  const handleSelectPrice = React.useCallback((selected: SelectedPrice) => {
    setForm((prev) => ({
      ...prev,
      unitPrice: String(selected.unitPrice),
      uom: selected.uom ?? prev.uom,
      supplierSku: selected.supplierSku || prev.supplierSku,
      discountPct: selected.discountPercentage != null
        ? String(selected.discountPercentage)
        : prev.discountPct,
    }))
    toast.success(
      `מחיר ${new Intl.NumberFormat("he-IL", { style: "currency", currency: selected.currency ?? "ILS" }).format(selected.unitPrice)} נבחר מ-${selected.supplierName ?? "ספק"}`
    )
  }, [])

  // ── Clear selected item ──────────────────────────────────────────────────
  const clearSelectedItem = React.useCallback(() => {
    setSelectedItem(null)
    setForm(DEFAULT_FORM)
  }, [])

  // ── Reset on open/close ──────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) {
      setForm(DEFAULT_FORM)
      setSelectedItem(null)
      setSearchQuery("")
      setSearchResults([])
    }
  }, [open])

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const qty = parseFloat(form.quantity)
    const price = parseFloat(form.unitPrice)
    const disc = parseFloat(form.discountPct || "0")

    if (isNaN(qty) || qty <= 0) {
      toast.error("כמות חייבת להיות חיובית")
      return
    }
    if (isNaN(price) || price < 0) {
      toast.error("מחיר לא תקין")
      return
    }
    if (!form.description.trim()) {
      toast.error("תיאור חובה")
      return
    }

    setSaving(true)
    try {
      await masterDataFetch(
        `/api/procurement/orders/${encodeURIComponent(poId)}/lines`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: form.description.trim(),
            quantity: qty,
            unitPrice: price,
            discountPct: isNaN(disc) ? 0 : disc,
            uom: form.uom.trim() || null,
            supplierSku: form.supplierSku.trim() || null,
            supplierSkuDescription: form.supplierSkuDescription.trim() || null,
            manufacturerName: form.manufacturerName.trim() || null,
            supplyDate: form.supplyDate || null,
            lineNotes: form.lineNotes.trim() || null,
            itemId: selectedItem?.id ?? null,
            priceSource: selectedItem ? "PRICELIST" : "MANUAL",
          }),
        }
      )
      toast.success("שורה נוספה בהצלחה")
      setOpen(false)
      onChanged()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "הוספת שורה נכשלה"
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof FormState) => ({
    value: form[key],
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => setForm((prev) => ({ ...prev, [key]: e.target.value })),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button type="button" size="sm" variant="outline" className="gap-1.5">
          <PackagePlus className="size-4" aria-hidden />
          הוסף שורה
        </Button>
      </DialogTrigger>

      <DialogContent
        dir="rtl"
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>הוסף שורה לפירוט ההזמנה</DialogTitle>
          <DialogDescription className="text-xs">
            חפש פריט ממאגר המוצרים וראה את כל הספקים — הזול ביותר בראש.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">

          {/* ── Item search ────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">מוצר ממאגר (לא חובה)</Label>

            {selectedItem ? (
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">
                      {selectedItem.sku || selectedItem.itemNumber}
                    </span>
                    {selectedItem.activeSupplierCount > 0 ? (
                      <Badge
                        variant="outline"
                        className="border-blue-300/50 bg-blue-50 text-blue-700 text-[9px]"
                      >
                        {selectedItem.activeSupplierCount} ספקים
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedItem.description}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {selectedItem.id ? (
                    <ItemSuppliersSheet
                      itemId={selectedItem.id}
                      itemName={selectedItem.description}
                      onSelectPrice={handleSelectPrice}
                      trigger={
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 gap-1 px-2 text-xs text-blue-700"
                        >
                          <TrendingDown className="size-3" aria-hidden />
                          ספקים
                        </Button>
                      }
                    />
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={clearSelectedItem}
                    aria-label="נקה בחירה"
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute right-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
                <Input
                  placeholder="חפש לפי שם / מק&quot;ט…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-9 text-sm"
                />
                {searchResults.length > 0 ? (
                  <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-accent"
                        onClick={() => handleSelectItem(item)}
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-semibold text-xs">
                            {item.sku || item.itemNumber}
                          </span>{" "}
                          <span className="truncate text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        </div>
                        {item.cheapestUnitPrice != null ? (
                          <span className="ml-3 shrink-0 text-xs font-medium text-emerald-700">
                            {new Intl.NumberFormat("he-IL", {
                              style: "currency",
                              currency: item.resolvedCurrency ?? "ILS",
                              maximumFractionDigits: 2,
                            }).format(item.cheapestUnitPrice)}
                          </span>
                        ) : null}
                      </button>
                    ))}
                    {searching ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        מחפש…
                      </p>
                    ) : null}
                  </div>
                ) : searching ? (
                  <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover p-3 shadow-lg">
                    <p className="text-xs text-muted-foreground">מחפש…</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* ── Main fields ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="add-line-desc" className="text-xs font-medium">
                תיאור <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-line-desc"
                placeholder="תיאור הפריט"
                required
                {...field("description")}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-line-qty" className="text-xs font-medium">
                כמות <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-line-qty"
                type="number"
                min={0}
                step="0.001"
                required
                {...field("quantity")}
                className="text-sm tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-line-price" className="text-xs font-medium">
                מחיר יחידה <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-line-price"
                type="number"
                min={0}
                step="0.01"
                required
                {...field("unitPrice")}
                className="text-sm tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-line-disc" className="text-xs font-medium">
                הנחה %
              </Label>
              <Input
                id="add-line-disc"
                type="number"
                min={0}
                max={100}
                step="0.1"
                {...field("discountPct")}
                className="text-sm tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-line-uom" className="text-xs font-medium">
                יחידת מידה
              </Label>
              <Input
                id="add-line-uom"
                placeholder="יח׳ / ק&quot;ג / מ…"
                {...field("uom")}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-line-sku" className="text-xs font-medium">
                מק&quot;ט ספק
              </Label>
              <Input
                id="add-line-sku"
                placeholder="קוד המוצר אצל הספק"
                {...field("supplierSku")}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-line-supply-date" className="text-xs font-medium">
                תאריך אספקה
              </Label>
              <Input
                id="add-line-supply-date"
                type="date"
                {...field("supplyDate")}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-line-mfr" className="text-xs font-medium">
                יצרן
              </Label>
              <Input
                id="add-line-mfr"
                placeholder="שם היצרן"
                {...field("manufacturerName")}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="add-line-notes" className="text-xs font-medium">
                הערות שורה
              </Label>
              <Textarea
                id="add-line-notes"
                rows={2}
                placeholder="הערות נוספות לשורה זו"
                {...field("lineNotes")}
                className="text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving ? (
                <>טוען…</>
              ) : (
                <>
                  <PackagePlus className="size-4" aria-hidden />
                  הוסף שורה
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
