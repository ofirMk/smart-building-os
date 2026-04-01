import type { BaselineBillLineItemAI } from "@/lib/marker-ofek/baseline-bill-ai-schema"

/**
 * Marker Ofek — חוזים (מיפוי לטבלאות Supabase: entities, projects, contracts, contract_milestones)
 *
 * מחיקה רכה (is_deleted, deleted_at) בטבלאות ליבה: projects, entities, contracts,
 * purchase_orders, partial_accounts — ראו marker_ofek_data_integrity.sql. בשאילתות UI יש לסנן
 * `.eq("is_deleted", false)`.
 */

export type MoEntityType = "client" | "subcontractor" | "supplier"

export type MoContractType = "main_contract" | "sub_contract"

export type MoProjectStatus =
  | "planning"
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled"

/** public.mo_project_task_status — משימות בלוח זמנים */
export type MoProjectTaskStatus =
  | "todo"
  | "in_progress"
  | "done"
  | "delayed"

export type MoContractStatus = "draft" | "active" | "closed" | "terminated"

/** public.mo_comment_context — הערות הקשר */
export type MoCommentContext = "contract_item" | "po_line" | "general"

/** public.project_comments */
export type MarkerOfekProjectCommentRow = {
  id: string
  project_id: string
  user_id: string
  context_type: MoCommentContext
  context_id: string | null
  context_label: string | null
  message: string
  created_at: string
}

export type MoPartialAccountStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "paid"

/** סטטוס הוראת שינוי (חריג) — אם יישמרו שוב ב-DB */
export type MoChangeOrderStatus = "pending" | "approved" | "rejected"

/** public.mo_invoice_document_type */
export type MoInvoiceDocumentType =
  | "tax_invoice"
  | "receipt"
  | "tax_invoice_receipt"

/** public.mo_invoice_financial_status */
export type MoInvoiceFinancialStatus = "issued" | "paid" | "cancelled"

/** public.mo_receipt_payment_method */
export type MoReceiptPaymentMethod =
  | "bank_transfer"
  | "check"
  | "credit_card"
  | "cash"

/** public.mo_invoices — חשבוניות מס / קבלות (לא public.invoices לדיירים) */
export type MarkerOfekMoInvoiceRow = {
  id: string
  invoice_number: number
  project_id: string
  entity_id: string
  contract_id: string | null
  linked_partial_account_id: string | null
  issue_date: string
  document_type: MoInvoiceDocumentType
  subtotal: number
  vat_amount: number
  grand_total: number
  status: MoInvoiceFinancialStatus
  is_printed_original: boolean
  created_at: string
}

/** public.mo_receipt_payments */
export type MarkerOfekMoReceiptPaymentRow = {
  id: string
  invoice_id: string
  payment_method: MoReceiptPaymentMethod
  reference_number: string | null
  amount: number
  payment_date: string
  created_at: string
}

/** public.company_profile — פרטי מנפיק רשמיים (מע״מ / רשויות מס) */
export interface CompanyProfile {
  id: string
  company_name: string
  legal_id: string | null
  address: string | null
  phone: string | null
  email: string | null
  deductions_file_number: string | null
  created_at: string
}

/** public.entities */
export type MarkerOfekEntityRow = {
  id: string
  name: string
  type: MoEntityType
  company_id: string | null
  contact_info: Record<string, unknown>
  /** ח.פ / ע.מ */
  legal_id: string | null
  address: string | null
  /** תיק ניכויים */
  deductions_file_number: string | null
  /** מספר סידורי מרצף supplier_seq / contractor_seq */
  mo_entity_code: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
}

/** Alias for ERP / tax documents */
export type Entity = MarkerOfekEntityRow

/** public.projects */
export type MarkerOfekProjectRow = {
  id: string
  internal_project_code: string
  name: string
  address: string | null
  client_name: string | null
  tender_id: string | null
  status: MoProjectStatus
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
}

/** public.project_documents — כספת מסמכי פרויקט (חוזים, מפרטים, תוכניות) */
export type MarkerOfekProjectDocumentRow = {
  id: string
  project_id: string
  title: string | null
  file_path: string
  document_kind: string | null
  mime_type: string | null
  created_at: string
}

/** public.tenders — מכרז (קליטה) */
export type MarkerOfekTenderRow = {
  id: string
  project_name_from_ai: string | null
  tender_date_target: string | null
  consultant_name_from_ai: string | null
  created_at: string
  updated_at: string
}

export type { BaselineBillLineItemAI }

