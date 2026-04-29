"use client"

import { useEffect, useMemo, useState } from "react"
import { ClipboardList, Loader2, PackageOpen, Search, Send } from "lucide-react"
import { toast } from "sonner"

import { recordOutgoingTransaction } from "@/lib/marker-ofek/reconciliation-actions"
import { decodeMilestoneStoredName } from "@/lib/marker-ofek/milestone-name-codec"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { formatError } from "@/lib/utils"

type ProjectOption = { id: string; name: string; internal_project_code: string }
type InventoryItemOption = {
  id: string
  sku: string
  description: string
  unit: string | null
}
type ContractItemOption = { id: string; name: string; contract_id: string }
type TxRow = {
  id: string
  quantity: number
  unit: string | null
  notes: string | null
  created_at: string
  item_sku: string | null
  item_description: string | null
  contract_milestones: { name?: string } | { name?: string }[] | null
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function matchesIrHaYayin(projectName: string): boolean {
  const normalized = projectName.replace(/\s+/g, "").toLowerCase()
  return (
    normalized.includes("עירהיין") ||
    normalized.includes("irhayayin") ||
    normalized.includes("ir-ha-yayin")
  )
}

export default function WarehouseOutgoingPage() {
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [inventoryItems, setInventoryItems] = useState<InventoryItemOption[]>([])
  const [contractItems, setContractItems] = useState<ContractItemOption[]>([])
  const [transactions, setTransactions] = useState<TxRow[]>([])
  const [itemSearch, setItemSearch] = useState("")
  const [contractSearch, setContractSearch] = useState("")
  const [selectedItemId, setSelectedItemId] = useState("")
  const [selectedContractItemId, setSelectedContractItemId] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const filteredInventoryItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    if (!q) return inventoryItems
    return inventoryItems.filter((item) =>
      `${item.sku} ${item.description}`.toLowerCase().includes(q)
    )
  }, [inventoryItems, itemSearch])

  const filteredContractItems = useMemo(() => {
    const q = contractSearch.trim().toLowerCase()
    if (!q) return contractItems
    return contractItems.filter((item) => {
      const decoded = decodeMilestoneStoredName(item.name)
      const label = `${decoded.sectionCode} ${decoded.description} ${item.name}`.toLowerCase()
      return label.includes(q)
    })
  }, [contractItems, contractSearch])

  async function loadByProject(projectId: string) {
    if (!projectId) return
    const supabase = createSupabaseBrowserClient()
    setLoading(true)
    try {
      const itemsRes = await masterDataFetch<
        Array<{
          id: string
          sku: string
          description: string
          uom: string | null
          isInventoryManaged: boolean
        }>
      >("/api/erp/master-data/items")
      const inventoryRows = itemsRes
        .filter((row) => row.isInventoryManaged)
        .map((row) => ({
          id: row.id,
          sku: row.sku,
          description: row.description,
          unit: row.uom,
        }))
      setInventoryItems(inventoryRows)

      const contractsRes = await supabase
        .schema("public")
        .from("contracts")
        .select("id")
        .eq("project_id", projectId)
        .eq("is_deleted", false)
      if (contractsRes.error) throw contractsRes.error

      const contractIds = ((contractsRes.data as Array<{ id: string }>) ?? []).map((c) => c.id)
      if (contractIds.length > 0) {
        const milestonesRes = await supabase
          .schema("public")
          .from("contract_milestones")
          .select("id, name, contract_id")
          .in("contract_id", contractIds)
          .order("sort_order", { ascending: true })
        if (milestonesRes.error) throw milestonesRes.error
        setContractItems((milestonesRes.data as ContractItemOption[]) ?? [])
      } else {
        setContractItems([])
      }

      const txRes = await supabase
        .schema("public")
        .from("inventory_transactions")
        .select("id, quantity, unit, notes, created_at, item_catalog_id, contract_milestones ( name )")
        .eq("project_id", projectId)
        .eq("transaction_type", "outgoing")
        .order("created_at", { ascending: false })
        .limit(50)
      if (txRes.error) throw txRes.error
      const txRows = (txRes.data as Array<{
        id: string
        quantity: number
        unit: string | null
        notes: string | null
        created_at: string
        item_catalog_id: string | null
        contract_milestones: { name?: string } | { name?: string }[] | null
      }>) ?? []
      const itemById = new Map(inventoryRows.map((row) => [row.id, row]))
      setTransactions(
        txRows.map((row) => {
          const item = row.item_catalog_id ? itemById.get(row.item_catalog_id) : null
          return {
            id: row.id,
            quantity: Number(row.quantity ?? 0),
            unit: row.unit,
            notes: row.notes,
            created_at: row.created_at,
            item_sku: item?.sku ?? null,
            item_description: item?.description ?? null,
            contract_milestones: row.contract_milestones,
          }
        })
      )
    } catch (error) {
      toast.error(formatError(error))
      setInventoryItems([])
      setContractItems([])
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        const projectsRes = await supabase
          .schema("public")
          .from("projects")
          .select("id, name, internal_project_code")
          .eq("is_deleted", false)
          .order("name", { ascending: true })
        if (projectsRes.error) throw projectsRes.error
        const list = (projectsRes.data as ProjectOption[]) ?? []
        if (cancelled) return
        setProjects(list)
        const defaultProject = list.find((p) => matchesIrHaYayin(p.name)) ?? list[0] ?? null
        if (!defaultProject) {
          setLoading(false)
          return
        }
        setSelectedProjectId(defaultProject.id)
        await loadByProject(defaultProject.id)
      } catch (error) {
        if (!cancelled) {
          toast.error(formatError(error))
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(formData: FormData) {
    setSubmitting(true)
    try {
      const itemId = String(formData.get("itemId") ?? "").trim()
      const projectId = String(formData.get("projectId") ?? "").trim()
      const contractItemId = String(formData.get("contractItemId") ?? "").trim()
      const quantity = parseFloat(String(formData.get("quantity") ?? "0"))
      const notes = String(formData.get("notes") ?? "").trim()

      await recordOutgoingTransaction({
        itemId,
        projectId,
        contractItemId: contractItemId || undefined,
        quantity,
        notes,
      })

      toast.success("הנפקה בוצעה בהצלחה!")
      setSelectedItemId("")
      setSelectedContractItemId("")
      setItemSearch("")
      setContractSearch("")
      ;(document.getElementById("outgoing-form") as HTMLFormElement | null)?.reset()
      await loadByProject(projectId)
    } catch (error) {
      toast.error(formatError(error))
      console.error(error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl bg-zinc-50 p-4 font-sans text-[13px] text-zinc-900" dir="rtl">
      <div className="mb-4 flex items-center gap-3 border-b border-zinc-300 pb-2">
        <PackageOpen size={24} className="text-zinc-700" />
        <h1 className="text-xl font-black text-zinc-900">הנפקת ציוד לפרויקט - מרקר אופק</h1>
      </div>

      <form
        id="outgoing-form"
        action={handleSubmit}
        className="space-y-4 rounded-sm border border-zinc-300 bg-card p-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[12px] font-bold text-zinc-900">פרויקט יעד</label>
            <select
              name="projectId"
              required
              value={selectedProjectId}
              onChange={(e) => {
                const nextProject = e.target.value
                setSelectedProjectId(nextProject)
                setSelectedItemId("")
                setSelectedContractItemId("")
                setItemSearch("")
                setContractSearch("")
                void loadByProject(nextProject)
              }}
              className="w-full rounded-sm border border-zinc-300 bg-card p-2 text-end text-[13px] text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            >
              <option value="">בחר פרויקט...</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.internal_project_code} - {project.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-bold text-zinc-900">כמות להנפקה</label>
            <input
              name="quantity"
              type="number"
              min="0.001"
              step="0.001"
              required
              className="w-full rounded-sm border border-zinc-300 bg-card p-2 text-end font-mono text-[13px] text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
              placeholder="0.000"
            />
          </div>
        </div>

        <div className="relative">
          <label className="mb-1 block text-[12px] font-bold text-zinc-900">חפש פריט במלאי (מק״ט / שם)</label>
          <div className="relative mb-1.5">
            <Search className="absolute right-2 top-2.5 text-zinc-500" size={16} />
            <input
              type="text"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              className="w-full rounded-sm border border-zinc-300 bg-card p-2 pe-8 text-end text-[13px] text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
              placeholder="הקלד שם פריט..."
            />
          </div>
          <select
            name="itemId"
            required
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
            className="w-full rounded-sm border border-zinc-300 bg-card p-2 text-end text-[13px] text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">בחר פריט מלאי...</option>
            {filteredInventoryItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku} - {item.description}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-sm border border-zinc-300 bg-background p-3">
          <label className="mb-2 flex items-center gap-2 text-[12px] font-bold text-zinc-900">
            <ClipboardList size={18} />
            שיוך לסעיף בחוזה (לצורך התאמת ביצוע)
          </label>
          <div className="relative mb-1.5">
            <Search className="absolute right-2 top-2.5 text-zinc-500" size={16} />
            <input
              type="text"
              value={contractSearch}
              onChange={(e) => setContractSearch(e.target.value)}
              className="w-full rounded-sm border border-zinc-300 bg-card p-2 pe-8 text-end text-[13px] text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
              placeholder="חיפוש סעיף (קוד / תיאור)..."
            />
          </div>
          <select
            name="contractItemId"
            value={selectedContractItemId}
            onChange={(e) => setSelectedContractItemId(e.target.value)}
            className="w-full rounded-sm border border-zinc-300 bg-card p-2 text-end text-[13px] text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">בחר סעיף מכתב הכמויות (אופציונלי)...</option>
            {filteredContractItems.map((item) => {
              const decoded = decodeMilestoneStoredName(item.name)
              const label = decoded.sectionCode
                ? `${decoded.sectionCode} - ${decoded.description}`
                : decoded.description || item.name
              return (
                <option key={item.id} value={item.id}>
                  {label}
                </option>
              )
            })}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-bold text-zinc-900">הערות</label>
          <input
            name="notes"
            type="text"
            className="w-full rounded-sm border border-zinc-300 bg-card p-2 text-end text-[13px] text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            placeholder="לדוגמה: יציקה קומה 2"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || loading}
          className="flex w-full items-center justify-center gap-2 rounded-sm bg-zinc-900 py-2.5 font-black text-zinc-100 transition-all hover:bg-zinc-700 disabled:bg-zinc-400"
        >
          {submitting ? <Loader2 className="animate-spin" /> : <Send size={20} />}
          {submitting ? "מעבד הנפקה..." : "אשר הנפקה ועדכן מלאי"}
        </button>
      </form>

      <div className="mt-4 overflow-hidden rounded-sm border border-zinc-300 bg-card">
        <div className="border-b border-zinc-300 px-4 py-2">
          <h2 className="text-base font-bold text-zinc-900">הנפקות אחרונות</h2>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-5 text-zinc-500">
            <Loader2 className="animate-spin" size={16} />
            טוען נתונים...
          </div>
        ) : transactions.length === 0 ? (
          <div className="px-4 py-5 text-zinc-500">אין תנועות הוצאה להצגה.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-background text-zinc-900">
                <tr>
                  <th className="px-3 py-2 text-end font-bold">תאריך</th>
                  <th className="px-3 py-2 text-end font-bold">פריט</th>
                  <th className="px-3 py-2 text-end font-bold">סעיף חוזה</th>
                  <th className="px-3 py-2 text-end font-bold">כמות</th>
                  <th className="px-3 py-2 text-end font-bold">הערות</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const contract = embedOne(tx.contract_milestones)
                  const decoded = decodeMilestoneStoredName(contract?.name ?? "")
                  const contractLabel =
                    decoded.sectionCode || decoded.description
                      ? `${decoded.sectionCode} ${decoded.description}`.trim()
                      : "—"
                  return (
                    <tr key={tx.id} className="border-t border-zinc-300">
                      <td className="px-3 py-2 font-mono">{new Date(tx.created_at).toLocaleString("he-IL")}</td>
                      <td className="px-3 py-2">
                        {tx.item_sku ?? "—"} - {tx.item_description ?? "—"}
                      </td>
                      <td className="px-3 py-2">{contractLabel}</td>
                      <td className="px-3 py-2 font-mono font-bold">
                        {Number(tx.quantity).toLocaleString("he-IL", {
                          maximumFractionDigits: 3,
                        })}
                        {tx.unit ? ` ${tx.unit}` : ""}
                      </td>
                      <td className="px-3 py-2">{tx.notes?.trim() || "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
