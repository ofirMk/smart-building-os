"use client"

import * as React from "react"
import { Loader2, Plus, RefreshCcw, Save } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  ERP_DENSE_INPUT_CLASS,
  ERP_DENSE_LABEL_CLASS,
} from "@/components/layout/DenseMasterDetailTemplate"
import { EntityWorkspace } from "@/components/layout/EntityWorkspace"
import { BentoSmartList, SmartListStatusPill } from "@/components/ui/bento-smart-list"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiFetch, parseApiData } from "@/lib/utils/api-client"

type ProductFamily = {
  id: string
  familyCode: string
  familyName: string
  defaultBudgetSubChapter?: string | null
  defaultResourceId?: string | null
}

type ItemRecord = {
  id: string
  sku: string
  description: string
  foreignDescription: string | null
  uom: string
  productFamilyId: string
  isInventoryManaged: boolean
  status: string
  minOrderQuantity: number
  itemType: string
  budgetSubChapter: string | null
  resourceId: string | null
  budgetSubChapterManualOverride: boolean
  resourceIdManualOverride: boolean
  productFamily: ProductFamily | null
}

const productFamilySchema = z.object({
  id: z.string(),
  familyCode: z.string(),
  familyName: z.string(),
  defaultBudgetSubChapter: z.string().nullable().optional(),
  defaultResourceId: z.string().nullable().optional(),
})

const itemRecordSchema = z.object({
  id: z.string(),
  sku: z.string(),
  description: z.string(),
  foreignDescription: z.string().nullable(),
  uom: z.string(),
  productFamilyId: z.string(),
  isInventoryManaged: z.boolean(),
  status: z.string(),
  minOrderQuantity: z.coerce.number(),
  itemType: z.string(),
  budgetSubChapter: z.string().nullable(),
  resourceId: z.string().nullable(),
  budgetSubChapterManualOverride: z.boolean(),
  resourceIdManualOverride: z.boolean(),
  productFamily: productFamilySchema.nullable(),
})

const itemRecordsSchema = z.array(itemRecordSchema)

async function requestData<T>(
  url: string,
  schema: z.ZodType<T>,
  init?: RequestInit
): Promise<T> {
  const response = await apiFetch(url, init)
  return parseApiData(response, { schema, signal: init?.signal ?? undefined })
}

