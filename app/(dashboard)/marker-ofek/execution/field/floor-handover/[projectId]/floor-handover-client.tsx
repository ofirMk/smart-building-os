"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { upsertFloorHandoverAction } from "@/lib/marker-ofek/field-ops-actions"
import {
  mergeFloorHandoverChecklist,
  type FloorHandoverChecklistItem,
} from "@/lib/marker-ofek/floor-handover-defaults"
import { formatError } from "@/lib/utils"

type Row = {
  building_label: string
  floor_label: string
  checklist: unknown
  ready_for_drywall: boolean
}

export default function FloorHandoverClient({
  projectId,
  initialRow,
  defaultBuilding,
  defaultFloor,
}: {
  projectId: string
  initialRow: Row | null
  defaultBuilding: string
  defaultFloor: string
}) {
  const router = useRouter()
  const [building, setBuilding] = React.useState(
    initialRow?.building_label?.trim() || defaultBuilding || ""
  )
  const [floor, setFloor] = React.useState(
    initialRow?.floor_label?.trim() || defaultFloor || ""
  )
  const [checklist, setChecklist] = React.useState<FloorHandoverChecklistItem[]>(
    () => mergeFloorHandoverChecklist(initialRow?.checklist)
  )
  const [ready, setReady] = React.useState(
    Boolean(initialRow?.ready_for_drywall)
  )
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setBuilding(initialRow?.building_label?.trim() || defaultBuilding || "")
    setFloor(initialRow?.floor_label?.trim() || defaultFloor || "")
    setChecklist(mergeFloorHandoverChecklist(initialRow?.checklist))
    setReady(Boolean(initialRow?.ready_for_drywall))
  }, [initialRow, defaultBuilding, defaultFloor])

  const electricianSigned = Boolean(
    checklist.find((c) => c.id === "electrician")?.signed
  )

  function signTrade(id: string) {
    setChecklist((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              signed: true,
              signed_at: new Date().toISOString(),
            }
          : c
      )
    )
  }

  async function onSave() {
    setSaving(true)
    try {
      const res = await upsertFloorHandoverAction({
        projectId,
        buildingLabel: building,
        floorLabel: floor,
        checklist,
        readyForDrywall: ready,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("פרוטוקול מסירת קומה נשמר")
      router.refresh()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            מסירת קומה
          </h1>
          <p className="mt-1 text-sm font-light text-slate-500">
            גבס מותר רק לאחר חתימת חשמלאי דיגיטלית.
          </p>
        </div>
        <Link
          href={`/marker-ofek/execution/diamond-workspace/${projectId}`}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          שולחן יהלום
        </Link>
      </div>

      <div className="grid gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-2">
          <Label htmlFor="b">בניין</Label>
          <Input
            id="b"
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
            placeholder="למשל מגדל א׳"
            className="font-light"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="f">קומה</Label>
          <Input
            id="f"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            placeholder="למשל 12"
            className="font-light"
            dir="ltr"
          />
        </div>

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold tracking-wide text-slate-400">
            חתימות מקצוע
          </p>
          <ul className="space-y-3">
            {checklist.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{c.label}</p>
                  {c.signed_at ? (
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400" dir="ltr">
                      {c.signed_at.slice(0, 19).replace("T", " ")}
                    </p>
                  ) : null}
                </div>
                {c.signed ? (
                  <span className="text-xs font-medium text-emerald-600">
                    נחתם
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => signTrade(c.id)}
                  >
                    חתימה דיגיטלית
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3">
          <Checkbox
            id="dry"
            checked={ready}
            disabled={!electricianSigned}
            onCheckedChange={(v) => setReady(v === true)}
          />
          <div className="min-w-0">
            <Label htmlFor="dry" className="cursor-pointer font-medium">
              מוכן לגבס
            </Label>
            <p className="mt-1 text-xs font-light text-slate-500">
              {electricianSigned
                ? "ניתן לסמן שהקומה מוכנה לעבודות גבס."
                : "יש לאשר תחילה את החשמלאי."}
            </p>
          </div>
        </div>

        <Button
          type="button"
          className="w-full bg-slate-900 text-white hover:bg-slate-800"
          disabled={saving}
          onClick={() => void onSave()}
        >
          {saving ? "שומר…" : "שמירת פרוטוקול"}
        </Button>
      </div>
    </div>
  )
}
