/** RTL skeleton for lazy-loaded billing workspaces (client + subcontractor). */
export function FinanceBillingWorkspaceSkeleton() {
  return (
    <div
      dir="rtl"
      lang="he"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-card [color-scheme:light]"
    >
      <div className="border-b border-slate-200 px-4 py-3 md:px-6">
        <div className="mb-2 h-4 w-40 animate-pulse rounded bg-slate-100" />
        <div className="h-6 w-64 max-w-full animate-pulse rounded bg-slate-100 md:h-7" />
        <div className="mt-2 h-3 w-full max-w-lg animate-pulse rounded bg-background" />
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="h-8 w-28 animate-pulse rounded-md bg-slate-100" />
          <div className="h-8 w-36 animate-pulse rounded-md bg-slate-100" />
          <div className="h-8 w-24 animate-pulse rounded-md bg-slate-100" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-3 md:p-4">
        <div className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-md border border-slate-100 bg-background"
            />
          ))}
        </div>
        <div className="rounded-lg border border-slate-200 bg-card">
          <div className="border-b border-slate-100 p-2">
            <div className="flex gap-2">
              {Array.from({ length: 6 }).map((_, c) => (
                <div
                  key={c}
                  className="h-6 flex-1 animate-pulse rounded bg-background"
                />
              ))}
            </div>
          </div>
          <div className="space-y-2 p-2">
            {Array.from({ length: 8 }).map((_, r) => (
              <div key={r} className="flex gap-2">
                {Array.from({ length: 6 }).map((_, c) => (
                  <div
                    key={c}
                    className="h-9 flex-1 animate-pulse rounded border border-slate-50 bg-background/80"
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 p-3">
            <div className="h-24 animate-pulse rounded-lg bg-background" />
          </div>
        </div>
      </div>
    </div>
  )
}
