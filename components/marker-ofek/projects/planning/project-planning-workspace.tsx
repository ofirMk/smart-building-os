"use client"

/**
 * ProjectPlanningWorkspace — Sprint A.4 (Pivot to Priority ERP).
 *
 * Renders the WBS data grid (Priority §5 style) and a side Sheet/Drawer
 * called "עץ מוצר לפעילות (תמחור)" for resource BOM editing.
 *
 * The grid groups BOQ lines by 4 hierarchy segments:
 *   structure → chapter → subchapter → item
 * and shows per-line: section_code (computed), description, uom, qty,
 * unit_price, total contracted, planned cost (Σ resource × qty), variance,
 * and the linked control-subchapter.
 *
 * Clicking any line opens the BOM drawer for that line, where resources can
 * be added / edited / removed and the line can be re-assigned to a control
 * subchapter for budget roll-up.
 */
import * as React from "react"
import { ChevronDown, Plus, Save, Trash2, X } from "lucide-react"

import {
  assignControlSubchapter,
  deleteBoqResource,
  upsertBoqResource,
} from "@/app/actions/project-planning"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const ILS2 = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
})

export type BoqLineDTO = {
  id: string
  segments: {
    structure: string
    chapter: string
    subchapter: string
    item: string
  }
  description: string
  uom: string
  quantity: number
  unitPrice: number
  totalPrice: number
  controlSubchapterId: string | null
  notes: string | null
}

export type BomRowDTO = {
  id: string
  boqLineId: string
  resourceId: string
  conversionRatio: number
  unitCost: number
  perUnitCost: number
  notes: string | null
}

type SubjectRow = { id: string; code: string; description: string }
type ResourceRow = {
  id: string
  subject_id: string
  code: string
  description: string
  uom: string
  default_unit_cost: number | null
}
type ChapterRow = { id: string; code: string; description: string }
type SubchapterRow = {
  id: string
  chapter_id: string
  code: string
  description: string
}

type Props = {
  projectId: string
  editionId: string
  editionLocked: boolean
  boqLines: BoqLineDTO[]
  bomRows: BomRowDTO[]
  subjects: SubjectRow[]
  resources: ResourceRow[]
  chapters: ChapterRow[]
  subchapters: SubchapterRow[]
}

function sectionCode(line: BoqLineDTO) {
  const { structure, chapter, subchapter, item } = line.segments
  return [structure, chapter, subchapter, item].filter(Boolean).join(".")
}

