"use client"

import * as React from "react"
import { Clock } from "lucide-react"
import { toast } from "sonner"

import { DenseMasterDetailTemplate } from "@/components/layout/DenseMasterDetailTemplate"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ATTENDANCE_MOCK_PROJECTS,
  ATTENDANCE_MOCK_WORKERS,
  computeDailyHoursDecimal,
  LOCATION_STATUS_LABELS,
  type AttendanceDayRow,
  type LocationStatusId,
} from "@/lib/marker-ofek/attendance-schema"
import { cn } from "@/lib/utils"

const GEO_MOCK_LABEL = "עיר היין"

let attendanceRowSeq = 0
function allocateAttendanceRowId(): string {
  attendanceRowSeq += 1
  return `att-${attendanceRowSeq}`
}

function todayIsoLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function nowTimeHmLocal(): string {
  const d = new Date()
  const h = String(d.getHours()).padStart(2, "0")
  const min = String(d.getMinutes()).padStart(2, "0")
  return `${h}:${min}`
}

/** דמה: לפעמים מחוץ לאתר (לצורך הדגמת סטטוס) */
function mockLocationStatus(): LocationStatusId {
  return Math.random() < 0.85 ? "onsite_ok" : "offsite_alert"
}

function seedTodayRows(dateIso: string): AttendanceDayRow[] {
  return [
    {
      id: "att-seed-1",
      workerId: "mo-worker-3",
      workerName: "יוסי כהן",
      projectId: "prj-wine-city",
      projectLabel: "מתחם עיר היין — שלב ביצוע",
      dateIso,
      clockInTime: "06:42",
      clockOutTime: null,
      locationStatus: "onsite_ok",
    },
    {
      id: "att-seed-2",
      workerId: "mo-worker-1",
      workerName: "דני לוי",
      projectId: "prj-gindi-towers-a",
      projectLabel: "גינדי TLV — מגדל A",
      dateIso,
      clockInTime: "07:05",
      clockOutTime: null,
      locationStatus: "offsite_alert",
    },
  ]
}

