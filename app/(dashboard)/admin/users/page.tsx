import Link from "next/link"
import { History, UserPlus, Users } from "lucide-react"

import { listAuditLog, listMembers } from "./actions"
import { AuditPanel } from "./audit-panel"
import { MembersTableClient } from "./members-table-client"

export const dynamic = "force-dynamic"

export default async function AdminUsersPage() {
  const [members, auditEntries] = await Promise.all([
    listMembers(),
    listAuditLog(20),
  ])
  const activeCount = members.filter((m) => m.isActive).length
  const adminCount = members.filter((m) => m.role === "admin" && m.isActive).length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-100 p-2">
            <Users className="h-5 w-5 text-indigo-700" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">ניהול משתמשים</h2>
            <p className="mt-1 text-sm text-slate-600">
              הזמנת משתמשים לחברה, הגדרת הרשאות והשבתה. כולל admins פעילים:{" "}
              <span className="font-semibold">{adminCount}</span> · סה&quot;כ חברים
              פעילים: <span className="font-semibold">{activeCount}</span> /
              {members.length}.
            </p>
          </div>
        </div>
        <Link
          href="/admin/users/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
        >
          <UserPlus className="h-4 w-4" />
          הזמנת משתמש חדש
        </Link>
      </div>

      {members.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <Users className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-600">
            אין עדיין משתמשים רשומים בחברה זו. התחל בהזמנת המשתמש הראשון.
          </p>
        </div>
      ) : (
        <MembersTableClient initialMembers={members} />
      )}

      <div className="space-y-3 pt-4">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">
            יומן פעולות אדמין (20 אחרונות)
          </h3>
        </div>
        <AuditPanel entries={auditEntries} />
      </div>
    </div>
  )
}
