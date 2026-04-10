import { GlAccountsClient } from "@/components/marker-ofek/finance/gl-accounts-client"
import { GlAccountsTable } from "@/components/marker-ofek/finance/gl-accounts-table"
import { fetchAllGlAccounts } from "@/lib/holden-erp/journal-actions"

export default async function GlAccountsPage() {
  const result = await fetchAllGlAccounts()
  const accounts = result.success && result.data ? result.data : []
  const loadError = result.success ? null : result.error ?? null

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          ניהול כרטסת ראשית
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          צפייה, ניהול וסינון של עץ החשבונות המערכתי
        </p>
      </div>

      {loadError ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          role="alert"
        >
          לא ניתן לטעון את רשימת החשבונות: {loadError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-8">
        <div className="h-[600px]">
          <GlAccountsTable initialAccounts={accounts} />
        </div>

        <div className="border-t border-slate-200 pt-8 dark:border-slate-700">
          <details className="group">
            <summary className="flex w-max cursor-pointer list-none items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70">
              <span className="group-open:hidden">+ הצג אפשרויות ייבוא נתונים (CSV)</span>
              <span className="hidden group-open:inline">− הסתר אפשרויות ייבוא</span>
            </summary>
            <div className="mt-4">
              <GlAccountsClient />
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
