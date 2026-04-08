"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"

import type { ProjectResourceRow } from "@/lib/marker-ofek/gantt-actions"
import { createProjectResource } from "@/lib/marker-ofek/gantt-actions"
import { formatError } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  resources: ProjectResourceRow[]
  onRefresh: () => void | Promise<void>
}

const statusHe: Record<ProjectResourceRow["availability_status"], string> = {
  available: "זמין",
  unavailable: "לא זמין",
  vacation: "חופשה",
}

export function GanttMsResourcePoolDialog({ open, onOpenChange, projectId, resources, onRefresh }: Props) {
  const [name, setName] = React.useState("")
  const [profession, setProfession] = React.useState("")
  const [hourly, setHourly] = React.useState("120")
  const [busy, setBusy] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const fullName = name.trim()
    if (!fullName) {
      toast.error("שם משאב חובה")
      return
    }
    setBusy(true)
    try {
      await createProjectResource({
        projectId,
        fullName,
        profession: profession.trim() || "כללי",
        hourlyCost: Number(hourly) || 0,
        workDays: [0, 1, 2, 3, 4],
      })
      toast.success("המשאב נוסף למאגר")
      setName("")
      setProfession("")
      await onRefresh()
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-lg" dir="rtl" showCloseButton>
        <DialogHeader className="text-start">
          <DialogTitle>ניהול מאגר משאבים</DialogTitle>
          <p className="text-xs text-slate-500">
            משאבים גלובליים (עובדים, צוותים, ציוד כבד) לשיוך למשימות בגאנט.
          </p>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-start">
          <p className="text-[11px] font-semibold text-slate-600">הוספת משאב חדש</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="res-name">שם</Label>
              <Input id="res-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: מנוף 50ט" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="res-prof">התמחות / סוג</Label>
              <Input
                id="res-prof"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="ציוד / שלד / חשמל"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="res-rate">עלות שעתית (₪)</Label>
            <Input
              id="res-rate"
              inputMode="decimal"
              className="font-currency-mono tabular-nums"
              value={hourly}
              onChange={(e) => setHourly(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "הוספה למאגר"}
            </Button>
          </DialogFooter>
        </form>

        <div className="max-h-[280px] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-start text-xs">
            <thead className="sticky top-0 bg-slate-100 text-[10px] font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-2 py-1.5">שם</th>
                <th className="px-2 py-1.5">התמחות</th>
                <th className="px-2 py-1.5">עלות ליום</th>
                <th className="px-2 py-1.5">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {resources.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-slate-500">
                    אין משאבים במאגר. הוסיפו משאב בטופס למעלה.
                  </td>
                </tr>
              ) : (
                resources.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-2 py-1.5 font-medium text-slate-900">{r.name}</td>
                    <td className="px-2 py-1.5 text-slate-600">{r.profession || "—"}</td>
                    <td className="px-2 py-1.5 font-currency-mono tabular-nums text-slate-800">
                      {r.cost_per_day.toLocaleString("he-IL", { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-2 py-1.5 text-slate-600">{statusHe[r.availability_status]}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
