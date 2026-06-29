"use client"

import * as React from "react"
import { CalendarPlus, FileText } from "lucide-react"

import type {
  PreventiveMaintenanceRow,
  PreventiveMaintenanceSummaryMock,
  MaintenanceFrequencyUi,
  MaintenanceScheduleStatusUi,
} from "@/components/maintenance/preventive-maintenance-mock-data"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type PreventiveMaintenanceDashboardProps = {
  summary: PreventiveMaintenanceSummaryMock
  rows: PreventiveMaintenanceRow[]
}

const FREQUENCY_LABEL: Record<MaintenanceFrequencyUi, string> = {
  monthly: "חודשי",
  bi_annual: "חצי-שנתי",
  annual: "שנתי",
}

const STATUS_META: Record<
  MaintenanceScheduleStatusUi,
  { label: string; badgeClass: string }
> = {
  scheduled: {
    label: "מתוכנן",
    badgeClass:
      "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-200 ring-1 ring-amber-500/20",
  },
  overdue: {
    label: "באיחור",
    badgeClass:
      "border-red-500/45 bg-red-500/15 text-red-700 dark:text-red-200 ring-1 ring-red-500/20",
  },
  completed: {
    label: "הושלם",
    badgeClass:
      "border-emerald-500/45 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 ring-1 ring-emerald-500/15",
  },
}

const TZ = "Asia/Jerusalem"

function formatNextService(iso: string): string {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "medium",
      timeZone: TZ,
    }).format(new Date(iso + "T12:00:00"))
  } catch {
    return iso
  }
}

