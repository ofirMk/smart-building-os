"use client"

import * as React from "react"
import { Check, Edit2, Loader2, Package, Plus, RefreshCcw, Star, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  ERP_DENSE_INPUT_CLASS,
  ERP_DENSE_LABEL_CLASS,
} from "@/components/layout/DenseMasterDetailTemplate"
import { EntityWorkspace } from "@/components/layout/EntityWorkspace"
import {
  ErpChooseList,
  type ErpChooseListOption,
} from "@/components/erp/workspaces/shared/erp-choose-list"
import { DirectActivationsMenu } from "@/components/erp/workspaces/shared/direct-activations-menu"
import { BentoSmartList, SmartListStatusPill } from "@/components/ui/bento-smart-list"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiFetch, parseApiData } from "@/lib/utils/api-client"
import { cn } from "@/lib/utils"
import type { ErpDirectActivation } from "@/types/erp"
import type { SupplierItemDto } from "@/app/api/master-data/suppliers/[id]/items/route"

type SupplierType = "STANDARD" | "SUBCONTRACTOR"

type SupplierContact = {
  id: string
  name: string
  role: string | null
  phone: string | null
  email: string | null
}

type SupplierBank = {
  id: string
  bankName: string
  branchNumber: string | null
  accountNumber: string
}

type SupplierRecord = {
  id: string
  supplierNumber: string
  name: string
  taxId: string
  paymentTerms: string
  vatCode: string
  supplierType: SupplierType
  phone: string | null
  email: string | null
  address: string | null
  contacts?: SupplierContact[]
  bankAccounts?: SupplierBank[]
}

type SupplierWorkspaceClientProps = {
  activations?: ErpDirectActivation<SupplierRecord>[]
}

const supplierContactSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
})

const supplierBankSchema = z.object({
  id: z.string(),
  bankName: z.string(),
  branchNumber: z.string().nullable(),
  accountNumber: z.string(),
})

const supplierRecordSchema = z.object({
  id: z.string(),
  supplierNumber: z.string(),
  name: z.string(),
  taxId: z.string(),
  paymentTerms: z.string(),
  vatCode: z.string(),
  supplierType: z.enum(["STANDARD", "SUBCONTRACTOR"]),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  contacts: z.array(supplierContactSchema).optional(),
  bankAccounts: z.array(supplierBankSchema).optional(),
})

const supplierRecordsSchema = z.array(supplierRecordSchema)

async function requestData<T>(
  url: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal
): Promise<T> {
  const response = await apiFetch(url, { method: "GET", signal })
  return parseApiData(response, { schema, signal })
}

// ─── Supplier-item helpers ────────────────────────────────────────────────

type MasterItemLookup = {
  id: string
  itemNumber: string
  description: string
  unitOfMeasure: string
}

type ItemEditValues = {
  supplierSku: string
  basePrice: string
  discountPercentage: string
  currency: string
  uom: string
  validFrom: string
  validTo: string
  isPreferred: boolean
}

type AddItemValues = ItemEditValues & { itemId: string }

