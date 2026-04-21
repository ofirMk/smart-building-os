/**
 * Business logic for the "High-Risk Approvals" widget.
 *
 * Reads manager price overrides from `mo_audit_logs` (written by
 * `logManagerPriceOverride` in `lib/erp/price-ceiling.ts`), resolves
 * supplier / document labels and keeps only rows whose override variance
 * crossed `HIGH_VARIANCE_THRESHOLD`.
 */

import { HIGH_VARIANCE_THRESHOLD, calculatePriceVariance } from "@/lib/erp/pricing-logic"

type SupabaseLike = {
  from: (table: string) => any
}

export type HighVarianceOverridesInput = {
  supabase: SupabaseLike
  companyId: string
  sinceDays: number
}

export type HighVarianceOverrideRow = {
  id: string
  createdAt: string
  tableName: string
  documentType: "PURCHASE_ORDER" | "CHANGE_ORDER" | "CLIENT_CONTRACT_LINE" | "OTHER"
  documentId: string
  documentLabel: string
  supplierName: string | null
  itemLabel: string | null
  enteredPrice: number
  effectivePrice: number
  variance: number
  variancePct: number
  delta: number
  managerNote: string | null
  projectId: string | null
  auditPayload: Record<string, unknown>
}

interface AuditRow {
  id: string
  created_at: string
  table_name: string
  project_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

interface PurchaseOrderRow {
  id: string
  po_number: string | null
  supplier_id: string | null
  erp_md_suppliers?:
    | { id: string; name: string | null }
    | { id: string; name: string | null }[]
    | null
}

interface ChangeOrderRow {
  id: string
  change_order_number: string | null
  client_contract_id: string
  erp_client_contracts?:
    | {
        id: string
        contract_number: string | null
        supplier_id: string | null
        erp_md_suppliers?:
          | { id: string; name: string | null }
          | { id: string; name: string | null }[]
          | null
      }
    | Array<{
        id: string
        contract_number: string | null
        supplier_id: string | null
        erp_md_suppliers?:
          | { id: string; name: string | null }
          | { id: string; name: string | null }[]
          | null
      }>
    | null
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null
  return value
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? parsed : fallback
}

function classifyDocumentType(
  tableName: string
): HighVarianceOverrideRow["documentType"] {
  if (
    tableName === "erp_purchase_orders" ||
    tableName === "erp_purchase_order_lines"
  ) {
    return "PURCHASE_ORDER"
  }
  if (tableName === "erp_change_orders") return "CHANGE_ORDER"
  if (tableName === "erp_client_contract_lines") return "CLIENT_CONTRACT_LINE"
  return "OTHER"
}

function readString(payload: Record<string, unknown> | null, key: string): string | null {
  if (!payload) return null
  const v = payload[key]
  return typeof v === "string" && v.trim().length > 0 ? v : null
}

export async function loadHighVarianceOverrides(
  input: HighVarianceOverridesInput
): Promise<HighVarianceOverrideRow[]> {
  const { supabase, companyId, sinceDays } = input
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()

  const auditRes: { data: AuditRow[] | null; error: { message: string } | null } =
    await supabase
      .from("mo_audit_logs")
      .select("id, created_at, table_name, project_id, old_data, new_data")
      .gte("created_at", cutoff)
      .contains("new_data", { overrideByManager: true })
      .order("created_at", { ascending: false })
      .limit(100)

  if (auditRes.error) throw new Error(auditRes.error.message)
  const auditRows = auditRes.data ?? []
  if (auditRows.length === 0) return []

  const poIds = new Set<string>()
  const changeOrderContractIds = new Set<string>()
  for (const row of auditRows) {
    const documentId = readString(row.new_data, "documentId")
    if (!documentId) continue
    const docType = classifyDocumentType(row.table_name)
    if (docType === "PURCHASE_ORDER") poIds.add(documentId)
    if (docType === "CHANGE_ORDER") changeOrderContractIds.add(documentId)
  }

  const poById = new Map<string, PurchaseOrderRow>()
  if (poIds.size > 0) {
    const poRes: {
      data: PurchaseOrderRow[] | null
      error: { message: string } | null
    } = await supabase
      .from("erp_purchase_orders")
      .select("id, po_number, supplier_id, erp_md_suppliers(id, name)")
      .eq("company_id", companyId)
      .in("id", Array.from(poIds))
    if (poRes.error) throw new Error(poRes.error.message)
    for (const row of poRes.data ?? []) {
      poById.set(row.id, row)
    }
  }

  const contractById = new Map<string, ChangeOrderRow["erp_client_contracts"]>()
  if (changeOrderContractIds.size > 0) {
    const ccRes: {
      data:
        | Array<{
            id: string
            contract_number: string | null
            supplier_id: string | null
            erp_md_suppliers?:
              | { id: string; name: string | null }
              | { id: string; name: string | null }[]
              | null
          }>
        | null
      error: { message: string } | null
    } = await supabase
      .from("erp_client_contracts")
      .select("id, contract_number, supplier_id, erp_md_suppliers(id, name)")
      .eq("company_id", companyId)
      .in("id", Array.from(changeOrderContractIds))
    if (ccRes.error) throw new Error(ccRes.error.message)
    for (const row of ccRes.data ?? []) {
      contractById.set(row.id, row)
    }
  }

  const output: HighVarianceOverrideRow[] = []
  for (const row of auditRows) {
    const payload = (row.new_data ?? {}) as Record<string, unknown>
    const enteredPrice = toFiniteNumber(payload.enteredPrice)
    const effectivePrice = toFiniteNumber(payload.effectivePrice)
    if (effectivePrice <= 0 || enteredPrice <= 0) continue

    const variance = calculatePriceVariance({
      enteredPrice,
      baseline: effectivePrice,
    })
    if (!variance.isHighVariance) continue

    const documentId = readString(payload, "documentId") ?? ""
    const documentType = classifyDocumentType(row.table_name)
    let documentLabel = documentId.slice(0, 8)
    let supplierName: string | null = null
    let itemLabel: string | null = readString(payload, "source")

    if (documentType === "PURCHASE_ORDER") {
      const po = poById.get(documentId)
      if (po) {
        documentLabel = po.po_number ?? documentLabel
        const supplier = firstOrNull(po.erp_md_suppliers)
        supplierName = supplier?.name ?? null
      }
    } else if (documentType === "CHANGE_ORDER") {
      const contract = firstOrNull(contractById.get(documentId) ?? null)
      if (contract) {
        documentLabel = contract.contract_number ?? documentLabel
        const supplier = firstOrNull(contract.erp_md_suppliers ?? null)
        supplierName = supplier?.name ?? null
      }
    }

    output.push({
      id: row.id,
      createdAt: row.created_at,
      tableName: row.table_name,
      documentType,
      documentId,
      documentLabel,
      supplierName,
      itemLabel,
      enteredPrice,
      effectivePrice,
      variance: variance.variance,
      variancePct: variance.variancePct,
      delta: variance.delta,
      managerNote:
        readString(payload, "note") ??
        readString(payload, "managerNote") ??
        readString(payload, "reason") ??
        null,
      projectId: row.project_id,
      auditPayload: payload,
    })
  }

  return output
}

export { HIGH_VARIANCE_THRESHOLD }