export function PreventiveMaintenanceDashboard({
  summary,
  rows: initialRows,
}: PreventiveMaintenanceDashboardProps) {
  const [rows, setRows] = React.useState<PreventiveMaintenanceRow[]>(() =>
    initialRows.map((r) => ({ ...r }))
  )
  const [addOpen, setAddOpen] = React.useState(false)
  const [pendingRowId, setPendingRowId] = React.useState<string | null>(null)

  const [newSystem, setNewSystem] = React.useState("")
  const [newVendor, setNewVendor] = React.useState("")
  const [newDate, setNewDate] = React.useState("")
  const [newFrequency, setNewFrequency] =
    React.useState<MaintenanceFrequencyUi>("monthly")

  React.useEffect(() => {
    if (!addOpen) {
      setNewSystem("")
      setNewVendor("")
      setNewDate("")
      setNewFrequency("monthly")
    }
  }, [addOpen])

  function handleAddScheduled(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!newSystem.trim() || !newVendor.trim() || !newDate.trim()) return
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `pm-${Date.now()}`
    setRows((prev) => [
      {
        id,
        systemEquipment: newSystem.trim(),
        vendorName: newVendor.trim(),
        nextServiceDate: newDate,
        frequency: newFrequency,
        status: "scheduled",
      },
      ...prev,
    ])
    setAddOpen(false)
  }

  function handleConfirmComplete(rowId: string) {
    setPendingRowId(rowId)
    window.setTimeout(() => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId ? { ...r, status: "completed" as const } : r
        )
      )
      setPendingRowId(null)
    }, 400)
  }

  function handleContractDetails(rowId: string) {
    setPendingRowId(`contract-${rowId}`)
    window.setTimeout(() => {
      setPendingRowId((p) => (p === `contract-${rowId}` ? null : p))
    }, 350)
  }

  return (
    <div
      className="-mx-4 flex-1 min-h-0 overflow-y-auto bg-background px-4 py-6 font-sans text-foreground md:-mx-6 md:px-6 md:py-10"
      dir="rtl"
    >
      <header className="mb-8 flex flex-col gap-6 border-b border-border pb-8 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="bg-gradient-to-l from-cyan-400 to-blue-600 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
            תחזוקה מונעת וניהול ספקים
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            פרויקט מגורים 16 קומות — מרקר אופק: לוח טיפולים, ספקים וחוזים
            בתצוגה אחת.
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          onClick={() => setAddOpen(true)}
          className="h-12 shrink-0 gap-2 border-0 bg-gradient-to-l from-cyan-500 to-blue-600 px-6 text-base font-semibold text-white shadow-lg shadow-cyan-900/20 hover:from-cyan-400 hover:to-blue-500"
        >
          <CalendarPlus className="size-5" aria-hidden />
          הוסף טיפול מתוכנן
        </Button>
      </header>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <SummaryCard
          title="טיפולים החודש"
          value={String(summary.maintenancesThisMonth)}
          subtitle="טיפולים מתוכננים או שבוצעו מתחילת החודש"
          accent="bg-cyan-500"
        />
        <SummaryCard
          title="חוזים פגי תוקף בקרוב"
          value={String(summary.expiringContractsSoon)}
          subtitle="חוזי שירות הדורשים חידוש ב־60 הימים הקרובים"
          accent="bg-amber-500"
        />
        <SummaryCard
          title="ספקים פעילים"
          value={String(summary.activeVendors)}
          subtitle="ספקים עם חוזה פעיל בפרויקט"
          accent="bg-emerald-500"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-4 md:px-6">
          <h2 className="text-lg font-semibold text-foreground">
            ספקים פעילים ולוח טיפולים קרוב
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            נתוני הדגמה — בניין מגורים רב-קומות
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-start text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-3.5 font-medium text-muted-foreground md:px-4">
                  מערכת / ציוד
                </th>
                <th className="px-3 py-3.5 font-medium text-muted-foreground md:px-4">
                  ספק שירות
                </th>
                <th className="px-3 py-3.5 font-medium text-muted-foreground md:px-4">
                  תאריך טיפול קרוב
                </th>
                <th className="px-3 py-3.5 font-medium text-muted-foreground md:px-4">
                  תדירות
                </th>
                <th className="px-3 py-3.5 font-medium text-muted-foreground md:px-4">
                  סטטוס
                </th>
                <th className="px-3 py-3.5 font-medium text-muted-foreground md:px-4">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const meta = STATUS_META[row.status]
                const busy =
                  pendingRowId === row.id ||
                  pendingRowId === `contract-${row.id}`
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border/80 transition-colors hover:bg-muted/30"
                  >
                    <td className="max-w-[280px] px-3 py-3.5 text-foreground md:px-4">
                      {row.systemEquipment}
                    </td>
                    <td className="px-3 py-3.5 text-muted-foreground md:px-4">
                      {row.vendorName}
                    </td>
                    <td className="px-3 py-3.5 tabular-nums text-foreground md:px-4">
                      {formatNextService(row.nextServiceDate)}
                    </td>
                    <td className="px-3 py-3.5 text-muted-foreground md:px-4">
                      {FREQUENCY_LABEL[row.frequency]}
                    </td>
                    <td className="px-3 py-3.5 md:px-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          meta.badgeClass
                        )}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 md:px-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy || row.status === "completed"}
                          className="border-emerald-600/50 bg-transparent text-emerald-700 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-950/40 disabled:opacity-45"
                          onClick={() => handleConfirmComplete(row.id)}
                        >
                          אישור ביצוע
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 border-border bg-transparent text-foreground hover:bg-accent"
                          onClick={() => handleContractDetails(row.id)}
                        >
                          <FileText className="size-3.5 shrink-0" aria-hidden />
                          פרטי חוזה
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent
          className="border-border bg-background text-foreground sm:max-w-md"
          dir="rtl"
          showCloseButton
        >
          <form onSubmit={handleAddScheduled}>
            <DialogHeader>
              <DialogTitle>
                הוספת טיפול מתוכנן
              </DialogTitle>
              <DialogDescription>
                תרחיש הדגמה — בפריסה לייצור הפרטים יישמרו ב־Supabase.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="pm-system">
                  מערכת / ציוד
                </Label>
                <Input
                  id="pm-system"
                  value={newSystem}
                  onChange={(e) => setNewSystem(e.target.value)}
                  placeholder="למשל: בדיקת משאבות לובי"
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pm-vendor">
                  ספק שירות
                </Label>
                <Input
                  id="pm-vendor"
                  value={newVendor}
                  onChange={(e) => setNewVendor(e.target.value)}
                  placeholder="שם הספק"
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pm-date">
                  תאריך טיפול קרוב
                </Label>
                <Input
                  id="pm-date"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pm-freq">
                  תדירות
                </Label>
                <Select
                  value={newFrequency}
                  onValueChange={(v) => {
                    if (
                      v === "monthly" ||
                      v === "bi_annual" ||
                      v === "annual"
                    ) {
                      setNewFrequency(v)
                    }
                  }}
                >
                  <SelectTrigger
                    id="pm-freq"
                    className="h-11 w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">חודשי</SelectItem>
                    <SelectItem value="bi_annual">חצי-שנתי</SelectItem>
                    <SelectItem value="annual">שנתי</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="sm:justify-start">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
              >
                ביטול
              </Button>
              <Button
                type="submit"
                className="border-0 bg-gradient-to-l from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500"
              >
                שמור
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SummaryCard({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string
  value: string
  subtitle: string
  accent: string
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
      <div className={`absolute end-0 top-0 h-full w-1 ${accent}`} />
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="mb-2 text-2xl font-bold tabular-nums text-foreground md:text-3xl">
        {value}
      </div>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  )
}
