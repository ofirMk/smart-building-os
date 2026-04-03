"use client"

import * as React from "react"
import { Loader2, Plus, Save, Users } from "lucide-react"
import { toast } from "sonner"

import {
  fetchResourcesGridRows,
  upsertResourceRow,
  type ResourceGridRow,
} from "@/lib/actions/gantt-actions"
import { formatError } from "@/lib/utils"

type EditableResourceRow = ResourceGridRow & {
  dirty?: boolean
  isNew?: boolean
}

const statusOptions: Array<{
  value: "available" | "unavailable" | "vacation"
  label: string
}> = [
  { value: "available", label: "זמין" },
  { value: "unavailable", label: "לא זמין" },
  { value: "vacation", label: "בחופשה" },
]

export default function MarkerOfekResourcesPage() {
  const [rows, setRows] = React.useState<EditableResourceRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [savingId, setSavingId] = React.useState<string | null>(null)

  async function loadRows() {
    setLoading(true)
    try {
      const data = await fetchResourcesGridRows()
      setRows(data)
    } catch (error) {
      toast.error(formatError(error))
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void loadRows()
  }, [])

  function updateRow(id: string, patch: Partial<EditableResourceRow>) {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch, dirty: true } : row))
    )
  }

  function addNewRow() {
    const tempId = `new-${Date.now()}`
    setRows((prev) => [
      {
        id: tempId,
        name: "",
        profession: "",
        cost_per_day: 0,
        availability_status: "available",
        conflict_count: 0,
        conflict_projects: [],
        cost_impact: 0,
        dirty: true,
        isNew: true,
      },
      ...prev,
    ])
  }

  async function saveRow(row: EditableResourceRow) {
    setSavingId(row.id)
    try {
      await upsertResourceRow({
        id: row.isNew ? undefined : row.id,
        name: row.name,
        profession: row.profession,
        costPerDay: Number(row.cost_per_day || 0),
        availabilityStatus: row.availability_status,
      })
      toast.success("השורה נשמרה בהצלחה")
      await loadRows()
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setSavingId(null)
    }
  }

  const gridFieldClass =
    "w-full rounded-sm border border-zinc-200 bg-white px-2 py-1.5 text-[13px] text-zinc-900 placeholder:text-zinc-500 outline-none focus:border-zinc-400 focus:ring-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-7xl flex-col gap-4 bg-zinc-50 px-3 py-5 font-sans text-[13px] text-zinc-900 md:px-5">
      <header className="space-y-2 text-start">
        <div className="inline-flex items-center gap-2 text-violet-700 dark:text-violet-300">
          <Users className="size-5" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em]">
            Marker Ofek - Resource Engine
          </span>
        </div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">ניהול כוח אדם ולוח שנה</h1>
        <p className="text-[12px] text-zinc-500">
          גיליון ניהול בסגנון Excel להוספה/עדכון עובדים, עלות יומית ובדיקת התנגשויות הקצאה.
        </p>
      </header>

      <div className="flex justify-start">
        <button
          type="button"
          onClick={addNewRow}
          className="inline-flex items-center gap-2 rounded-sm bg-zinc-900 px-2.5 py-1.5 text-[12px] font-medium text-zinc-100 hover:bg-zinc-700"
        >
          <Plus className="size-4" />
          הוספת עובד
        </button>
      </div>

      <div className="overflow-x-auto rounded-sm border border-zinc-200 bg-white shadow-sm dark:border-slate-700 dark:bg-zinc-900">
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-8 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            טוען משאבים...
          </div>
        ) : (
          <table className="w-full min-w-[920px] text-[13px] text-zinc-900 dark:text-slate-100">
            <thead className="bg-zinc-100 text-zinc-900 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-2 py-2 text-right font-bold text-zinc-900">שם עובד</th>
                <th className="px-2 py-2 text-right font-bold text-zinc-900">מקצוע</th>
                <th className="px-2 py-2 text-right font-bold text-zinc-900">עלות יומית</th>
                <th className="px-2 py-2 text-right font-bold text-zinc-900">Cost Impact</th>
                <th className="px-2 py-2 text-right font-bold text-zinc-900">סטטוס זמינות</th>
                <th className="px-2 py-2 text-right font-bold text-zinc-900">Conflict Checker</th>
                <th className="px-2 py-2 text-right font-bold text-zinc-900">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const hasConflict = row.conflict_count > 0
                const isSaving = savingId === row.id
                return (
                  <tr key={row.id} className="border-t border-zinc-200 dark:border-slate-800">
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => updateRow(row.id, { name: e.target.value })}
                        className={gridFieldClass}
                        placeholder="לדוגמה: אופיר דיין"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.profession}
                        onChange={(e) => updateRow(row.id, { profession: e.target.value })}
                        className={gridFieldClass}
                        placeholder="לדוגמה: חשמלאי"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.cost_per_day}
                        onChange={(e) =>
                          updateRow(row.id, {
                            cost_per_day: Number(e.target.value || 0),
                          })
                        }
                        className={`${gridFieldClass} font-mono text-right`}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="rounded-sm border border-zinc-200 bg-zinc-50 px-2 py-1.5 font-mono tabular-nums text-right text-[12px] text-zinc-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                        ₪{Math.round(Number(row.cost_impact || 0)).toLocaleString("he-IL")}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={row.availability_status}
                        onChange={(e) =>
                          updateRow(row.id, {
                            availability_status: e.target
                              .value as EditableResourceRow["availability_status"],
                          })
                        }
                        className={gridFieldClass}
                      >
                        {statusOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      {hasConflict ? (
                        <div className="rounded-sm border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-700">
                          <div className="font-bold">התנגשות ({row.conflict_count})</div>
                          <div className="truncate">פרויקטים: {row.conflict_projects.join(", ")}</div>
                        </div>
                      ) : (
                        <div className="rounded-sm border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
                          ללא התנגשות
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        disabled={!row.dirty || isSaving}
                        onClick={() => void saveRow(row)}
                        className="inline-flex items-center gap-1 rounded-sm border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-bold text-zinc-900 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSaving ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Save className="size-3" />
                        )}
                        שמירה
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
