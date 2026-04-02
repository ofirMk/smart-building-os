"use client"

import { useEffect, useMemo, useState } from "react"
import { ClipboardList, Loader2, PackageOpen, Search, Send } from "lucide-react"
import { toast } from "sonner"

import { recordOutgoingTransaction } from "@/lib/actions/reconciliation-actions"
import { decodeMilestoneStoredName } from "@/lib/marker-ofek/milestone-name-codec"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"

type ProjectOption = { id: string; name: string; internal_project_code: string }
type InventoryItemOption = { id: string; sku: string; description: string; unit: string | null }
type ContractItemOption = { id: string; name: string; contract_id: string }
type TxRow = {
  id: string
  quantity: number
  unit: string | null
  notes: string | null
  created_at: string
  items_catalog: { sku?: string; description?: string } | { sku?: string; description?: string }[] | null
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
      const itemsRes = await supabase
        .schema("public")
        .from("items_catalog")
        .select("id, sku, description, unit")
        .eq("is_inventory", true)
        .order("description", { ascending: true })
      if (itemsRes.error) throw itemsRes.error
      setInventoryItems((itemsRes.data as InventoryItemOption[]) ?? [])

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
        .select(
          "id, quantity, unit, notes, created_at, items_catalog ( sku, description ), contract_milestones ( name )"
        )
        .eq("project_id", projectId)
        .eq("transaction_type", "outgoing")
        .order("created_at", { ascending: false })
        .limit(50)
      if (txRes.error) throw txRes.error
      setTransactions((txRes.data as TxRow[]) ?? [])
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
        actionBy: "אופיר דיין",
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
    <div className="p-8 max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-8 border-b pb-4 border-slate-200">
        <PackageOpen size={32} className="text-blue-600" />
        <h1 className="text-2xl font-black text-slate-800">הנפקת ציוד לפרויקט - מרקר אופק</h1>
      </div>

      <form
        id="outgoing-form"
        action={handleSubmit}
        className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100 space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold mb-2 text-slate-700">פרויקט יעד</label>
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
              className="w-full p-3 rounded-lg border bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 text-right"
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
            <label className="block text-sm font-bold mb-2 text-slate-700">כמות להנפקה</label>
            <input
              name="quantity"
              type="number"
              min="0.001"
              step="0.001"
              required
              className="w-full p-3 rounded-lg border bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 text-right"
              placeholder="0.000"
            />
          </div>
        </div>

        <div className="relative">
          <label className="block text-sm font-bold mb-2 text-slate-700">חפש פריט במלאי (מק״ט / שם)</label>
          <div className="relative mb-2">
            <Search className="absolute right-3 top-3 text-slate-400" size={18} />
            <input
              type="text"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              className="w-full pr-10 p-3 rounded-lg border bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 text-right"
              placeholder="הקלד שם פריט..."
            />
          </div>
          <select
            name="itemId"
            required
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
            className="w-full p-3 rounded-lg border bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 text-right"
          >
            <option value="">בחר פריט מלאי...</option>
            {filteredInventoryItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku} - {item.description}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-blue-50 p-5 rounded-xl border border-blue-100">
          <label className="flex items-center gap-2 text-sm font-bold mb-3 text-blue-800">
            <ClipboardList size={18} />
            שיוך לסעיף בחוזה (לצורך התאמת ביצוע)
          </label>
          <div className="relative mb-2">
            <Search className="absolute right-3 top-3 text-slate-400" size={18} />
            <input
              type="text"
              value={contractSearch}
              onChange={(e) => setContractSearch(e.target.value)}
              className="w-full pr-10 p-3 rounded-lg border border-blue-200 bg-white outline-none focus:ring-2 focus:ring-blue-500 text-right"
              placeholder="חיפוש סעיף (קוד / תיאור)..."
            />
          </div>
          <select
            name="contractItemId"
            value={selectedContractItemId}
            onChange={(e) => setSelectedContractItemId(e.target.value)}
            className="w-full p-3 rounded-lg border border-blue-200 bg-white outline-none focus:ring-2 focus:ring-blue-500 text-right"
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
          <label className="block text-sm font-bold mb-2 text-slate-700">הערות</label>
          <input
            name="notes"
            type="text"
            className="w-full p-3 rounded-lg border bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 text-right"
            placeholder="לדוגמה: יציקה קומה 2"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg disabled:bg-slate-400"
        >
          {submitting ? <Loader2 className="animate-spin" /> : <Send size={20} />}
          {submitting ? "מעבד הנפקה..." : "אשר הנפקה ועדכן מלאי"}
        </button>
      </form>

      <div className="mt-8 bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">הנפקות אחרונות</h2>
        </div>
        {loading ? (
          <div className="px-6 py-8 text-slate-500 flex items-center gap-2">
            <Loader2 className="animate-spin" size={16} />
            טוען נתונים...
          </div>
        ) : transactions.length === 0 ? (
          <div className="px-6 py-8 text-slate-500">אין תנועות הוצאה להצגה.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="text-right px-4 py-3 font-bold">תאריך</th>
                  <th className="text-right px-4 py-3 font-bold">פריט</th>
                  <th className="text-right px-4 py-3 font-bold">סעיף חוזה</th>
                  <th className="text-right px-4 py-3 font-bold">כמות</th>
                  <th className="text-right px-4 py-3 font-bold">הערות</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const item = embedOne(tx.items_catalog)
                  const contract = embedOne(tx.contract_milestones)
                  const decoded = decodeMilestoneStoredName(contract?.name ?? "")
                  const contractLabel =
                    decoded.sectionCode || decoded.description
                      ? `${decoded.sectionCode} ${decoded.description}`.trim()
                      : "—"
                  return (
                    <tr key={tx.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">{new Date(tx.created_at).toLocaleString("he-IL")}</td>
                      <td className="px-4 py-3">
                        {item?.sku ?? "—"} - {item?.description ?? "—"}
                      </td>
                      <td className="px-4 py-3">{contractLabel}</td>
                      <td className="px-4 py-3 font-bold">
                        {Number(tx.quantity).toLocaleString("he-IL", {
                          maximumFractionDigits: 3,
                        })}
                        {tx.unit ? ` ${tx.unit}` : ""}
                      </td>
                      <td className="px-4 py-3">{tx.notes?.trim() || "—"}</td>
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
