"use server"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { decodeMilestoneStoredName } from "@/lib/marker-ofek/milestone-name-codec"
import { revalidatePath } from "next/cache"

export type ProjectDiscrepancyRow = {
  contractItemId: string | null
  inventoryQty: number
  billedQty: number
  variance: number
  status: "OK" | "WARNING" | "CRITICAL"
}

export type ContractItemDropdownRow = {
  id: string
  manual_id: string
  description: string
}

export type UnassignedInventoryRow = {
  id: string
  item_id: string
  quantity: number
  items: {
    item_name: string
    unit_cost: number
  }
}

function toNum(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export type RecordOutgoingTransactionInput = {
  itemId: string
  projectId: string
  contractItemId?: string
  quantity: number
  notes?: string
  actionBy?: string
}

export type RecordIncomingTransactionInput = {
  projectId: string
  itemCatalogId: string
  quantity: number
  unit?: string
  notes?: string
}

export async function recordOutgoingTransaction(
  input: RecordOutgoingTransactionInput
) {
  const itemId = String(input.itemId ?? "").trim()
  const projectId = String(input.projectId ?? "").trim()
  const contractItemId = String(input.contractItemId ?? "").trim()
  const quantity = toNum(input.quantity)
  const notes = String(input.notes ?? "").trim()
  const actionBy = String(input.actionBy ?? "").trim()

  if (!projectId) throw new Error("projectId חסר")
  if (!itemId) throw new Error("itemId חסר")
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("quantity לא תקין")
  }

  const supabase = await createSupabaseServerAuthClient()

  const itemRes = await supabase
    .schema("public")
    .from("items_catalog")
    .select("id, unit")
    .eq("id", itemId)
    .single()
  if (itemRes.error || !itemRes.data?.id) {
    throw new Error("פריט מלאי לא נמצא")
  }

  const normalizedNotes = [notes, actionBy ? `בוצע ע״י: ${actionBy}` : ""]
    .filter(Boolean)
    .join(" | ")

  const { data, error } = await supabase
    .schema("public")
    .from("inventory_transactions")
    .insert({
      project_id: projectId,
      item_catalog_id: itemId,
      contract_item_id: contractItemId || null,
      transaction_type: "outgoing",
      quantity,
      unit: String(itemRes.data.unit ?? "").trim() || null,
      notes: normalizedNotes || null,
    })
    .select("id")
    .single()

  if (error || !data?.id) {
    throw new Error(error?.message ?? "שמירת תנועת מלאי נכשלה")
  }

  revalidatePath("/marker-ofek/procurement/warehouse-outgoing")
  revalidatePath("/marker-ofek/procurement/reconciliation/inventory-progress")
  return { id: String(data.id) }
}

export async function recordIncomingTransaction(
  input: RecordIncomingTransactionInput
) {
  const projectId = String(input.projectId ?? "").trim()
  const itemCatalogId = String(input.itemCatalogId ?? "").trim()
  const quantity = toNum(input.quantity)
  const unitInput = String(input.unit ?? "").trim()
  const notes = String(input.notes ?? "").trim()

  if (!projectId) throw new Error("projectId חסר")
  if (!itemCatalogId) throw new Error("itemCatalogId חסר")
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("quantity לא תקין")
  }

  const supabase = await createSupabaseServerAuthClient()

  const itemRes = await supabase
    .schema("public")
    .from("items_catalog")
    .select("id, unit")
    .eq("id", itemCatalogId)
    .single()
  if (itemRes.error || !itemRes.data?.id) {
    throw new Error("פריט מלאי לא נמצא")
  }

  const unit = unitInput || String(itemRes.data.unit ?? "").trim() || null
  const { data, error } = await supabase
    .schema("public")
    .from("inventory_transactions")
    .insert({
      project_id: projectId,
      item_catalog_id: itemCatalogId,
      contract_item_id: null,
      transaction_type: "incoming",
      quantity,
      unit,
      notes: notes || null,
    })
    .select("id")
    .single()

  if (error || !data?.id) {
    throw new Error(error?.message ?? "שמירת תנועת מלאי נכנסת נכשלה")
  }

  revalidatePath("/marker-ofek/items")
  revalidatePath("/marker-ofek/procurement/reconciliation")
  return { id: String(data.id) }
}

