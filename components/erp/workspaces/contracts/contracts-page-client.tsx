"use client"

import * as React from "react"
import { Loader2, RefreshCcw, Search } from "lucide-react"
import { z } from "zod"

import {
  DenseMasterDetailTemplate,
  ERP_DENSE_INPUT_CLASS,
  ERP_DENSE_LABEL_CLASS,
} from "@/components/layout/DenseMasterDetailTemplate"
import {
  ErpChooseList,
  type ErpChooseListOption,
} from "@/components/erp/workspaces/shared/erp-choose-list"
import { useErpLookupCache } from "@/components/erp/workspaces/shared/use-erp-lookup-cache"
import { BentoMetricCard } from "@/components/ui/bento-metric-card"
import { BentoSmartList, SmartListStatusPill } from "@/components/ui/bento-smart-list"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiGet } from "@/lib/utils/api-client"
import { cn } from "@/lib/utils"
import type { ErpContract, ErpContractStatus } from "@/types/erp"

type ProjectLookup = { id: string; projectNumber: string; name: string }
type SupplierType = "STANDARD" | "SUBCONTRACTOR"
type SupplierLookup = {
  id: string
  supplierNum: string
  name: string
  type: SupplierType
  taxId: string | null
  paymentTerms: string | null
}

const contractSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  supplierId: z.string().uuid(),
  contractNumber: z.string(),
  title: z.string(),
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "ACTIVE", "CLOSED"]),
  totalAmount: z.coerce.number(),
  paymentTermsOverride: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  companyId: z.string(),
})

const contractsSchema = z.array(contractSchema)
const projectLookupSchema = z.object({
  id: z.string().uuid(),
  projectNumber: z.string(),
  name: z.string(),
})
const supplierLookupSchema = z.object({
  id: z.string().uuid(),
  supplierNum: z.string(),
  name: z.string(),
  type: z.enum(["STANDARD", "SUBCONTRACTOR"]),
  taxId: z.string().nullable(),
  paymentTerms: z.string().nullable(),
})
const contractLineSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  boqLineId: z.string().nullable(),
  itemId: z.string().nullable(),
  quantity: z.coerce.number(),
  unitPrice: z.coerce.number(),
  totalPrice: z.coerce.number(),
})
const contractLinesSchema = z.array(contractLineSchema)

function statusTone(status: ErpContractStatus): "success" | "info" | "neutral" | "warning" {
  if (status === "ACTIVE") return "success"
  if (status === "PENDING_APPROVAL") return "info"
  if (status === "CLOSED") return "neutral"
  return "warning"
}

