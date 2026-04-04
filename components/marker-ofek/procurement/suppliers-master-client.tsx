"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, Building2, Loader2, PackageSearch, Phone, UserRound } from "lucide-react"
import { toast } from "sonner"

import { ProcurementCommandSubnav } from "@/components/marker-ofek/procurement/procurement-command-subnav"
import { ProcurementPageHeader } from "@/components/marker-ofek/procurement/procurement-page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { procurementCurrencyFormatter } from "@/lib/marker-ofek/procurement/format"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  isMissingSuppliersLegalIdColumnError,
  SUPPLIERS_TABLE_SELECT_MINIMAL,
  SUPPLIERS_TABLE_SELECT_WITH_LEGAL_ID,
} from "@/lib/marker-ofek/supabase-fields"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { buttonVariants } from "@/components/ui/button-variants"
import { formatError } from "@/lib/format-error"
import { cn } from "@/lib/utils"

type SupplierRow = {
  id: string
  name: string
  legal_id: string | null
  contact_info: Record<string, unknown> | null
}

type SupplierItemRow = {
  id: string
  supplier_sku: string | null
  unit_price: number
  last_updated: string
  master_item_id: string
  items_catalog:
    | { sku: string; description: string; unit: string | null }
    | { sku: string; description: string; unit: string | null }[]
    | null
}