export function AttendanceWorkspace() {
  const [dateIso] = React.useState(() => todayIsoLocal())
  const [rows, setRows] = React.useState<AttendanceDayRow[]>(() =>
    seedTodayRows(todayIsoLocal())
  )
  const [workerId, setWorkerId] = React.useState(
    () => ATTENDANCE_MOCK_WORKERS[0]?.id ?? ""
  )
  const [projectId, setProjectId] = React.useState(
    () => ATTENDANCE_MOCK_PROJECTS[0]?.id ?? ""
  )

  const activeToday = React.useMemo(
    () => rows.filter((r) => r.dateIso === dateIso && r.clockOutTime == null),
    [rows, dateIso]
  )

  function clockIn() {
    const w = ATTENDANCE_MOCK_WORKERS.find((x) => x.id === workerId)
    const p = ATTENDANCE_MOCK_PROJECTS.find((x) => x.id === projectId)
    if (!w || !p) {
      toast.error("נא לבחור עובד ופרויקט")
      return
    }
    const open = rows.find(
      (r) =>
        r.workerId === workerId &&
        r.dateIso === dateIso &&
        r.clockOutTime == null
    )
    if (open) {
      toast.error("לעובד כבר יש כניסה פתוחה — החתימו יציאה קודם")
      return
    }
    const loc = mockLocationStatus()
    const next: AttendanceDayRow = {
      id: allocateAttendanceRowId(),
      workerId: w.id,
      workerName: w.name,
      projectId: p.id,
      projectLabel: p.label,
      dateIso,
      clockInTime: nowTimeHmLocal(),
      clockOutTime: null,
      locationStatus: loc,
    }
    setRows((prev) => [...prev, next])
    toast.success(
      loc === "onsite_ok"
        ? "כניסה נרשמה (באתר)"
        : "כניסה נרשמה — מיקום מחוץ לאתר (דמה)"
    )
  }

  function clockOutForRow(id: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id || r.clockOutTime != null) return r
        return { ...r, clockOutTime: nowTimeHmLocal() }
      })
    )
    toast.message("יציאה ידנית נרשמה")
  }

  function clockOutMega() {
    const open = rows.find(
      (r) =>
        r.workerId === workerId &&
        r.dateIso === dateIso &&
        r.clockOutTime == null
    )
    if (!open) {
      toast.error("אין כניסה פתוחה לעובד הנבחר")
      return
    }
    clockOutForRow(open.id)
  }

  return (
    <DenseMasterDetailTemplate
      dir="rtl"
      className="min-h-0 flex-1 bg-white text-slate-900 [color-scheme:light]"
      eyebrow="Marker Ofek · ביצוע"
      title="שעון נוכחות יומי"
      description={`${dateIso} · דמה GPS · שעות מחושבות אוטומטית`}
      leading={<Clock className="size-5 text-slate-700" aria-hidden />}
      backLink={{
        href: "/marker-ofek/dashboard",
        label: "חזרה ללוח בקרה",
      }}
      master={
      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="att-worker" className="text-xs font-semibold text-slate-600">
            עובד
          </Label>
          <Select
            value={workerId}
            onValueChange={(v) => {
              if (v) setWorkerId(v)
            }}
          >
            <SelectTrigger
              id="att-worker"
              className="h-8 border-slate-200 bg-white text-sm shadow-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ATTENDANCE_MOCK_WORKERS.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="att-project" className="text-xs font-semibold text-slate-600">
            פרויקט
          </Label>
          <Select
            value={projectId}
            onValueChange={(v) => {
              if (v) setProjectId(v)
            }}
          >
            <SelectTrigger
              id="att-project"
              className="h-8 border-slate-200 bg-white text-sm shadow-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ATTENDANCE_MOCK_PROJECTS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>
      }
      detail={
      <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-[7rem] flex-col gap-3 sm:min-h-[5.5rem] sm:flex-row sm:items-stretch">
        <Button
          type="button"
          className="min-h-[4.5rem] flex-1 gap-2 rounded-xl bg-emerald-600 text-lg font-bold text-white shadow-md hover:bg-emerald-700 sm:min-h-[5rem] sm:text-xl"
          onClick={() => clockIn()}
        >
          החתם כניסה (Clock In)
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="min-h-[4.5rem] flex-1 gap-2 rounded-xl text-lg font-bold shadow-md sm:min-h-[5rem] sm:text-xl"
          onClick={() => clockOutMega()}
        >
          החתם יציאה (Clock Out)
        </Button>
      </div>

      <div
        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950 shadow-sm"
        role="status"
      >
        <span aria-hidden>📍 </span>
        מיקום מאומת: <strong>{GEO_MOCK_LABEL}</strong>
      </div>

      <section className="min-h-0 flex-1 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-3 py-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">
            נוכחות היום ({activeToday.length} פתוחים ללא יציאה)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <Table dir="rtl" className="text-xs">
            <TableHeader>
              <TableRow className="border-slate-200 hover:bg-transparent">
                <TableHead className="h-9 text-right font-semibold text-slate-700">
                  שם עובד
                </TableHead>
                <TableHead className="h-9 text-right font-semibold text-slate-700">
                  שעת כניסה
                </TableHead>
                <TableHead className="h-9 text-right font-semibold text-slate-700">
                  סטטוס מיקום
                </TableHead>
                <TableHead className="h-9 text-right font-semibold text-slate-700">
                  שעות (סגור)
                </TableHead>
                <TableHead className="h-9 w-[9rem] text-right font-semibold text-slate-700">
                  פעולות ניהול
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows
                .filter((r) => r.dateIso === dateIso)
                .sort((a, b) => a.clockInTime.localeCompare(b.clockInTime))
                .map((row) => {
                  const hrs = computeDailyHoursDecimal(
                    row.clockInTime,
                    row.clockOutTime
                  )
                  const open = row.clockOutTime == null
                  return (
                    <TableRow key={row.id} className="border-slate-100">
                      <TableCell className="py-1.5 font-medium text-slate-900">
                        {row.workerName}
                      </TableCell>
                      <TableCell className="py-1.5 font-currency-mono tabular-nums text-slate-800">
                        {row.clockInTime}
                        {row.clockOutTime ? (
                          <span className="text-slate-500">
                            {" "}
                            → {row.clockOutTime}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <span
                          className={cn(
                            "inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                            row.locationStatus === "onsite_ok"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                              : "border-amber-200 bg-amber-50 text-amber-950"
                          )}
                        >
                          {LOCATION_STATUS_LABELS[row.locationStatus]}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5 font-currency-mono tabular-nums text-slate-700">
                        {hrs != null ? `${hrs} ש׳` : "—"}
                      </TableCell>
                      <TableCell className="py-1.5">
                        {open ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 border-red-200 bg-white text-xs font-semibold text-red-700 hover:bg-red-50"
                            onClick={() => clockOutForRow(row.id)}
                          >
                            יציאה ידנית
                          </Button>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
            </TableBody>
          </Table>
        </div>
      </section>
      </div>
      }
    />
  )
}
