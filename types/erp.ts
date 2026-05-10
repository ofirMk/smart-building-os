export const ERP_SUPPLIER_TYPES = ["STANDARD", "SUBCONTRACTOR"] as const

export type ErpSupplierType = (typeof ERP_SUPPLIER_TYPES)[number]

export type ErpSupplier = {
  id: string
  companyId: string
  supplierNum: string
  name: string
  taxId: string | null
  type: ErpSupplierType
  paymentTerms: string | null
}

export type ErpSupplierContact = {
  id: string
  companyId: string
  supplierId: string
  name: string
  role: string | null
  phone: string | null
  email: string | null
  isPrimary: boolean
}

export type ErpSupplierBankAccount = {
  id: string
  companyId: string
  supplierId: string
  bankName: string
  branchCode: string | null
  accountNumber: string
  iban: string | null
  swift: string | null
  isPrimary: boolean
}

export type ErpSupplierMasterDetail = ErpSupplier & {
  contacts?: ErpSupplierContact[]
  bankAccounts?: ErpSupplierBankAccount[]
}

export type ErpProductFamily = {
  id: string
  companyId: string
  code: string
  name: string
}

export type ErpItem = {
  id: string
  companyId: string
  sku: string
  itemNumber?: string
  description: string
  uom: string
  unitOfMeasure?: string
  uomNormalized?: string | null
  uomSourceText?: string | null
  isInventoryManaged: boolean
  status?: string
  minOrderQuantity?: number
  itemType?: string
  budgetSubChapter?: string | null
  resourceId?: string | null
  budgetSubChapterManualOverride?: boolean
  resourceIdManualOverride?: boolean
  internalSku?: string | null
  skuAliases?: string[]
  ocrMatchTokens?: string[]
  aiMetadata?: Record<string, unknown>
  legacyDefaultPrice?: number | null
  legacyLastPrice?: number | null
  productFamilyId: string
  productFamily: ErpProductFamily | null
}

export type ErpSupplierItem = {
  id: string
  companyId: string
  itemId: string
  supplierId: string
  supplierSku: string | null
  basePrice: number
  discountPercentage: number
  currency: string
  uom: string | null
  validFrom: string | null
  validTo: string | null
  isPreferred: boolean
  aiLastParsedAt: string | null
  aiParseStatus: string | null
  aiParseHistory: unknown[]
  aiMetadata: Record<string, unknown>
}

export type CreateSupplierInput = {
  supplierNum: string
  name: string
  taxId?: string | null
  type?: ErpSupplierType
  paymentTerms?: string | null
}

export type UpdateSupplierInput = Partial<CreateSupplierInput>

export type CreateSupplierContactInput = {
  name: string
  role?: string | null
  phone?: string | null
  email?: string | null
  isPrimary?: boolean
}

export type UpdateSupplierContactInput = Partial<CreateSupplierContactInput>

export type CreateProductFamilyInput = {
  code: string
  name: string
}

export type UpdateProductFamilyInput = Partial<CreateProductFamilyInput>

export type CreateItemInput = {
  sku: string
  description: string
  uom: string
  productFamilyId: string
  isInventoryManaged?: boolean
  internalSku?: string | null
  skuAliases?: string[]
  uomNormalized?: string | null
  uomSourceText?: string | null
  aiMetadata?: Record<string, unknown>
  legacyDefaultPrice?: number | null
  legacyLastPrice?: number | null
}

export type UpdateItemInput = Partial<CreateItemInput>

export type CreateSupplierItemInput = {
  itemId: string
  supplierId: string
  supplierSku?: string | null
  basePrice?: number
  discountPercentage?: number
  currency?: string
  uom?: string | null
  validFrom?: string | null
  validTo?: string | null
  isPreferred?: boolean
  aiLastParsedAt?: string | null
  aiParseStatus?: string | null
  aiParseHistory?: unknown[]
  aiMetadata?: Record<string, unknown>
}

export type UpdateSupplierItemInput = Partial<CreateSupplierItemInput>

export const ERP_PROJECT_STATUSES = ["ACTIVE", "COMPLETED", "DRAFT"] as const
export type ErpProjectStatus = (typeof ERP_PROJECT_STATUSES)[number]

