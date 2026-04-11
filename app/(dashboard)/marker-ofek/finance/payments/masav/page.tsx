import { MasavClient } from "@/components/marker-ofek/finance/payments/masav-client"
import { fetchPendingPayments } from "@/lib/holden-erp/payment-queries"

export default async function MasavPage() {
  const result = await fetchPendingPayments()
  const pendingPayments = result.success ? result.data : []

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-7xl flex-col p-6 md:p-8">
      <div className="mb-6 shrink-0">
        <h1 className="text-2xl font-bold text-slate-900">
          מסלקת תשלומים (מס״ב)
        </h1>
        <p className="text-slate-500">
          הכנת קובץ תשלומים מרוכז לקבלני משנה וספקים
        </p>
      </div>

      <MasavClient pendingPayments={pendingPayments} />
    </div>
  )
}