/** פלט AI לקליטת חשבון חלקי מאושר (Baseline) — לפני שמירה ב-DB */
export type PartialBillBaselineAIExtract = {
  bill_number: number
  bill_month: string
  base_index: number
  current_index: number
  cumulative_work_value: number
  indexation_amount: number
  retention_percent: number
  retention_amount: number
  insurance_amount: number
  testing_amount: number
  subcontractor_deductions: number
  total_approved: number
  /** שורות כתב כמויות / אבני דרך — חובה מהמודל כשמופיעות בטבלת PDF */
  items: BaselineBillLineItemAI[]
}

/** public.project_tasks — משימות לגנט */
export type MarkerOfekProjectTaskRow = {
  id: string
  project_id: string
  title: string
  description: string | null
  start_date: string
  end_date: string
  progress: number
  status: MoProjectTaskStatus
  assigned_to: string | null
  created_at: string
}

/** public.contracts */
export type MarkerOfekContractRow = {
  id: string
  project_id: string
  entity_id: string
  contract_type: MoContractType
  parent_contract_id: string | null
  agreement_type: string | null
  retention_pct: number
  insurance_pct: number
  total_amount: number | null
  start_date: string | null
  end_date: string | null
  status: MoContractStatus
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
}

/** public.contract_milestones — סעיפי כסף לחוזה (BoQ / פאושלי) */
export type MarkerOfekContractMilestoneRow = {
  id: string
  contract_id: string
  name: string
  amount: number
  weight_percentage: number | null
  sort_order: number
}

/** טיוטת יצירה / טופס — לפני הכנסה ל-DB */
export type MarkerOfekEntityInsert = {
  name: string
  type: MoEntityType
  company_id?: string | null
  contact_info?: Record<string, unknown>
  legal_id?: string | null
  address?: string | null
  deductions_file_number?: string | null
}

export type MarkerOfekProjectInsert = {
  /** ריק — DB ימלא מ-project_seq (PR-YY-NNNN) */
  internal_project_code?: string
  name: string
  address?: string | null
  client_name?: string | null
  tender_id?: string | null
  status?: MoProjectStatus
}

export type MarkerOfekContractInsert = {
  project_id: string
  entity_id: string
  contract_type: MoContractType
  parent_contract_id?: string | null
  agreement_type?: string | null
  retention_pct?: number
  insurance_pct?: number
  total_amount?: number | null
  start_date?: string | null
  end_date?: string | null
  status?: MoContractStatus
}

/** public.partial_accounts */
export type MarkerOfekPartialAccountRow = {
  id: string
  contract_id: string
  account_number: number
  status: MoPartialAccountStatus
  total_cumulative_amount: number
  retention_deduction: number
  insurance_deduction: number
  payment_due: number
  snapshot_payload?: Record<string, unknown> | null
  previous_cumulative_approved?: number | null
  project_id?: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
}

/** public.partial_account_line_items */
export type MarkerOfekPartialAccountLineItemRow = {
  id: string
  partial_account_id: string
  contract_line_item_id: string | null
  contract_milestone_id: string | null
  execution_percentage: number
  cumulative_amount: number
  submitted_percentage: number
  submitted_amount: number
  approved_percentage: number
  approved_amount: number
  created_at: string
}

export type MarkerOfekPartialAccountInsert = {
  contract_id: string
  /** אם null — מספר חשבון אוטומטי לפי חוזה (טריגר ב-DB) */
  account_number?: number | null
  status?: MoPartialAccountStatus
  total_cumulative_amount: number
  retention_deduction: number
  insurance_deduction: number
  payment_due: number
  snapshot_payload?: Record<string, unknown> | null
  previous_cumulative_approved?: number | null
  project_id?: string | null
}

export type MarkerOfekPartialAccountLineItemInsert = {
  partial_account_id: string
  contract_line_item_id?: string | null
  contract_milestone_id?: string | null
  execution_percentage: number
  cumulative_amount: number
  submitted_percentage: number
  submitted_amount: number
  approved_percentage: number
  approved_amount: number
}

/** public.mo_po_status */
export type MoPurchaseOrderStatus =
  | "draft"
  | "approved"
  | "pending_ceo_approval"
  | "sent"
  | "partial_receipt"
  | "closed"

/** public.items_catalog */
export type MarkerOfekItemsCatalogRow = {
  id: string
  sku: string
  description: string
  unit: string | null
  category: string | null
  default_price: number | null
  is_inventory: boolean
  /** שדות דינמיים מספק / OCR (marker_ofek_ai_invoices.sql) */
  additional_attributes?: Record<string, unknown>
  created_at: string
}

