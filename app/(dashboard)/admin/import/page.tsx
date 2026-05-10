import Link from "next/link"
import { Plus, FileText, AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react"

import { listImportJobs } from "./actions"
import { getRegisteredEntities } from "@/lib/admin/import/registry"
import type { ImportJobRow } from "@/lib/admin/import/types"

export const dynamic = "force-dynamic"

const STATUS_BADGE: Record<
  ImportJobRow["status"],
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  uploaded: {
    label: "הועלה",
    className: "bg-slate-100 text-slate-700",
    icon: Clock,
  },
  previewed: {
    label: "ממתין לאישור",
    className: "bg-amber-100 text-amber-800",
    icon: Clock,
  },
  committed: {
    label: "הוטמע",
    className: "bg-emerald-100 text-emerald-800",
    icon: CheckCircle2,
  },
  failed: {
    label: "נכשל",
    className: "bg-rose-100 text-rose-800",
    icon: AlertCircle,
  },
  cancelled: {
    label: "בוטל",
    className: "bg-slate-100 text-slate-500",
    icon: XCircle,
  },
}

function entityLabel(kind: string): string {
  const reg = getRegisteredEntities().find((e) => e.kind === kind)
  return reg?.title ?? kind
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

export default async function ImportJobsIndexPage() {
  const jobs = await listImportJobs(50)
  const entities = getRegisteredEntities()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">ייבוא נתונים</h2>
          <p className="text-sm text-slate-600">
            ייבוא קבצי CSV / XLSX מ-Priority למערכת. כל job עובר preview לפני
            commit.
          </p>
        </div>
        <Link
          href="/admin/import/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <Plus className="size-4" aria-hidden />
          ייבוא חדש
        </Link>
      </div>

      {/* Available entities at a glance */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          ישויות זמינות לייבוא ({entities.length})
        </h3>
        <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {entities.map((e) => (
            <li
              key={e.kind}
              className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <div className="text-sm font-medium text-slate-900">{e.title}</div>
              <div className="text-xs text-slate-600">{e.description}</div>
            </li>
          ))}
        </ul>
      </section>

      {/* Jobs history */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-700">
            היסטוריית ייבוא ({jobs.length})
          </h3>
        </div>

        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
            <FileText className="size-8 text-slate-300" aria-hidden />
            <p className="text-sm text-slate-600">
              עדיין לא בוצע ייבוא. התחילו עם <Link href="/admin/import/new" className="font-semibold text-indigo-600 hover:underline">ייבוא חדש</Link>.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-right text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">תאריך</th>
                <th className="px-5 py-3 font-medium">ישות</th>
                <th className="px-5 py-3 font-medium">קובץ</th>
                <th className="px-5 py-3 font-medium">שורות</th>
                <th className="px-5 py-3 font-medium">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const badge = STATUS_BADGE[job.status]
                const Icon = badge.icon
                return (
                  <tr
                    key={job.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3 text-slate-600">
                      {formatDate(job.created_at)}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {entityLabel(job.entity_kind)}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      <span className="block max-w-[18rem] truncate" title={job.file_name}>
                        {job.file_name}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {job.rows_success}/{job.rows_total}
                      {job.rows_error > 0 && (
                        <span className="mr-1 text-xs text-rose-600">
                          ({job.rows_error} שגיאות)
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}
                      >
                        <Icon className="size-3.5" aria-hidden />
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
