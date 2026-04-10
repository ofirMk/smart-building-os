import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * לקוח Supabase עם עוגיות סשן — לשימוש ב־Server Actions וב־Server Components
 * שדורשים משתמש מחובר.
 *
 * הערה: אל תעטוף קריאה זו בלולאה — כל קריאה יוצרת לקוח חדש לבקשה. קריאות Auth (rate limit)
 * מגיעות בעיקר מ־middleware (getUser) ומ־Server Actions; שאילתות RSC צריכות להשתמש במודולי
 * server-only + cache, לא בקובץ עם "use server" בראש הקובץ לכל export.
 *
 * Diamond V1.0: לקוח זה נשאר ללא גנריק DB בזמן מעבר הדרגתי; השתמשו ב־`Tables<"table">`
 * מ־`@/types/supabase` בשכבת lib/ לשדות מדויקים. אחרי `supabase gen types typescript` — ניתן
 * להחליף ל־`createServerClient<Database>`.
 */
export async function createSupabaseServerAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  }

  const cookieStore = await cookies()

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // נקרא מ־Server Component ללא אפשרות לעדכן עוגיות — ה־middleware מרענן סשן
        }
      },
    },
  })
}