/** public.purchase_orders */
export type MarkerOfekPurchaseOrderRow = {
  id: string
  project_id: string
  tender_id?: string | null
  supplier_id: string
  po_number: string
  status: MoPurchaseOrderStatus
  is_deleted: boolean
  deleted_at: string | null
  order_date: string
  expected_delivery_date: string | null
  internal_notes: string | null
  total_amount: number
  created_by?: string | null
  user_signed_by?: string | null
  user_signed_at?: string | null
  ceo_signed_by?: string | null
  ceo_signed_at?: string | null
  ceo_approval_required?: boolean
  ceo_approval_email_sent_at?: string | null
  price_deviation_percent?: number
  price_deviation_amount?: number
  created_at: string
}

/** public.supplier_items — קישור קטלוג ↔ ספק */
export type MarkerOfekSupplierItemRow = {
  id: string
  master_item_id: string
  supplier_id: string
  supplier_sku: string | null
  unit_price: number
  discount_pct: number
  last_updated: string
  is_preferred: boolean
}

/** public.po_line_items */
export type MarkerOfekPoLineItemRow = {
  id: string
  po_id: string
  item_id: string | null
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total_price: number
  /** שדות דינמיים (מקושר לפריט / OCR) */
  additional_attributes?: Record<string, unknown>
  /** הצעה זוכה מ-supplier_items */
  selected_supplier_item_id: string | null
  created_at: string
}

/** public.centralized_invoices — חשבונית מרכזת חודשית (marker_ofek_ai_invoices.sql) */
export type MarkerOfekCentralizedInvoiceRow = {
  id: string
  invoice_number: number | null
  project_id: string | null
  billing_month: number | null
  billing_year: number | null
  total_amount: number | null
  status: string | null
  is_deleted: boolean | null
  created_at: string
}

/** public supplier invoice status (enum / text varies by migration) */
export type MoSupplierInvoiceStatus =
  | "pending"
  | "pending_match"
  | "paid"

/** public.supplier_invoices */
export type MarkerOfekSupplierInvoiceRow = {
  id: string
  supplier_id: string
  po_id: string | null
  invoice_number: string | null
  total_amount: number
  status: MoSupplierInvoiceStatus
  invoice_date: string
  paid_at: string | null
  notes: string | null
  /** קובץ מקור ב-Storage (קליטת AI) */
  source_storage_bucket?: string | null
  source_file_path?: string | null
  source_mime_type?: string | null
  created_at: string
}

/** public.goods_receipts */
export type MarkerOfekGoodsReceiptRow = {
  id: string
  po_id: string
  receipt_date: string
  delivery_note_number: string | null
  received_by: string | null
  delivery_note_image_url: string | null
  shortage_notes: string | null
  created_at: string
}

export type MarkerOfekItemsCatalogInsert = {
  sku: string
  description: string
  unit?: string | null
  category?: string | null
  default_price?: number | null
  is_inventory?: boolean
}

export type MarkerOfekPurchaseOrderInsert = {
  project_id: string
  supplier_id: string
  po_number?: string | null
  status?: MoPurchaseOrderStatus
  order_date?: string
  expected_delivery_date?: string | null
  internal_notes?: string | null
  total_amount?: number
}

export type MarkerOfekSupplierItemInsert = {
  master_item_id: string
  supplier_id: string
  supplier_sku?: string | null
  unit_price?: number
  discount_pct?: number
  is_preferred?: boolean
}

export type MarkerOfekPoLineItemInsert = {
  po_id: string
  item_id?: string | null
  description: string
  quantity: number
  unit?: string | null
  unit_price: number
  total_price: number
  selected_supplier_item_id?: string | null
}

export type MarkerOfekGoodsReceiptInsert = {
  po_id: string
  receipt_date?: string
  delivery_note_number?: string | null
  received_by?: string | null
  delivery_note_image_url?: string | null
  shortage_notes?: string | null
}

export type MarkerOfekSupplierInvoiceInsert = {
  supplier_id: string
  po_id: string | null
  invoice_number?: string | null
  total_amount: number
  status?: MoSupplierInvoiceStatus
  invoice_date?: string
  paid_at?: string | null
  notes?: string | null
  source_storage_bucket?: string | null
  source_file_path?: string | null
  source_mime_type?: string | null
}

/** public.goods_receipt_items */
export type MarkerOfekGoodsReceiptItemRow = {
  id: string
  goods_receipt_id: string
  po_line_item_id: string
  quantity_received: number
  created_at: string
}

export type MarkerOfekGoodsReceiptItemInsert = {
  goods_receipt_id: string
  po_line_item_id: string
  quantity_received: number
}
