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
  "PENDING_PRICE_APPROVAL",
  "APPROVED",
  "SENT",
  "CLOSED",
  "CANCELLED",
] as const
export type ErpPurchaseOrderStatus = (typeof ERP_PURCHASE_ORDER_STATUSES)[number]

export const ERP_GOODS_RECEIPT_STATUSES = ["DRAFT", "FINAL"] as const
export type ErpGoodsReceiptStatus = (typeof ERP_GOODS_RECEIPT_STATUSES)[number]

export const ERP_VENDOR_INVOICE_STATUSES = ["DRAFT", "FINAL", "CANCELLED"] as const
export type ErpVendorInvoiceStatus = (typeof ERP_VENDOR_INVOICE_STATUSES)[number]

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
