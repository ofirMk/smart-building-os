"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AlertCircle, CheckCircle2, Loader2, Mail } from "lucide-react"

import { inviteMember, type MembershipRole } from "../actions"

export function InviteUserFormClient() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [role, setRole] = useState<MembershipRole>("member")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    email: string
    invited: boolean
  } | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await inviteMember({ email, fullName, role })
      if (res.ok) {
        setSuccess({ email: email.trim().toLowerCase(), invited: res.invited })
        setEmail("")
        setFullName("")
        setRole("member")
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-6"
    >
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <div className="font-medium">
              {success.invited
                ? `הזמנה נשלחה ל-${success.email}`
                : `המשתמש ${success.email} צורף לחברה`}
            </div>
            <div className="mt-1 text-xs">
              <Link
                href="/admin/users"
                className="text-emerald-700 underline hover:text-emerald-900"
              >
                חזרה לרשימת המשתמשים
              </Link>{" "}
              · אפשר להזמין משתמש נוסף מטה.
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-700">
          אימייל <span className="text-rose-600">*</span>
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            dir="ltr"
            className="w-full rounded-lg border border-slate-300 py-2 pr-9 pl-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-700">
          שם מלא <span className="text-rose-600">*</span>
        </label>
        <input
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="ישראל ישראלי"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-700">תפקיד</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as MembershipRole)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        >
          <option value="member">member — משתמש רגיל</option>
          <option value="admin">admin — גישה מלאה (כולל /admin)</option>
        </select>
        <p className="text-xs text-slate-500">
          ניתן לשנות את התפקיד בהמשך דרך מסך המשתמשים.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          שלח הזמנה
        </button>
        <Link
          href="/admin/users"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ביטול
        </Link>
      </div>
    </form>
  )
}
