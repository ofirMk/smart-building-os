import { ReconciliationClient } from "@/components/marker-ofek/finance/reconciliation-client"
import { fetchAllGlAccounts } from "@/lib/holden-erp/journal-actions"

export default async function ReconciliationPage() {
  const { data: accounts } = await fetchAllGlAccounts()

  return (
    <div
      className="min-h-[calc(100vh-3rem)] bg-gradient-to-br from-slate-100/95 via-white to-violet-50/30"
      dir="rtl"
    >
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6 overflow-hidden p-4 pb-10 md:p-8">
        <header className="shrink-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            התאמות בנקים וקליטה אוטומטית
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
            משטח התאמות — Bank Side מול Books Side, Live Delta, ו־Match AI
          </p>
        </header>

        <ReconciliationClient accounts={accounts ?? []} />
      </div>
    </div>
  )
}