export async function getProjectDiscrepancies(
  projectId: string
): Promise<ProjectDiscrepancyRow[]> {
  const pid = projectId.trim()
  if (!pid) return []

  const supabase = await createSupabaseServerAuthClient()

  // 1) הוצאת מלאי לפי סעיף חוזה
  const inventoryRes = await supabase
    .schema("public")
    .from("inventory_transactions")
    .select("contract_item_id, quantity")
    .eq("project_id", pid)
    .eq("transaction_type", "outgoing")

  if (inventoryRes.error) {
    throw new Error(inventoryRes.error.message)
  }

  const inventoryOut = new Map<string | null, number>()
  for (const row of inventoryRes.data ?? []) {
    const r = row as { contract_item_id: string | null; quantity: unknown }
    const key = r.contract_item_id ?? null
    inventoryOut.set(key, (inventoryOut.get(key) ?? 0) + toNum(r.quantity))
  }

  // 2) דיווח התקדמות מהחשבונות החלקיים (AI)
  const contractsRes = await supabase
    .schema("public")
    .from("contracts")
    .select("id")
    .eq("project_id", pid)
    .eq("is_deleted", false)
  if (contractsRes.error) {
    throw new Error(contractsRes.error.message)
  }
  const contractIds = ((contractsRes.data as Array<{ id: string }>) ?? []).map(
    (c) => c.id
  )
  if (contractIds.length === 0) {
    return Array.from(inventoryOut.entries()).map(([contractItemId, invQty]) => {
      const variance = invQty
      return {
        contractItemId,
        inventoryQty: invQty,
        billedQty: 0,
        variance,
        status:
          variance > invQty * 0.1
            ? "CRITICAL"
            : variance > 0
              ? "WARNING"
              : "OK",
      }
    })
  }

  const reportsRes = await supabase
    .schema("public")
    .from("project_progress_reports")
    .select("id")
    .in("contract_id", contractIds)
    .in("status", ["approved", "submitted"])
  if (reportsRes.error) {
    throw new Error(reportsRes.error.message)
  }
  const reportIds = ((reportsRes.data as Array<{ id: string }>) ?? []).map(
    (r) => r.id
  )

  const billedProgress = new Map<string | null, number>()
  if (reportIds.length > 0) {
    const progressRes = await supabase
      .schema("public")
      .from("project_progress_items")
      .select("contract_milestone_id, quantity_executed")
      .in("progress_report_id", reportIds)
    if (progressRes.error) {
      throw new Error(progressRes.error.message)
    }
    for (const row of progressRes.data ?? []) {
      const r = row as {
        contract_milestone_id: string | null
        quantity_executed: unknown
      }
      const key = r.contract_milestone_id ?? null
      billedProgress.set(key, (billedProgress.get(key) ?? 0) + toNum(r.quantity_executed))
    }
  }

  // 3) מיזוג לדו"ח
  const keys = new Set<string | null>([
    ...inventoryOut.keys(),
    ...billedProgress.keys(),
  ])

  return Array.from(keys.values()).map((contractItemId) => {
    const invQty = inventoryOut.get(contractItemId) ?? 0
    const billQty = billedProgress.get(contractItemId) ?? 0
    const variance = invQty - billQty
    return {
      contractItemId,
      inventoryQty: invQty,
      billedQty: billQty,
      variance,
      status:
        variance > invQty * 0.1
          ? "CRITICAL"
          : variance > 0
            ? "WARNING"
            : "OK",
    }
  })
}

