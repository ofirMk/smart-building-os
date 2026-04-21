/** RTL loading shell for lazy-loaded Executive BI (matches Jimmy Standard: bg-card, slate borders). */
export function ExecutiveDashboardPageSkeleton() {
  return (
    <div
      dir="rtl"
      lang="he"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 bg-card p-3 text-foreground md:p-4 [color-scheme:light]"
    >
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <div className="size-9 shrink-0 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-5 w-48 animate-pulse rounded bg-slate-100 md:h-6" />
          </div>
          <div className="h-3 w-full max-w-md animate-pulse rounded bg-background" />
        </div>
        <div className="h-8 w-40 shrink-0 animate-pulse rounded-md bg-slate-100" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-slate-200 bg-card p-4 shadow-sm"
          >
            <div className="mb-3 h-4 w-24 rounded bg-slate-100" />
            <div className="h-8 w-32 rounded bg-slate-100 md:h-9" />
            <div className="mt-3 h-3 w-full rounded bg-background" />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-card p-4 shadow-sm">
        <div className="mb-3 h-4 w-56 rounded bg-slate-100" />
        <div className="h-[280px] w-full animate-pulse rounded-lg bg-background" />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <div className="min-h-[240px] animate-pulse rounded-lg border border-slate-200 bg-card shadow-sm">
          <div className="border-b border-slate-100 p-3">
            <div className="h-4 w-40 rounded bg-slate-100" />
          </div>
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="h-8 w-full rounded bg-background" />
            ))}
          </div>
        </div>
        <div className="min-h-[240px] animate-pulse rounded-lg border border-slate-200 bg-card shadow-sm">
          <div className="border-b border-slate-100 p-3">
            <div className="h-4 w-32 rounded bg-slate-100" />
          </div>
          <div className="space-y-2 p-3">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="h-14 w-full rounded bg-background" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
