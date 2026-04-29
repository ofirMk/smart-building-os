"use client"

import Link from "next/link"
import * as React from "react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { ArrowRight, FileSignature, FileUp, PackageSearch, Plus, Save, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useSmartWorkspace } from "@/components/marker-ofek/workspace/smart-workspace-context"
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { masterDataFetch } from "@/lib/erp/master-data-browser"

import { AddSupplierPriceModal } from "./add-supplier-price-modal"

type ProductFamily = {
  id: string
  familyCode: string
  familyName: string
}

type UomOption = {
  id: string
  code: string
  descriptionHe: string
  nameEn: string
  companyId: string | null
}

type SupplierRecord = {
  id: string
  companyId: string
  supplierNum: string
  name: string
  taxId: string | null
  type: string
  paymentTerms: string | null
}

type SupplierItemRecord = {
  id: string
  companyId: string
  itemId: string
  supplierId: string
  supplierSku: string | null
  basePrice: number
  discountPercentage: number
  currency: string
  uom: string | null
  validFrom: string | null
  validTo: string | null
  isPreferred: boolean
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
  productFamily: ProductFamily | null
}

type ItemCreateDraft = {
  sku: string
  description: string
  uom: string
  productFamilyId: string
}

const EMPTY_CREATE_DRAFT: ItemCreateDraft = {
  sku: "",
  description: "",
  uom: "",
  productFamilyId: "",
}