export const ERP_PLANNING_VERSION_STATUSES = ["DRAFT", "APPROVED"] as const
export type ErpPlanningVersionStatus = (typeof ERP_PLANNING_VERSION_STATUSES)[number]

export type ErpProject = {
  id: string
  companyId: string
  projectNumber: string
  name: string
  status: ErpProjectStatus
  startDate: string | null
  endDate: string | null
  projectManagerId: string | null
}

export type ErpPlanningVersion = {
  id: string
  companyId: string
  projectId: string
  versionNumber: number
  description: string
  isBaseVersion: boolean
  isExecutionVersion: boolean
  status: ErpPlanningVersionStatus
}

export type ErpBoqLine = {
  id: string
  companyId: string
  versionId: string
  section: string
  itemNumber: string
  description: string
  uom: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export type CreatePlanningVersionInput = {
  versionNumber?: number
  description: string
  isBaseVersion: boolean
  isExecutionVersion: boolean
  status: ErpPlanningVersionStatus
}

export type CreateBoqLineInput = {
  section: string
  itemNumber: string
  description: string
  uom: string
  quantity: number
  unitPrice: number
}

export const ERP_CONTRACT_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "ACTIVE",
  "CLOSED",
] as const
export type ErpContractStatus = (typeof ERP_CONTRACT_STATUSES)[number]

export type ErpContract = {
  id: string
  companyId: string
  projectId: string
  supplierId: string
  contractNumber: string
  title: string
  status: ErpContractStatus
  totalAmount: number
  paymentTermsOverride: string | null
  startDate: string | null
  endDate: string | null
}

export type ErpContractLine = {
  id: string
  companyId: string
  contractId: string
  boqLineId: string | null
  itemId: string | null
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export type CreateContractInput = {
  projectId: string
  supplierId: string
  contractNumber: string
  title: string
  status?: ErpContractStatus
  totalAmount?: number
  paymentTermsOverride?: string | null
  startDate?: string | null
  endDate?: string | null
}

export type UpdateContractInput = Partial<CreateContractInput>

export type CreateContractLineInput = {
  boqLineId?: string | null
  itemId?: string | null
  description: string
  quantity: number
  unitPrice: number
}

export type UpdateContractLineInput = Partial<CreateContractLineInput>

export type ErpDirectActivationContext<TEntity> = {
  entityName: string
  entity: TEntity | null
}

export type ErpDirectActivation<TEntity = unknown> = {
  id: string
  label: string
  hint?: string
  disabled?: boolean
  onActivate: (context: ErpDirectActivationContext<TEntity>) => void | Promise<void>
}

export const ERP_PURCHASE_ORDER_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "PENDING_PRICE_APPROVAL",
  "APPROVED",
  "SENT_TO_SUPPLIER",
  "SENT",
  "PARTIALLY_RECEIVED",
  "FULLY_RECEIVED",
  "CLOSED",
  "CANCELLED",
] as const
export type ErpPurchaseOrderStatus = (typeof ERP_PURCHASE_ORDER_STATUSES)[number]

export const ERP_GOODS_RECEIPT_STATUSES = ["DRAFT", "COMPLETED", "FINAL"] as const
export type ErpGoodsReceiptStatus = (typeof ERP_GOODS_RECEIPT_STATUSES)[number]

export const ERP_VENDOR_INVOICE_STATUSES = [
  "DRAFT",
  "NEW",
  "MATCHED",
  "HAS_VARIANCES",
  "APPROVED",
  "READY_FOR_PAYMENT",
  "FINAL",
  "CANCELLED",
] as const
export type ErpVendorInvoiceStatus = (typeof ERP_VENDOR_INVOICE_STATUSES)[number]

/**
 * Phase 8.3 — תוצאת 3-Way Match ברמת שורת חשבונית מול שורת PO + GR מתאימות.
 */
export const ERP_INVOICE_MATCH_LINE_STATUSES = [
  "PERFECT",
  "QTY_VARIANCE",
  "PRICE_VARIANCE",
  "MIXED_VARIANCE",
] as const
export type ErpInvoiceMatchLineStatus =
  (typeof ERP_INVOICE_MATCH_LINE_STATUSES)[number]

