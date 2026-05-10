import { redirect } from "next/navigation"
import { cookies } from "next/headers"

import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

/**
 * Admin segment guard — gates the entire `/admin/*` tree behind:
 *   1. Authenticated user.
 *   2. Active company context cookie.
 *   3. `erp_user_company_memberships.role = 'admin'` for that company.
 *
 * Anything below this layout (e.g. /admin/import, future /admin/users) inherits
 * the gate. Non-admin users see a redirect to /marker-ofek (their normal home).
 */
export default async function AdminSegmentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) redirect("/login")

  const store = await cookies()
  const companyId = resolveCompanyContext(store.get(COMPANY_COOKIE_KEY)?.value)
  if (!companyId) redirect("/marker-ofek")

  const { data: mem } = await supabase
    .from("erp_user_company_memberships")
    .select("role,is_active")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!mem || !mem.is_active || mem.role !== "admin") {
    redirect("/marker-ofek")
  }

  return (
    <div className="mx-auto max-w-6xl p-6" dir="rtl">
      <header className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">מרכז ניהול</h1>
        <p className="mt-1 text-sm text-slate-600">
          כלים אדמיניסטרטיביים — ייבוא נתונים, ניהול משתמשים, מסמכי ה-tenant.
        </p>
      </header>
      {children}
    </div>
  )
}