// משתמשים ב-`masterDataFetch` הקנוני (זהה לטופס הראשי `priority-item-form-client`)
// כדי להבטיח מעבר עקבי של `x-active-company-id` ו-`x-company-id` בכל הקריאה
// — מתאים את ה-master-data API המחמיר הקנוני.
const itemsApiPost = async (body: unknown): Promise<{ id: string }> =>
  masterDataFetch<{ id: string }>("/api/erp/master-data/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

const itemsApiPut = async (id: string, body: unknown): Promise<ItemRecord> =>
  masterDataFetch<ItemRecord>(`/api/erp/master-data/items/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

const itemsApiDelete = async (id: string): Promise<void> => {
  await masterDataFetch<null>(`/api/erp/master-data/items/${id}`, {
    method: "DELETE",
  })
}

type HeavyItemMasterScreenProps = {
  /** מזהה פריט לבחירה מיידית לאחר הטעינה (drill-down מה-data grid). */
  initialSelectedId?: string | null
  /** אם `true`, מודל יצירת הפריט ייפתח מייד עם טעינת המסך. */
  initialOpenCreate?: boolean
  /** מקרה שמסתפקים ב- onBack — מתווסף כפתור "חזור לטבלה" בראש ה-toolbar. */
  onBack?: () => void
}

export function HeavyItemMasterScreen({
  initialSelectedId,
  initialOpenCreate,
  onBack,
}: HeavyItemMasterScreenProps = {}) {
  const workspace = useSmartWorkspace()

  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [items, setItems] = React.useState<ItemRecord[]>([])
  const [families, setFamilies] = React.useState<ProductFamily[]>([])
  const [uoms, setUoms] = React.useState<UomOption[]>([])
  const [suppliers, setSuppliers] = React.useState<SupplierRecord[]>([])
  const [supplierItems, setSupplierItems] = React.useState<SupplierItemRecord[]>([])
  const [supplierItemsLoading, setSupplierItemsLoading] = React.useState(false)
  const [addPriceModalOpen, setAddPriceModalOpen] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialSelectedId ?? null
  )
  const [searchTerm, setSearchTerm] = React.useState("")
  const [createOpen, setCreateOpen] = React.useState<boolean>(
    Boolean(initialOpenCreate)
  )
  const [createDraft, setCreateDraft] = React.useState<ItemCreateDraft>(EMPTY_CREATE_DRAFT)
  const [draft, setDraft] = React.useState<ItemRecord | null>(null)
  const [notesTab, setNotesTab] = React.useState<1 | 2 | 3 | 4 | 5>(1)
  const [notesByType, setNotesByType] = React.useState<Record<number, string>>({
    1: "",
    2: "",
    3: "",
    4: "",
    5: "",
  })

  const selectedItem = React.useMemo(
    () => items.find((row) => row.id === selectedId) ?? null,
    [items, selectedId]
  )

  const filteredItems = React.useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const text = `${item.sku} ${item.description} ${item.productFamily?.familyName ?? ""}`
      return text.toLowerCase().includes(q)
    })
  }, [items, searchTerm])

  const openScreens = React.useMemo(
    () => (workspace?.openTabs ?? []).filter((tab) => tab.href.includes("/marker-ofek")),
    [workspace?.openTabs]
  )

  const availabilityRows = React.useMemo(() => {
    if (!selectedItem) return []
    const base = Math.max(selectedItem.minOrderQuantity || 0, 1)
    return [
      { warehouse: "מחסן מרכזי", available: base * 12, reserved: base * 2, incoming: base * 3 },
      { warehouse: "מחסן אתר צפון", available: base * 6, reserved: base * 1, incoming: base * 2 },
      { warehouse: "מחסן אתר דרום", available: base * 4, reserved: 0, incoming: base * 1 },
    ]
  }, [selectedItem])

  // רשומות המחירון לפריט המסומן. ממופה דרך `loadSupplierItemsForItem` מתוך `useEffect`
  // במקביל ל-`selectedId`. התצוגה משולבת עם מפת הספקים להצגת שם למשתמש.
  const purchasingRows = React.useMemo(() => {
    if (!selectedItem) return []
    const supplierMap = new Map(suppliers.map((s) => [s.id, s]))
    return supplierItems.map((row) => {
      const supplier = supplierMap.get(row.supplierId)
      const supplierLabel = supplier
        ? `${supplier.supplierNum} · ${supplier.name}`
        : row.supplierId
      const netPrice =
        row.discountPercentage > 0
          ? row.basePrice * (1 - row.discountPercentage / 100)
          : row.basePrice
      return {
        id: row.id,
        supplierLabel,
        supplierSku: row.supplierSku,
        currency: row.currency,
        basePrice: row.basePrice,
        discountPercentage: row.discountPercentage,
        netPrice,
        isPreferred: row.isPreferred,
        validTo: row.validTo,
      }
    })
  }, [selectedItem, supplierItems, suppliers])

  const movementRows = React.useMemo(() => {
    if (!selectedItem) return []
    return [
      { doc: "ניפוק-10294", type: "ניפוק", qty: -24, date: "22/04/2026", user: "רכש מרכזי" },
      { doc: "קבלה-7781", type: "קליטה", qty: 80, date: "20/04/2026", user: "לוגיסטיקה" },
      { doc: "התאמה-511", type: "התאמה", qty: -3, date: "16/04/2026", user: "בקר מלאי" },
    ]
  }, [selectedItem])

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const [itemRows, familyRows, uomRows, supplierRows] = await Promise.all([
        masterDataFetch<ItemRecord[]>("/api/erp/master-data/items").catch(
          () => [] as ItemRecord[]
        ),
        masterDataFetch<ProductFamily[]>(
          "/api/master-data/product-families"
        ).catch(() => [] as ProductFamily[]),
        masterDataFetch<UomOption[]>("/api/master-data/uoms").catch(
          () => [] as UomOption[]
        ),
        masterDataFetch<SupplierRecord[]>("/api/master-data/suppliers").catch(
          () => [] as SupplierRecord[]
        ),
      ])
      setItems(itemRows)
      setFamilies(familyRows)
      setUoms(uomRows)
      setSuppliers(supplierRows)
      // אם המאכלסל סיפק `initialSelectedId` — מכבדים אותו; אחרת בוחרים ראשון ברשימה.
      setSelectedId(
        (prev) => prev ?? initialSelectedId ?? itemRows[0]?.id ?? null
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "טעינת נתונים נכשלה")
      setItems([])
      setFamilies([])
      setUoms([])
      setSuppliers([])
      setSelectedId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadData()
  }, [loadData])

  // טעינת מחירי-ספקים לפריט המסומן. ממומש ל-callback כדי להפעיל מחדש מ-onSuccess
  // של המודל לאחר הוספת מחיר חדש.
  const reloadSupplierItems = React.useCallback(async () => {
    if (!selectedId) {
      setSupplierItems([])
      return
    }
    setSupplierItemsLoading(true)
    try {
      const rows = await masterDataFetch<SupplierItemRecord[]>(
        `/api/master-data/supplier-items?itemId=${encodeURIComponent(selectedId)}`
      )
      setSupplierItems(rows)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "טעינת מחירי ספקים נכשלה"
      )
      setSupplierItems([])
    } finally {
      setSupplierItemsLoading(false)
    }
  }, [selectedId])

  // טעינה מחדש בכל מעבר בין פריטים, למנוע הצגת מידע גקול מפריט אחר.
  React.useEffect(() => {
    void reloadSupplierItems()
  }, [reloadSupplierItems])

  React.useEffect(() => {
    if (!selectedItem) {
      setDraft(null)
      return
    }
    setDraft(selectedItem)
    setNotesByType({
      1: `הערה כללית לפריט ${selectedItem.sku}`,
      2: "",
      3: "",
      4: "",
      5: "",
    })
  }, [selectedItem])

  async function handleCreateItem() {
    const sku = createDraft.sku.trim()
    const description = createDraft.description.trim()
    const uom = createDraft.uom.trim()
    const productFamilyId = createDraft.productFamilyId.trim()

    if (!sku || !description || !uom || !productFamilyId) {
      toast.error("יש להשלים מק״ט, תיאור, יחידה ומשפחת מוצר")
      return
    }

    setCreating(true)
    try {
      const created = await itemsApiPost({
        sku,
        description,
        uom,
        productFamilyId,
        status: "ACTIVE",
        isInventoryManaged: false,
      })
      await loadData()
      setSelectedId(created.id ?? null)
      setCreateOpen(false)
      setCreateDraft(EMPTY_CREATE_DRAFT)
      toast.success("הפריט נוצר בהצלחה")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "יצירת פריט נכשלה")
    } finally {
      setCreating(false)
    }
  }

  async function handleSaveItem() {
    if (!draft) return

    setSaving(true)
    try {
      await itemsApiPut(draft.id, {
        sku: draft.sku,
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
      })
      await loadData()
      setSelectedId(draft.id)
      toast.success("כרטיס הפריט נשמר")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירה נכשלה")
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteItem() {
    if (!selectedItem) return
    const confirmed = window.confirm(`למחוק את הפריט ${selectedItem.sku}?`)
    if (!confirmed) return

    setDeleting(true)
    try {
      await itemsApiDelete(selectedItem.id)
      await loadData()
      toast.success("הפריט נמחק")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "מחיקה נכשלה")
    } finally {
      setDeleting(false)
    }
  }

  const quickActionsDisabled = !selectedItem || loading

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-background">
      <div dir="ltr" className="flex flex-1 min-h-0 overflow-hidden">
        <aside
          dir="rtl"
          className="flex w-80 min-h-0 flex-col overflow-hidden border-r border-border bg-card"
        >
          <div className="flex-none border-b border-border p-4">
            <p className="text-xs text-muted-foreground">שרשרת רכש</p>
            <h1 className="mt-1 text-lg font-semibold text-foreground">כרטיס פריט</h1>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <Accordion type="multiple" defaultValue={["nav", "actions", "tabs"]}>
              <AccordionItem value="nav" className="border-border">
                <AccordionHeader>
                  <AccordionTrigger className="px-2">ניווט בין מסכים</AccordionTrigger>
                </AccordionHeader>
                <AccordionContent className="space-y-2 px-2">
                  <div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                    שרשרת רכש &gt; לוח ראשי
                  </div>
                  <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-foreground">
                    שרשרת רכש &gt; כרטיסי פריט
                  </div>
                  <div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                    שרשרת רכש &gt; קטלוג טכני
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="actions" className="border-border">
                <AccordionHeader>
                  <AccordionTrigger className="px-2">הפעלות ישירות</AccordionTrigger>
                </AccordionHeader>
                <AccordionContent className="space-y-2 px-2">
                  <Button
                    type="button"
                    className="w-full justify-start gap-2"
                    render={<Link href="/marker-ofek/items/new" />}
                  >
                    <FileSignature className="size-4" aria-hidden />
                    כרטיס פריט מלא
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start gap-2"
                    render={<Link href="/marker-ofek/items/import" />}
                  >
                    <FileUp className="size-4" aria-hidden />
                    ייבוא קטלוג מ-CSV
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full justify-start gap-2"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="size-4" aria-hidden />
                    יצירה מהירה
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => void handleSaveItem()}
                    disabled={quickActionsDisabled || saving}
                  >
                    <Save className="size-4" aria-hidden />
                    שמירת הפריט הפעיל
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => void handleDeleteItem()}
                    disabled={quickActionsDisabled || deleting}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    מחיקת הפריט הפעיל
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => void loadData()}
                    disabled={loading}
                  >
                    <PackageSearch className="size-4" aria-hidden />
                    רענון נתונים
                  </Button>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="tabs" className="border-border">
                <AccordionHeader>
                  <AccordionTrigger className="px-2">מסכים פתוחים</AccordionTrigger>
                </AccordionHeader>
                <AccordionContent className="space-y-2 px-2">
                  {openScreens.length === 0 ? (
                    <p className="text-sm text-muted-foreground">אין מסכים פתוחים להצמדה.</p>
                  ) : (
                    openScreens.slice(0, 8).map((screen) => (
                      <button
                        key={screen.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-right text-sm transition-colors hover:bg-muted"
                        onClick={() => workspace?.activateTab(screen)}
                      >
                        <span className="truncate">{screen.title}</span>
                        <span className="text-xs text-muted-foreground">מעבר</span>
                      </button>
                    ))
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </aside>

        <section dir="rtl" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="flex flex-none items-center gap-2 border-b border-border bg-card/95 px-3 py-2 backdrop-blur">
            {onBack ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-2"
                onClick={onBack}
              >
                <ArrowRight className="size-4" aria-hidden />
                חזור לטבלת הפריטים
              </Button>
            ) : null}
            <Button type="button" size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden />
              הוסף
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => void handleSaveItem()}
              disabled={quickActionsDisabled || saving}
            >
              <Save className="size-4" aria-hidden />
              שמור
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => void handleDeleteItem()}
              disabled={quickActionsDisabled || deleting}
            >
              <Trash2 className="size-4" aria-hidden />
              מחק
            </Button>
            <div className="ms-auto flex w-full max-w-sm items-center gap-2 rounded-md border border-border bg-background px-2">
              <Search className="size-4 text-muted-foreground" aria-hidden />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="חיפוש לפי מק״ט / תיאור"
                className="border-0 bg-transparent px-0 focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-3">
            <PanelGroup direction="vertical" className="h-full min-h-0">
              <Panel defaultSize={40} minSize={30} className="min-h-0">
                <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
                  <header className="flex flex-none items-center justify-between border-b border-border px-4 py-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">מק״ט</p>
                      <p className="font-mono text-lg font-semibold text-foreground">
                        {draft?.sku ?? "—"}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1 px-4">
                      <p className="text-xs text-muted-foreground">תאור</p>
                      <p className="truncate text-sm text-foreground">
                        {draft?.description ?? "לא נבחר פריט"}
                      </p>
                    </div>
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted text-xs text-muted-foreground">
                      תמונה
                    </div>
                  </header>

                  <div className="min-h-0 flex-1 overflow-hidden p-3">
                    <Tabs defaultValue="general" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      <TabsList variant="line" className="flex-none">
                        <TabsTrigger value="general">פרטים כלליים</TabsTrigger>
                        <TabsTrigger value="prices">מחירים</TabsTrigger>
                        <TabsTrigger value="warehouse">ניהול מחסנים</TabsTrigger>
                        <TabsTrigger value="params">פרמטרים</TabsTrigger>
                      </TabsList>

                      <TabsContent value="general" className="mt-3 min-h-0 flex-1 overflow-y-auto">
                        <div className="grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
                          <div className="rounded-lg border border-border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-start">מק״ט</TableHead>
                                  <TableHead className="text-start">תיאור</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {loading ? (
                                  <TableRow>
                                    <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">
                                      טוען פריטים...
                                    </TableCell>
                                  </TableRow>
                                ) : filteredItems.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">
                                      לא נמצאו פריטים.
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  filteredItems.map((item) => (
                                    <TableRow
                                      key={item.id}
                                      className="cursor-pointer transition-colors hover:bg-muted/60"
                                      data-state={selectedId === item.id ? "selected" : undefined}
                                      onClick={() => setSelectedId(item.id)}
                                    >
                                      <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                                      <TableCell>{item.description}</TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </div>

                          <div className="space-y-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor="item-description">תיאור</Label>
                                <Input
                                  id="item-description"
                                  value={draft?.description ?? ""}
                                  onChange={(event) =>
                                    setDraft((prev) =>
                                      prev ? { ...prev, description: event.target.value } : prev
                                    )
                                  }
                                  disabled={!draft}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="item-foreign-description">תיאור נוסף</Label>
                                <Input
                                  id="item-foreign-description"
                                  value={draft?.foreignDescription ?? ""}
                                  onChange={(event) =>
                                    setDraft((prev) =>
                                      prev
                                        ? { ...prev, foreignDescription: event.target.value || null }
                                        : prev
                                    )
                                  }
                                  disabled={!draft}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="item-uom">יחידת מידה</Label>
                                <Input
                                  id="item-uom"
                                  value={draft?.uom ?? ""}
                                  onChange={(event) =>
                                    setDraft((prev) => (prev ? { ...prev, uom: event.target.value } : prev))
                                  }
                                  disabled={!draft}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>משפחת מוצר</Label>
                                <Select
                                  value={draft?.productFamilyId ?? ""}
                                  onValueChange={(value) => {
                                    const nextValue = value ?? ""
                                    if (!nextValue) return
                                    setDraft((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            productFamilyId: nextValue,
                                            productFamily:
                                              families.find((f) => f.id === nextValue) ?? null,
                                          }
                                        : prev
                                    )
                                  }}
                                  disabled={!draft}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="בחר משפחה" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {families.map((family) => (
                                      <SelectItem key={family.id} value={family.id}>
                                        {family.familyCode} · {family.familyName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="prices" className="mt-3 min-h-0 flex-1 overflow-y-auto">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-lg border border-border bg-background p-3">
                            <p className="text-xs text-muted-foreground">מחיר בסיס מחושב</p>
                            <p className="mt-1 text-lg font-semibold text-foreground">
                              ₪{((draft?.minOrderQuantity ?? 1) * 11).toLocaleString("he-IL")}
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              מחושב לצורך הדמיית עבודה במסך הכבד.
                            </p>
                          </div>
                          <div className="rounded-lg border border-border bg-background p-3">
                            <Label htmlFor="item-min-order">כמות הזמנה מינימלית</Label>
                            <Input
                              id="item-min-order"
                              type="number"
                              min={0}
                              value={draft?.minOrderQuantity ?? 0}
                              onChange={(event) =>
                                setDraft((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        minOrderQuantity:
                                          event.target.value === "" ? 0 : Number(event.target.value),
                                      }
                                    : prev
                                )
                              }
                              disabled={!draft}
                              className="mt-2"
                            />
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="warehouse" className="mt-3 min-h-0 flex-1 overflow-y-auto">
                        <div className="rounded-lg border border-border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-start">מחסן</TableHead>
                                <TableHead className="text-start">זמין</TableHead>
                                <TableHead className="text-start">שמור</TableHead>
                                <TableHead className="text-start">בהזמנה</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {availabilityRows.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                                    בחרו פריט להצגת זמינות.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                availabilityRows.map((row) => (
                                  <TableRow key={row.warehouse}>
                                    <TableCell>{row.warehouse}</TableCell>
                                    <TableCell>{row.available.toLocaleString("he-IL")}</TableCell>
                                    <TableCell>{row.reserved.toLocaleString("he-IL")}</TableCell>
                                    <TableCell>{row.incoming.toLocaleString("he-IL")}</TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </TabsContent>

                      <TabsContent value="params" className="mt-3 min-h-0 flex-1 overflow-y-auto">
                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="space-y-2">
                            <Label>סטטוס</Label>
                            <Select
                              value={draft?.status ?? "ACTIVE"}
                              onValueChange={(value) => {
                                const nextValue = value ?? ""
                                if (!nextValue) return
                                setDraft((prev) => (prev ? { ...prev, status: nextValue } : prev))
                              }}
                              disabled={!draft}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ACTIVE">פעיל</SelectItem>
                                <SelectItem value="INACTIVE">לא פעיל</SelectItem>
                                <SelectItem value="PURCHASE_ONLY">רכש בלבד</SelectItem>
                                <SelectItem value="INTERNAL_ONLY">שימוש פנימי</SelectItem>
                                <SelectItem value="OBSOLETE">הוצא משימוש</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="item-type">סוג פריט</Label>
                            <Input
                              id="item-type"
                              value={draft?.itemType ?? ""}
                              onChange={(event) =>
                                setDraft((prev) =>
                                  prev ? { ...prev, itemType: event.target.value } : prev
                                )
                              }
                              disabled={!draft}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="budget-sub">תת-פרק תקציבי</Label>
                            <Input
                              id="budget-sub"
                              value={draft?.budgetSubChapter ?? ""}
                              onChange={(event) =>
                                setDraft((prev) =>
                                  prev
                                    ? { ...prev, budgetSubChapter: event.target.value || null }
                                    : prev
                                )
                              }
                              disabled={!draft}
                            />
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="my-2 h-2 rounded-md bg-border transition-colors hover:bg-primary/30" />

              <Panel minSize={30} className="min-h-0">
                <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex flex-none items-center justify-between border-b border-border px-4 py-3">
                    <h2 className="text-sm font-semibold text-foreground">נתונים מקושרים</h2>
                    <p className="text-xs text-muted-foreground">
                      פריט פעיל: {draft?.sku ?? "לא נבחר"}
                    </p>
                  </div>

                  <div className="min-h-0 flex-1 overflow-hidden p-3">
                    <Tabs defaultValue="availability" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      <TabsList variant="line" className="flex-none">
                        <TabsTrigger value="availability">זמינות מוצר</TabsTrigger>
                        <TabsTrigger value="purchase-prices">מחירי קניה אפשריים</TabsTrigger>
                        <TabsTrigger value="notes">מוצרים - טקסט</TabsTrigger>
                        <TabsTrigger value="movements">תנועות מלאי אחרונות</TabsTrigger>
                      </TabsList>

                      <TabsContent value="availability" className="mt-3 min-h-0 flex-1 overflow-y-auto">
                        <div className="rounded-lg border border-border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-start">מחסן</TableHead>
                                <TableHead className="text-start">זמין לשיווק</TableHead>
                                <TableHead className="text-start">במחויבות</TableHead>
                                <TableHead className="text-start">בדרך</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {availabilityRows.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                                    אין נתוני זמינות להצגה.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                availabilityRows.map((row) => (
                                  <TableRow key={`child-${row.warehouse}`}>
                                    <TableCell>{row.warehouse}</TableCell>
                                    <TableCell>{row.available.toLocaleString("he-IL")}</TableCell>
                                    <TableCell>{row.reserved.toLocaleString("he-IL")}</TableCell>
                                    <TableCell>{row.incoming.toLocaleString("he-IL")}</TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </TabsContent>

                      <TabsContent value="purchase-prices" className="mt-3 min-h-0 flex-1 overflow-y-auto">
                        <div className="flex items-center justify-between gap-2 pb-2">
                          <div className="text-xs text-muted-foreground">
                            {supplierItemsLoading
                              ? "טוען מחירי ספקים..."
                              : `${purchasingRows.length} מחירים קשורים לפריט`}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!selectedItem}
                            onClick={() => setAddPriceModalOpen(true)}
                          >
                            הוסף מחיר ספק
                          </Button>
                        </div>
                        <div className="rounded-lg border border-border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-start">ספק</TableHead>
                                <TableHead className="text-start">מק"ט ספק</TableHead>
                                <TableHead className="text-start">מטבע</TableHead>
                                <TableHead className="text-start">מחיר בסיס</TableHead>
                                <TableHead className="text-start">הנחה %</TableHead>
                                <TableHead className="text-start">מחיר נטו</TableHead>
                                <TableHead className="text-start">מועדף</TableHead>
                                <TableHead className="text-start">תוקף עד</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {purchasingRows.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                                    {supplierItemsLoading
                                      ? "טוען..."
                                      : "אין נתוני ספקים להצגה."}
                                  </TableCell>
                                </TableRow>
                              ) : (
                                purchasingRows.map((row) => (
                                  <TableRow key={row.id}>
                                    <TableCell>{row.supplierLabel}</TableCell>
                                    <TableCell>{row.supplierSku ?? "—"}</TableCell>
                                    <TableCell>{row.currency}</TableCell>
                                    <TableCell>
                                      {row.basePrice.toLocaleString("he-IL", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                    </TableCell>
                                    <TableCell>
                                      {row.discountPercentage.toLocaleString("he-IL", {
                                        maximumFractionDigits: 2,
                                      })}
                                      %
                                    </TableCell>
                                    <TableCell className="font-medium">
                                      {row.netPrice.toLocaleString("he-IL", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                    </TableCell>
                                    <TableCell>
                                      {row.isPreferred ? "★ מועדף" : "—"}
                                    </TableCell>
                                    <TableCell>{row.validTo ?? "—"}</TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </TabsContent>

                      <TabsContent value="notes" className="mt-3 min-h-0 flex-1 overflow-y-auto">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-muted-foreground">בחירת סוג טקסט:</span>
                            {[1, 2, 3, 4, 5].map((n) => {
                              const typed = n as 1 | 2 | 3 | 4 | 5
                              return (
                                <button
                                  key={n}
                                  type="button"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm transition-colors hover:bg-muted data-[active=true]:border-primary data-[active=true]:bg-primary/10"
                                  data-active={notesTab === typed}
                                  onClick={() => setNotesTab(typed)}
                                >
                                  {n}
                                </button>
                              )
                            })}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="item-note">טקסט מספר {notesTab}</Label>
                            <Textarea
                              id="item-note"
                              value={notesByType[notesTab] ?? ""}
                              onChange={(event) =>
                                setNotesByType((prev) => ({
                                  ...prev,
                                  [notesTab]: event.target.value,
                                }))
                              }
                              rows={8}
                              placeholder="הזינו טקסט חופשי לסוג ההערה שנבחר"
                            />
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="movements" className="mt-3 min-h-0 flex-1 overflow-y-auto">
                        <div className="rounded-lg border border-border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-start">מסמך</TableHead>
                                <TableHead className="text-start">סוג תנועה</TableHead>
                                <TableHead className="text-start">כמות</TableHead>
                                <TableHead className="text-start">תאריך</TableHead>
                                <TableHead className="text-start">מבצע</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {movementRows.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                                    אין תנועות להצגה.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                movementRows.map((row) => (
                                  <TableRow key={row.doc}>
                                    <TableCell>{row.doc}</TableCell>
                                    <TableCell>{row.type}</TableCell>
                                    <TableCell>{row.qty.toLocaleString("he-IL")}</TableCell>
                                    <TableCell>{row.date}</TableCell>
                                    <TableCell>{row.user}</TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </div>
        </section>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>פתיחת פריט חדש</DialogTitle>
            <DialogDescription>
              הזינו נתוני בסיס כדי ליצור פריט חדש במסך הכבד.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-2">
              <Label htmlFor="new-item-sku">מק״ט</Label>
              <Input
                id="new-item-sku"
                value={createDraft.sku}
                onChange={(event) =>
                  setCreateDraft((prev) => ({ ...prev, sku: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-item-description">תיאור</Label>
              <Input
                id="new-item-description"
                value={createDraft.description}
                onChange={(event) =>
                  setCreateDraft((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-item-uom">יחידת מידה</Label>
                <Select
                  value={createDraft.uom}
                  onValueChange={(value) =>
                    setCreateDraft((prev) => ({ ...prev, uom: value ?? "" }))
                  }
                >
                  <SelectTrigger id="new-item-uom">
                    {/*
                      Base UI Select.Value מציג את ה-`value` הגולמי כברירת מחדל.
                      משתמשים ב-children render-prop כדי להציג label עברי במקום הקוד החשוף.
                    */}
                    <SelectValue placeholder={uoms.length === 0 ? "טוען..." : "בחר יחידת מידה"}>
                      {(value: string) => {
                        const u = uoms.find((row) => row.code === value)
                        return u ? `${u.code} · ${u.descriptionHe}` : null
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {uoms.map((u) => (
                      <SelectItem key={u.id} value={u.code}>
                        {u.code} · {u.descriptionHe}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>משפחת מוצר</Label>
                <Select
                  value={createDraft.productFamilyId}
                  onValueChange={(value) =>
                    setCreateDraft((prev) => ({ ...prev, productFamilyId: value ?? "" }))
                  }
                >
                  <SelectTrigger>
                    {/*
                      ללא render-prop, Base UI Select.Value יציג את ה-UUID של הרשומה.
                      ממפים אותו לתצוגת `קוד · שם` תוך שמירה של ה-id ב-state.
                    */}
                    <SelectValue placeholder={families.length === 0 ? "אין משפחות זמינות" : "בחר משפחה"}>
                      {(value: string) => {
                        const family = families.find((row) => row.id === value)
                        return family ? `${family.familyCode} · ${family.familyName}` : null
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {families.map((family) => (
                      <SelectItem key={family.id} value={family.id}>
                        {family.familyCode} · {family.familyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              ביטול
            </Button>
            <Button type="button" onClick={() => void handleCreateItem()} disabled={creating}>
              {creating ? "שומר..." : "יצירה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddSupplierPriceModal
        itemId={selectedItem?.id ?? null}
        itemSku={selectedItem?.sku ?? null}
        isOpen={addPriceModalOpen}
        onClose={() => setAddPriceModalOpen(false)}
        onSuccess={() => {
          // ריענון מיידי של הטבלה אחרי שמירה מוצלחת כדי שהשורה החדשה תופיע מיד.
          void reloadSupplierItems()
        }}
      />
    </div>
  )
}
