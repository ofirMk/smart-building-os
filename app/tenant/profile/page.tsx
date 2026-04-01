import { User } from "lucide-react"

export default function TenantProfilePage() {
  return (
    <div className="flex flex-col gap-6 text-start">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">פרופיל</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          פרטי דייר, התראות והעדפות — יוצגו כאן בהמשך.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border/70 bg-card/50 px-4 py-10 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-muted">
          <User className="size-8 text-muted-foreground" aria-hidden />
        </div>
        <p className="text-sm text-muted-foreground">הגדרות חשבון יתווספו בקרוב</p>
      </div>
    </div>
  )
}