// עדכון שיוך של תנועת מלאי לסעיף בחוזה
export async function assignTransactionToContractItem(
  transactionId: string,
  contractItemId: string
) {
  const txId = transactionId.trim()
  const itemId = contractItemId.trim()
  if (!txId) throw new Error("transactionId חסר")
  if (!itemId) throw new Error("contractItemId חסר")

  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("inventory_transactions")
    .update({ contract_item_id: itemId })
    .eq("id", txId)
    .select("id, contract_item_id")
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function assignTransactionsToContractItem(
  transactionIds: string[],
  contractItemId: string
) {
  const ids = transactionIds.map((id) => id.trim()).filter(Boolean)
  const itemId = contractItemId.trim()
  if (ids.length === 0) throw new Error("transactionIds חסרים")
  if (!itemId) throw new Error("contractItemId חסר")

  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("inventory_transactions")
    .update({ contract_item_id: itemId })
    .in("id", ids)
    .select("id, contract_item_id")

  if (error) throw new Error(error.message)
  return data ?? []
}

// שליפת סעיפי חוזה לפרויקט (Dropdown)
// בפרויקט זה "contract_items" ממומש בטבלת contract_milestones
export async function getContractItems(
  projectId: string
): Promise<ContractItemDropdownRow[]> {
  const pid = projectId.trim()
  if (!pid) return []

  const supabase = await createSupabaseServerAuthClient()
  const { data: contracts, error: contractsErr } = await supabase
    .schema("public")
    .from("contracts")
    .select("id")
    .eq("project_id", pid)
    .eq("is_deleted", false)

  if (contractsErr) throw new Error(contractsErr.message)
  const contractIds = ((contracts as Array<{ id: string }> | null) ?? []).map(
    (c) => c.id
  )
  if (contractIds.length === 0) return []

  const { data, error } = await supabase
    .schema("public")
    .from("contract_milestones")
    .select("id, name")
    .in("contract_id", contractIds)
    .order("sort_order", { ascending: true })

  if (error) throw new Error(error.message)

  return ((data as Array<{ id: string; name: string }> | null) ?? []).map(
    (row) => {
      const decoded = decodeMilestoneStoredName(row.name)
      return {
        id: row.id,
        manual_id: decoded.sectionCode || "—",
        description: decoded.description || row.name || "ללא תיאור",
      }
    }
  )
}

export async function getUnassignedInventory(projectId: string): Promise<{
  items: UnassignedInventoryRow[]
  totalLoss: number
}> {
  const pid = projectId.trim()
  if (!pid) return { items: [], totalLoss: 0 }

  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("inventory_transactions")
    .select(
      "id, item_catalog_id, quantity, items_catalog ( description, last_price, default_price )"
    )
    .eq("project_id", pid)
    .eq("transaction_type", "outgoing")
    .is("contract_item_id", null)

  if (error) throw new Error(error.message)

  const normalized: UnassignedInventoryRow[] = (data ?? []).map((row) => {
    const r = row as {
      id: string | null
      item_catalog_id: string | null
      quantity: unknown
      items_catalog:
        | {
            description?: unknown
            last_price?: unknown
            default_price?: unknown
          }
        | Array<{
            description?: unknown
            last_price?: unknown
            default_price?: unknown
          }>
        | null
    }
    const item = Array.isArray(r.items_catalog)
      ? (r.items_catalog[0] ?? null)
      : r.items_catalog
    const unitCost = toNum(item?.last_price ?? item?.default_price)
    return {
      id: String(r.id ?? "").trim(),
      item_id: String(r.item_catalog_id ?? "").trim(),
      quantity: toNum(r.quantity),
      items: {
        item_name: String(item?.description ?? "").trim() || "ללא שם",
        unit_cost: unitCost,
      },
    }
  })

  const totalLoss = normalized.reduce(
    (acc, curr) => acc + curr.quantity * curr.items.unit_cost,
    0
  )

  return {
    items: normalized,
    totalLoss,
  }
}
