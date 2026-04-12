import { type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/middleware"

/**
 * Next.js App Router proxy (edge) — רענון סשן Supabase + בידוד נתיבים (ERP מול פורטל חיצוני).
 * לוגיקה מלאה: `lib/supabase/middleware.ts`.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * לא להריץ proxy על נכסים סטטיים — ביצועים.
     * מתעלמים מ־_next/static, _next/image, favicon.ico, ותמונות נפוצות.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