export type ErpPurchaseOrder = {
  id: string
  companyId: string
  projectId: string
  supplierId: string
  poNumber: string
  title: string
  status: ErpPurchaseOrderStatus
  priceOverrideStatus?: "NONE" | "REQUESTED" | "APPROVED"
  totalAmount: number
  issuedAt: string | null
  notes: string | null
}

export type ErpPurchaseOrderLine = {
  id: string
  companyId: string
  purchaseOrderId: string
  projectId: string
  itemSku: string | null
  budgetSubChapter: string
  resourceId: string
  description: string
  quantity: number
  unitPrice: number
  effectiveUnitPrice?: number | null
  totalPrice: number
}

export type ErpGoodsReceipt = {
  id: string
  companyId: string
  purchaseOrderId: string
  grNumber: string
  status: ErpGoodsReceiptStatus
  receiptDate: string | null
  notes: string | null
  /** Phase 8.2 — מספר תעודת משלוח מהספק. */
  vendorDeliveryNote?: string | null
  /** Phase 8.2 — חותמת זמן קליטה פיזית. */
  receivedAt?: string | null
  /** Phase 8.2 — auth.users.id של המחסנאי. */
  receivedBy?: string | null
}

export type ErpGoodsReceiptLine = {
  id: string
  companyId: string
  goodsReceiptId: string
  purchaseOrderLineId: string | null
  projectId: string
  budgetSubChapter: string
  resourceId: string
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  /** Phase 8.2 — מזהה פריט ל-erp_md_items. */
  itemId?: string | null
  /** Phase 8.2 — כמות שנדחתה (פגומה / לא מתאימה). */
  rejectedQty?: number
  /** Phase 8.2 — סיבת דחייה. */
  rejectReason?: string | null
}

export type ErpVendorInvoice = {
  id: string
  companyId: string
  supplierId: string
  invoiceNumber: string
  status: ErpVendorInvoiceStatus
  invoiceDate: string | null
  totalAmount: number
  priceVarianceAmount: number
  notes: string | null
  /** Phase 8.3 — קישור ישיר ל-PO (ה-header). nullable — Direct AP ללא PO. */
  purchaseOrderId?: string | null
  /** Phase 8.3 — קישור ישיר ל-GR (ה-header). hint בלבד — שורות מגשרות עצמאית. */
  goodsReceiptId?: string | null
}

export type ErpVendorInvoiceLine = {
  id: string
  companyId: string
  vendorInvoiceId: string
  goodsReceiptLineId: string | null
  projectId: string
  budgetSubChapter: string
  resourceId: string
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  /** Phase 8.3 — קישור ישיר לשורת PO לצורך 3-Way Match. */
  purchaseOrderLineId?: string | null
}

/**
 * Phase 8.3 — שורת גישור בטבלת `erp_invoice_po_line_matches`.
 * Snapshot של ההשוואה בזמן ההרצת ה-RPC erp_perform_3way_match.
 */
