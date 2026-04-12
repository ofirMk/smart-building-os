import type { ClientBillingDocumentStatus } from "@/lib/marker-ofek/client-billing-schema"
import { cn } from "@/lib/utils"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export type PrintableClientBillingBoqLine = {
  itemDescription: string
  currentPeriodQty: number
  unitPrice: number
  lineTotalAmount: number
  totalCumulativeQty: number
}

type PrintableClientBillingViewProps = {
  companyName: string
  companyTaxId: string
  formalSerial: string | null
  documentDateLabel: string
  status: ClientBillingDocumentStatus
  projectName: string
  billingMonthLabel: string
  applicationNumber: number
  /** סה״כ לחיוב בתקופה (בסיס לניכויים) */
  totalPeriodBillAmount: number
  boqLines: PrintableClientBillingBoqLine[]
  changeOrderRows: { description: string; amount: number }[]
  deductionRows: { description: string; amount: number }[]
  finalAmountToBill: number
}

/**
 * תצוגת הדפסה A4 — חשבון יזם מצטבר; מוסתרת במסך (`hidden print:block`).
 */
export function PrintableClientBillingView({
  companyName,
  companyTaxId,
  formalSerial,
  documentDateLabel,
  status,
  projectName,
  billingMonthLabel,
  applicationNumber,
  totalPeriodBillAmount,
  boqLines,
  changeOrderRows,
  deductionRows,
  finalAmountToBill,
}: PrintableClientBillingViewProps) {
  return (
    <div
      className={cn(
        "hidden print:block",
        "w-[210mm] min-h-[297mm] bg-white p-8 text-black [color-scheme:light]"
      )}
      dir="rtl"
      lang="he"
    >
      <header className="border-b-2 border-black pb-4">
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-xl font-bold tracking-tight">{companyName}</h1>
          <p className="text-sm">ח.פ {companyTaxId}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-neutral-700">
            חשבון יזם מצטבר — Application for Payment
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
              <span className="font-semibold">חודש חיוב:</span> {billingMonthLabel}
            </p>
            <p>
              <span className="font-semibold">מספר בקשה / חשבון:</span>{" "}
              {applicationNumber}
            </p>
          </div>
        </div>
      </header>

      <section className="mt-6">
        <h2 className="mb-2 border-b border-black pb-1 text-sm font-bold">
          סעיפי BOQ — חיוב תקופה
        </h2>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border border-black bg-neutral-100">
              <th className="border border-black px-2 py-1.5 text-start font-semibold">
                תיאור סעיף
              </th>
              <th className="border border-black px-2 py-1.5 text-end font-semibold">
                כמות תקופה
              </th>
              <th className="border border-black px-2 py-1.5 text-end font-semibold">
                מחיר יח׳
              </th>
              <th className="border border-black px-2 py-1.5 text-end font-semibold">
                מצטבר (חישוב)
              </th>
              <th className="border border-black px-2 py-1.5 text-end font-semibold">
                סכום סעיף
              </th>
            </tr>
          </thead>
          <tbody>
            {boqLines.map((row, i) => (
              <tr key={i}>
                <td className="border border-black px-2 py-1.5 align-top">
                  {row.itemDescription}
                </td>
                <td className="border border-black px-2 py-1.5 text-end font-mono tabular-nums">
                  {row.currentPeriodQty.toLocaleString("he-IL", {
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="border border-black px-2 py-1.5 text-end font-mono tabular-nums">
                  {ils.format(row.unitPrice)}
                </td>
                <td className="border border-black px-2 py-1.5 text-end font-mono tabular-nums">
                  {row.totalCumulativeQty.toLocaleString("he-IL", {
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="border border-black px-2 py-1.5 text-end font-mono tabular-nums">
                  {ils.format(row.lineTotalAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex justify-end text-sm">
          <span>
            <span className="font-semibold">סה״כ לחיוב בתקופה (בסיס):</span>{" "}
            <span className="font-mono tabular-nums">
              {ils.format(totalPeriodBillAmount)}
            </span>
          </span>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 border-b border-black pb-1 text-sm font-bold">
          הוראות שינוי והתייקרויות
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
          ניכויים נטו
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
          סכום לחיוב סופי (אחרי שינויים וניכויים):{" "}
          <span className="font-mono tabular-nums text-base text-black">
            {ils.format(finalAmountToBill)}
          </span>
        </p>
        <p className="mt-4 text-[10px] text-neutral-600">
          מסמך זה הופק מהמערכת לצורכי דמה. חתימה וחותמת — _______________
        </p>
      </footer>
    </div>
  )
}
