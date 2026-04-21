import "server-only"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

function shortId(id: string): string {
  return id.trim().slice(0, 8)
}

function pickFirstText(
  row: Record<string, unknown> | null,
  keys: readonly string[]
): string | null {
  if (!row) return null
  for (const key of keys) {
    const value = row[key]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return null
}

async function resolveTitleByTables(
  id: string,
  tables: ReadonlyArray<{
    table: string
    columns: string
    labelKeys: readonly string[]
  }>
): Promise<string | null> {
  const normalized = id.trim()
  if (!normalized) return null

  try {
    const supabase = await createSupabaseServerAuthClient()
    for (const config of tables) {
      const { data, error } = await supabase
        .from(config.table)
        .select(config.columns)
        .eq("id", normalized)
        .maybeSingle()
      if (error || !data) continue
      const label = pickFirstText(
        data as unknown as Record<string, unknown>,
        config.labelKeys
      )
      if (label) return label
    }
    return null
  } catch {
    return null
  }
}

export async function resolveProjectTitle(id: string): Promise<string> {
  const value =
    (await resolveTitleByTables(id, [
      {
        table: "projects",
        columns: "name,project_number,internal_project_code",
        labelKeys: ["name", "project_number", "internal_project_code"],
      },
    ])) ?? `פרויקט ${shortId(id)}`
  return value
}

export async function resolveContractTitle(id: string): Promise<string> {
  const value =
    (await resolveTitleByTables(id, [
      {
        table: "contracts",
        columns: "name,contract_number,title",
        labelKeys: ["name", "contract_number", "title"],
      },
      {
        table: "erp_client_contracts",
        columns: "title,contract_number,client_name",
        labelKeys: ["title", "contract_number", "client_name"],
      },
    ])) ?? `חוזה ${shortId(id)}`
  return value
}

export async function resolveItemTitle(id: string): Promise<string> {
  const value =
    (await resolveTitleByTables(id, [
      {
        table: "erp_md_items",
        columns: "description,item_number,item_name",
        labelKeys: ["description", "item_number", "item_name"],
      },
      {
        table: "items",
        columns: "description,sku,item_number",
        labelKeys: ["description", "sku", "item_number"],
      },
    ])) ?? `פריט ${shortId(id)}`
  return value
}

export async function resolveEntityTitle(id: string): Promise<string> {
  const value =
    (await resolveTitleByTables(id, [
      {
        table: "entities",
        columns: "name,company_name,display_name",
        labelKeys: ["name", "company_name", "display_name"],
      },
    ])) ?? `ישות ${shortId(id)}`
  return value
}

export async function resolvePartialTitle(id: string): Promise<string> {
  const value =
    (await resolveTitleByTables(id, [
      {
        table: "partial_accounts",
        columns: "account_number,title,description",
        labelKeys: ["title", "account_number", "description"],
      },
      {
        table: "erp_client_progress_bills",
        columns: "bill_number,status",
        labelKeys: ["bill_number", "status"],
      },
    ])) ?? `חשבון ${shortId(id)}`
  return value
}

export async function resolvePurchaseOrderTitle(id: string): Promise<string> {
  const value =
    (await resolveTitleByTables(id, [
      {
        table: "purchase_orders",
        columns: "po_number,status",
        labelKeys: ["po_number", "status"],
      },
      {
        table: "erp_purchase_orders",
        columns: "po_number,status",
        labelKeys: ["po_number", "status"],
      },
    ])) ?? `הזמנת רכש ${shortId(id)}`
  return value
}

export async function resolveInvoiceTitle(id: string): Promise<string> {
  const value =
    (await resolveTitleByTables(id, [
      {
        table: "mo_finance_invoices",
        columns: "invoice_number,doc_number,status",
        labelKeys: ["invoice_number", "doc_number", "status"],
      },
      {
        table: "invoices",
        columns: "invoice_number,number,status",
        labelKeys: ["invoice_number", "number", "status"],
      },
    ])) ?? `חשבונית ${shortId(id)}`
  return value
}

export function fallbackTaskTitle(prefix: string, id: string): string {
  return `${prefix} ${shortId(id)}`
}

