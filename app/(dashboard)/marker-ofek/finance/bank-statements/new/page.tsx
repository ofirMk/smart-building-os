import { BankStatementClient } from "@/components/marker-ofek/finance/bank-statement-client"
import { fetchAllGlAccounts } from "@/lib/holden-erp/journal-actions"

export default async function NewBankStatementPage() {
  const { data: accounts } = await fetchAllGlAccounts()

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          קליטת דפי בנק
        </h1>
        <p className="text-slate-500">
          הזנת דפי בנק למערכת לקראת ביצוע התאמות מול הכרטסת
        </p>
      </div>

      <BankStatementClient accounts={accounts ?? []} />
    </div>
  )
}
