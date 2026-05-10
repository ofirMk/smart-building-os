import { ShieldCheck, ToggleLeft, Trash2, UserPlus } from "lucide-react"

import type { AdminAuditEntry } from "@/lib/admin/audit-log"

const ACTION_META: Record<
  AdminAuditEntry["action"],
  {
    label: string
    icon: React.ComponentType<{ className?: string }>
    iconClass: string
    describe: (e: AdminAuditEntry) => string
  }
> = {
  invite_member: {
    label: "הזמנה",
    icon: UserPlus,
    iconClass: "text-emerald-600",
    describe: (e) => {
      const role = (e.details as { role?: string }).role ?? "member"
      const wasInvited = (e.details as { invited?: boolean }).invited
      return wasInvited
        ? `הוזמן/ה כ-${role}`
        : `צורף/ה לחברה (משתמש קיים) כ-${role}`
    },
  },
  update_role: {
    label: "שינוי הרשאה",
    icon: ShieldCheck,
    iconClass: "text-indigo-600",
    describe: (e) => {
      const d = e.details as { previous_role?: string; new_role?: string }
      return `${d.previous_role ?? "?"} → ${d.new_role ?? "?"}`
    },
  },
  toggle_active: {
    label: "סטטוס",
    icon: ToggleLeft,
    iconClass: "text-amber-600",
    describe: (e) => {
      const isActive = (e.details as { is_active?: boolean }).is_active
      return isActive ? "הופעל" : "הושבת"
    },
  },
  remove_member: {
    label: "הסרה",
    icon: Trash2,
    iconClass: "text-rose-600",
    describe: (e) => {
      const role = (e.details as { removed_role?: string }).removed_role
      return role ? `הוסר (היה ${role})` : "הוסר מהחברה"
    },
  },
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

export function AuditPanel({ entries }: { entries: AdminAuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-500">
        אין רשומות עדיין. כל פעולת admin (הזמנה / שינוי הרשאה / השבתה / הסרה)
        תופיע כאן.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-right text-xs">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 font-medium">מתי</th>
            <th className="px-3 py-2 font-medium">פעולה</th>
            <th className="px-3 py-2 font-medium">מבצע</th>
            <th className="px-3 py-2 font-medium">יעד</th>
            <th className="px-3 py-2 font-medium">פרטים</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((e) => {
            const meta = ACTION_META[e.action]
            const Icon = meta.icon
            return (
              <tr key={e.id} className="text-slate-700">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-500">
                  {formatTime(e.created_at)}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon className={`h-3.5 w-3.5 ${meta.iconClass}`} />
                    {meta.label}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {e.actor_email ?? "—"}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {e.target_email ?? "—"}
                </td>
                <td className="px-3 py-2 text-slate-600">{meta.describe(e)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
