import { JournalEntryClient } from "@/components/marker-ofek/finance/journal-entry-client"
import { fetchAllGlAccounts } from "@/lib/holden-erp/journal-actions"
import {
  fetchCurrenciesAction,
  fetchUnitsOfMeasureAction,
} from "@/lib/holden-erp/master-data-actions"

export default async function NewJournalEntryPage() {
  const [accRes, curRes, uomRes] = await Promise.all([
    fetchAllGlAccounts(),
    fetchCurrenciesAction(),
    fetchUnitsOfMeasureAction(),
  ])
  const accounts = accRes.data ?? []

  return (
    <div
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-100/90 via-white to-blue-50/40 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900"
      dir="rtl"
    >
      <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            הזנת פקודת יומן
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            פקודה חכמה — השלמה אוטומטית לקודי חשבון, איזון בזמן אמת, וספק מהיר
            לצד שורות היומן
          </p>
        </header>

        <JournalEntryClient
          accounts={accounts}
          masterCurrencies={curRes.ok ? curRes.data : []}
          masterUnitsOfMeasure={uomRes.ok ? uomRes.data : []}
        />
      </div>
    </div>
  )
}
