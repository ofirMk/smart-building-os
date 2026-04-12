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
      className="flex min-h-[100dvh] min-w-0 flex-1 flex-col bg-white text-slate-900 [color-scheme:light]"
    >
      {children}
    </div>
  )
}
