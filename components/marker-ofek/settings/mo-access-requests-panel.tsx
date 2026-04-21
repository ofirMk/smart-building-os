"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  listPendingMoAccessRequests,
  type MoAccessRequestRow,
} from "@/lib/marker-ofek/mo-access-request-actions"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatError } from "@/lib/utils"

const ilsDate = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
})

export function MoAccessRequestsPanel() {
  const [rows, setRows] = React.useState<MoAccessRequestRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [hidden, setHidden] = React.useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await listPendingMoAccessRequests()
      if (!res.ok) {
        if (/הרשאה/i.test(res.error)) {
          setHidden(true)
          setRows([])
          return
        }
        if (!/מיגרציה/i.test(res.error)) {
          toast.error(res.error)
        }
        setRows([])
        return
      }
      setRows(res.rows)
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void load()
  }, [])

  if (hidden) return null

  return (
    <Card className="border-slate-100 shadow-sm">
      <CardHeader>
        <CardTitle className="text-indigo-950">בקשות גישה ממתינות</CardTitle>
        <CardDescription>
          טפסים ממסך הכניסה — אישור ידני לפני יצירת משתמש ב-Supabase Auth.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            טוען…
          </p>
        ) : rows.length === 0 ? (
          <p className="font-currency-mono text-sm text-slate-500">אין בקשות ממתינות</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-slate-100 bg-background/50 p-3 text-start"
              >
                <p className="font-medium text-indigo-950">{r.full_name}</p>
                <p className="mt-1 font-currency-mono text-xs text-slate-600">
                  {r.role_requested} · {r.mobile}
                  {r.email ? ` · ${r.email}` : ""}
                  {r.company ? ` · ${r.company}` : ""}
                </p>
                {r.requested_project_name ? (
                  <p className="mt-1 font-currency-mono text-xs text-slate-500">
                    פרויקט: {r.requested_project_name}
                  </p>
                ) : null}
                <p className="mt-1 font-currency-mono text-[11px] text-slate-400">
                  {ilsDate.format(new Date(r.created_at))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
