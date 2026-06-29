"use client"

import * as React from "react"
import { Building2, FileDown, Loader2, Plus, RefreshCcw } from "lucide-react"
import { toast } from "sonner"

import { DirectActivationsMenu } from "@/components/erp/workspaces/shared/direct-activations-menu"
import {
  DenseMasterDetailTemplate,
  ERP_DENSE_INPUT_CLASS,
  ERP_DENSE_LABEL_CLASS,
} from "@/components/layout/DenseMasterDetailTemplate"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { readActiveCompanyIdFromCookie } from "@/lib/company-context"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"
import type { ErpDirectActivation } from "@/types/erp"

type ApiResponse<T> = { data: T; error?: string }

type SupplierLookup = {
  id: string
  supplierNum: string
  name: string
  paymentTerms: string | null
  taxId: string | null
}

type SupplierContact = {
  id: string
  name: string
  role: string | null
  phone: string | null
  email: string | null
}

type SupplierDetail = SupplierLookup & {
  contacts?: SupplierContact[]
}

type PriceListHeader = {
  id: string
  supplierId: string
  listCode: string
  validFrom: string | null
  validUntil: string | null
  currencyCode: string
  source: "erp_vendor_price_lists" | "erp_supplier_price_lists"
}

type PriceListLine = {
  id: string
  itemSku: string
  itemDescription: string
  uom: string | null
  minQty: number
  unitPrice: number
}

async function requestJson<T>(url: string): Promise<T> {
  const activeCompanyId = readActiveCompanyIdFromCookie()
  const headers = new Headers()
  if (activeCompanyId) {
    headers.set("x-company-id", activeCompanyId)
    headers.set("x-active-company-id", activeCompanyId)
  }
  const response = await fetch(url, { headers, credentials: "same-origin", cache: "no-store" })
  const payload = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(payload.error ?? `API error (${response.status})`)
  return payload as T
}

function money(currency: string, value: number): string {
  return Number(value || 0).toLocaleString("he-IL", { style: "currency", currency: currency || "ILS" })
}

