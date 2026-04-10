/**
 * Holden ERP — General Ledger & Chart of Accounts (mirrors public.gl_* tables).
 */

export type GlAccountRow = {
  id: string
  account_code: string
  account_name_he: string
  account_name_en: string
  trial_balance_group: string
  financial_statement_category: string
  is_active: boolean
  created_at: string
  updated_at: string
  /** Core finance — asset | liability | equity | income | expense */
  account_class?: string | null
  parent_id?: string | null
  balance?: number | null
}

export type GlJournalEntryRow = {
  id: string
  entry_date: string
  reference_document_type: string
  reference_document_id: string
  description: string | null
  project_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type GlJournalLineRow = {
  id: string
  journal_entry_id: string
  account_id: string
  debit_amount: number
  credit_amount: number
  line_memo: string | null
  sort_order: number
  /** Phase 12 — קישור לפרויקט בשורה */
  project_id?: string | null
  /** Phase 12 — FK ל-erp_project_wbs */
  wbs_node_id?: string | null
  /** Phase 12 — מספר תנועה ב-Priority (ביקורת) */
  legacy_journal_entry_number?: string | null
  /** Phase 12 — סוג תנועה מהמקור */
  transaction_type?: string | null
  created_at: string
}

/** Input line for posting — exactly one side positive per row (validated server-side). */
export type HoldenGlJournalLineInput = {
  accountId: string
  debitAmount: number
  creditAmount: number
  lineMemo?: string | null
}

export type PostJournalEntryOptions = {
  description?: string | null
  projectId?: string | null
  /** ISO date yyyy-MM-dd; defaults to UTC today */
  entryDate?: string
}

/** Payload for `createJournalEntryAction` — kept here so journal-actions exports only async functions */
export type JournalEntryPayload = {
  entryDate: string
  description: string
  /** אסמכתא חיצונית / מספר מסמך */
  referenceNumber?: string
  /** מפתח ייחודיות — מונע כפל פקודת יומן */
  idempotencyKey?: string | null
  status: "draft" | "posted"
  lines: {
    /** `gl_accounts.id` (UUID) or account_code — resolved server-side */
    accountId: string
    debit: number
    credit: number
    reference1: string
    reference2: string
    details: string
  }[]
}

/** שורות יומן פתוחות להתאמה (צד כרטסת) */
export interface UnmatchedJournalLine {
  id: string
  entry_id: string
  entry_date: string
  entry_number: string
  description: string
  reference_1: string
  debit: number
  credit: number
  /** Net amount (debit − credit) for matching math */
  amount: number
}

/** שורות בנק פתוחות להתאמה (צד דף בנק) */
export interface UnmatchedBankLine {
  id: string
  statement_id: string
  transaction_date: string
  reference_number: string
  description: string
  debit: number
  credit: number
  /** Net amount (credit − debit): bank inflow minus outflow */
  amount: number
  /** מקור: ייבוא שטוח `bank_statement_entries` מול שורות legacy */
  source?: "feed" | "legacy"
}

/** public.erp_payment_terms */
export type ErpPaymentTerm = {
  code: string
  description: string
  is_eom: boolean
  months_to_add: number
  days_to_add: number
  installments: number
  created_at: string
  updated_at: string
}

/**
 * שדות גבייה (A/R) ללקוח — `public.entities` כאשר `type = 'client'` (Holden Phase 9).
 * נפרד משדות ספק (AP) כדי למנוע בלבול; `tax_id` / `legal_id` משותפים לישות.
 */
export type EntityAccountsReceivableFields = {
  erp_customer_number: string | null
  status_he: string | null
  account_manager: string | null
  currency_code: string | null
  vat_code: string | null
  phone: string | null
  fax: string | null
  email: string | null
  address_line_1: string | null
  city: string | null
  zip_code: string | null
}

/**
 * עמודות ERP/מס על `public.entities` — תואמות מיגרציה
 * `20260605120000_holden_erp_fix_entity_tax_columns.sql` (ADD COLUMN IF NOT EXISTS).
 */
export const ENTITY_ERP_FINANCIAL_COLUMN_KEYS = [
  "withholding_tax_expiry",
  "bookkeeping_cert_expiry",
  "withholding_tax_pct",
  "payment_term_code",
  "erp_supplier_number",
  "erp_customer_number",
] as const

export type EntityErpFinancialColumnKey =
  (typeof ENTITY_ERP_FINANCIAL_COLUMN_KEYS)[number]

/**
 * שדות פיננסיים להרחבת ישות (ספק/לקוח) — תואמים עמודות ב־`public.entities`.
 * שמות עמודות קנוניים: `withholding_tax_expiry`, `bookkeeping_cert_expiry`, `withholding_tax_pct`, וכו׳.
 * (גרסאות Holden ישנות יותר: `withholding_tax_expires_at`, `bookkeeping_cert_expires_at`, `bookkeeping_auth_expiry`.)
 */
export type EntityFinancials = {
  erp_supplier_number: string | null
  erp_customer_number: string | null
  tax_id: string | null
  payment_term_code: string | null
  withholding_tax_pct: number | null
  /** ברירת מחדל לניכוי (%) — עמודת `default_withholding_tax_percent` (מסונכרן לעיתים עם `withholding_tax_pct`) */
  default_withholding_tax_percent?: number | null
  /** תאריך — תואם לעמודת `withholding_tax_expiry` */
  withholding_tax_expiry: string | null
  /** תאריך — תואם לעמודת `bookkeeping_cert_expiry` */
  bookkeeping_cert_expiry: string | null
  gl_account_code: string | null
  bank_code: string | null
  bank_branch: string | null
  bank_account_number: string | null
}

export type SupplierTaxComplianceCode =
  | "BOOKKEEPING_EXPIRED"
  | "WITHHOLDING_EXPIRED"
  | "ENTITY_NOT_FOUND"
  | "MISSING_ENTITY"
  | "LOAD_ERROR"

export type SupplierTaxComplianceResult =
  | { ok: true }
  | {
      ok: false
      code: SupplierTaxComplianceCode
      reason: string
    }

/** מס״ב — דוח התקדמות מאושר לריצת תשלום (סכום מ־`total_payable`) */
export type PendingPaymentRow = {
  id: string
  date: string | null
  contractorName: string
  contractNumber: string
  projectName: string
  amount: number
  glAccountCode: string | null
  /** מקור השורה בקובץ מס״ב */
  paymentSource: "progress_report" | "procurement_masav"
}

/** תחנת בקרה — קבלת מחסן מול הזמנה */
export type FinancialClearanceRow = {
  receiptId: string
  receiptDate: string
  warehouseLocation: string
  poId: string
  poNumber: string
  projectName: string
  supplierName: string
  financialApprovalStatus: string
  deliveryNoteStoragePath: string | null
  verificationNotes: string | null
  /** כל שורות ה־PO (ההזמנה המקורית) */
  orderedLines: Array<{
    lineId: string
    partLabel: string
    orderedQty: number
    unitPrice: number
    lineTotal: number
  }>
  /** כמויות בקבלה הנוכחית בלבד, לפי שורת הזמנה */
  receiptQtyByPurchaseOrderLineId: Record<string, number>
  /** לכל שורת PO, הכמות בקבלה זו שווה לכמות שהוזמנה */
  quantitiesFullyAligned: boolean
  /** יחס ערך (קבלה זו מול סה״כ PO) */
  valueAlignmentRatio: number
}

export type FetchPendingPaymentsResult =
  | { success: true; data: PendingPaymentRow[] }
  | { success: false; data: []; error: string }
