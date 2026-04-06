"use client"

import { AlertCircle, Link as LinkIcon, Search } from "lucide-react"
import { useState } from "react"

export type UnassignedCardItem = {
  id: string
  quantity: number
  items?: {
    item_name?: string
    unit_cost?: number
  } | null
}

export type UnassignedCardContractItem = {
  id: string
  manual_id: string
  description: string
}

export function UnassignedItemsCard({
  unassignedItems,
  contractItems,
  onAssign,
  onBulkAssign,
}: {
  unassignedItems: UnassignedCardItem[]
  contractItems: UnassignedCardContractItem[]
  onAssign: (transactionId: string, contractItemId: string) => Promise<void> | void
  onBulkAssign: (
    transactionIds: string[],
    contractItemId: string
  ) => Promise<void> | void
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState("")

  if (!unassignedItems || unassignedItems.length === 0) return null

  const totalValue = unassignedItems.reduce(
    (acc, item) => acc + item.quantity * (item.items?.unit_cost || 0),
    0
  )
  const filteredItems = unassignedItems.filter((item) =>
    String(item.items?.item_name ?? "")
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  )

  async function handleAssign(transactionId: string, contractItemId: string) {
    if (!transactionId || !contractItemId) return
    setLoadingId(transactionId)
    try {
      await onAssign(transactionId, contractItemId)
    } finally {
      setLoadingId(null)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const allSelected =
    filteredItems.length > 0 &&
    filteredItems.every((item) => selectedIds.includes(item.id))

  function toggleSelectAll() {
    if (allSelected) {
      const filteredIdSet = new Set(filteredItems.map((item) => item.id))
      setSelectedIds((prev) => prev.filter((id) => !filteredIdSet.has(id)))
      return
    }
    const filteredIds = filteredItems.map((item) => item.id)
    setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])))
  }

  function selectAllFiltered() {
    const filteredIds = filteredItems.map((i) => i.id)
    setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])))
  }

  async function handleBulkAssign(contractItemId: string) {
    if (!contractItemId || selectedIds.length === 0) return
    await onBulkAssign(selectedIds, contractItemId)
    setSelectedIds([])
  }

  return (
    <div className="relative mb-8 rounded-xl border-2 border-red-200 bg-red-50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-red-700">
          <AlertCircle size={28} className="animate-bounce" />
          <div>
            <h3 className="text-xl font-bold">חומרים ללא שיוך לסעיף</h3>
            <p className="text-sm">
              זוהו פריטים שיצאו למשימה אך לא יחויבו בחשבון הקרוב
            </p>
          </div>
        </div>
        <div className="text-left">
          <span className="text-sm uppercase text-gray-500">
            שווי אובדן פוטנציאלי
          </span>
          <div className="text-2xl font-black text-red-600">
            ₪{totalValue.toLocaleString("he-IL")}
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-col items-center justify-between gap-4 md:flex-row">
        <div className="relative w-full md:w-96">
          <Search
            className="pointer-events-none absolute end-3 top-2.5 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="חיפוש חומר (למשל: כבל, מנתק, צינור)..."
            className="w-full rounded-lg border border-red-100 py-2 ps-4 pe-10 outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {searchTerm ? (
          <button
            type="button"
            onClick={selectAllFiltered}
            className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-600 shadow-sm transition-all hover:text-blue-800"
          >
            בחר את כל {filteredItems.length} התוצאות
          </button>
        ) : null}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
          />
          בחר הכל
        </label>
        {selectedIds.length > 0 ? (
          <span className="text-xs font-medium text-slate-600">
            נבחרו {selectedIds.length} פריטים
          </span>
        ) : null}
      </div>

      <div className="max-h-96 space-y-3 overflow-y-auto pe-2">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-between rounded-lg border p-3 shadow-sm transition-all ${
              selectedIds.includes(item.id)
                ? "border-blue-200 bg-blue-50"
                : "border-red-100 bg-white"
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selectedIds.includes(item.id)}
                onChange={() => toggleSelect(item.id)}
                className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                disabled={loadingId === item.id}
              />
              <div className="flex flex-col">
              <span className="font-bold text-slate-800">
                {item.items?.item_name || "ללא שם פריט"}
              </span>
              <span className="text-xs text-slate-500">
                כמות: {item.quantity.toLocaleString("he-IL")} | שווי: ₪
                {(item.quantity * (item.items?.unit_cost || 0)).toLocaleString("he-IL")}
              </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                className="rounded border bg-slate-50 p-2 text-sm focus:ring-2 focus:ring-blue-500"
                onChange={(e) => void handleAssign(item.id, e.target.value)}
                disabled={loadingId === item.id}
                value=""
              >
                <option value="">בחר סעיף לשיוך...</option>
                {contractItems.map((ci) => (
                  <option key={ci.id} value={ci.id}>
                    {ci.manual_id} - {ci.description}
                  </option>
                ))}
              </select>
              <LinkIcon size={18} className="text-slate-400" />
            </div>
          </div>
        ))}
        {filteredItems.length === 0 ? (
          <p className="rounded-lg border border-red-100 bg-white p-4 text-sm text-slate-500">
            לא נמצאו תוצאות לחיפוש.
          </p>
        ) : null}
      </div>

      {selectedIds.length > 0 && (
        <div className="animate-in slide-in-from-bottom-5 sticky bottom-4 inset-x-0 z-50 mt-4 flex items-center justify-between rounded-xl bg-blue-600 p-4 text-white shadow-2xl">
          <div className="flex items-center gap-4">
            <span className="rounded-full bg-white px-3 py-1 font-bold text-blue-600">
              {selectedIds.length} פריטים נבחרו
            </span>
            <p className="text-sm font-medium">שיוך גורף לסעיף בחוזה:</p>
          </div>

          <div className="flex items-center gap-3">
            <select
              className="rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  void handleBulkAssign(e.target.value)
                  e.currentTarget.value = ""
                }
              }}
            >
              <option value="">בחר סעיף יעד...</option>
              {contractItems.map((ci) => (
                <option key={ci.id} value={ci.id}>
                  {ci.manual_id} - {ci.description}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-sm text-white/80 hover:text-white"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