export function VendorPriceListsWorkspaceClient() {
  const [loading, setLoading] = React.useState(true)
  const [loadingLines, setLoadingLines] = React.useState(false)
  const [priceLists, setPriceLists] = React.useState<PriceListHeader[]>([])
  const [suppliers, setSuppliers] = React.useState<SupplierLookup[]>([])
  const [selectedPriceListId, setSelectedPriceListId] = React.useState<string | null>(null)
  const [priceListLines, setPriceListLines] = React.useState<PriceListLine[]>([])
  const [supplierDetail, setSupplierDetail] = React.useState<SupplierDetail | null>(null)
  const [search, setSearch] = React.useState("")

  const supplierMap = React.useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers]
  )
  const filteredPriceLists = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return priceLists
    return priceLists.filter((row) => {
      const supplier = supplierMap.get(row.supplierId)
      const text = `${row.listCode} ${supplier?.name ?? ""} ${row.currencyCode}`.toLowerCase()
      return text.includes(query)
    })
  }, [priceLists, search, supplierMap])
  const selectedPriceList = React.useMemo(
    () => priceLists.find((row) => row.id === selectedPriceListId) ?? null,
    [priceLists, selectedPriceListId]
  )
  const selectedSupplier = selectedPriceList ? supplierMap.get(selectedPriceList.supplierId) ?? null : null

  const loadWorkspace = React.useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const [supplierRes, priceListRes] = await Promise.all([
        requestJson<ApiResponse<SupplierLookup[]>>("/api/suppliers"),
        supabase
          .from("erp_vendor_price_lists")
          .select("id,supplier_id,list_code,valid_from,valid_to,currency_code")
          .order("valid_from", { ascending: false })
          .limit(400),
      ])

      const nextSuppliers = supplierRes.data ?? []
      setSuppliers(nextSuppliers)

      let nextPriceLists: PriceListHeader[] = []
      if (!priceListRes.error && priceListRes.data && priceListRes.data.length > 0) {
        nextPriceLists = (priceListRes.data as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id),
          supplierId: String(row.supplier_id),
          listCode: String(row.list_code),
          validFrom: row.valid_from ? String(row.valid_from) : null,
          validUntil: row.valid_to ? String(row.valid_to) : null,
          currencyCode: String(row.currency_code ?? "ILS"),
          source: "erp_vendor_price_lists",
        }))
      } else {
        const fallbackRes = await supabase
          .from("erp_supplier_price_lists")
          .select("id,supplier_id,price_list_code,valid_from,valid_to,currency_code")
          .order("valid_from", { ascending: false })
          .limit(1500)
        if (fallbackRes.error) throw fallbackRes.error
        const grouped = new Map<string, PriceListHeader>()
        for (const row of (fallbackRes.data ?? []) as Array<Record<string, unknown>>) {
          const supplierId = String(row.supplier_id)
          const listCode = String(row.price_list_code ?? "DEFAULT")
          const key = `${supplierId}:${listCode}`
          if (!grouped.has(key)) {
            grouped.set(key, {
              id: key,
              supplierId,
              listCode,
              validFrom: row.valid_from ? String(row.valid_from) : null,
              validUntil: row.valid_to ? String(row.valid_to) : null,
              currencyCode: String(row.currency_code ?? "ILS"),
              source: "erp_supplier_price_lists",
            })
          }
        }
        nextPriceLists = Array.from(grouped.values())
      }

      setPriceLists(nextPriceLists)
      setSelectedPriceListId((prev) => prev ?? nextPriceLists[0]?.id ?? null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "טעינת מחירוני ספק נכשלה")
      setPriceLists([])
      setSuppliers([])
      setSelectedPriceListId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPriceListDetail = React.useCallback(
    async (priceList: PriceListHeader) => {
      setLoadingLines(true)
      try {
        const supabase = createSupabaseBrowserClient()
        if (priceList.source === "erp_vendor_price_lists") {
          const [linesRes, itemsRes] = await Promise.all([
            supabase
              .from("erp_vendor_price_list_items")
              .select("id,item_sku,min_quantity,unit_price")
              .eq("price_list_id", priceList.id)
              .order("min_quantity", { ascending: true }),
            supabase.from("erp_items").select("sku,description,uom"),
          ])
          if (linesRes.error) throw linesRes.error
          if (itemsRes.error) throw itemsRes.error
          const itemBySku = new Map(
            ((itemsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [
              String(row.sku),
              {
                description: String(row.description ?? ""),
                uom: row.uom ? String(row.uom) : null,
              },
            ])
          )
          setPriceListLines(
            ((linesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => {
              const sku = String(row.item_sku)
              return {
                id: String(row.id),
                itemSku: sku,
                itemDescription: itemBySku.get(sku)?.description ?? sku,
                uom: itemBySku.get(sku)?.uom ?? null,
                minQty: Number(row.min_quantity ?? 1),
                unitPrice: Number(row.unit_price ?? 0),
              }
            })
          )
        } else {
          const [supplierId, priceListCode] = priceList.id.split(":")
          const [linesRes, catalogRes] = await Promise.all([
            supabase
              .from("erp_supplier_price_lists")
              .select("id,item_sku,price")
              .eq("supplier_id", supplierId)
              .eq("price_list_code", priceListCode)
              .order("item_sku", { ascending: true }),
            masterDataFetch<Array<{ sku: string; description: string; uom: string | null }>>(
              "/api/erp/master-data/items"
            ),
          ])
          if (linesRes.error) throw linesRes.error
          const catalogMap = new Map(
            (catalogRes ?? []).map((row) => [
              String(row.sku),
              {
                description: String(row.description ?? ""),
                uom: row.uom ? String(row.uom) : null,
              },
            ])
          )
          setPriceListLines(
            ((linesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => {
              const sku = String(row.item_sku)
              return {
                id: String(row.id),
                itemSku: sku,
                itemDescription: catalogMap.get(sku)?.description ?? sku,
                uom: catalogMap.get(sku)?.uom ?? null,
                minQty: 1,
                unitPrice: Number(row.price ?? 0),
              }
            })
          )
        }

        const supplierRes = await requestJson<ApiResponse<SupplierDetail>>(
          `/api/suppliers/${priceList.supplierId}?include=contacts`
        ).catch(() => ({ data: null as SupplierDetail | null }))
        setSupplierDetail(supplierRes.data)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "טעינת פירוט מחירון נכשלה")
        setPriceListLines([])
        setSupplierDetail(null)
      } finally {
        setLoadingLines(false)
      }
    },
    []
  )

  React.useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  React.useEffect(() => {
    if (!selectedPriceList) {
      setPriceListLines([])
      setSupplierDetail(null)
      return
    }
    void loadPriceListDetail(selectedPriceList)
  }, [loadPriceListDetail, selectedPriceList])

  const activations = React.useMemo<ErpDirectActivation<PriceListHeader>[]>(
    () => [
      {
        id: "add-price-list",
        label: "Add Price List",
        hint: "פתיחת מסך יצירת מחירון ספק",
        onActivate: async () => {
          window.open("/marker-ofek/supply-chain/suppliers", "_blank", "noopener,noreferrer")
        },
      },
      {
        id: "export-price-list",
        label: "Export PDF",
        hint: "ייצוא תצוגת המחירון הנבחר",
        disabled: !selectedPriceList,
        onActivate: async ({ entity }) => {
          if (!entity) throw new Error("בחרו מחירון לפני ייצוא")
          toast.success(`ייצוא PDF הופעל עבור מחירון ${entity.listCode}`)
        },
      },
    ],
    [selectedPriceList]
  )

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background">
      <DenseMasterDetailTemplate
        dir="rtl"
        eyebrow="Procurement"
        title="Supplier Price Lists Workspace"
        description="מחירוני ספקים בתצורת Master-Detail Bento עם פירוט שורות וספק."
        leading={<Building2 />}
        className="bg-background"
        headerActions={
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => void loadWorkspace()}>
              <RefreshCcw className="ms-1 size-3.5" />
              רענון
            </Button>
            <DirectActivationsMenu
              title="Direct Activations"
              entityName="Vendor Price List"
              entity={selectedPriceList}
              activations={activations}
            />
            <Button
              size="sm"
              className="bg-[#00A76F] text-white hover:bg-[#029c67]"
              onClick={() => window.open("/marker-ofek/supply-chain/suppliers", "_blank", "noopener,noreferrer")}
            >
              <Plus className="ms-1 size-3.5" />
              מחירון חדש
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedPriceList}
              onClick={() => {
                if (!selectedPriceList) return
                toast.success(`ייצוא PDF הופעל עבור מחירון ${selectedPriceList.listCode}`)
              }}
            >
              <FileDown className="ms-1 size-3.5" />
              Export PDF
            </Button>
          </div>
        }
        master={
          <div className="space-y-2">
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <label className="grid gap-1">
                <span className={ERP_DENSE_LABEL_CLASS}>חיפוש מחירון</span>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className={ERP_DENSE_INPUT_CLASS}
                  placeholder="קוד מחירון / ספק / מטבע"
                />
              </label>
              <div className="flex items-end text-xs text-slate-500">
                {filteredPriceLists.length.toLocaleString("he-IL")} מחירונים
              </div>
            </div>
            <div className="max-h-[40vh] overflow-auto rounded-xl border border-slate-200 bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-card hover:bg-card">
                    <TableHead className="text-right">Price List Code</TableHead>
                    <TableHead className="text-right">Supplier Name</TableHead>
                    <TableHead className="text-right">Valid From</TableHead>
                    <TableHead className="text-right">Valid Until</TableHead>
                    <TableHead className="text-right">Currency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-sm text-slate-500">
                        <Loader2 className="ms-2 inline size-4 animate-spin" />
                        טוען מחירונים...
                      </TableCell>
                    </TableRow>
                  ) : filteredPriceLists.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-sm text-slate-500">
                        אין מחירוני ספק להצגה.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPriceLists.map((row) => (
                      <TableRow
                        key={row.id}
                        className={cn(
                          "cursor-pointer hover:bg-background",
                          selectedPriceListId === row.id && "bg-emerald-50/40 hover:bg-emerald-50/50"
                        )}
                        onClick={() => setSelectedPriceListId(row.id)}
                      >
                        <TableCell className="font-mono text-xs">{row.listCode}</TableCell>
                        <TableCell>{supplierMap.get(row.supplierId)?.name ?? row.supplierId}</TableCell>
                        <TableCell className="text-xs">{row.validFrom ?? "—"}</TableCell>
                        <TableCell className="text-xs">{row.validUntil ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{row.currencyCode}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        }
        detail={
          <Tabs defaultValue="items">
            <TabsList variant="line" className="h-9 rounded-xl bg-card shadow-sm">
              <TabsTrigger value="items">Items & Prices</TabsTrigger>
              <TabsTrigger value="supplier">Supplier Info</TabsTrigger>
            </TabsList>
            <TabsContent value="items" className="mt-2">
              <div className="max-h-[42vh] overflow-auto rounded-xl border border-slate-200 bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">Item SKU</TableHead>
                      <TableHead className="text-right">Description</TableHead>
                      <TableHead className="text-right">UoM</TableHead>
                      <TableHead className="text-right">Tiered / Min Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingLines ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-sm text-slate-500">
                          טוען שורות מחירון...
                        </TableCell>
                      </TableRow>
                    ) : priceListLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-sm text-slate-500">
                          אין שורות מחירון להצגה.
                        </TableCell>
                      </TableRow>
                    ) : (
                      priceListLines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="font-mono text-xs">{line.itemSku}</TableCell>
                          <TableCell>{line.itemDescription}</TableCell>
                          <TableCell>{line.uom ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{line.minQty.toLocaleString("he-IL")}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {money(selectedPriceList?.currencyCode ?? "ILS", line.unitPrice)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            <TabsContent value="supplier" className="mt-2">
              {!selectedSupplier ? (
                <div className="rounded-xl border border-slate-200 bg-card p-4 text-sm text-slate-500">
                  בחרו מחירון להצגת פרטי ספק.
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-card p-3">
                    <p className="text-[11px] text-slate-500">Supplier</p>
                    <p className="text-sm font-semibold">{selectedSupplier.name}</p>
                    <p className="text-xs text-slate-500">{selectedSupplier.supplierNum}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-card p-3">
                    <p className="text-[11px] text-slate-500">Payment Terms</p>
                    <p className="text-sm">{selectedSupplier.paymentTerms ?? "—"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-card p-3">
                    <p className="text-[11px] text-slate-500">Tax ID</p>
                    <p className="text-sm">{selectedSupplier.taxId ?? "—"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-card p-3 md:col-span-3">
                    <p className="mb-2 text-[11px] text-slate-500">Contacts</p>
                    {(supplierDetail?.contacts ?? []).length === 0 ? (
                      <p className="text-sm text-slate-500">אין אנשי קשר לספק זה.</p>
                    ) : (
                      <div className="grid gap-2 md:grid-cols-2">
                        {(supplierDetail?.contacts ?? []).map((contact) => (
                          <div key={contact.id} className="rounded-lg border border-slate-200 bg-background/60 p-2">
                            <p className="text-sm font-semibold">{contact.name}</p>
                            <p className="text-xs text-slate-600">
                              {contact.role ?? "—"} · {contact.phone ?? "—"} · {contact.email ?? "—"}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
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

