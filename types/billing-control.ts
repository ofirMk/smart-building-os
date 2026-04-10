/** Billing Control Center — payloads (kept out of "use server" files) */

export type BillingDocumentKind = "tax_invoice" | "credit_note" | "proforma"

export type BillingTransactionMode = "manual" | "auto"

export type BillingLineInput = {
  supplierPartId: string | null
  description: string
  uomId: string | null
  quantity: number
  unitPrice: number
  discountPercent: number
  netUnitPrice: number
  lineTotal: number
  wbsNodeId: string | null
}

export type CreateFinalTaxInvoicePayload = {
  issueDate: string
  customerName: string
  headerMemo: string
  projectId: string | null
  profitCenterLabel: string | null
  documentKind: BillingDocumentKind
  transactionMode: BillingTransactionMode
  agentUserId: string | null
  currencyCode: string
  fxRateToIls: number
  incomeGlAccountId: string
  sourceProgressReportId: string | null
  sourcePurchaseOrderId: string | null
  lines: BillingLineInput[]
  subtotal: number
  vatAmount: number
  totalAmount: number
}