export type ErpInvoicePoLineMatch = {
  id: string
  companyId: string
  invoiceId: string
  invoiceLineId: string
  poLineId: string
  grLineId: string | null
  invoiceQty: number
  invoiceUnitPrice: number
  poUnitPrice: number
  poOrderedQty: number
  grReceivedQty: number
  /** invoice_qty - gr_received_qty */
  qtyDiff: number
  /** invoice_unit_price - po_unit_price */
  priceDiff: number
  matchStatus: ErpInvoiceMatchLineStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Phase 8.3 — תוצאה מה-RPC `erp_perform_3way_match(p_invoice_id)`.
 * ממופה הישר מ-snake_case ל-camelCase.
 */
export type ErpPerform3WayMatchResult = {
  invoiceId: string
  newInvoiceStatus: ErpVendorInvoiceStatus
  totalInvoiceLines: number
  matchedLines: number
  perfectLines: number
  qtyVarianceLines: number
  priceVarianceLines: number
  mixedVarianceLines: number
  unmatchedLines: number
  /** סכום qty_diff (yes-can-go-negative). */
  totalQtyDiff: number
  /** סכום price_diff מוכפל ב-invoice_qty (השפעה כספית). */
  totalPriceDiffValue: number
}

export type ErpProcurementStatusEvent = {
  id: string
  companyId: string
  entityType: "PURCHASE_ORDER" | "GOODS_RECEIPT" | "VENDOR_INVOICE"
  entityId: string
  fromStatus: string | null
  toStatus: string
  actionName: string
  createdAt: string
}

export type ErpClientContract = {
  id: string
  companyId: string
  projectId: string
  supplierId: string | null
  contractNumber: string
  clientName: string
  title: string
  status: "DRAFT" | "ACTIVE" | "CLOSED" | "CANCELLED"
  indexationPct: number
  retentionPct: number
  advancePaymentAmount: number
  advanceRepaymentPct: number
  totalAmount: number
  startDate: string | null
  endDate: string | null
}

export type ErpClientContractLine = {
  id: string
  companyId: string
  clientContractId: string
  supplierId: string | null
  itemId: string | null
  lineNumber: number
  boqRef: string | null
  description: string
  quantity: number
  unitPrice: number
  expectedUnitCost: number | null
  expectedTotalCost: number
  profitabilityPct: number
  totalPrice: number
  lastApprovedPct: number
  lastApprovedQty: number
  lastApprovedAmount: number
  retainageExempt: boolean
  isAdvanceLine: boolean
  priceOverrideStatus: "NONE" | "REQUESTED" | "APPROVED"
}

export type ErpChangeOrder = {
  id: string
  companyId: string
  clientContractId: string
  contractLineId: string | null
  priceItemId: string | null
  priceSupplierId: string | null
  supplierId: string | null
  changeOrderNumber: string
  changeType: "NEW_LINE" | "QTY_CHANGE" | "PRICE_CHANGE"
  newLineDescription: string | null
  qtyDelta: number | null
  newUnitPrice: number | null
  status: "DRAFT" | "PENDING_PRICE_APPROVAL" | "ACTIVE" | "APPROVED" | "REJECTED"
  priceOverrideStatus?: "NONE" | "REQUESTED" | "APPROVED"
  notes: string | null
  isExtraWork: boolean
  isAdditionalWork: boolean
  isLocked: boolean
  managerApprovalRequired: boolean
  managerApprovalReason: string | null
  effectivePriceSnapshot: number | null
}

export type ErpClientProgressBill = {
  id: string
  companyId: string
  clientContractId: string
  billNumber: string
  periodStart: string | null
  periodEnd: string | null
  status: "DRAFT" | "SUBMITTED" | "PARTIALLY_APPROVED" | "APPROVED"
  submittedTotalAmount: number
  approvedTotalAmount: number
  indexedSubmittedAmount: number
  indexedApprovedAmount: number
  retentionDeductedAmount: number
  advanceRepaymentAmount: number
  netApprovedPayable: number
}

export type ErpClientProgressBillLine = {
  id: string
  companyId: string
  progressBillId: string
  contractLineId: string
  submittedQuantity: number
  submittedAmount: number
  submittedPercent: number
  approvedQuantity: number | null
  approvedAmount: number | null
  approvedPercent: number | null
  approvedManualOverride: boolean
}

export interface SubcontractorBill {
  id: string
  projectId: string
  // Stored as company-scoped supplier text identifier in this codebase.
  supplierId: string
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PAID"
  amount: number
  isOffset: boolean
  linkedPurchaseOrderId?: string
  historicalVariance?: number
}

export interface HistoricalPriceStats {
  avgPrice: number
  minPrice: number
  maxPrice: number
  lastPaidPrice: number
  sampleCount: number
}

// =============================================================================
// Phase A — AI Autonomous Procurement: Knowledge Foundation
// Migration: 20260808100000_ai_autonomous_procurement_foundation.sql
// =============================================================================

export const ERP_PROJ_LOCATION_LEVELS = [
  "BUILDING",
  "FLOOR",
  "ZONE",
  "ROOM",
  "AREA",
] as const
export type ErpProjLocationLevel = (typeof ERP_PROJ_LOCATION_LEVELS)[number]

export const ERP_ASSEMBLY_UOMS = [
  "METER",
  "SQM",
  "CBM",
  "UNIT",
  "KG",
  "METER_RUN",
] as const
export type ErpAssemblyUom = (typeof ERP_ASSEMBLY_UOMS)[number]

export const ERP_ASSEMBLY_LINE_ROLES = [
  "PRIMARY",
  "SUPPORT",
  "FASTENER",
  "CONSUMABLE",
  "OPTIONAL",
  "ACCESSORY",
] as const
export type ErpAssemblyLineRole = (typeof ERP_ASSEMBLY_LINE_ROLES)[number]

export const ERP_ENGINEERING_RULE_TYPES = [
  "RATIO",
  "PER_LENGTH",
  "PER_AREA",
  "ABSOLUTE_MIN",
  "ABSOLUTE_MAX",
  "COMPATIBILITY",
] as const
export type ErpEngineeringRuleType = (typeof ERP_ENGINEERING_RULE_TYPES)[number]

export const ERP_ENGINEERING_RULE_ACTIONS = [
  "WARN",
  "BLOCK",
  "ESCALATE",
] as const
export type ErpEngineeringRuleAction =
  (typeof ERP_ENGINEERING_RULE_ACTIONS)[number]

export const ERP_AI_BOM_REQUEST_MODALITIES = ["TEXT", "VOICE", "FORM"] as const
export type ErpAiBomRequestModality =
  (typeof ERP_AI_BOM_REQUEST_MODALITIES)[number]

export const ERP_AI_BOM_REQUEST_ACTIONS = [
  "PENDING",
  "DRAFT_PO_CREATED",
  "BLOCKED",
  "ESCALATED",
  "USER_OVERRIDE",
  "CANCELLED",
] as const
export type ErpAiBomRequestAction =
  (typeof ERP_AI_BOM_REQUEST_ACTIONS)[number]

/** היררכיית מיקומים בפרויקט (קומה/מפלס/אזור/חדר). */
export interface ErpProjLocation {
  id: string
  companyId: string
  projectId: string
  parentId: string | null
  code: string
  name: string
  levelType: ErpProjLocationLevel
  /** אורך במטרים — נדרש לחוקי PER_LENGTH/RATIO על UoM=METER. */
  lengthM: number | null
  /** שטח במ"ר — נדרש לחוקי PER_AREA. */
  areaSqm: number | null
  metadata: Record<string, unknown>
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/** עץ מוצר (קיט). embedding מתמלא ב-Phase C. */
export interface ErpProductAssembly {
  id: string
  companyId: string
  code: string
  name: string
  description: string
  category: string
  unitOfMeasure: ErpAssemblyUom
  version: number
  parentAssemblyId: string | null
  /** vector(1536) — מוחזר כמערך מספרים מ-PostgREST. null עד Phase C. */
  embedding: number[] | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/** שורת רכיב בקיט. quantity_per_base_unit הוא היחס לתוך UoM של ה-assembly. */
export interface ErpAssemblyLine {
  id: string
  companyId: string
  assemblyId: string
  itemId: string
  quantityPerBaseUnit: number
  role: ErpAssemblyLineRole
  isOptional: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

/** מילה נרדפת לחיפוש NL. embedding מתמלא ב-Phase C. */
export interface ErpAssemblyAlias {
  id: string
  companyId: string
  assemblyId: string
  aliasText: string
  aliasEmbedding: number[] | null
  language: string
  createdAt: string
  updatedAt: string
}

/** חוק תקן הנדסי. parameters שונה לפי ruleType (RATIO ≠ PER_LENGTH). */
export interface ErpEngineeringRule {
  id: string
  companyId: string
  code: string
  name: string
  description: string
  regulatorySource: string | null
  /** ריק = החוק חל על כל ה-assemblies לפי applicableCategories. */
  applicableAssemblyIds: string[]
  applicableCategories: string[]
  ruleType: ErpEngineeringRuleType
  parameters: Record<string, unknown>
  expectedValue: number | null
  tolerancePct: number
  violationAction: ErpEngineeringRuleAction
  isActive: boolean
  effectiveFrom: string
  effectiveUntil: string | null
  /** auth.users.id של המהנדס המוסמך שחתם. */
  signedBy: string | null
  signedAt: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

/** Audit log של חריגה מחוק. immutable — אין updatedAt. */
export interface ErpEngineeringRuleViolation {
  id: string
  companyId: string
  ruleId: string
  bomRequestId: string | null
  severity: ErpEngineeringRuleAction
  actualValue: number
  expectedValue: number
  /** סטיה באחוזים מהערך המצופה (חיובי = מעל, שלילי = מתחת). */
  deltaPct: number
  decidedAction: string | null
  context: Record<string, unknown>
  createdAt: string
}

// =============================================================================
// Phase B — Deterministic Engine RPC contracts
// Migration: 20260809100000_ai_procurement_deterministic_engine.sql
// =============================================================================

/** שורת BOM פתורה ע"י `erp_resolve_assembly_bom`. */
export interface ErpResolvedBomLine {
  itemId: string
  itemNumber: string
  itemDescription: string
  /** UoM של הפריט (לא של ה-assembly). */
  itemUom: string
  role: ErpAssemblyLineRole
  quantityPerBase: number
  /** quantityPerBase × requestedQty לפני עיגול. */
  rawQuantity: number
  /** הכמות הסופית אחרי CEIL/ROUND לפי UoM של ה-assembly. */
  resolvedQuantity: number
  isOptional: boolean
}

/** הפרת חוק הנדסי שמוחזרת מ-`erp_validate_engineering_rules`. */
export interface ErpEngineeringViolation {
  ruleId: string
  ruleCode: string
  ruleName: string
  ruleType: ErpEngineeringRuleType
  violationAction: ErpEngineeringRuleAction
  actualValue: number
  expectedValue: number
  deltaPct: number
  tolerancePct: number
  message: string
}

/** התוצאה של `erp_generate_draft_po_from_bom` (Phase B orchestrator). */
export interface ErpGenerateDraftPoResult {
  purchaseOrderId: string
  poNumber: string
  /** 'DRAFT' אם אין violations חמורות, 'PENDING_APPROVAL' אם יש ESCALATE. */
  status: string
  totalAmountNet: number
  /** ESCALATE/WARN בלבד מגיעים לכאן; BLOCK זורק exception (HTTP 409). */
  violations: ErpEngineeringViolation[]
  /** מזהה רשומת ה-audit ב-erp_ai_bom_requests. */
  bomRequestId: string
  linesCount: number
}

/** Audit log של בקשת AI לתכנון BOM. Replay מלא דרך השדות jsonb. */
export interface ErpAiBomRequest {
  id: string
  companyId: string
  projectId: string | null
  locationId: string | null
  requestedBy: string | null
  rawInput: string
  inputModality: ErpAiBomRequestModality
  parsedIntent: Record<string, unknown>
  confidenceScore: number | null
  /** Array of { tool, args, result, durationMs }. */
  toolCallLog: unknown[]
  /** Array of resolved BOM lines (item_id, qty, role). */
  generatedBom: unknown[]
  /** Array of violations triggered during validation. */
  engineeringViolations: unknown[]
  finalAction: ErpAiBomRequestAction
  draftPoId: string | null
  latencyMs: number | null
  llmTokensUsed: number | null
  /** true אם total היה חורג מ-po_auto_limit (₪50K MVP). */
  hardLimitExceeded: boolean
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

// ============================================================================
// Phase E — Supplier Catalog Ingestion
// (DB schema: 20260813100000_supplier_catalog_imports_schema.sql)
// ============================================================================

export const ERP_SUPPLIER_CATALOG_IMPORT_STATUSES = [
  "PENDING",
  "EXTRACTING",
  "READY",
  "IMPORTED",
  "FAILED",
  "CANCELLED",
] as const
export type ErpSupplierCatalogImportStatus =
  (typeof ERP_SUPPLIER_CATALOG_IMPORT_STATUSES)[number]

export const ERP_SUPPLIER_CATALOG_LINE_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "EDITED",
  "REJECTED",
  "IMPORTED",
] as const
export type ErpSupplierCatalogLineStatus =
  (typeof ERP_SUPPLIER_CATALOG_LINE_STATUSES)[number]

export const ERP_SUPPLIER_CATALOG_FILE_FORMATS = [
  "pdf",
  "xlsx",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "webp",
] as const
export type ErpSupplierCatalogFileFormat =
  (typeof ERP_SUPPLIER_CATALOG_FILE_FORMATS)[number]

/** Header של ייבוא קטלוג ספק (PDF/Excel). השורות שחולצו ב-`ErpSupplierCatalogImportLine`. */
export interface ErpSupplierCatalogImport {
  id: string
  companyId: string
  supplierId: string
  fileUrl: string
  originalFilename: string
  fileFormat: ErpSupplierCatalogFileFormat
  fileSizeBytes: number
  status: ErpSupplierCatalogImportStatus
  linesCount: number
  /** ממוצע confidence_score של כל השורות שחולצו (0..1). */
  confidenceAvg: number | null
  importedBy: string | null
  metadata: Record<string, unknown>
  errorMessage: string | null
  extractedAt: string | null
  importedAt: string | null
  createdAt: string
  updatedAt: string
}

/* ---------------------------------------------------------------------------
 * Phase 9 Step 1 — Personal Productivity & Microsoft Graph integration types.
 * Mirror של 20260815100000_user_integrations_schema.sql.
 * ה-RLS על הטבלאות הוא per-user (auth.uid() = user_id), לא per-company —
 * ולכן השדות פה לא כוללים companyId.
 * ------------------------------------------------------------------------- */

export const ERP_USER_INTEGRATION_PROVIDERS = [
  "MICROSOFT_GRAPH",
  "GOOGLE_WORKSPACE",
  "SLACK",
] as const
export type ErpUserIntegrationProvider =
  (typeof ERP_USER_INTEGRATION_PROVIDERS)[number]

export const ERP_USER_INTEGRATION_SYNC_STATUSES = [
  "PENDING",
  "SYNCING",
  "ACTIVE",
  "STALE",
  "EXPIRED",
  "REVOKED",
  "ERROR",
] as const
export type ErpUserIntegrationSyncStatus =
  (typeof ERP_USER_INTEGRATION_SYNC_STATUSES)[number]

export const ERP_COMMUNICATION_TYPES = ["EMAIL", "MEETING", "CHAT"] as const
export type ErpCommunicationType = (typeof ERP_COMMUNICATION_TYPES)[number]

export const ERP_COMMUNICATION_LINKED_ENTITY_TYPES = [
  "PROJECT",
  "PURCHASE_ORDER",
  "SUPPLIER",
  "INVOICE",
] as const
export type ErpCommunicationLinkedEntityType =
  (typeof ERP_COMMUNICATION_LINKED_ENTITY_TYPES)[number]

/** OAuth integration אחד פר משתמש × provider. אסור לחשוף ל-UI את ה-tokens. */
export interface ErpUserIntegration {
  id: string
  userId: string
  provider: ErpUserIntegrationProvider
  /** UI-safe — לא לחשוף את הטוקן עצמו ב-API responses; רק boolean / ה-email. */
  emailAddress: string
  externalTenantId: string | null
  syncStatus: ErpUserIntegrationSyncStatus
  lastSyncAt: string | null
  lastSyncError: string | null
  expiresAt: string
  scopes: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

/** שולח/נמען מנורמל בכרטיס תקשורת. */
export interface ErpCommunicationParticipant {
  name: string | null
  address: string
  isInternal?: boolean
}

/** פריט יחיד במטמון התקשורת — מייל / פגישה / (בעתיד) צ׳אט. */
export interface ErpCommunicationCacheItem {
  id: string
  userId: string
  integrationId: string | null
  externalId: string
  type: ErpCommunicationType
  sender: ErpCommunicationParticipant
  recipients: ErpCommunicationParticipant[]
  subject: string
  bodyPreview: string | null
  isRead: boolean
  isFlagged: boolean
  hasAttachments: boolean
  receivedAt: string
  /** Meeting only. */
  endsAt: string | null
  /** Meeting only. */
  location: string | null
  linkedEntityType: ErpCommunicationLinkedEntityType | null
  linkedEntityId: string | null
  /** 0..1; UI מציג קישור רק כש-≥ 0.6. */
  linkConfidence: number | null
  createdAt: string
  updatedAt: string
}

/** שורה שחולצה מקטלוג ספק — ממתינה לאישור איש רכש. */
export interface ErpSupplierCatalogImportLine {
  id: string
  companyId: string
  importId: string
  lineNumber: number
  sku: string | null
  description: string
  uom: string
  price: number
  currency: string
  /** 0..1 — ה-UI מציג שורות עם <0.85 בצבע אזהרה. */
  confidenceScore: number
  status: ErpSupplierCatalogLineStatus
  matchedItemId: string | null
  reviewerNotes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  rawExtracted: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ===========================================================================
// Subcontractor Contracts (חוזי קבלן משנה) — מיגרציה 20260818100000
// ===========================================================================

export const ERP_SUBCONTRACTOR_CONTRACT_TYPES = [
  "PAUSHALI",
  "MEASURED",
] as const
export type ErpSubcontractorContractType =
  (typeof ERP_SUBCONTRACTOR_CONTRACT_TYPES)[number]

export const ERP_SUBCONTRACTOR_CONTRACT_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const
export type ErpSubcontractorContractStatus =
  (typeof ERP_SUBCONTRACTOR_CONTRACT_STATUSES)[number]

export type ErpSubcontractorContract = {
  id: string
  companyId: string
  projectId: string
  subcontractorId: string
  contractNumber: string
  contractType: ErpSubcontractorContractType
  totalAmount: number
  insurancePct: number
  retentionPct: number
  paymentTerms: string | null
  escalationIncluded: boolean
  status: ErpSubcontractorContractStatus
  signedAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type ErpContractBoqLine = {
  id: string
  companyId: string
  contractId: string
  lineNo: number
  sectionCode: string
  description: string
  uom: string
  quantity: number
  unitPrice: number
  discountAmount: number
  totalLinePrice: number
  escalationIncluded: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type ErpContractGeneralTerm = {
  id: string
  companyId: string
  contractId: string
  termIndex: number
  termText: string
  createdAt: string
  updatedAt: string
}

export type ErpSubcontractorContractDetail = ErpSubcontractorContract & {
  boqLines?: ErpContractBoqLine[]
  generalTerms?: ErpContractGeneralTerm[]
}

/** UUID דמו של חוזה ההדגמה (Seed). יציב עבור כפתור ה"הדפס" במצגת. */
export const DEMO_SUBCONTRACTOR_CONTRACT_ID =
  "c0700000-0000-4000-8000-cccccccccccc"

// ===========================================================================
// Subcontractor Partial Bills (חשבונות חלקיים) — מיגרציה 20260819100000
// ===========================================================================

export const ERP_SUBCONTRACTOR_BILL_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "PAID",
  "REJECTED",
] as const
export type ErpSubcontractorBillStatus =
  (typeof ERP_SUBCONTRACTOR_BILL_STATUSES)[number]

export type ErpSubcontractorBill = {
  id: string
  companyId: string
  projectId: string
  contractId: string
  billNumber: number
  executionMonth: string
  billDate: string
  cumulativeExecutedAmount: number
  retentionDeductionAmount: number
  insuranceDeductionAmount: number
  /** Computed (generated stored) — cumulative_executed − retention − insurance */
  cumulativeNetAmount: number
  previousBilledAmount: number
  /** = cumulativeNetAmount − previousBilledAmount */
  amountToPay: number
  vatPct: number
  vatAmount: number
  grandTotalAmount: number
  status: ErpSubcontractorBillStatus
  notes: string | null
  approvedAt: string | null
  paidAt: string | null
  createdAt: string
  updatedAt: string
}

export type ErpSubcontractorBillLine = {
  id: string
  companyId: string
  billId: string
  boqLineId: string
  cumulativeQty: number
  cumulativePct: number
  cumulativeAmount: number
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type ErpSubcontractorBillDetail = ErpSubcontractorBill & {
  lines?: ErpSubcontractorBillLine[]
}

/** UUID דמו של החשבון החלקי המוצג (Seed bill #5). יציב עבור כפתור המצגת. */
export const DEMO_SUBCONTRACTOR_BILL_ID =
  "b1110000-0000-4000-8000-555555555555"

/**
 * UUID דמו של הזמנת הרכש המוצגת (Seed PO-2026-001). יציב עבור כפתור המצגת.
 * מייצג "עבודות חשמל נוספות" — change-order style מעל חוזה קבלן המשנה.
 */
export const DEMO_PURCHASE_ORDER_ID =
  "d0000000-0000-4000-8000-777777777777"

/**
 * UUID דמו של דוח התאמת בנק לחודש 11/2026 (Seed). יציב עבור כפתור המצגת
 * "דוח התאמת בנק (PDF)" ב-CEO Command Center.
 */
export const DEMO_BANK_RECONCILIATION_ID =
  "e0000000-0000-4000-8000-888888888888"