export function SuppliersMasterClient() {
  const [suppliers, setSuppliers] = React.useState<SupplierRow[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = React.useState<string>("")
  const [supplierItems, setSupplierItems] = React.useState<SupplierItemRow[]>([])
  const [selectedItemId, setSelectedItemId] = React.useState<string>("")
  const [loading, setLoading] = React.useState(true)
  const [loadingItems, setLoadingItems] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [relinkQuery, setRelinkQuery] = React.useState("")
  const [relinkingItemId, setRelinkingItemId] = React.useState<string | null>(null)

  const currencyFormatter = React.useMemo(() => procurementCurrencyFormatter(), [])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        let data: SupplierRow[] | null = null
        let { data: fetched, error } = await supabase
          .schema("public")
          .from("suppliers")
          .select(SUPPLIERS_TABLE_SELECT_WITH_LEGAL_ID)
          .eq("is_deleted", false)
          .order("name", { ascending: true })
        data = (fetched ?? null) as SupplierRow[] | null
        // Backward-compatible fallback when the dedicated suppliers table
        // does not expose is_deleted yet in some environments.
        if (error?.message?.toLowerCase().includes("is_deleted")) {
          const retry = await supabase
            .schema("public")
            .from("suppliers")
            .select(SUPPLIERS_TABLE_SELECT_WITH_LEGAL_ID)
            .order("name", { ascending: true })
          data = (retry.data ?? null) as SupplierRow[] | null
          error = retry.error
        }
        if (error && isMissingSuppliersLegalIdColumnError(error)) {
          const retry = await supabase
            .schema("public")
            .from("suppliers")
            .select(SUPPLIERS_TABLE_SELECT_MINIMAL)
            .eq("is_deleted", false)
            .order("name", { ascending: true })
          data = (retry.data ?? null) as SupplierRow[] | null
          error = retry.error
        }
        if (error?.message?.toLowerCase().includes("is_deleted")) {
          const retry = await supabase
            .schema("public")
            .from("suppliers")
            .select(SUPPLIERS_TABLE_SELECT_MINIMAL)
            .order("name", { ascending: true })
          data = (retry.data ?? null) as SupplierRow[] | null
          error = retry.error
        }
        if (error) throw error
        if (cancelled) return
        const rows = (data ?? []).map((r) => ({
          ...r,
          legal_id: r.legal_id ?? null,
        }))
        setSuppliers(rows)
        if (rows.length > 0) setSelectedSupplierId((prev) => prev || rows[0]!.id)
      } catch (e) {
        if (!cancelled) {
          setSuppliers([])
          setSelectedSupplierId("")
          setError(formatError(e))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!selectedSupplierId) {
      setSupplierItems([])
      setSelectedItemId("")
      return
    }
    let cancelled = false
    void (async () => {
      setLoadingItems(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .schema("public")
          .from("supplier_items")
          .select(
            "id, master_item_id, supplier_sku, unit_price, last_updated, items_catalog ( sku, description, unit )"
          )
          .eq("supplier_id", selectedSupplierId)
          .order("last_updated", { ascending: false })
        if (error) throw error
        if (!cancelled) {
          const rows = (data ?? []) as SupplierItemRow[]
          setSupplierItems(rows)
          setSelectedItemId((prev) => prev || rows[0]?.id || "")
        }
      } catch {
        if (!cancelled) {
          setSupplierItems([])
          setSelectedItemId("")
        }
      } finally {
        if (!cancelled) setLoadingItems(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedSupplierId])

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId) ?? null
  const selectedItem = supplierItems.find((it) => it.id === selectedItemId) ?? null
  const selectedCatalogItem = Array.isArray(selectedItem?.items_catalog)
    ? (selectedItem?.items_catalog[0] ?? null)
    : (selectedItem?.items_catalog ?? null)
  const contact = (selectedSupplier?.contact_info ?? {}) as Record<string, unknown>
  const phone = String(contact.phone ?? "").trim()
  const email = String(contact.email ?? "").trim()

  async function handleRelinkSupplierItem(supplierItemId: string) {
    const q = relinkQuery.trim()
    if (!q) {
      toast.error("יש להזין מק״ט פנימי או תיאור פריט לשיוך מחדש")
      return
    }
    setRelinkingItemId(supplierItemId)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: options, error: optionsErr } = await supabase
        .schema("public")
        .from("items_catalog")
        .select("id, sku, description")
        .or(`sku.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(1)

      if (optionsErr || !options || options.length === 0) {
        toast.error("לא נמצא פריט מתאים בקטלוג")
        return
      }
      const target = options[0] as { id: string }
      const { error: updateErr } = await supabase
        .schema("public")
        .from("supplier_items")
        .update({ master_item_id: target.id })
        .eq("id", supplierItemId)
      if (updateErr) {
        toast.error(updateErr.message)
        return
      }
      toast.success("השיוך עודכן בהצלחה")
      setRelinkQuery("")
      setSupplierItems((prev) =>
        prev.map((row) =>
          row.id === supplierItemId
            ? {
                ...row,
                master_item_id: target.id,
              }
            : row
        )
      )
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setRelinkingItemId(null)
    }
  }

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-7xl flex-col gap-6 bg-white pb-12">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-700"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח הבקרה
      </Link>

      <ProcurementCommandSubnav />

      <ProcurementPageHeader
        icon={Building2}
        kicker="מרקר אופק — רכש"
        title="ספקים"
        subtitle="מאגר ספקים, פרטי קשר ומחירוני פריטים מקושרים לקטלוג."
        primaryAction={
          <Link
            href="/marker-ofek/supply-chain/suppliers"
            className={cn(
              buttonVariants({ size: "lg" }),
              "inline-flex gap-2 bg-indigo-600 text-white hover:bg-indigo-500"
            )}
          >
            + ניהול ספקים (מורחב)
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-100 bg-white">
          <div className="border-b border-slate-100 px-4 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[#1e293b]">
              <Building2 className="size-5 stroke-[1.5] text-indigo-600" aria-hidden />
              רשימת ספקים
            </h2>
            <p className="mt-1 text-xs text-slate-500">בחרו ספק לצפייה בפרטים ובמחירונים.</p>
          </div>
          <div className="space-y-2 p-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                טוען ספקים…
              </div>
            ) : error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין ספקים להצגה.</p>
            ) : (
              suppliers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedSupplierId(s.id)
                    setSelectedItemId("")
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-start text-sm transition-colors ${
                    s.id === selectedSupplierId
                      ? "border-indigo-200 bg-indigo-50/50"
                      : "border-slate-100 bg-white hover:border-slate-200"
                  }`}
                >
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.legal_id || "—"}</p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white">
          <div className="border-b border-slate-100 px-4 py-4">
            <h2 className="text-lg font-semibold text-[#1e293b]">פרטי ספק ומחירונים</h2>
            <p className="mt-1 text-xs text-slate-500">פרטי קשר, פריטים מקושרים ומחירי ספק אחרונים.</p>
          </div>
          <div className="space-y-5 p-4 md:p-6">
            {!selectedSupplier ? (
              <p className="text-sm text-muted-foreground">בחרו ספק להצגת פירוט.</p>
            ) : (
              <>
                <div className="grid gap-3 rounded-lg border border-slate-100 bg-white p-3 sm:grid-cols-3">
                  <div className="inline-flex items-center gap-2">
                    <UserRound className="size-4 text-muted-foreground" aria-hidden />
                    <span className="text-sm">{selectedSupplier.name}</span>
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <Badge variant="outline">ח.פ</Badge>
                    <span className="text-sm">{selectedSupplier.legal_id || "—"}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3.5" aria-hidden />
                      {phone || "—"}
                    </span>
                    <span>{email || "—"}</span>
                  </div>
                </div>

                {loadingItems ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    טוען פריטי ספק…
                  </div>
                ) : supplierItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    לספק זה עדיין אין פריטים מקושרים.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-slate-100 bg-white p-3">
                      <p className="mb-2 text-xs text-muted-foreground">
                        שיוך ידני מחדש (במקרה שמיפוי AI היה שגוי)
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          className="h-9 w-full rounded-md border border-slate-100 bg-white px-3 text-sm"
                          value={relinkQuery}
                          onChange={(e) => setRelinkQuery(e.target.value)}
                          placeholder="הקלידו מק״ט פנימי / תיאור פריט"
                        />
                      </div>
                    </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-100">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-start">מק״ט פנימי</TableHead>
                          <TableHead className="text-start">תיאור פריט</TableHead>
                          <TableHead className="text-start">מק״ט ספק</TableHead>
                          <TableHead className="text-start">מחיר אחרון</TableHead>
                          <TableHead className="text-start">עודכן</TableHead>
                          <TableHead className="text-start">פעולה</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplierItems.map((it) => {
                          const item = Array.isArray(it.items_catalog)
                            ? (it.items_catalog[0] ?? null)
                            : it.items_catalog
                          return (
                          <TableRow
                            key={it.id}
                            onClick={() => setSelectedItemId(it.id)}
                            className={
                              it.id === selectedItemId
                                ? "cursor-pointer bg-indigo-50/60 hover:bg-indigo-50"
                                : "cursor-pointer hover:bg-slate-50/80"
                            }
                          >
                            <TableCell className="font-mono text-xs">
                              {item?.sku || "—"}
                            </TableCell>
                            <TableCell>{item?.description || "—"}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {it.supplier_sku?.trim() || "—"}
                            </TableCell>
                            <TableCell className="font-mono tabular-nums text-[#1e293b]">
                              {currencyFormatter.format(Number(it.unit_price) || 0)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {it.last_updated
                                ? new Date(it.last_updated).toLocaleDateString("he-IL")
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={relinkingItemId === it.id}
                                onClick={() => void handleRelinkSupplierItem(it.id)}
                              >
                                שיוך מחדש
                              </Button>
                            </TableCell>
                          </TableRow>
                        )})}
                      </TableBody>
                    </Table>
                  </div>
                  </div>
                )}

                <section className="rounded-lg border border-slate-100 bg-white p-3">
                  <p className="mb-2 text-sm font-semibold text-[#1e293b]">פריט נבחר</p>
                  {!selectedItem ? (
                    <p className="text-sm text-muted-foreground">בחרו פריט מהטבלה להצגת פירוט.</p>
                  ) : (
                    <div className="grid gap-3 rounded-lg border border-slate-100 bg-white p-3 sm:grid-cols-2">
                      <p className="text-sm">
                        <span className="text-muted-foreground">מק״ט פנימי: </span>
                        <span className="font-mono">{selectedCatalogItem?.sku || "—"}</span>
                      </p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">מק״ט ספק: </span>
                        <span className="font-mono">
                          {selectedItem.supplier_sku?.trim() || "—"}
                        </span>
                      </p>
                      <p className="text-sm sm:col-span-2">
                        <span className="text-muted-foreground">תיאור: </span>
                        {selectedCatalogItem?.description || "—"}
                      </p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">מחיר אחרון: </span>
                        <span className="font-mono tabular-nums">
                          {currencyFormatter.format(Number(selectedItem.unit_price) || 0)}
                        </span>
                      </p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">עדכון אחרון: </span>
                        {selectedItem.last_updated
                          ? new Date(selectedItem.last_updated).toLocaleDateString("he-IL")
                          : "—"}
                      </p>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="inline-flex items-center gap-2 rounded-md border border-slate-100 bg-white px-3 py-2 text-xs text-slate-500">
        <PackageSearch className="size-3.5 stroke-[1.5] text-indigo-600" aria-hidden />
        בחירת ספק מעדכנת מיד את פאנל הפרטים.
      </div>
    </div>
  )
}
