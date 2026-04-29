"use client"

import * as React from "react"
import { Plus, RefreshCcw } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiFetch, parseApiData } from "@/lib/utils/api-client"
import type { ErpDirectActivation } from "@/types/erp"

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

export function SupplierWorkspaceClient({ activations }: SupplierWorkspaceClientProps) {
  const [loading, setLoading] = React.useState(true)
  const [loadingDetail, setLoadingDetail] = React.useState(false)
  const [suppliers, setSuppliers] = React.useState<SupplierRecord[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<SupplierRecord | null>(null)
  const [search, setSearch] = React.useState("")

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
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#F8FAFC]">
      <EntityWorkspace
        title="ספקים - Workspace"
        description="Master Grid ו-Detail Tabs משולבים במסך אחד."
        className="bg-[#F8FAFC]"
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
          <Tabs defaultValue="general">
            <TabsList variant="line" className="h-9 rounded-xl bg-card shadow-sm">
              <TabsTrigger value="general">כרטיס ספק</TabsTrigger>
              <TabsTrigger value="contacts">אנשי קשר</TabsTrigger>
              <TabsTrigger value="banks">חשבונות בנק</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="mt-2">
              {loadingDetail || !selected ? (
                <div className="rounded-xl border border-slate-200 bg-card p-5 text-sm text-slate-500">
                  {loadingDetail ? "טוען כרטיס ספק..." : "בחרו ספק להצגת פרטים"}
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-card p-3">
                    <p className="text-[11px] text-slate-500">שם ספק</p>
                    <p className="text-sm font-semibold">{selected.name}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-card p-3">
                    <p className="text-[11px] text-slate-500">טלפון</p>
                    <p className="text-sm">{selected.phone || "—"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-card p-3">
                    <p className="text-[11px] text-slate-500">אימייל</p>
                    <p className="text-sm">{selected.email || "—"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-card p-3 md:col-span-2">
                    <p className="text-[11px] text-slate-500">כתובת</p>
                    <p className="text-sm">{selected.address || "—"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-card p-3">
                    <p className="text-[11px] text-slate-500">{'קוד מע"מ'}</p>
                    <p className="text-sm">{selected.vatCode}</p>
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
          </Tabs>
        }
      />
    </div>
  )
}
