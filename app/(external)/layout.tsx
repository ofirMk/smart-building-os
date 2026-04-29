import type { ReactNode } from "react"

/**
 * פריסת פורטל חיצוני — ללא סרגל ERP / דשבורד ראשי (`DashboardShell` / Marker Ofek drawer).
 * בידוד נתיב: ראו `proxy.ts` + `lib/supabase/middleware.ts` (משטח `X-Marker-Ofek-Surface`).
 */
export default function ExternalLayout({ children }: { children: ReactNode }) {
  return (
    <div
      dir="rtl"
      lang="he"
      className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden bg-card text-foreground [color-scheme:light]"
    >
      {children}
    </div>
  )
}
