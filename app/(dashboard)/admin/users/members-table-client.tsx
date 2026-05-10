"use client"

import { useState, useTransition } from "react"
import { AlertCircle, ShieldCheck, Trash2 } from "lucide-react"

import {
  removeMember,
  toggleMemberActive,
  updateMemberRole,
  type MemberRow,
  type MembershipRole,
} from "./actions"

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

export function MembersTableClient(props: { initialMembers: MemberRow[] }) {
  const [members, setMembers] = useState<MemberRow[]>(props.initialMembers)
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function handleRoleChange(userId: string, role: MembershipRole) {
    setBusyId(userId)
    setErrorMsg(null)
    startTransition(async () => {
      const res = await updateMemberRole({ userId, role })
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) => (m.userId === userId ? { ...m, role } : m)),
        )
      } else {
        setErrorMsg(res.error)
      }
      setBusyId(null)
    })
  }

  function handleToggleActive(userId: string, isActive: boolean) {
    setBusyId(userId)
    setErrorMsg(null)
    startTransition(async () => {
      const res = await toggleMemberActive({ userId, isActive })
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) => (m.userId === userId ? { ...m, isActive } : m)),
        )
      } else {
        setErrorMsg(res.error)
      }
      setBusyId(null)
    })
  }

  function handleRemove(userId: string, email: string) {
    if (
      !confirm(
        `להסיר את "${email}" מהחברה? הפעולה תמחק את ה-membership (חשבון Auth יישאר).`,
      )
    ) {
      return
    }
    setBusyId(userId)
    setErrorMsg(null)
    startTransition(async () => {
      const res = await removeMember({ userId })
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.userId !== userId))
      } else {
        setErrorMsg(res.error)
      }
      setBusyId(null)
    })
  }

  return (
    <div className="space-y-3">
      {errorMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">אימייל / שם</th>
              <th className="px-4 py-3 font-medium">תפקיד</th>
              <th className="px-4 py-3 font-medium">סטטוס</th>
              <th className="px-4 py-3 font-medium">הוזמן</th>
              <th className="px-4 py-3 font-medium">כניסה אחרונה</th>
              <th className="px-4 py-3 font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => {
              const isBusy = busyId === m.userId && pending
              return (
                <tr
                  key={m.userId}
                  className={
                    m.isActive ? "bg-white" : "bg-slate-50/60 text-slate-500"
                  }
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{m.email}</div>
                    {m.fullName && (
                      <div className="text-xs text-slate-500">{m.fullName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={m.role}
                      disabled={isBusy}
                      onChange={(e) =>
                        handleRoleChange(
                          m.userId,
                          e.target.value as MembershipRole,
                        )
                      }
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                    {m.role === "admin" && (
                      <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-indigo-600" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleToggleActive(m.userId, !m.isActive)}
                      className={
                        m.isActive
                          ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-200"
                          : "rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-300"
                      }
                    >
                      {m.isActive ? "פעיל" : "מושבת"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {formatDate(m.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {formatDate(m.lastSignInAt)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleRemove(m.userId, m.email)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      title="הסרה מהחברה"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      הסר
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        הערה: הסרה מוחקת את ה-membership בלבד — חשבון Auth של המשתמש נשאר, ואפשר להזמין אותו שוב בעתיד.
      </p>
    </div>
  )
}
