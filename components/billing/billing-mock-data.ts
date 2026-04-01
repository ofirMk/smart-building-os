export type InvoiceStatusUi = "unpaid" | "overdue" | "paid"

export type BillingSummaryMock = {
  totalOutstandingNis: number
  collectedThisMonthNis: number
  activeDirectDebits: number
}

export type BillingInvoiceRow = {
  sourceId: string
  invoiceNumber: string
  tenantAndUnit: string
  chargeTypeHe: string
  amountNis: number
  dueDateLabel: string
  status: InvoiceStatusUi
}

export const BILLING_SUMMARY_MOCK: BillingSummaryMock = {
  totalOutstandingNis: 124_500,
  collectedThisMonthNis: 89_200,
  activeDirectDebits: 14,
}

export const BILLING_INVOICES_MOCK: BillingInvoiceRow[] = [
  {
    sourceId: "inv-1",
    invoiceNumber: "INV-2025-0142",
    tenantAndUnit: "משפחת כהן, בניין ב׳ דירה 12",
    chargeTypeHe: "דמי ניהול",
    amountNis: 1850,
    dueDateLabel: "1.4.2025",
    status: "unpaid",
  },
  {
    sourceId: "inv-2",
    invoiceNumber: "INV-2025-0138",
    tenantAndUnit: "משפחת לוי, בניין א׳ דירה 7",
    chargeTypeHe: "טעינת רכב חשמלי",
    amountNis: 342.5,
    dueDateLabel: "28.2.2025",
    status: "overdue",
  },
  {
    sourceId: "inv-3",
    invoiceNumber: "INV-2025-0131",
    tenantAndUnit: "ד״ר רוזן, בניין ג׳ דירה 3",
    chargeTypeHe: "דמי ניהול",
    amountNis: 2100,
    dueDateLabel: "15.3.2025",
    status: "paid",
  },
  {
    sourceId: "inv-4",
    invoiceNumber: "INV-2025-0129",
    tenantAndUnit: "משפחת אברהם, בניין ב׳ דירה 4",
    chargeTypeHe: "חניה",
    amountNis: 450,
    dueDateLabel: "10.3.2025",
    status: "paid",
  },
  {
    sourceId: "inv-5",
    invoiceNumber: "INV-2025-0126",
    tenantAndUnit: "משפחת מזרחי, בניין ד׳ דירה 18",
    chargeTypeHe: "טעינת רכב חשמלי",
    amountNis: 128.75,
    dueDateLabel: "5.4.2025",
    status: "unpaid",
  },
  {
    sourceId: "inv-6",
    invoiceNumber: "INV-2025-0124",
    tenantAndUnit: "משפחת שחר, בניין א׳ דירה 22",
    chargeTypeHe: "דמי ניהול",
    amountNis: 1850,
    dueDateLabel: "20.1.2025",
    status: "overdue",
  },
  {
    sourceId: "inv-7",
    invoiceNumber: "INV-2025-0119",
    tenantAndUnit: "משפחת דוד, בניין ג׳ דירה 9",
    chargeTypeHe: "מים וניקוז",
    amountNis: 312,
    dueDateLabel: "1.3.2025",
    status: "paid",
  },
]