export function ItemsWorkspaceClient() {
  const [loading, setLoading] = React.useState(true)
  const [loadingDetail, setLoadingDetail] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [items, setItems] = React.useState<ItemRecord[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<ItemRecord | null>(null)
  const [search, setSearch] = React.useState("")
  const [draft, setDraft] = React.useState<ItemRecord | null>(null)

  const filtered = React.useMemo(() => {
    if (!search.trim()) return items
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      return item.sku.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
    })
  }, [items, search])

  const families = React.useMemo(() => {
    const map = new Map<string, ProductFamily>()
    for (const item of items) {
      if (item.productFamily) map.set(item.productFamily.id, item.productFamily)
    }
    return Array.from(map.values()).sort((a, b) => a.familyCode.localeCompare(b.familyCode))
  }, [items])

  const loadItems = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const rows = await requestData<ItemRecord[]>("/api/erp/master-data/items", itemRecordsSchema, { signal })
      if (signal?.aborted) return
      setItems(rows)
      setSelectedId((prev) => prev ?? rows[0]?.id ?? null)
    } catch (error) {
      if (signal?.aborted) return
      toast.error(error instanceof Error ? error.message : "טעינת פריטים נכשלה")
      setItems([])
      setSelectedId(null)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  const loadDetail = React.useCallback(async (id: string, signal?: AbortSignal) => {
    setLoadingDetail(true)
    try {
      const item = await requestData<ItemRecord>(`/api/erp/master-data/items/${id}`, itemRecordSchema, { signal })
      if (signal?.aborted) return
      setSelected(item)
      setDraft(item)
    } catch (error) {
      if (signal?.aborted) return
      toast.error(error instanceof Error ? error.message : "טעינת כרטיס פריט נכשלה")
      setSelected(null)
    } finally {
      if (!signal?.aborted) setLoadingDetail(false)
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void loadItems(controller.signal)
    return () => controller.abort()
  }, [loadItems])

  React.useEffect(() => {
    if (!selectedId) {
      setSelected(null)
      setDraft(null)
      return
    }
    const controller = new AbortController()
    void loadDetail(selectedId, controller.signal)
    return () => controller.abort()
  }, [loadDetail, selectedId])

  const selectedFamily = React.useMemo(() => {
    if (!draft) return null
    return families.find((family) => family.id === draft.productFamilyId) ?? draft.productFamily ?? null
  }, [draft, families])

  const effectiveBudgetSubChapter =
    draft?.budgetSubChapterManualOverride === false
      ? selectedFamily?.defaultBudgetSubChapter ?? draft?.budgetSubChapter ?? null
      : draft?.budgetSubChapter ?? null
  const effectiveResourceId =
    draft?.resourceIdManualOverride === false
      ? selectedFamily?.defaultResourceId ?? draft?.resourceId ?? null
      : draft?.resourceId ?? null

  async function saveItem() {
    if (!draft) return
    setSaving(true)
    try {
      await requestData(`/api/erp/master-data/items/${draft.id}`, z.any(), {
        method: "PUT",
        body: JSON.stringify({
          description: draft.description,
          foreignDescription: draft.foreignDescription,
          uom: draft.uom,
          productFamilyId: draft.productFamilyId,
          status: draft.status,
          isInventoryManaged: draft.isInventoryManaged,
          minOrderQuantity: draft.minOrderQuantity,
          itemType: draft.itemType,
          budgetSubChapter: draft.budgetSubChapter,
          resourceId: draft.resourceId,
          budgetSubChapterManualOverride: draft.budgetSubChapterManualOverride,
          resourceIdManualOverride: draft.resourceIdManualOverride,
        }),
      })
      toast.success("כרטיס פריט נשמר")
      await loadItems()
      await loadDetail(draft.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירת פריט נכשלה")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background">
      <EntityWorkspace
        title="פריטים - Workspace"
        description="Master Grid צפוף עם אזור Detail טאבס מוטמע."
        className="bg-background"
        headerActions={
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => void loadItems()}>
              <RefreshCcw className="ms-1 size-3.5" />
              רענון
            </Button>
            <Button size="sm" className="bg-[#00A76F] text-white hover:bg-[#029c67]">
              <Plus className="ms-1 size-3.5" />
              פריט חדש
            </Button>
          </div>
        }
        sidebar={
          <div className="space-y-2">
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <label className="grid gap-1">
                <span className={ERP_DENSE_LABEL_CLASS}>חיפוש מהיר</span>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className={ERP_DENSE_INPUT_CLASS}
                  placeholder="SKU / תיאור פריט"
                />
              </label>
              <div className="flex items-end text-xs text-slate-500">{filtered.length.toLocaleString("he-IL")} תוצאות</div>
            </div>
            <div className="max-h-[40vh] overflow-auto">
              <BentoSmartList
                items={filtered}
                density="compact"
                rowKey={(item) => item.id}
                selectedRowKey={selectedId}
                onRowClick={(item) => setSelectedId(item.id)}
                emptyState={loading ? "טוען פריטים..." : "אין פריטים להצגה."}
                columns={[
                  { key: "sku", title: "SKU", render: (item) => <span className="font-mono">{item.sku}</span> },
                  { key: "description", title: "תיאור", render: (item) => item.description },
                  {
                    key: "family",
                    title: "משפחה",
                    render: (item) =>
                      item.productFamily
                        ? `${item.productFamily.familyCode} · ${item.productFamily.familyName}`
                        : "—",
                  },
                  { key: "uom", title: "UOM", render: (item) => item.uom },
                  {
                    key: "inventory",
                    title: "Inventory",
                    render: (item) => (
                      <SmartListStatusPill tone={item.isInventoryManaged ? "success" : "neutral"}>
                        {item.isInventoryManaged ? "כן" : "לא"}
                      </SmartListStatusPill>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        }
        main={
          <Tabs defaultValue="general">
            <TabsList variant="line" className="h-9 rounded-xl bg-card shadow-sm">
              <TabsTrigger value="general">General Info</TabsTrigger>
              <TabsTrigger value="inventory">Inventory & Procurement</TabsTrigger>
              <TabsTrigger value="accounting">Accounting Defaults</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="mt-2">
              {loadingDetail || !draft ? (
                <div className="rounded-xl border border-slate-200 bg-card p-5 text-sm text-slate-500">
                  {loadingDetail ? "טוען פרטי פריט..." : "בחרו פריט להצגת פרטים"}
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-card p-3 md:col-span-2">
                    <p className={ERP_DENSE_LABEL_CLASS}>SKU</p>
                    <p className="font-mono text-sm font-semibold">{draft.sku}</p>
                  </div>
                  <label className="grid gap-1 rounded-xl border border-slate-200 bg-card p-3">
                    <span className={ERP_DENSE_LABEL_CLASS}>Description</span>
                    <Input className={ERP_DENSE_INPUT_CLASS} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                  </label>
                  <label className="grid gap-1 rounded-xl border border-slate-200 bg-card p-3">
                    <span className={ERP_DENSE_LABEL_CLASS}>Foreign Description</span>
                    <Input className={ERP_DENSE_INPUT_CLASS} value={draft.foreignDescription ?? ""} onChange={(event) => setDraft({ ...draft, foreignDescription: event.target.value || null })} />
                  </label>
                  <label className="grid gap-1 rounded-xl border border-slate-200 bg-card p-3">
                    <span className={ERP_DENSE_LABEL_CLASS}>Family</span>
                    <Select
                      value={draft.productFamilyId}
                      onValueChange={(value) => {
                        if (!value) return
                        setDraft({ ...draft, productFamilyId: value })
                      }}
                    >
                      <SelectTrigger className={ERP_DENSE_INPUT_CLASS}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {families.map((family) => <SelectItem key={family.id} value={family.id}>{family.familyCode} · {family.familyName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-1 rounded-xl border border-slate-200 bg-card p-3">
                    <span className={ERP_DENSE_LABEL_CLASS}>Status</span>
                    <Select
                      value={draft.status}
                      onValueChange={(value) => {
                        if (!value) return
                        setDraft({ ...draft, status: value })
                      }}
                    >
                      <SelectTrigger className={ERP_DENSE_INPUT_CLASS}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                        <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                        <SelectItem value="PURCHASE_ONLY">PURCHASE_ONLY</SelectItem>
                        <SelectItem value="INTERNAL_ONLY">INTERNAL_ONLY</SelectItem>
                        <SelectItem value="OBSOLETE">OBSOLETE</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <div className="md:col-span-2 flex justify-end">
                    <Button size="sm" onClick={() => void saveItem()} disabled={saving}>
                      {saving ? <Loader2 className="ms-1 size-4 animate-spin" /> : <Save className="ms-1 size-4" />}
                      שמירה
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="inventory" className="mt-2">
              {!draft ? <div className="rounded-xl border border-slate-200 bg-card p-5 text-sm text-slate-500">בחרו פריט להצגת פרטים</div> : (
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="grid gap-1 rounded-xl border border-slate-200 bg-card p-3">
                    <span className={ERP_DENSE_LABEL_CLASS}>Unit of Measure</span>
                    <Input className={ERP_DENSE_INPUT_CLASS} value={draft.uom} onChange={(event) => setDraft({ ...draft, uom: event.target.value })} />
                  </label>
                  <label className="grid gap-1 rounded-xl border border-slate-200 bg-card p-3">
                    <span className={ERP_DENSE_LABEL_CLASS}>Min Order Quantity</span>
                    <Input type="number" step="0.001" className={ERP_DENSE_INPUT_CLASS} value={draft.minOrderQuantity} onChange={(event) => setDraft({ ...draft, minOrderQuantity: event.target.value === "" ? 0 : Number(event.target.value) })} />
                  </label>
                  <label className="grid gap-1 rounded-xl border border-slate-200 bg-card p-3">
                    <span className={ERP_DENSE_LABEL_CLASS}>Item Type</span>
                    <Select
                      value={draft.itemType}
                      onValueChange={(value) => {
                        if (!value) return
                        setDraft({ ...draft, itemType: value })
                      }}
                    >
                      <SelectTrigger className={ERP_DENSE_INPUT_CLASS}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="R">R - Purchased</SelectItem>
                        <SelectItem value="P">P - Produced</SelectItem>
                        <SelectItem value="O">O - Other</SelectItem>
                        <SelectItem value="S">S - Service</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-card p-3 text-sm">
                    <input type="checkbox" checked={draft.isInventoryManaged} onChange={(event) => setDraft({ ...draft, isInventoryManaged: event.target.checked })} />
                    ניהול מלאי
                  </label>
                  <div className="md:col-span-2 flex justify-end">
                    <Button size="sm" onClick={() => void saveItem()} disabled={saving}>
                      {saving ? <Loader2 className="ms-1 size-4 animate-spin" /> : <Save className="ms-1 size-4" />}
                      שמירה
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="accounting" className="mt-2">
              {!draft ? <div className="rounded-xl border border-slate-200 bg-card p-5 text-sm text-slate-500">בחרו פריט להצגת פרטים</div> : (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-card p-3">
                    <p className={ERP_DENSE_LABEL_CLASS}>Family Default Budget Sub-chapter</p>
                    <p className="text-sm">{selectedFamily?.defaultBudgetSubChapter ?? "—"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-card p-3">
                    <p className={ERP_DENSE_LABEL_CLASS}>Family Default Resource</p>
                    <p className="text-sm">{selectedFamily?.defaultResourceId ?? "—"}</p>
                  </div>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-card p-3 text-sm">
                    <input type="checkbox" checked={draft.budgetSubChapterManualOverride} onChange={(event) => setDraft({ ...draft, budgetSubChapterManualOverride: event.target.checked })} />
                    Manual Budget Override
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-card p-3 text-sm">
                    <input type="checkbox" checked={draft.resourceIdManualOverride} onChange={(event) => setDraft({ ...draft, resourceIdManualOverride: event.target.checked })} />
                    Manual Resource Override
                  </label>
                  <label className="grid gap-1 rounded-xl border border-slate-200 bg-card p-3">
                    <span className={ERP_DENSE_LABEL_CLASS}>Budget Sub-chapter (effective: {effectiveBudgetSubChapter ?? "—"})</span>
                    <Input
                      className={ERP_DENSE_INPUT_CLASS}
                      value={draft.budgetSubChapter ?? ""}
                      disabled={!draft.budgetSubChapterManualOverride}
                      onChange={(event) => setDraft({ ...draft, budgetSubChapter: event.target.value || null })}
                    />
                  </label>
                  <label className="grid gap-1 rounded-xl border border-slate-200 bg-card p-3">
                    <span className={ERP_DENSE_LABEL_CLASS}>Resource ID (effective: {effectiveResourceId ?? "—"})</span>
                    <Input
                      className={ERP_DENSE_INPUT_CLASS}
                      value={draft.resourceId ?? ""}
                      disabled={!draft.resourceIdManualOverride}
                      onChange={(event) => setDraft({ ...draft, resourceId: event.target.value || null })}
                    />
                  </label>
                  <div className="md:col-span-2 flex justify-end">
                    <Button size="sm" onClick={() => void saveItem()} disabled={saving}>
                      {saving ? <Loader2 className="ms-1 size-4 animate-spin" /> : <Save className="ms-1 size-4" />}
                      שמירה
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        }
      />
    </div>
  )
}
