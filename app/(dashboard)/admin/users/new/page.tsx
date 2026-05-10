import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { InviteUserFormClient } from "./invite-user-form-client"

export const dynamic = "force-dynamic"

export default function AdminInviteUserPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לרשימת המשתמשים
        </Link>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate-900">הזמנת משתמש חדש</h2>
        <p className="mt-1 text-sm text-slate-600">
          המשתמש יקבל מייל הזמנה מ-Supabase עם קישור לכניסה ראשונה. לאחר ההזמנה
          הוא יצורף מיידית כ-member/admin של החברה הפעילה.
        </p>
      </div>

      <InviteUserFormClient />
    </div>
  )
}