export function ProjectPlanningWorkspace({
  projectId,
  editionLocked,
  boqLines,
  bomRows,
  subjects,
  resources,
  chapters,
  subchapters,
}: Props) {
  const [openLineId, setOpenLineId] = React.useState<string | null>(null)

  // Group lines by structure → chapter → subchapter for the WBS tree.
  const tree = React.useMemo(() => {
    const root = new Map<
      string,
      Map<string, Map<string, BoqLineDTO[]>>
    >()
    for (const line of boqLines) {
      const s = line.segments.structure || "—"
      const c = line.segments.chapter || "—"
      const sc = line.segments.subchapter || "—"
      if (!root.has(s)) root.set(s, new Map())
      const lvl1 = root.get(s)!
      if (!lvl1.has(c)) lvl1.set(c, new Map())
      const lvl2 = lvl1.get(c)!
      if (!lvl2.has(sc)) lvl2.set(sc, [])
      lvl2.get(sc)!.push(line)
    }
    return root
  }, [boqLines])

  const bomByLine = React.useMemo(() => {
    const map = new Map<string, BomRowDTO[]>()
    for (const r of bomRows) {
      const arr = map.get(r.boqLineId) ?? []
      arr.push(r)
      map.set(r.boqLineId, arr)
    }
    return map
  }, [bomRows])

  function lineTotalPlannedCost(line: BoqLineDTO) {
    const rows = bomByLine.get(line.id) ?? []
    const perUnit = rows.reduce((s, r) => s + r.perUnitCost, 0)
    return perUnit * line.quantity
  }

  const openLine = openLineId
    ? boqLines.find((l) => l.id === openLineId) ?? null
    : null
  const openLineBom = openLine ? bomByLine.get(openLine.id) ?? [] : []

  const subchapterById = React.useMemo(
    () => new Map(subchapters.map((s) => [s.id, s])),
    [subchapters],
  )
  const chapterById = React.useMemo(
    () => new Map(chapters.map((c) => [c.id, c])),
    [chapters],
  )
  const resourceById = React.useMemo(
    () => new Map(resources.map((r) => [r.id, r])),
    [resources],
  )
  const subjectById = React.useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects],
  )

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h3 className="text-sm font-bold tracking-tight">
            כתב כמויות (WBS) · {boqLines.length} סעיפים
          </h3>
          {editionLocked ? (
            <Badge className="bg-slate-100 text-slate-700">
              צפייה בלבד — מהדורה נעולה
            </Badge>
          ) : (
            <Badge className="bg-emerald-100 text-emerald-900">
              מהדורה לעריכה
            </Badge>
          )}
        </div>

        {boqLines.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            אין סעיפים במהדורה זו.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-2 py-2 text-start">קוד WBS</th>
                  <th className="px-2 py-2 text-start">תיאור</th>
                  <th className="px-2 py-2 text-start">תת-פרק לבקרה</th>
                  <th className="px-2 py-2 text-start">יח׳</th>
                  <th className="px-2 py-2 text-end">כמות</th>
                  <th className="px-2 py-2 text-end">מחיר ליח׳</th>
                  <th className="px-2 py-2 text-end">סה״כ חוזי</th>
                  <th className="px-2 py-2 text-end">עלות מתוכננת</th>
                  <th className="px-2 py-2 text-end">רווח</th>
                  <th className="px-2 py-2 text-center">עץ מוצר</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(tree.entries()).map(([structureCode, chapters]) => (
                  <React.Fragment key={structureCode}>
                    <tr className="bg-indigo-50/60">
                      <td
                        colSpan={10}
                        className="px-2 py-1 text-[11px] font-bold tracking-tight text-indigo-900"
                      >
                        מבנה {structureCode}
                      </td>
                    </tr>
                    {Array.from(chapters.entries()).map(
                      ([chapterCode, subchapters]) => (
                        <React.Fragment key={`${structureCode}-${chapterCode}`}>
                          <tr className="bg-indigo-50/30">
                            <td
                              colSpan={10}
                              className="px-2 py-1 ps-6 text-[11px] font-semibold text-indigo-800"
                            >
                              פרק {structureCode}.{chapterCode}
                            </td>
                          </tr>
                          {Array.from(subchapters.entries()).map(
                            ([subCode, lines]) => (
                              <React.Fragment
                                key={`${structureCode}-${chapterCode}-${subCode}`}
                              >
                                <tr className="bg-slate-50/60">
                                  <td
                                    colSpan={10}
                                    className="px-2 py-1 ps-10 text-[11px] font-medium text-slate-700"
                                  >
                                    תת-פרק {structureCode}.{chapterCode}.
                                    {subCode}
                                  </td>
                                </tr>
                                {lines.map((line) => {
                                  const planned = lineTotalPlannedCost(line)
                                  const margin = line.totalPrice - planned
                                  const sub = line.controlSubchapterId
                                    ? subchapterById.get(
                                        line.controlSubchapterId,
                                      )
                                    : null
                                  const chap = sub
                                    ? chapterById.get(sub.chapter_id)
                                    : null
                                  const bomCount = (
                                    bomByLine.get(line.id) ?? []
                                  ).length
                                  return (
                                    <tr
                                      key={line.id}
                                      className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-amber-50/60"
                                      onClick={() => setOpenLineId(line.id)}
                                    >
                                      <td className="px-2 py-1.5 ps-14 font-mono text-slate-600">
                                        {sectionCode(line)}
                                      </td>
                                      <td className="px-2 py-1.5">
                                        {line.description}
                                      </td>
                                      <td className="px-2 py-1.5">
                                        {sub ? (
                                          <span className="text-[10px]">
                                            <span className="font-mono text-slate-500">
                                              {chap?.code}.{sub.code}
                                            </span>{" "}
                                            {sub.description}
                                          </span>
                                        ) : (
                                          <span className="text-[10px] text-rose-600">
                                            לא משויך
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-2 py-1.5">
                                        {line.uom}
                                      </td>
                                      <td className="px-2 py-1.5 text-end font-mono">
                                        {line.quantity.toLocaleString("he-IL")}
                                      </td>
                                      <td className="px-2 py-1.5 text-end font-mono">
                                        {ILS.format(line.unitPrice)}
                                      </td>
                                      <td className="px-2 py-1.5 text-end font-mono font-semibold">
                                        {ILS.format(line.totalPrice)}
                                      </td>
                                      <td className="px-2 py-1.5 text-end font-mono">
                                        {bomCount > 0 ? (
                                          ILS.format(planned)
                                        ) : (
                                          <span className="text-[10px] text-rose-600">
                                            לא תומחר
                                          </span>
                                        )}
                                      </td>
                                      <td
                                        className={`px-2 py-1.5 text-end font-mono font-semibold ${
                                          bomCount === 0
                                            ? "text-slate-400"
                                            : margin >= 0
                                              ? "text-emerald-700"
                                              : "text-rose-700"
                                        }`}
                                      >
                                        {bomCount > 0 ? ILS.format(margin) : "—"}
                                      </td>
                                      <td className="px-2 py-1.5 text-center">
                                        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-800">
                                          {bomCount} משאבים
                                          <ChevronDown
                                            className="size-3"
                                            aria-hidden
                                          />
                                        </span>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </React.Fragment>
                            ),
                          )}
                        </React.Fragment>
                      ),
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <BomDrawer
        open={openLine !== null}
        onClose={() => setOpenLineId(null)}
        projectId={projectId}
        line={openLine}
        bomRows={openLineBom}
        editionLocked={editionLocked}
        subjects={subjects}
        resources={resources}
        chapters={chapters}
        subchapters={subchapters}
        resourceById={resourceById}
        subjectById={subjectById}
      />
    </>
  )
}

// ─── Drawer ──────────────────────────────────────────────────────────────
type DrawerProps = {
  open: boolean
  onClose: () => void
  projectId: string
  line: BoqLineDTO | null
  bomRows: BomRowDTO[]
  editionLocked: boolean
  subjects: SubjectRow[]
  resources: ResourceRow[]
  chapters: ChapterRow[]
  subchapters: SubchapterRow[]
  resourceById: Map<string, ResourceRow>
  subjectById: Map<string, SubjectRow>
}

function BomDrawer({
  open,
  onClose,
  projectId,
  line,
  bomRows,
  editionLocked,
  subjects,
  resources,
  chapters,
  subchapters,
  resourceById,
  subjectById,
}: DrawerProps) {
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  // Add-row state
  const [newResourceId, setNewResourceId] = React.useState<string>("")
  const [newConv, setNewConv] = React.useState<string>("1")
  const [newCost, setNewCost] = React.useState<string>("")
  const [newNotes, setNewNotes] = React.useState<string>("")

  // Reset add-row form whenever the drawer opens for a new line.
  React.useEffect(() => {
    if (open) {
      setNewResourceId("")
      setNewConv("1")
      setNewCost("")
      setNewNotes("")
      setError(null)
    }
  }, [open, line?.id])

  // Default unit cost when picking a resource (must run before any early return).
  React.useEffect(() => {
    if (!newResourceId) return
    const r = resourceById.get(newResourceId)
    if (r?.default_unit_cost && !newCost) {
      setNewCost(String(r.default_unit_cost))
    }
  }, [newResourceId, resourceById, newCost])

  if (!line) return null

  const linePlanned = bomRows.reduce(
    (s, r) => s + r.perUnitCost * line.quantity,
    0,
  )
  const margin = line.totalPrice - linePlanned

  function handleAdd() {
    if (!newResourceId) {
      setError("יש לבחור משאב")
      return
    }
    const conv = Number(newConv)
    const cost = Number(newCost)
    if (!Number.isFinite(conv) || conv <= 0) {
      setError("יחס המרה חייב להיות גדול מאפס")
      return
    }
    if (!Number.isFinite(cost) || cost < 0) {
      setError("עלות לא תקינה")
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await upsertBoqResource({
        projectId,
        boqLineId: line!.id,
        resourceId: newResourceId,
        conversionRatio: conv,
        unitCost: cost,
        notes: newNotes || null,
      })
      if (!res.ok) setError(res.error)
      else {
        setNewResourceId("")
        setNewConv("1")
        setNewCost("")
        setNewNotes("")
      }
    })
  }

  function handleDelete(bomId: string) {
    setError(null)
    startTransition(async () => {
      const res = await deleteBoqResource({ projectId, bomId })
      if (!res.ok) setError(res.error)
    })
  }

  function handleAssignSubchapter(subchapterId: string) {
    setError(null)
    startTransition(async () => {
      const res = await assignControlSubchapter({
        projectId,
        boqLineId: line!.id,
        controlSubchapterId: subchapterId || null,
      })
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <Sheet open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <SheetContent
        side="right"
        dir="rtl"
        className="w-full max-w-2xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="text-end">
            עץ מוצר לפעילות — תמחור משאבים
          </SheetTitle>
          <SheetDescription className="text-end">
            <span className="font-mono">{sectionCode(line)}</span> ·{" "}
            {line.description} ·{" "}
            <span className="font-mono">
              {line.quantity.toLocaleString("he-IL")} {line.uom}
            </span>{" "}
            × {ILS.format(line.unitPrice)} = {ILS.format(line.totalPrice)}
          </SheetDescription>
        </SheetHeader>

        {error ? (
          <div className="m-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </div>
        ) : null}

        {/* Control subchapter assignment */}
        <div className="m-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            תת-פרק לבקרה (איסוף עלויות)
          </p>
          <select
            value={line.controlSubchapterId ?? ""}
            disabled={editionLocked || pending}
            onChange={(e) => handleAssignSubchapter(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
          >
            <option value="">— לא משויך —</option>
            {chapters.map((chap) => (
              <optgroup
                key={chap.id}
                label={`פרק ${chap.code} — ${chap.description}`}
              >
                {subchapters
                  .filter((s) => s.chapter_id === chap.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {chap.code}.{s.code} — {s.description}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* BOM rows */}
        <div className="m-4 overflow-hidden rounded-lg border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
            <h4 className="text-xs font-bold tracking-tight">
              משאבים מוקצים ({bomRows.length})
            </h4>
            <span className="text-[10px] text-slate-600">
              עלות מתוכננת לסעיף:{" "}
              <span className="font-mono font-bold">
                {ILS.format(linePlanned)}
              </span>{" "}
              · רווח:{" "}
              <span
                className={`font-mono font-bold ${margin >= 0 ? "text-emerald-700" : "text-rose-700"}`}
              >
                {ILS.format(margin)}
              </span>
            </span>
          </div>
          {bomRows.length === 0 ? (
            <div className="p-4 text-center text-[11px] text-slate-500">
              עדיין לא הוקצו משאבים — הוסף שורה ראשונה למטה.
            </div>
          ) : (
            <table className="w-full text-[11px] tabular-nums">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-2 py-1.5 text-start">משאב</th>
                  <th className="px-2 py-1.5 text-start">נושא</th>
                  <th className="px-2 py-1.5 text-end">יחס המרה</th>
                  <th className="px-2 py-1.5 text-end">עלות ליח׳</th>
                  <th className="px-2 py-1.5 text-end">לכל יח׳ סעיף</th>
                  <th className="px-2 py-1.5 text-end">סה&quot;כ מתוכנן</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {bomRows.map((r) => {
                  const res = resourceById.get(r.resourceId)
                  const subj = res ? subjectById.get(res.subject_id) : null
                  const lineTotal = r.perUnitCost * line.quantity
                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">
                        <div className="font-mono text-slate-500">
                          {res?.code ?? "?"}
                        </div>
                        <div>{res?.description ?? "—"}</div>
                        {r.notes ? (
                          <div className="text-[10px] text-slate-500">
                            {r.notes}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 text-slate-700">
                        {subj ? `${subj.code} · ${subj.description}` : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-end font-mono">
                        {r.conversionRatio}
                      </td>
                      <td className="px-2 py-1.5 text-end font-mono">
                        {ILS2.format(r.unitCost)}
                      </td>
                      <td className="px-2 py-1.5 text-end font-mono">
                        {ILS2.format(r.perUnitCost)}
                      </td>
                      <td className="px-2 py-1.5 text-end font-mono font-semibold">
                        {ILS.format(lineTotal)}
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={editionLocked || pending}
                          onClick={() => handleDelete(r.id)}
                          className="h-6 w-6 p-0 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="size-3" aria-hidden />
                          <span className="sr-only">מחק</span>
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Add row */}
        {!editionLocked ? (
          <div className="m-4 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/40 p-3">
            <h4 className="mb-2 text-xs font-bold tracking-tight text-indigo-900">
              הוסף משאב חדש לסעיף
            </h4>
            <div className="space-y-2">
              <select
                value={newResourceId}
                onChange={(e) => setNewResourceId(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
                disabled={pending}
              >
                <option value="">— בחר משאב —</option>
                {subjects.map((subj) => (
                  <optgroup
                    key={subj.id}
                    label={`${subj.code} — ${subj.description}`}
                  >
                    {resources
                      .filter((r) => r.subject_id === subj.id)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.code} — {r.description}
                          {r.default_unit_cost
                            ? ` (₪${r.default_unit_cost})`
                            : ""}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] font-semibold text-slate-700">
                  יחס המרה (כמות משאב ליחידת סעיף)
                  <Input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={newConv}
                    onChange={(e) => setNewConv(e.target.value)}
                    disabled={pending}
                    className="mt-0.5 h-8 text-xs"
                  />
                </label>
                <label className="text-[10px] font-semibold text-slate-700">
                  עלות ליחידת משאב (₪)
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                    disabled={pending}
                    className="mt-0.5 h-8 text-xs"
                  />
                </label>
              </div>
              <Textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="הערות (אופציונלי)"
                disabled={pending}
                className="min-h-[44px] text-xs"
              />
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={handleAdd}
                className="gap-2"
              >
                {pending ? (
                  <>
                    <Save className="size-3.5 animate-pulse" aria-hidden />
                    שומר…
                  </>
                ) : (
                  <>
                    <Plus className="size-3.5" aria-hidden />
                    הוסף משאב
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="m-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose} className="gap-1.5">
            <X className="size-3.5" aria-hidden />
            סגור
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
