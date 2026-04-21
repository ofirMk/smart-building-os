"use client"

import * as React from "react"
import { Boxes, FileDown, Loader2, Plus, RefreshCcw } from "lucide-react"
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
import { cn } from "@/lib/utils"
import type { ErpDirectActivation } from "@/types/erp"

type ScopeType = "PROJECT" | "WAREHOUSE"

type ScopeRow = {
  id: string
  code: string
  name: string
  type: ScopeType
}

type StockRow = {
  itemId: string
  sku: string
  description: string
  uom: string | null
  balance: number
}

type MovementRow = {
  id: string
  createdAt: string
  transactionType: string
  quantity: number
  itemSku: string
  itemDescription: string
  notes: string | null
}

function movementBadgeClass(kind: string): string {
  if (kind === "incoming") return "border-emerald-200 bg-emerald-50 text-emerald-800"
  if (kind === "outgoing") return "border-amber-200 bg-amber-50 text-amber-800"
  return "border-slate-300 bg-slate-100 text-slate-700"
}

export function InventorySheetWorkspaceClient() {
  const [loading, setLoading] = React.useState(true)
  const [loadingDetail, setLoadingDetail] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [scopes, setScopes] = React.useState<ScopeRow[]>([])
  const [selectedScopeId, setSelectedScopeId] = React.useState<string | null>(null)
  const [stockRows, setStockRows] = React.useState<StockRow[]>([])
  const [movementRows, setMovementRows] = React.useState<MovementRow[]>([])

  const selectedScope = React.useMemo(
    () => scopes.find((scope) => scope.id === selectedScopeId) ?? null,
    [scopes, selectedScopeId]
  )
  const filteredScopes = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return scopes
    return scopes.filter((scope) => `${scope.code} ${scope.name}`.toLowerCase().includes(query))
  }, [scopes, search])

  const loadScopes = React.useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const [projectsRes, buildingsRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id,name,internal_project_code")
          .eq("is_deleted", false)
          .order("name", { ascending: true })
          .limit(300),
        supabase
          .from("buildings")
          .select("id,name")
          .order("name", { ascending: true })
          .limit(100),
      ])
      if (projectsRes.error) throw projectsRes.error
      const projectScopes: ScopeRow[] = ((projectsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: `project:${String(row.id)}`,
        code: String(row.internal_project_code ?? "PRJ"),
        name: String(row.name ?? "Project"),
        type: "PROJECT",
      }))
      const warehouseScopes: ScopeRow[] = (buildingsRes.error ? [] : (buildingsRes.data ?? [])).map(
        (row: Record<string, unknown>) => ({
          id: `warehouse:${String(row.id)}`,
          code: "WH",
          name: String(row.name ?? "Warehouse"),
          type: "WAREHOUSE",
        })
      )
      const allScopes = [{ id: "warehouse:main", code: "WH-MAIN", name: "Main Warehouse", type: "WAREHOUSE" as const }, ...projectScopes, ...warehouseScopes]
      setScopes(allScopes)
      setSelectedScopeId((prev) => prev ?? allScopes[0]?.id ?? null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "טעינת רשימת מלאי נכשלה")
      setScopes([])
      setSelectedScopeId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadScopeDetail = React.useCallback(async (scope: ScopeRow) => {
    setLoadingDetail(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const itemsRes = await supabase
        .from("items_catalog")
        .select("id,sku,description,unit,is_inventory")
        .eq("is_inventory", true)
        .limit(4000)
      if (itemsRes.error) throw itemsRes.error
      let txQuery = supabase
        .from("inventory_transactions")
        .select("id,project_id,item_catalog_id,transaction_type,quantity,created_at,notes")
        .order("created_at", { ascending: false })
        .limit(4000)
      if (scope.type === "PROJECT") {
        txQuery = txQuery.eq("project_id", scope.id.replace("project:", ""))
      }
      const txRes = await txQuery
      if (txRes.error) throw txRes.error

      const items = (itemsRes.data ?? []) as Array<Record<string, unknown>>
      const txRows = (txRes.data ?? []) as Array<Record<string, unknown>>
      const itemMap = new Map(
        items.map((item) => [
          String(item.id),
          {
            sku: String(item.sku ?? ""),
            description: String(item.description ?? ""),
            uom: item.unit ? String(item.unit) : null,
          },
        ])
      )
      const balances = new Map<string, number>()
      for (const tx of txRows) {
        const itemId = String(tx.item_catalog_id)
        if (!itemMap.has(itemId)) continue
        const qty = Number(tx.quantity ?? 0)
        const type = String(tx.transaction_type ?? "adjustment")
        const signedQty = type === "outgoing" ? -Math.abs(qty) : Math.abs(qty)
        balances.set(itemId, (balances.get(itemId) ?? 0) + signedQty)
      }

      setStockRows(
        Array.from(balances.entries())
          .map(([itemId, balance]) => ({
            itemId,
            sku: itemMap.get(itemId)?.sku ?? "",
            description: itemMap.get(itemId)?.description ?? "",
            uom: itemMap.get(itemId)?.uom ?? null,
            balance,
          }))
          .sort((a, b) => a.sku.localeCompare(b.sku))
      )
      setMovementRows(
        txRows.map((tx) => {
          const itemId = String(tx.item_catalog_id)
          const item = itemMap.get(itemId)
          return {
            id: String(tx.id),
            createdAt: String(tx.created_at ?? ""),
            transactionType: String(tx.transaction_type ?? ""),
            quantity: Number(tx.quantity ?? 0),
            itemSku: item?.sku ?? itemId,
            itemDescription: item?.description ?? "—",
            notes: tx.notes ? String(tx.notes) : null,
          }
        })
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "טעינת פירוט מלאי נכשלה")
      setStockRows([])
      setMovementRows([])
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  React.useEffect(() => {
    void loadScopes()
  }, [loadScopes])

  React.useEffect(() => {
    if (!selectedScope) {
      setStockRows([])
      setMovementRows([])
      return
    }
    void loadScopeDetail(selectedScope)
  }, [loadScopeDetail, selectedScope])

  const activations = React.useMemo<ErpDirectActivation<ScopeRow>[]>(
    () => [
      {
        id: "add-inventory-movement",
        label: "Add Stock Movement",
        hint: "פתיחת מסך תנועת מלאי",
        onActivate: async () => {
          window.open("/marker-ofek/procurement/warehouse-outgoing", "_blank", "noopener,noreferrer")
        },
      },
      {
        id: "export-stock-sheet",
        label: "Export PDF",
        hint: "ייצוא דוח מלאי לסקופ הנבחר",
        disabled: !selectedScope,
        onActivate: async ({ entity }) => {
          if (!entity) throw new Error("יש לבחור סקופ לפני ייצוא")
          toast.success(`ייצוא דוח מלאי הופעל עבור ${entity.name}`)
        },
      },
    ],
    [selectedScope]
  )

  return (
    <div className="min-h-[calc(100vh-9rem)] bg-[#F8FAFC]">
      <DenseMasterDetailTemplate
        dir="rtl"
        eyebrow="Inventory Control"
        title="Inventory Sheet Workspace"
        description="מעקב מלאי חי עם תנועות, ברמת פרויקט/מחסן, בתבנית Master-Detail."
        leading={<Boxes />}
        className="bg-[#F8FAFC]"
        headerActions={
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => void loadScopes()}>
              <RefreshCcw className="ms-1 size-3.5" />
              רענון
            </Button>
            <DirectActivationsMenu
              title="Direct Activations"
              entityName="Inventory Scope"
              entity={selectedScope}
              activations={activations}
            />
            <Button
              size="sm"
              className="bg-[#00A76F] text-white hover:bg-[#029c67]"
              onClick={() =>
                window.open("/marker-ofek/procurement/warehouse-outgoing", "_blank", "noopener,noreferrer")
              }
            >
              <Plus className="ms-1 size-3.5" />
              תנועת מלאי חדשה
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedScope}
              onClick={() => {
                if (!selectedScope) return
                toast.success(`ייצוא דוח הופעל עבור ${selectedScope.name}`)
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
                <span className={ERP_DENSE_LABEL_CLASS}>חיפוש פרויקט/מחסן</span>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className={ERP_DENSE_INPUT_CLASS}
                  placeholder="קוד / שם"
                />
              </label>
              <div className="flex items-end text-xs text-slate-500">
                {filteredScopes.length.toLocaleString("he-IL")} רשומות
              </div>
            </div>
            <div className="max-h-[40vh] overflow-auto rounded-xl border border-slate-200 bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-card hover:bg-card">
                    <TableHead className="text-right">Type</TableHead>
                    <TableHead className="text-right">Code</TableHead>
                    <TableHead className="text-right">Name</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-sm text-slate-500">
                        <Loader2 className="ms-2 inline size-4 animate-spin" />
                        טוען רשימת פרויקטים/מחסנים...
                      </TableCell>
                    </TableRow>
                  ) : filteredScopes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-sm text-slate-500">
                        אין רשומות להצגה.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredScopes.map((scope) => (
                      <TableRow
                        key={scope.id}
                        className={cn(
                          "cursor-pointer hover:bg-background",
                          selectedScopeId === scope.id && "bg-emerald-50/40 hover:bg-emerald-50/50"
                        )}
                        onClick={() => setSelectedScopeId(scope.id)}
                      >
                        <TableCell>{scope.type === "PROJECT" ? "Project" : "Warehouse"}</TableCell>
                        <TableCell className="font-mono text-xs">{scope.code}</TableCell>
                        <TableCell>{scope.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={scope.type === "PROJECT" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>
                            {scope.type}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        }
        detail={
          <Tabs defaultValue="stock">
            <TabsList variant="line" className="h-9 rounded-xl bg-card shadow-sm">
              <TabsTrigger value="stock">Current Stock (Inventory Managed)</TabsTrigger>
              <TabsTrigger value="movements">Stock Movements</TabsTrigger>
            </TabsList>
            <TabsContent value="stock" className="mt-2">
              <div className="max-h-[42vh] overflow-auto rounded-xl border border-slate-200 bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">SKU</TableHead>
                      <TableHead className="text-right">Description</TableHead>
                      <TableHead className="text-right">UoM</TableHead>
                      <TableHead className="text-right">Current Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingDetail ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-20 text-center text-sm text-slate-500">
                          טוען יתרות מלאי...
                        </TableCell>
                      </TableRow>
                    ) : stockRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-20 text-center text-sm text-slate-500">
                          אין יתרות מלאי להצגה.
                        </TableCell>
                      </TableRow>
                    ) : (
                      stockRows.map((row) => (
                        <TableRow key={row.itemId}>
                          <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                          <TableCell>{row.description}</TableCell>
                          <TableCell>{row.uom ?? "—"}</TableCell>
                          <TableCell className={cn("font-mono text-xs", row.balance < 0 ? "text-red-700" : "text-emerald-700")}>
                            {row.balance.toLocaleString("he-IL")}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            <TabsContent value="movements" className="mt-2">
              <div className="max-h-[42vh] overflow-auto rounded-xl border border-slate-200 bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">Date</TableHead>
                      <TableHead className="text-right">Type</TableHead>
                      <TableHead className="text-right">SKU</TableHead>
                      <TableHead className="text-right">Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingDetail ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-20 text-center text-sm text-slate-500">
                          טוען תנועות...
                        </TableCell>
                      </TableRow>
                    ) : movementRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-20 text-center text-sm text-slate-500">
                          אין תנועות מלאי להצגה.
                        </TableCell>
                      </TableRow>
                    ) : (
                      movementRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs">{row.createdAt ? new Date(row.createdAt).toLocaleString("he-IL") : "—"}</TableCell>
                          <TableCell>
                          <Badge variant="outline" className={movementBadgeClass(row.transactionType)}>
                            {row.transactionType}
                          </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.itemSku}</TableCell>
                          <TableCell>{row.itemDescription}</TableCell>
                          <TableCell className="font-mono text-xs">{row.quantity.toLocaleString("he-IL")}</TableCell>
                          <TableCell className="text-xs text-slate-500">{row.notes ?? "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        }
      />
    </div>
  )
}

