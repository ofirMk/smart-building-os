/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(tech-debt): refactor DB row types; tracked for Sprint 3 cleanup. */
import { type NextRequest, NextResponse } from "next/server"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"
import type {
  ErpGoodsReceipt,
  ErpGoodsReceiptLine,
  ErpPurchaseOrder,
  ErpPurchaseOrderLine,
  ErpProcurementStatusEvent,
  ErpVendorInvoice,
  ErpVendorInvoiceLine,
} from "@/types/erp"

export type ProcurementApiContext =
  | { ok: true; supabase: any; activeCompanyId: string; userId: string; userRole: string | null }
  | { ok: false; response: NextResponse }

export async function requireProcurementApiContext(req: NextRequest): Promise<ProcurementApiContext> {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return { ok: false, response: gate.response }
  return {
    ok: true,
    supabase: gate.ctx.supabase,
    activeCompanyId: gate.ctx.activeCompanyId,
    userId: gate.ctx.userId,
    userRole: gate.ctx.userRole,
  }
}

export function normalizeRouteParams<T extends Record<string, string>>(
  params: Promise<T> | T
): Promise<T> {
  return Promise.resolve(params)
}

export function mapPurchaseOrderRow(row: any): ErpPurchaseOrder {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    supplierId: row.supplier_id,
    poNumber: row.po_number,
    title: row.title,
    status: row.status,
    priceOverrideStatus: row.price_override_status ?? "NONE",
    totalAmount: Number(row.total_amount),
    issuedAt: row.issued_at,
    notes: row.notes,
  }
}

export function mapPurchaseOrderLineRow(row: any): ErpPurchaseOrderLine {
  return {
    id: row.id,
    companyId: row.company_id,
    purchaseOrderId: row.purchase_order_id,
    projectId: row.project_id,
    itemSku: row.item_sku ?? null,
    budgetSubChapter: row.budget_sub_chapter,
    resourceId: row.resource_id,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    effectiveUnitPrice:
      row.effective_unit_price === null || row.effective_unit_price === undefined
        ? null
        : Number(row.effective_unit_price),
    totalPrice: Number(row.total_price),
  }
}

export function mapGoodsReceiptRow(row: any): ErpGoodsReceipt {
  return {
    id: row.id,
    companyId: row.company_id,
    purchaseOrderId: row.purchase_order_id,
    grNumber: row.gr_number,
    status: row.status,
    receiptDate: row.receipt_date,
    notes: row.notes,
  }
}

export function mapGoodsReceiptLineRow(row: any): ErpGoodsReceiptLine {
  return {
    id: row.id,
    companyId: row.company_id,
    goodsReceiptId: row.goods_receipt_id,
    purchaseOrderLineId: row.purchase_order_line_id,
    projectId: row.project_id,
    budgetSubChapter: row.budget_sub_chapter,
    resourceId: row.resource_id,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    totalPrice: Number(row.total_price),
  }
}

export function mapVendorInvoiceRow(row: any): ErpVendorInvoice {
  return {
    id: row.id,
    companyId: row.company_id,
    supplierId: row.supplier_id,
    invoiceNumber: row.invoice_number,
    status: row.status,
    invoiceDate: row.invoice_date,
    totalAmount: Number(row.total_amount),
    priceVarianceAmount: Number(row.price_variance_amount),
    notes: row.notes,
  }
}

export function mapVendorInvoiceLineRow(row: any): ErpVendorInvoiceLine {
  return {
    id: row.id,
    companyId: row.company_id,
    vendorInvoiceId: row.vendor_invoice_id,
    goodsReceiptLineId: row.goods_receipt_line_id,
    projectId: row.project_id,
    budgetSubChapter: row.budget_sub_chapter,
    resourceId: row.resource_id,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    totalPrice: Number(row.total_price),
  }
}

export function mapStatusEventRow(row: any): ErpProcurementStatusEvent {
  return {
    id: row.id,
    companyId: row.company_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actionName: row.action_name,
    createdAt: row.created_at,
  }
}

