import type { SubcontractorBillingDocumentStatus } from "@/lib/marker-ofek/subcontractor-billing-schema"
import { cn } from "@/lib/utils"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export type PrintableBillingLine = {
  taskDescription: string
  claimedAmount: number
  approvedAmount: number
  notes: string
}

type PrintableSubcontractorBillingViewProps = {
  companyName: string
  companyTaxId: string
  formalSerial: string | null
  documentDateLabel: string
  status: SubcontractorBillingDocumentStatus
  projectName: string
  subcontractorName: string
  invoiceNumber: string
  billingMonthLabel: string
  lines: PrintableBillingLine[]
  totalClaimed: number
  totalApproved: number
  /** שורות הדגמה להדפסה — הזמנות שינוי */
  changeOrderRows?: { description: string; amount: number }[]
  /** שורות ניכוי להדפסה */
  deductionRows?: { description: string; amount: number }[]
}

/**
 * תצוגת הדפסה A4 — מוסתרת במסך (`hidden print:block`), מופיעה בלבד ב־PDF/הדפסה.
 */
export function PrintableSubcontractorBillingView({
  companyName,
  companyTaxId,
  formalSerial,
  documentDateLabel,
  status,
  projectName,
  subcontractorName,
  invoiceNumber,
  billingMonthLabel,
  lines,
  totalClaimed,
  totalApproved,
  changeOrderRows = [
    { description: "הזמנת שינוי — תוספת לוחות (אישור CO-2026-014)", amount: 12000 },
  ],
  deductionRows = [
    { description: "ניכוי בטחונות (דמה, 5% מסכום מאושר)", amount: -(totalApproved * 0.05) },
  ],
}: PrintableSubcontractorBillingViewProps) {
  const netAfterDeductions =
    totalApproved +
    changeOrderRows.reduce((s, r) => s + r.amount, 0) +
    deductionRows.reduce((s, r) => s + r.amount, 0)

  return (
    <div
      className={cn(
        "hidden print:block",
        "w-[210mm] min-h-[297mm] bg-card p-8 text-foreground [color-scheme:light]"
      )}
      dir="rtl"
      lang="he"
    >
      <header className="border-b-2 border-black pb-4">
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-xl font-bold tracking-tight">{companyName}</h1>
          <p className="text-sm">ח.פ {companyTaxId}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-neutral-700">
            אישור חשבון קבלן משנה — Payment Certificate
          </p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1 border border-black p-3">
            <p>
              <span className="font-semibold">מצב מסמך:</span>{" "}
              {status === "draft" ? "טיוטא" : "סופי"}
            </p>
            <p>
              <span className="font-semibold">מספר רשמי:</span>{" "}
              {formalSerial ?? "—"}
            </p>
            <p>
              <span className="font-semibold">תאריך:</span> {documentDateLabel}
            </p>
          </div>
          <div className="space-y-1 border border-black p-3">
            <p>
              <span className="font-semibold">פרויקט:</span> {projectName}
            </p>
            <p>
              <span className="font-semibold">קבלן משנה:</span>{" "}
              {subcontractorName}
            </p>
            <p>
              <span className="font-semibold">מספר חשבון:</span> {invoiceNumber}
            </p>
            <p>
              <span className="font-semibold">חודש חיוב:</span>{" "}
              {billingMonthLabel}
            </p>
          </div>
        </div>
      </header>

      <section className="mt-6">
        <h2 className="mb-2 border-b border-black pb-1 text-sm font-bold">
          שורות חיוב
        </h2>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border border-black bg-neutral-100">
              <th className="border border-black px-2 py-1.5 text-start font-semibold">
                תיאור
              </th>
              <th className="border border-black px-2 py-1.5 text-end font-semibold">
                נדרש
              </th>
              <th className="border border-black px-2 py-1.5 text-end font-semibold">
                מאושר
              </th>
              <th className="border border-black px-2 py-1.5 text-start font-semibold">
                הערות
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((row, i) => (
              <tr key={i}>
                <td className="border border-black px-2 py-1.5 align-top">
                  {row.taskDescription}
                </td>
                <td className="border border-black px-2 py-1.5 text-end font-mono tabular-nums">
                  {ils.format(row.claimedAmount)}
                </td>
                <td className="border border-black px-2 py-1.5 text-end font-mono tabular-nums">
                  {ils.format(row.approvedAmount)}
                </td>
                <td className="border border-black px-2 py-1.5 align-top text-neutral-800">
                  {row.notes || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex justify-end gap-8 text-sm">
          <span>
            <span className="font-semibold">סה״כ נדרש:</span>{" "}
            <span className="font-mono tabular-nums">{ils.format(totalClaimed)}</span>
          </span>
          <span>
            <span className="font-semibold">סה״כ מאושר:</span>{" "}
            <span className="font-mono tabular-nums">{ils.format(totalApproved)}</span>
          </span>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 border-b border-black pb-1 text-sm font-bold">
          הזמנות שינוי
        </h2>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border border-black bg-neutral-100">
              <th className="border border-black px-2 py-1.5 text-start font-semibold">
                תיאור
              </th>
              <th className="border border-black px-2 py-1.5 text-end font-semibold">
                סכום
              </th>
            </tr>
          </thead>
          <tbody>
            {changeOrderRows.map((row, i) => (
              <tr key={i}>
                <td className="border border-black px-2 py-1.5">{row.description}</td>
                <td className="border border-black px-2 py-1.5 text-end font-mono tabular-nums">
                  {ils.format(row.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 border-b border-black pb-1 text-sm font-bold">
          ניכויים
        </h2>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border border-black bg-neutral-100">
              <th className="border border-black px-2 py-1.5 text-start font-semibold">
                תיאור
              </th>
              <th className="border border-black px-2 py-1.5 text-end font-semibold">
                סכום
              </th>
            </tr>
          </thead>
          <tbody>
            {deductionRows.map((row, i) => (
              <tr key={i}>
                <td className="border border-black px-2 py-1.5">{row.description}</td>
                <td className="border border-black px-2 py-1.5 text-end font-mono tabular-nums">
                  {ils.format(row.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="mt-10 border-t-2 border-black pt-4 text-center text-xs text-neutral-800">
        <p className="font-semibold">
          סה״כ לתשלום (אחרי שינויים וניכויים):{" "}
          <span className="font-mono tabular-nums text-base text-foreground">
            {ils.format(netAfterDeductions)}
          </span>
        </p>
        <p className="mt-4 text-[10px] text-neutral-600">
          מסמך זה הופק מהמערכת לצורכי דמה. חתימה וחותמת — _______________
        </p>
      </footer>
    </div>
  )
}

export function formatBillingMonthHe(ym: string): string {
  const parts = ym.split("-").map(Number)
  const y = parts[0]
  const m = parts[1]
  if (!y || !m) return ym
  const d = new Date(y, m - 1, 1)
  return new Intl.DateTimeFormat("he-IL", {
    month: "long",
    year: "numeric",
  }).format(d)
}

export function formatDocumentDateHe(d: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "long",
  }).format(d)
}

/** שם לפי מפרט Phase 8.2 — alias ל־`PrintableSubcontractorBillingView` */
export const PrintableInvoiceView = PrintableSubcontractorBillingView