export function ContractsPageClient() {
  const [contracts, setContracts] = React.useState<ErpContract[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [searchDraft, setSearchDraft] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<"ALL" | ErpContractStatus>("ALL")
  const [projectId, setProjectId] = React.useState<"ALL" | string>("ALL")
  const [supplierId, setSupplierId] = React.useState<"ALL" | string>("ALL")
  const [trade, setTrade] = React.useState<"ALL" | SupplierType>("ALL")
  const [selectedContractId, setSelectedContractId] = React.useState<string | null>(null)
  const [selectedContractLines, setSelectedContractLines] = React.useState<{
    id: string
    description: string
    boqLineId: string | null
    itemId: string | null
    quantity: number
    unitPrice: number
    totalPrice: number
  }[]>([])
  const [loadingLines, setLoadingLines] = React.useState(false)

  const {
    data: projects,
    loading: loadingProjects,
    refresh: refreshProjects,
  } = useErpLookupCache<ProjectLookup>({
    cacheKey: "erp-project-lookups",
    loader: async () => {
      return apiGet<ProjectLookup[]>("/api/projects", { schema: z.array(projectLookupSchema) })
    },
  })
  const {
    data: suppliers,
    loading: loadingSuppliers,
    refresh: refreshSuppliers,
  } = useErpLookupCache<SupplierLookup>({
    cacheKey: "erp-supplier-lookups",
    loader: async () => {
      return apiGet<SupplierLookup[]>("/api/suppliers", { schema: z.array(supplierLookupSchema) })
    },
  })

  const projectMap = React.useMemo(
    () => new Map(projects.map((project) => [project.id, `${project.projectNumber} · ${project.name}`])),
    [projects]
  )
  const supplierMap = React.useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, `${supplier.supplierNum} · ${supplier.name}`])),
    [suppliers]
  )

  const totalAmount = React.useMemo(
    () => contracts.reduce((sum, contract) => sum + Number(contract.totalAmount || 0), 0),
    [contracts]
  )
  const projectOptions = React.useMemo<ErpChooseListOption[]>(
    () => [
      { value: "ALL", label: "כל הפרויקטים", searchText: "all projects" },
      ...projects.map((project) => ({
        value: project.id,
        label: `${project.projectNumber} · ${project.name}`,
        searchText: `${project.projectNumber} ${project.name}`,
      })),
    ],
    [projects]
  )
  const supplierOptions = React.useMemo<ErpChooseListOption[]>(
    () => [
      { value: "ALL", label: "כל הספקים", searchText: "all suppliers" },
      ...suppliers.map((supplier) => ({
        value: supplier.id,
        label: `${supplier.supplierNum} · ${supplier.name}`,
        description: `${supplier.type} · ${supplier.taxId ?? "ללא ח.פ"}`,
        searchText: `${supplier.supplierNum} ${supplier.name} ${supplier.taxId ?? ""}`,
      })),
    ],
    [suppliers]
  )
  const supplierTypeById = React.useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.type])),
    [suppliers]
  )
  const selectedSupplierLookup = React.useMemo(() => {
    if (supplierId === "ALL") return null
    return suppliers.find((supplier) => supplier.id === supplierId) ?? null
  }, [supplierId, suppliers])

  const loadData = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set("q", search.trim())
      if (status !== "ALL") params.set("status", status)
      if (projectId !== "ALL") params.set("projectId", projectId)
      if (supplierId !== "ALL") params.set("supplierId", supplierId)

      const contractsUrl = params.size > 0 ? `/api/contracts?${params.toString()}` : "/api/contracts"
      const nextContracts = await apiGet<ErpContract[]>(contractsUrl, {
        schema: contractsSchema,
        signal,
      })
      setContracts(nextContracts)
      setSelectedContractId((prev) =>
        prev && nextContracts.some((contract) => contract.id === prev)
          ? prev
          : nextContracts[0]?.id ?? null
      )
    } catch (loadError) {
      setContracts([])
      setError(loadError instanceof Error ? loadError.message : "טעינת חוזים נכשלה")
    } finally {
      setLoading(false)
    }
  }, [search, status, projectId, supplierId])

  React.useEffect(() => {
    const controller = new AbortController()
    void loadData(controller.signal)
    return () => controller.abort()
  }, [loadData])

  React.useEffect(() => {
    if (supplierId === "ALL") return
    if (trade === "ALL") return
    if (supplierTypeById.get(supplierId) !== trade) {
      setSupplierId("ALL")
    }
  }, [supplierId, supplierTypeById, trade])

  const selectedContract = React.useMemo(() => {
    return contracts.find((contract) => contract.id === selectedContractId) ?? null
  }, [contracts, selectedContractId])

  React.useEffect(() => {
    if (!selectedContractId) {
      setSelectedContractLines([])
      return
    }
    const controller = new AbortController()
    const loadLines = async () => {
      setLoadingLines(true)
      try {
        const linesRes = await apiGet<
          {
            id: string
            description: string
            boqLineId: string | null
            itemId: string | null
            quantity: number
            unitPrice: number
            totalPrice: number
          }[]
        >(`/api/contracts/${selectedContractId}/lines`, {
          schema: contractLinesSchema,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setSelectedContractLines(linesRes)
      } catch {
        if (controller.signal.aborted) return
        setSelectedContractLines([])
      } finally {
        if (!controller.signal.aborted) setLoadingLines(false)
      }
    }
    void loadLines()
    return () => controller.abort()
  }, [selectedContractId])

  return (
    <div className="min-h-[calc(100vh-9rem)] bg-[#F8FAFC]">
      <DenseMasterDetailTemplate
        dir="rtl"
        eyebrow="Contracts & Billing"
        title="חוזים - מסך אב"
        description="תצוגת חוזים ארגונית עם סינון לפי פרויקט, ספק וסטטוס."
        className="bg-[#F8FAFC]"
        master={
          <div className="space-y-2">
            <div className="grid gap-2 lg:grid-cols-[1fr_160px_220px_220px_auto]">
            <label className="grid gap-1">
              <span className={ERP_DENSE_LABEL_CLASS}>חיפוש</span>
              <div className="relative">
                <Search className="pointer-events-none absolute end-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setSearch(searchDraft)
                  }}
                  className={cn(ERP_DENSE_INPUT_CLASS, "pe-8")}
                  placeholder="מספר / כותרת חוזה"
                />
              </div>
            </label>
            <label className="grid gap-1">
              <span className={ERP_DENSE_LABEL_CLASS}>סטטוס</span>
              <ErpChooseList
                value={status}
                onChange={(nextValue) => setStatus(nextValue as "ALL" | ErpContractStatus)}
                placeholder="בחירת סטטוס"
                searchPlaceholder="חיפוש סטטוס"
                options={[
                  { value: "ALL", label: "הכל" },
                  { value: "DRAFT", label: "DRAFT" },
                  { value: "PENDING_APPROVAL", label: "PENDING_APPROVAL" },
                  { value: "ACTIVE", label: "ACTIVE" },
                  { value: "CLOSED", label: "CLOSED" },
                ]}
              />
            </label>
            <label className="grid gap-1">
              <span className={ERP_DENSE_LABEL_CLASS}>פרויקט</span>
              <ErpChooseList
                value={projectId}
                onChange={(nextValue) => setProjectId(nextValue)}
                placeholder={loadingProjects ? "טוען פרויקטים..." : "בחירת פרויקט"}
                searchPlaceholder="חיפוש פרויקט"
                options={projectOptions}
                quickCreateHref="/projects"
                quickCreateLabel="פרויקט חדש"
                disabled={loadingProjects}
              />
            </label>
            <label className="grid gap-1">
              <span className={ERP_DENSE_LABEL_CLASS}>ספק</span>
              <ErpChooseList
                value={supplierId}
                onChange={(nextValue) => setSupplierId(nextValue)}
                placeholder={loadingSuppliers ? "טוען ספקים..." : "בחירת ספק"}
                searchPlaceholder="חיפוש ספק"
                options={supplierOptions}
                quickCreateHref="/procurement/suppliers"
                quickCreateLabel="ספק חדש"
                disabled={loadingSuppliers}
                contextualFilter={(option) => {
                  if (option.value === "ALL") return true
                  if (trade === "ALL") return true
                  return supplierTypeById.get(option.value) === trade
                }}
              />
            </label>
            <div className="flex items-end gap-1.5">
              <Button type="button" size="sm" onClick={() => setSearch(searchDraft)}>סנן</Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void Promise.all([loadData(), refreshProjects(), refreshSuppliers()])
                }}
                disabled={loading}
              >
                <RefreshCcw className="ms-1 size-3.5" />רענון
              </Button>
            </div>
          </div>
            <div className="grid gap-2 md:grid-cols-[auto_1fr_1fr]">
              <div className="rounded-xl border border-slate-200 bg-card p-2">
                <p className="text-[11px] text-slate-500">Trade Rule</p>
                <div className="mt-1 flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={trade === "ALL" ? "default" : "outline"}
                    className={trade === "ALL" ? "h-7 bg-slate-900 text-white" : "h-7"}
                    onClick={() => setTrade("ALL")}
                  >
                    הכל
                  </Button>
                  <Button
                    size="sm"
                    variant={trade === "STANDARD" ? "default" : "outline"}
                    className={trade === "STANDARD" ? "h-7 bg-slate-900 text-white" : "h-7"}
                    onClick={() => setTrade("STANDARD")}
                  >
                    STANDARD
                  </Button>
                  <Button
                    size="sm"
                    variant={trade === "SUBCONTRACTOR" ? "default" : "outline"}
                    className={trade === "SUBCONTRACTOR" ? "h-7 bg-slate-900 text-white" : "h-7"}
                    onClick={() => setTrade("SUBCONTRACTOR")}
                  >
                    SUBCONTRACTOR
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-card p-2">
                <p className="text-[11px] text-slate-500">תנאי תשלום (Auto)</p>
                <p className="text-sm">{selectedSupplierLookup?.paymentTerms ?? "—"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-card p-2">
                <p className="text-[11px] text-slate-500">ח.פ ספק (Auto)</p>
                <p className="text-sm">{selectedSupplierLookup?.taxId ?? "—"}</p>
              </div>
            </div>
          </div>
        }
        detail={
          <div className="flex min-h-0 h-full flex-col gap-2 overflow-hidden">
            <div className="grid gap-2 md:grid-cols-3">
              <BentoMetricCard label="כמות חוזים" value={contracts.length} />
              <BentoMetricCard label={'סה"כ התחייבות'} value={totalAmount} suffix="₪" />
              <BentoMetricCard label="חוזים פעילים" value={contracts.filter((row) => row.status === "ACTIVE").length} />
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-card">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs text-slate-500">
                <span>{contracts.length.toLocaleString("he-IL")} חוזים</span>
                <span>{'סה"כ התחייבות:'} {totalAmount.toLocaleString("he-IL", { style: "currency", currency: "ILS" })}</span>
              </div>
              <div className="max-h-[36vh] overflow-auto">
                {loading ? (
                  <div className="h-24 text-center text-sm text-muted-foreground">
                    <Loader2 className="ms-2 inline size-4 animate-spin" />
                    טוען חוזים...
                  </div>
                ) : error ? (
                  <div className="h-24 text-center text-sm text-destructive">{error}</div>
                ) : (
                  <BentoSmartList
                    items={contracts}
                    density="compact"
                    rowKey={(contract) => contract.id}
                    selectedRowKey={selectedContractId}
                    onRowClick={(contract) => setSelectedContractId(contract.id)}
                    emptyState="אין חוזים להצגה."
                    columns={[
                      {
                        key: "contractNumber",
                        title: "מספר חוזה",
                        render: (contract) => <span className="font-mono">{contract.contractNumber}</span>,
                      },
                      {
                        key: "title",
                        title: "כותרת",
                        render: (contract) => <span className="max-w-[320px] truncate">{contract.title}</span>,
                      },
                      {
                        key: "project",
                        title: "פרויקט",
                        render: (contract) => (
                          <span>{projectMap.get(contract.projectId) ?? contract.projectId}</span>
                        ),
                      },
                      {
                        key: "supplier",
                        title: "ספק",
                        render: (contract) => (
                          <span>{supplierMap.get(contract.supplierId) ?? contract.supplierId}</span>
                        ),
                      },
                      {
                        key: "status",
                        title: "סטטוס",
                        render: (contract) => (
                          <SmartListStatusPill tone={statusTone(contract.status)}>
                            {contract.status}
                          </SmartListStatusPill>
                        ),
                      },
                      {
                        key: "total",
                        title: "סה\"כ",
                        render: (contract) => (
                          <span className="font-mono">
                            {Number(contract.totalAmount).toLocaleString("he-IL", {
                              style: "currency",
                              currency: "ILS",
                            })}
                          </span>
                        ),
                      },
                    ]}
                  />
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-card p-2">
              <Tabs defaultValue="master">
                <TabsList variant="line" className="h-9 rounded-xl bg-slate-100">
                  <TabsTrigger value="master">Contract Master</TabsTrigger>
                  <TabsTrigger value="lines">Contract Lines</TabsTrigger>
                  <TabsTrigger value="terms">Terms</TabsTrigger>
                </TabsList>
                <TabsContent value="master" className="mt-2">
                  {!selectedContract ? (
                    <div className="rounded-xl border border-slate-200 bg-card p-4 text-sm text-slate-500">בחרו חוזה להצגת פירוט.</div>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-card p-3">
                        <p className="text-[11px] text-slate-500">מספר חוזה</p>
                        <p className="font-mono text-sm font-semibold">{selectedContract.contractNumber}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-card p-3 md:col-span-2">
                        <p className="text-[11px] text-slate-500">כותרת</p>
                        <p className="text-sm">{selectedContract.title}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-card p-3">
                        <p className="mb-1 text-[11px] text-slate-500">סטטוס</p>
                        <SmartListStatusPill tone={statusTone(selectedContract.status)}>
                          {selectedContract.status}
                        </SmartListStatusPill>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-card p-3">
                        <p className="text-[11px] text-slate-500">פרויקט</p>
                        <p className="text-xs">{projectMap.get(selectedContract.projectId) ?? selectedContract.projectId}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-card p-3">
                        <p className="text-[11px] text-slate-500">ספק</p>
                        <p className="text-xs">{supplierMap.get(selectedContract.supplierId) ?? selectedContract.supplierId}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-card p-3">
                        <p className="text-[11px] text-slate-500">{'סה"כ'}</p>
                        <p className="font-mono text-sm">{Number(selectedContract.totalAmount).toLocaleString("he-IL", { style: "currency", currency: "ILS" })}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-card p-3">
                        <p className="text-[11px] text-slate-500">תאריכים</p>
                        <p className="text-xs">{selectedContract.startDate ?? "—"} - {selectedContract.endDate ?? "—"}</p>
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="lines" className="mt-2">
                  <div className="max-h-[28vh] overflow-auto rounded-xl border border-slate-200 bg-card">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">BOQ</TableHead>
                          <TableHead className="text-right">Item</TableHead>
                          <TableHead className="text-right">Description</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Unit</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingLines ? (
                          <TableRow><TableCell colSpan={6} className="h-20 text-center text-sm text-slate-500">טוען שורות...</TableCell></TableRow>
                        ) : selectedContractLines.length === 0 ? (
                          <TableRow><TableCell colSpan={6} className="h-20 text-center text-sm text-slate-500">אין שורות להצגה.</TableCell></TableRow>
                        ) : (
                          selectedContractLines.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell className="font-mono text-xs">{line.boqLineId ?? "—"}</TableCell>
                              <TableCell className="font-mono text-xs">{line.itemId ?? "—"}</TableCell>
                              <TableCell>{line.description}</TableCell>
                              <TableCell>{Number(line.quantity).toLocaleString("he-IL")}</TableCell>
                              <TableCell>{Number(line.unitPrice).toLocaleString("he-IL", { style: "currency", currency: "ILS" })}</TableCell>
                              <TableCell>{Number(line.totalPrice).toLocaleString("he-IL", { style: "currency", currency: "ILS" })}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
                <TabsContent value="terms" className="mt-2">
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-card p-3">
                      <p className="text-[11px] text-slate-500">Payment Terms Override</p>
                      <p className="text-sm">{selectedContract?.paymentTermsOverride ?? "—"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-card p-3">
                      <p className="text-[11px] text-slate-500">חישוב סכום חוזה</p>
                      <p className="text-sm">מתבצע אוטומטית על בסיס סכום שורות חוזה ב-DB trigger.</p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        }
      />
    </div>
  )
}
