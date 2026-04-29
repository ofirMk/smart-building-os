"use client"

import * as React from "react"
import { Loader2, Plus, Save, Users } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  fetchResourcesGridRows,
  upsertResourceRow,
  type ResourceGridRow,
} from "@/lib/marker-ofek/gantt-actions"
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

const gridFieldClass =
  "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary/45 focus:ring-2 focus:ring-primary/15"

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

  return (
    <div
      dir="rtl"
      className="mx-auto flex flex-1 min-h-0 w-full max-w-7xl flex-col gap-6 overflow-y-auto bg-background p-6 font-sans text-[13px] text-foreground md:p-8"
    >
      <header className="space-y-2 text-start">
        <div className="inline-flex items-center gap-2 text-primary">
          <Users className="size-5" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Marker Ofek — Resource Engine
          </span>
        </div>
        <h1 className="module-page-title text-balance font-semibold">
          ניהול כוח אדם ולוח שנה
        </h1>
        <p className="text-[12px] text-muted-foreground">
          גיליון ניהול להוספה/עדכון עובדים, עלות יומית ובדיקת התנגשויות הקצאה.
        </p>
      </header>

      <div className="flex justify-start">
        <Button type="button" size="sm" className="gap-2 font-semibold" onClick={addNewRow}>
          <Plus className="size-4 shrink-0" aria-hidden />
          הוספת עובד
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="flex items-center gap-2 px-5 py-10 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            טוען משאבים...
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-muted/40">
              <Users className="size-7 text-muted-foreground opacity-80" aria-hidden />
            </div>
            <p className="text-sm font-medium text-foreground">אין משאבים רשומים</p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              הוסיפו עובד ראשון כדי להתחיל לשבץ צוותים בפרויקטים ולחשב עלויות.
            </p>
            <Button type="button" size="sm" className="mt-1 gap-2 font-semibold" onClick={addNewRow}>
              <Plus className="size-4 shrink-0" aria-hidden />
              הוספת עובד
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-[13px]">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-3 py-2.5 text-right font-semibold text-foreground">שם עובד</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-foreground">מקצוע</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-foreground">עלות יומית</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-foreground">Cost Impact</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-foreground">סטטוס זמינות</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-foreground">Conflict Checker</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const hasConflict = row.conflict_count > 0
                  const isSaving = savingId === row.id
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-border/80 transition-colors hover:bg-muted/35"
                    >
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => updateRow(row.id, { name: e.target.value })}
                          className={gridFieldClass}
                          placeholder="לדוגמה: אופיר דיין"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.profession}
                          onChange={(e) => updateRow(row.id, { profession: e.target.value })}
                          className={gridFieldClass}
                          placeholder="לדוגמה: חשמלאי"
                        />
                      </td>
                      <td className="px-3 py-2">
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
                          className={`${gridFieldClass} font-mono tabular-nums text-right`}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 font-mono tabular-nums text-right text-[12px] text-foreground">
                          ₪{Math.round(Number(row.cost_impact || 0)).toLocaleString("he-IL")}
                        </div>
                      </td>
                      <td className="px-3 py-2">
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
                      <td className="px-3 py-2">
                        {hasConflict ? (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-950">
                            <div className="font-semibold">התנגשות ({row.conflict_count})</div>
                            <div className="truncate text-amber-900/90">
                              פרויקטים: {row.conflict_projects.join(", ")}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                            ללא התנגשות
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={!row.dirty || isSaving}
                          className="gap-1.5 font-semibold disabled:opacity-40"
                          onClick={() => void saveRow(row)}
                        >
                          {isSaving ? (
                            <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                          ) : (
                            <Save className="size-3.5 shrink-0" aria-hidden />
                          )}
                          שמירה
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