const EMPTY_ADD: AddItemValues = {
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

function itemToEditValues(item: SupplierItemDto): ItemEditValues {
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

const supplierItemSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  itemNumber: z.string().nullable(),
  itemDescription: z.string().nullable(),
  itemUom: z.string().nullable(),
  supplierSku: z.string().nullable(),
  basePrice: z.number(),
  netUnitPrice: z.number().nullable(),
  discountPercentage: z.number(),
  currency: z.string(),
  uom: z.string().nullable(),
  isPreferred: z.boolean(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
})

const supplierItemsSchema = z.array(supplierItemSchema) as unknown as z.ZodType<SupplierItemDto[]>

export function SupplierWorkspaceClient({ activations }: SupplierWorkspaceClientProps) {
  const [loading, setLoading] = React.useState(true)
  const [loadingDetail, setLoadingDetail] = React.useState(false)
  const [suppliers, setSuppliers] = React.useState<SupplierRecord[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<SupplierRecord | null>(null)
  const [search, setSearch] = React.useState("")
  const [activeTab, setActiveTab] = React.useState("general")

  // ── Products tab state ──────────────────────────────────────────────────
  const [items, setItems] = React.useState<SupplierItemDto[]>([])
  const [itemsLoading, setItemsLoading] = React.useState(false)
  const [editingItemId, setEditingItemId] = React.useState<string | null>(null)
  const [editingValues, setEditingValues] = React.useState<ItemEditValues | null>(null)
  const [savingItemId, setSavingItemId] = React.useState<string | null>(null)
  const [deletingItemId, setDeletingItemId] = React.useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = React.useState(false)
  const [addValues, setAddValues] = React.useState<AddItemValues>(EMPTY_ADD)
  const [addSaving, setAddSaving] = React.useState(false)
  const [catalog, setCatalog] = React.useState<MasterItemLookup[]>([])
  const [catalogLoading, setCatalogLoading] = React.useState(false)

  // ── General tab edit state ──────────────────────────────────────────────
  const [isEditingGeneral, setIsEditingGeneral] = React.useState(false)
  const [pendingPhone, setPendingPhone] = React.useState("")
  const [pendingEmail, setPendingEmail] = React.useState("")
  const [pendingAddress, setPendingAddress] = React.useState("")
  const [pendingPaymentTerms, setPendingPaymentTerms] = React.useState("")
  const [savingGeneral, setSavingGeneral] = React.useState(false)

  const filtered = React.useMemo(() => {
    if (!search.trim()) return suppliers
    const q = search.trim().toLowerCase()
    return suppliers.filter((supplier) => {
      return (
        supplier.name.toLowerCase().includes(q) ||
        supplier.supplierNumber.toLowerCase().includes(q) ||
        supplier.taxId.toLowerCase().includes(q)
      )
    })
  }, [search, suppliers])
  const supplierOptions = React.useMemo<ErpChooseListOption[]>(
    () => [
      { value: "", label: "בחירה מהירה מספקים", searchText: "all suppliers" },
      ...filtered.map((supplier) => ({
        value: supplier.id,
        label: `${supplier.supplierNumber} · ${supplier.name}`,
        description: `${supplier.supplierType} · ${supplier.taxId}`,
        searchText: `${supplier.supplierNumber} ${supplier.name} ${supplier.taxId}`,
      })),
    ],
    [filtered]
  )

  const loadSuppliers = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const rows = await requestData<SupplierRecord[]>("/api/erp/master-data/suppliers", supplierRecordsSchema, signal)
      if (signal?.aborted) return
      setSuppliers(rows)
      setSelectedId((prev) => prev ?? rows[0]?.id ?? null)
    } catch (error) {
      if (signal?.aborted) return
      toast.error(error instanceof Error ? error.message : "טעינת ספקים נכשלה")
      setSuppliers([])
      setSelectedId(null)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  const loadSupplierDetail = React.useCallback(async (id: string, signal?: AbortSignal) => {
    setLoadingDetail(true)
    try {
      const supplier = await requestData<SupplierRecord>(
        `/api/erp/master-data/suppliers/${id}`,
        supplierRecordSchema,
        signal
      )
      if (signal?.aborted) return
      setSelected(supplier)
    } catch (error) {
      if (signal?.aborted) return
      toast.error(error instanceof Error ? error.message : "טעינת כרטיס ספק נכשלה")
      setSelected(null)
    } finally {
      if (!signal?.aborted) setLoadingDetail(false)
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void loadSuppliers(controller.signal)
    return () => controller.abort()
  }, [loadSuppliers])

  React.useEffect(() => {
    if (!selectedId) {
      setSelected(null)
      return
    }
    const controller = new AbortController()
    void loadSupplierDetail(selectedId, controller.signal)
    return () => controller.abort()
  }, [loadSupplierDetail, selectedId])

  // Reset products when supplier changes
  React.useEffect(() => {
    setItems([])
    setEditingItemId(null)
    setEditingValues(null)
    setIsEditingGeneral(false)
  }, [selectedId])

  // Load items when products tab becomes active
  React.useEffect(() => {
    if (activeTab === "products" && selectedId) {
      void (async () => {
        setItemsLoading(true)
        try {
          const data = await requestData<SupplierItemDto[]>(
            `/api/master-data/suppliers/${selectedId}/items`,
            supplierItemsSchema,
          )
          setItems(data)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "טעינת מוצרים נכשלה")
          setItems([])
        } finally {
          setItemsLoading(false)
        }
      })()
    }
  }, [activeTab, selectedId])

  // Load catalog when add-dialog opens
  React.useEffect(() => {
    if (!showAddDialog) return
    if (catalog.length > 0) return // already loaded
    setCatalogLoading(true)
    void apiFetch("/api/erp/master-data/items", { method: "GET" })
      .then(async (res) => {
        const body = (await res.json()) as { data?: Array<{
          id: string
          item_number?: string
          description?: string
          unit_of_measure?: string
        }> }
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
  }, [showAddDialog, catalog.length])

  // ── Callbacks ────────────────────────────────────────────────────────────

  const handleSaveItem = React.useCallback(
    async (itemId: string) => {
      if (!selectedId || !editingValues) return
      setSavingItemId(itemId)
      try {
        const res = await apiFetch(
          `/api/master-data/suppliers/${selectedId}/items/${itemId}`,
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
        setEditingItemId(null)
        setEditingValues(null)
        toast.success("הפריט עודכן בהצלחה")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "עדכון פריט נכשל")
      } finally {
        setSavingItemId(null)
      }
    },
    [selectedId, editingValues],
  )

  const handleDeleteItem = React.useCallback(
    async (itemId: string) => {
      if (!selectedId) return
      setDeletingItemId(itemId)
      try {
        const res = await apiFetch(
          `/api/master-data/suppliers/${selectedId}/items/${itemId}`,
          { method: "DELETE" },
        )
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(b?.error ?? `שגיאה ${res.status}`)
        }
        setItems((prev) => prev.filter((it) => it.id !== itemId))
        if (editingItemId === itemId) { setEditingItemId(null); setEditingValues(null) }
        toast.success("הפריט הוסר מהספק")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "מחיקת פריט נכשלה")
      } finally {
        setDeletingItemId(null)
      }
    },
    [selectedId, editingItemId],
  )

  const handleAddItem = React.useCallback(async () => {
    if (!selectedId) return
    if (!addValues.itemId) { toast.error("יש לבחור פריט"); return }
    setAddSaving(true)
    try {
      const res = await apiFetch(`/api/master-data/suppliers/${selectedId}/items`, {
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
      setShowAddDialog(false)
      setAddValues(EMPTY_ADD)
      toast.success("הפריט נוסף לספק בהצלחה")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "הוספת פריט נכשלה")
    } finally {
      setAddSaving(false)
    }
  }, [selectedId, addValues])

  const handleSaveGeneral = React.useCallback(async () => {
    if (!selectedId || !selected) return
    setSavingGeneral(true)
    try {
      const res = await apiFetch(`/api/erp/master-data/suppliers/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: pendingPhone || null,
          email: pendingEmail || null,
          address: pendingAddress || null,
          paymentTerms: pendingPaymentTerms || null,
        }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(b?.error ?? `שגיאה ${res.status}`)
      }
      setSelected((prev) =>
        prev
          ? { ...prev, phone: pendingPhone || null, email: pendingEmail || null,
              address: pendingAddress || null, paymentTerms: pendingPaymentTerms || "" }
          : prev,
      )
      setIsEditingGeneral(false)
      toast.success("פרטי הספק עודכנו בהצלחה")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שמירת פרטי ספק נכשלה")
    } finally {
      setSavingGeneral(false)
    }
  }, [selectedId, selected, pendingPhone, pendingEmail, pendingAddress, pendingPaymentTerms])

  const defaultActivations = React.useMemo<ErpDirectActivation<SupplierRecord>[]>(
    () => [
      {
        id: "open-ledger-card",
        label: "כרטיס ספק הנהלת חשבונות",
        hint: "מעבר לכרטסת ספק לפי ההקשר הפעיל",
        disabled: !selected,
        onActivate: async ({ entity }) => {
          if (!entity) throw new Error("יש לבחור ספק לפני הפעלה")
          toast.success(`נפתחה כרטסת הנה\"ח עבור ${entity.name}`)
        },
      },
      {
        id: "print-supplier-summary",
        label: "הדפסת כרטיס ספק",
        hint: "דוח מרכז כולל פרטי קשר ובנק",
        disabled: !selected,
        onActivate: async ({ entity }) => {
          if (!entity) throw new Error("יש לבחור ספק לפני הפעלה")
          toast.success(`נשלחה בקשת הדפסה עבור ${entity.supplierNumber}`)
        },
      },
      {
        id: "create-purchase-order",
        label: "יצירת הזמנת רכש",
        hint: "פתיחת הזמנה חדשה עם שיוך לספק",
        disabled: !selected,
        onActivate: async ({ entity }) => {
          if (!entity) throw new Error("יש לבחור ספק לפני הפעלה")
          toast.success(`נפתחה הזמנת רכש חדשה עבור ${entity.name}`)
        },
      },
    ],
    [selected]
  )

  const activeActivations = activations ?? defaultActivations

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background">
      <EntityWorkspace
        title="ספקים - Workspace"
        description="Master Grid ו-Detail Tabs משולבים במסך אחד."
        className="bg-background"
        headerActions={
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => void loadSuppliers()}>
              <RefreshCcw className="ms-1 size-3.5" />
              רענון
            </Button>
            <DirectActivationsMenu
              title="הפעלות ספק"
              entityName="Supplier"
              entity={selected}
              activations={activeActivations}
            />
            <Button size="sm" className="bg-[#00A76F] text-white hover:bg-[#029c67]">
              <Plus className="ms-1 size-3.5" />
              ספק חדש
            </Button>
          </div>
        }
        sidebar={
          <div className="space-y-2">
            <div className="grid gap-2 md:grid-cols-[1fr_280px_auto]">
              <label className="grid gap-1">
                <span className={ERP_DENSE_LABEL_CLASS}>חיפוש מהיר</span>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className={ERP_DENSE_INPUT_CLASS}
                  placeholder="מספר ספק / שם / ח.פ"
                />
              </label>
              <label className="grid gap-1">
                <span className={ERP_DENSE_LABEL_CLASS}>בחירת ספק</span>
                <ErpChooseList
                  value={selectedId}
                  onChange={(nextValue) => setSelectedId(nextValue || null)}
                  placeholder="בחרו ספק"
                  searchPlaceholder="חיפוש ספק"
                  options={supplierOptions}
                  quickCreateHref="/procurement/suppliers"
                  quickCreateLabel="ספק חדש"
                  disabled={loading}
                />
              </label>
              <div className="flex items-end text-xs text-slate-500">
                {filtered.length.toLocaleString("he-IL")} תוצאות
              </div>
            </div>
            <div className="max-h-[40vh] overflow-auto">
              <BentoSmartList
                items={filtered}
                density="compact"
                rowKey={(supplier) => supplier.id}
                selectedRowKey={selectedId}
                onRowClick={(supplier) => setSelectedId(supplier.id)}
                emptyState={loading ? "טוען ספקים..." : "אין ספקים להצגה."}
                columns={[
                  {
                    key: "supplierNumber",
                    title: "מספר ספק",
                    render: (supplier) => (
                      <span className="font-mono text-[11px]">{supplier.supplierNumber}</span>
                    ),
                  },
                  { key: "name", title: "שם", render: (supplier) => supplier.name },
                  {
                    key: "type",
                    title: "סוג",
                    render: (supplier) => (
                      <SmartListStatusPill
                        tone={supplier.supplierType === "SUBCONTRACTOR" ? "warning" : "info"}
                      >
                        {supplier.supplierType}
                      </SmartListStatusPill>
                    ),
                  },
                  { key: "taxId", title: "ח.פ", render: (supplier) => supplier.taxId },
                ]}
              />
            </div>
          </div>
        }
        main={
          <>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList variant="line" className="h-9 rounded-xl bg-card shadow-sm">
              <TabsTrigger value="general">כרטיס ספק</TabsTrigger>
              <TabsTrigger value="contacts">אנשי קשר</TabsTrigger>
              <TabsTrigger value="banks">חשבונות בנק</TabsTrigger>
              <TabsTrigger value="products" className="gap-1">
                <Package className="size-3.5" aria-hidden />
                מוצרים
                {items.length > 0 && (
                  <span className="ms-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                    {items.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="mt-2">
              {loadingDetail || !selected ? (
                <div className="rounded-xl border border-slate-200 bg-card p-5 text-sm text-slate-500">
                  {loadingDetail ? "טוען כרטיס ספק..." : "בחרו ספק להצגת פרטים"}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Edit / Save / Cancel controls */}
                  <div className="flex items-center justify-end gap-2">
                    {isEditingGeneral ? (
                      <>
                        <Button
                          size="sm" variant="outline"
                          className="gap-1.5 border-slate-200"
                          onClick={() => setIsEditingGeneral(false)}
                          disabled={savingGeneral}
                        >
                          <X className="size-3.5" aria-hidden />
                          בטל
                        </Button>
                        <Button
                          size="sm"
                          className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() => void handleSaveGeneral()}
                          disabled={savingGeneral}
                        >
                          {savingGeneral
                            ? <Loader2 className="size-3.5 animate-spin" aria-hidden />
                            : <Check className="size-3.5" aria-hidden />}
                          שמור
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm" variant="outline"
                        className="gap-1.5 border-slate-200"
                        onClick={() => {
                          setPendingPhone(selected.phone ?? "")
                          setPendingEmail(selected.email ?? "")
                          setPendingAddress(selected.address ?? "")
                          setPendingPaymentTerms(selected.paymentTerms ?? "")
                          setIsEditingGeneral(true)
                        }}
                      >
                        <Edit2 className="size-3.5" aria-hidden />
                        ערוך
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-2 md:grid-cols-3">
                    {/* Read-only: name, tax id, type */}
                    <div className="rounded-xl border border-slate-200 bg-card p-3">
                      <p className="text-[11px] text-slate-500">שם ספק</p>
                      <p className="text-sm font-semibold">{selected.name}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-card p-3">
                      <p className="text-[11px] text-slate-500">ח.פ / ע.מ</p>
                      <p className="text-sm font-mono">{selected.taxId || "—"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-card p-3">
                      <p className="text-[11px] text-slate-500">{'קוד מע"מ'}</p>
                      <p className="text-sm">{selected.vatCode}</p>
                    </div>

                    {/* Editable fields */}
                    <div className="rounded-xl border border-slate-200 bg-card p-3">
                      <p className="text-[11px] text-slate-500">טלפון</p>
                      {isEditingGeneral ? (
                        <Input
                          value={pendingPhone}
                          onChange={(e) => setPendingPhone(e.target.value)}
                          placeholder="05X-XXXXXXX"
                          className={cn(ERP_DENSE_INPUT_CLASS, "mt-1")}
                          dir="ltr"
                        />
                      ) : (
                        <p className="text-sm">{selected.phone || "—"}</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-card p-3">
                      <p className="text-[11px] text-slate-500">אימייל</p>
                      {isEditingGeneral ? (
                        <Input
                          type="email"
                          value={pendingEmail}
                          onChange={(e) => setPendingEmail(e.target.value)}
                          placeholder="name@example.com"
                          className={cn(ERP_DENSE_INPUT_CLASS, "mt-1")}
                          dir="ltr"
                        />
                      ) : (
                        <p className="text-sm">{selected.email || "—"}</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-card p-3">
                      <p className="text-[11px] text-slate-500">תנאי תשלום</p>
                      {isEditingGeneral ? (
                        <Input
                          value={pendingPaymentTerms}
                          onChange={(e) => setPendingPaymentTerms(e.target.value)}
                          placeholder="NET_30"
                          className={cn(ERP_DENSE_INPUT_CLASS, "mt-1")}
                        />
                      ) : (
                        <p className="text-sm">{selected.paymentTerms || "—"}</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-card p-3 md:col-span-3">
                      <p className="text-[11px] text-slate-500">כתובת</p>
                      {isEditingGeneral ? (
                        <Input
                          value={pendingAddress}
                          onChange={(e) => setPendingAddress(e.target.value)}
                          placeholder="רחוב, עיר, מיקוד"
                          className={cn(ERP_DENSE_INPUT_CLASS, "mt-1")}
                        />
                      ) : (
                        <p className="text-sm">{selected.address || "—"}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="contacts" className="mt-2">
              <div className="rounded-xl border border-slate-200 bg-card p-3">
                {!selected || (selected.contacts ?? []).length === 0 ? (
                  <p className="text-sm text-slate-500">אין אנשי קשר להצגה.</p>
                ) : (
                  <div className="space-y-2">
                    {(selected.contacts ?? []).map((contact) => (
                      <div key={contact.id} className="rounded-lg border border-slate-200 bg-background/80 p-2">
                        <p className="text-sm font-semibold">{contact.name}</p>
                        <p className="text-xs text-slate-600">
                          {contact.role || "—"} · {contact.phone || "—"} · {contact.email || "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="banks" className="mt-2">
              <div className="rounded-xl border border-slate-200 bg-card p-3">
                {!selected || (selected.bankAccounts ?? []).length === 0 ? (
                  <p className="text-sm text-slate-500">אין חשבונות בנק להצגה.</p>
                ) : (
                  <div className="space-y-2">
                    {(selected.bankAccounts ?? []).map((bank) => (
                      <div key={bank.id} className="rounded-lg border border-slate-200 bg-background/80 p-2">
                        <p className="text-sm font-semibold">{bank.bankName}</p>
                        <p className="text-xs text-slate-600">
                          סניף: {bank.branchNumber || "—"} · חשבון: {bank.accountNumber}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Products tab ─────────────────────────────────────────── */}
            <TabsContent value="products" className="mt-2">
              <div className="rounded-xl border border-slate-200 bg-card">
                {/* Tab toolbar */}
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                  <p className="text-sm font-semibold text-slate-700">
                    מוצרים ומחירים
                    {items.length > 0 && (
                      <span className="ms-2 text-xs font-normal text-slate-500">{items.length} פריטים</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    {selectedId && (
                      <Button
                        size="sm" variant="outline"
                        className="gap-1.5 border-slate-200"
                        disabled={itemsLoading}
                        onClick={() => {
                          if (!selectedId) return
                          setItemsLoading(true)
                          requestData<SupplierItemDto[]>(
                            `/api/master-data/suppliers/${selectedId}/items`,
                            supplierItemsSchema,
                          )
                            .then(setItems)
                            .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "רענון נכשל"))
                            .finally(() => setItemsLoading(false))
                        }}
                      >
                        {itemsLoading
                          ? <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          : <RefreshCcw className="size-3.5" aria-hidden />}
                        רענן
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="gap-1.5 bg-[#00A76F] text-white hover:bg-[#029c67]"
                      disabled={!selected}
                      onClick={() => { setAddValues(EMPTY_ADD); setShowAddDialog(true) }}
                    >
                      <Plus className="size-3.5" aria-hidden />
                      הוסף מוצר
                    </Button>
                  </div>
                </div>

                {/* Content */}
                {itemsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    טוען מוצרים…
                  </div>
                ) : !selected ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-500">בחרו ספק להצגת מוצרים</p>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-slate-500">
                    <Package className="size-8 text-slate-300" aria-hidden />
                    <p className="text-sm">אין מוצרים מוגדרים לספק זה</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="min-w-[7rem]">מק"ט</TableHead>
                          <TableHead className="min-w-[14rem]">תאור</TableHead>
                          <TableHead className="min-w-[7rem]">מק"ט ספק</TableHead>
                          <TableHead className="min-w-[6rem] text-end">מחיר בסיס</TableHead>
                          <TableHead className="min-w-[5rem] text-end">הנחה %</TableHead>
                          <TableHead className="min-w-[6rem] text-end">מחיר נטו</TableHead>
                          <TableHead className="min-w-[4rem]">מטבע</TableHead>
                          <TableHead className="min-w-[4rem]">י"מ</TableHead>
                          <TableHead className="min-w-[6rem]">תוקף מ-</TableHead>
                          <TableHead className="min-w-[6rem]">תוקף עד</TableHead>
                          <TableHead className="w-[7rem] text-center">מועדף</TableHead>
                          <TableHead className="w-[7rem] text-center">פעולות</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => {
                          const isEditing = editingItemId === item.id
                          const isSaving = savingItemId === item.id
                          const isDeleting = deletingItemId === item.id

                          return (
                            <TableRow
                              key={item.id}
                              className={cn(
                                "transition-colors",
                                isEditing && "bg-indigo-50/60 dark:bg-indigo-900/20",
                              )}
                            >
                              <TableCell className="font-mono text-xs text-slate-600">
                                {item.itemNumber ?? "—"}
                              </TableCell>
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
                                    className={cn(ERP_DENSE_INPUT_CLASS, "w-24")}
                                    placeholder="SKU"
                                  />
                                ) : (
                                  <span className="font-mono text-xs">{item.supplierSku ?? "—"}</span>
                                )}
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
                                    className={cn(ERP_DENSE_INPUT_CLASS, "w-24 text-end")}
                                  />
                                ) : (
                                  <span className="tabular-nums">{item.basePrice.toFixed(2)}</span>
                                )}
                              </TableCell>

                              {/* Discount % */}
                              <TableCell className="text-end">
                                {isEditing ? (
                                  <Input
                                    type="number" min="0" max="100" step="0.1"
                                    value={editingValues?.discountPercentage ?? "0"}
                                    onChange={(e) =>
                                      setEditingValues((v) => v ? { ...v, discountPercentage: e.target.value } : v)
                                    }
                                    className={cn(ERP_DENSE_INPUT_CLASS, "w-20 text-end")}
                                  />
                                ) : (
                                  <span className="tabular-nums">{item.discountPercentage}%</span>
                                )}
                              </TableCell>

                              {/* Net price (read-only) */}
                              <TableCell className="text-end font-semibold tabular-nums text-emerald-700">
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
                                    className={cn(ERP_DENSE_INPUT_CLASS, "w-14 font-mono uppercase")}
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
                                    className={cn(ERP_DENSE_INPUT_CLASS, "w-16")}
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
                                    className={cn(ERP_DENSE_INPUT_CLASS, "w-32")}
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
                                    className={cn(ERP_DENSE_INPUT_CLASS, "w-32")}
                                  />
                                ) : (
                                  <span className="text-xs tabular-nums">{item.validTo ?? "—"}</span>
                                )}
                              </TableCell>

                              {/* Is preferred */}
                              <TableCell className="text-center">
                                {isEditing ? (
                                  <input
                                    type="checkbox"
                                    checked={editingValues?.isPreferred ?? false}
                                    onChange={(e) =>
                                      setEditingValues((v) => v ? { ...v, isPreferred: e.target.checked } : v)
                                    }
                                    className="size-4 cursor-pointer rounded accent-indigo-600"
                                  />
                                ) : item.isPreferred ? (
                                  <Star className="mx-auto size-4 fill-amber-400 text-amber-400" aria-label="מועדף" />
                                ) : (
                                  <span className="text-xs text-slate-300">—</span>
                                )}
                              </TableCell>

                              {/* Actions */}
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {isEditing ? (
                                    <>
                                      <Button
                                        size="icon" variant="ghost"
                                        className="size-7 text-emerald-600 hover:bg-emerald-50"
                                        disabled={isSaving}
                                        onClick={() => void handleSaveItem(item.id)}
                                        aria-label="שמור"
                                      >
                                        {isSaving
                                          ? <Loader2 className="size-3.5 animate-spin" />
                                          : <Check className="size-3.5" />}
                                      </Button>
                                      <Button
                                        size="icon" variant="ghost"
                                        className="size-7 text-slate-500 hover:bg-slate-100"
                                        disabled={isSaving}
                                        onClick={() => { setEditingItemId(null); setEditingValues(null) }}
                                        aria-label="בטל"
                                      >
                                        <X className="size-3.5" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        size="icon" variant="ghost"
                                        className="size-7 text-slate-500 hover:bg-slate-100"
                                        disabled={!!editingItemId || isDeleting}
                                        onClick={() => {
                                          setEditingItemId(item.id)
                                          setEditingValues(itemToEditValues(item))
                                        }}
                                        aria-label="ערוך"
                                      >
                                        <Edit2 className="size-3.5" />
                                      </Button>
                                      <Button
                                        size="icon" variant="ghost"
                                        className="size-7 text-rose-500 hover:bg-rose-50"
                                        disabled={!!editingItemId || isDeleting}
                                        onClick={() => void handleDeleteItem(item.id)}
                                        aria-label="מחק"
                                      >
                                        {isDeleting
                                          ? <Loader2 className="size-3.5 animate-spin" />
                                          : <Trash2 className="size-3.5" />}
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
              </div>
            </TabsContent>
          </Tabs>

          {/* ── Add Product Dialog ──────────────────────────────────────── */}
          <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) { setShowAddDialog(false); setAddValues(EMPTY_ADD) } }}>
            <DialogContent className="max-w-lg" dir="rtl">
              <DialogHeader>
                <DialogTitle>הוסף מוצר לספק</DialogTitle>
              </DialogHeader>

              <div className="grid gap-3 py-2">
                {/* Item selector */}
                <div className="grid gap-1">
                  <label className={ERP_DENSE_LABEL_CLASS}>פריט מקטלוג *</label>
                  {catalogLoading ? (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="size-3.5 animate-spin" />
                      טוען קטלוג…
                    </div>
                  ) : (
                    <select
                      value={addValues.itemId}
                      onChange={(e) => setAddValues((v) => ({ ...v, itemId: e.target.value }))}
                      className={cn(ERP_DENSE_INPUT_CLASS, "cursor-pointer")}
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
                  <label className={ERP_DENSE_LABEL_CLASS}>מק"ט ספק (אופציונלי)</label>
                  <Input
                    value={addValues.supplierSku}
                    onChange={(e) => setAddValues((v) => ({ ...v, supplierSku: e.target.value }))}
                    placeholder="xxxxxx"
                    className={ERP_DENSE_INPUT_CLASS}
                    dir="ltr"
                  />
                </div>

                {/* Price row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-1">
                    <label className={ERP_DENSE_LABEL_CLASS}>מחיר בסיס *</label>
                    <Input
                      type="number" min="0" step="0.01"
                      value={addValues.basePrice}
                      onChange={(e) => setAddValues((v) => ({ ...v, basePrice: e.target.value }))}
                      className={cn(ERP_DENSE_INPUT_CLASS, "text-end")}
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className={ERP_DENSE_LABEL_CLASS}>הנחה %</label>
                    <Input
                      type="number" min="0" max="100" step="0.1"
                      value={addValues.discountPercentage}
                      onChange={(e) => setAddValues((v) => ({ ...v, discountPercentage: e.target.value }))}
                      className={cn(ERP_DENSE_INPUT_CLASS, "text-end")}
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className={ERP_DENSE_LABEL_CLASS}>מטבע</label>
                    <Input
                      value={addValues.currency}
                      onChange={(e) => setAddValues((v) => ({ ...v, currency: e.target.value.toUpperCase() }))}
                      maxLength={3}
                      className={cn(ERP_DENSE_INPUT_CLASS, "font-mono uppercase")}
                    />
                  </div>
                </div>

                {/* UOM + validity */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-1">
                    <label className={ERP_DENSE_LABEL_CLASS}>יחידת מידה</label>
                    <Input
                      value={addValues.uom}
                      onChange={(e) => setAddValues((v) => ({ ...v, uom: e.target.value }))}
                      placeholder="יח'"
                      className={ERP_DENSE_INPUT_CLASS}
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className={ERP_DENSE_LABEL_CLASS}>תוקף מ-</label>
                    <Input
                      type="date"
                      value={addValues.validFrom}
                      onChange={(e) => setAddValues((v) => ({ ...v, validFrom: e.target.value }))}
                      className={ERP_DENSE_INPUT_CLASS}
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className={ERP_DENSE_LABEL_CLASS}>תוקף עד</label>
                    <Input
                      type="date"
                      value={addValues.validTo}
                      onChange={(e) => setAddValues((v) => ({ ...v, validTo: e.target.value }))}
                      className={ERP_DENSE_INPUT_CLASS}
                    />
                  </div>
                </div>

                {/* Is preferred */}
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={addValues.isPreferred}
                    onChange={(e) => setAddValues((v) => ({ ...v, isPreferred: e.target.checked }))}
                    className="size-4 rounded accent-indigo-600"
                  />
                  ספק מועדף לפריט זה
                </label>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setShowAddDialog(false); setAddValues(EMPTY_ADD) }}
                  disabled={addSaving}
                >
                  בטל
                </Button>
                <Button
                  className="bg-[#00A76F] text-white hover:bg-[#029c67] gap-1.5"
                  onClick={() => void handleAddItem()}
                  disabled={addSaving || !addValues.itemId}
                >
                  {addSaving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                  הוסף מוצר
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
        }
      />
    </div>
  )
}
