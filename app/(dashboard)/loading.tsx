export default function DashboardLoading() {
  return (
    <div
      className="-mx-4 flex-1 min-h-0 overflow-y-auto bg-background px-4 py-6 md:-mx-6 md:px-6 md:py-10"
      dir="rtl"
    >
      <header className="mb-10 border-b border-border pb-6">
        <div className="mb-2 h-9 w-3/4 max-w-md animate-pulse rounded-lg bg-muted md:h-11" />
        <div className="h-4 w-2/3 max-w-lg animate-pulse rounded bg-muted/80" />
      </header>

      <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            <div className="absolute end-0 top-0 h-full w-1 animate-pulse bg-muted-foreground/30" />
            <div className="mb-2 h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="mb-2 h-9 w-20 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full max-w-[12rem] animate-pulse rounded bg-muted/70" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-2">
            <span className="inline-block h-6 w-2 animate-pulse rounded-full bg-muted-foreground/30" />
            <div className="h-6 w-48 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex h-48 items-end gap-3 pt-4 md:gap-6">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full animate-pulse rounded-t-sm bg-muted"
                  style={{ height: `${30 + (i % 4) * 12}%` }}
                />
                <div className="h-3 w-8 animate-pulse rounded bg-muted/80" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-2">
            <span className="inline-block h-6 w-2 animate-pulse rounded-full bg-muted-foreground/30" />
            <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-4 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="mb-1 flex justify-between">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-10 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-2.5 w-full animate-pulse rounded-full bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
