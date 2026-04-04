"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, Search } from "lucide-react"
import { toast } from "sonner"

import {
  contextMenuIcons,
  SmartTableContextMenuPortal,
  type SmartContextMenuAction,
} from "@/components/marker-ofek/smart-table-context-menu"
import { TenderNum } from "@/components/marker-ofek/tenders/tender-numeric"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { boqLineTotal } from "@/lib/marker-ofek/tenders/calc"
import { TENDERS_ROUTES } from "@/lib/marker-ofek/tenders/nav"
import {
  deleteBoqItem,
  insertBoqItem,
  listBoqItems,
  updateBoqItem,
} from "@/lib/marker-ofek/tenders/tender-actions"
import type { MarkerOfekTenderBoqItemRow } from "@/types/marker-ofek"

export function TendersWbsClient({ projectId }: { projectId: string | null }) {
  const router = useRouter()
  const [rows, setRows] = React.useState<MarkerOfekTenderBoqItemRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  const [savingId, setSavingId] = React.useState<string | null>(null)
  const [tableSearch, setTableSearch] = React.useState("")
  const [ctxMenu, setCtxMenu] = React.useState<{
    x: number
    y: number
    row: MarkerOfekTenderBoqItemRow
  } | null>(null)

  const load = React.useCallback(async () => {
    if (!projectId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    const res = await listBoqItems({ tenderProjectId: projectId, version: "final" })
    if (!res.ok) {
      toast.error(res.error)
      setRows([])
    } else {
      setRows(res.rows)
      setDrafts(Object.fromEntries(res.rows.map((r) => [r.id, r.wbs_code ?? ""])))
    }
    setLoading(false)
  }, [projectId])

  React.useEffect(() => {
    void load()
  }, [load])

  function setDraft(id: string, v: string) {
    setDrafts((d) => ({ ...d, [id]: v }))
  }

  async function saveWbs(id: string) {
    const code = (drafts[id] ?? "").trim()
    setSavingId(id)
    const res = await updateBoqItem({ id, wbsCode: code || null })
    setSavingId(null)
    if (!res.ok) toast.error(res.error)
    else {
      toast.success("נשמר קוד WBS")
      void load()
    }
  }

  const filteredRows = React.useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const blob = `${r.description} ${r.wbs_code ?? ""}`.toLowerCase()
      return blob.includes(q)
    })
  }, [rows, tableSearch])

  const grouped = React.useMemo(() => {
    const map = new Map<string, MarkerOfekTenderBoqItemRow[]>()
    for (const r of filteredRows) {
      const key = (r.wbs_code ?? "").split(".")[0]?.trim() || "_ללא קוד"
      const list = map.get(key) ?? []
      list.push(r)
      map.set(key, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "he"))
  }, [filteredRows])

  async function duplicateRow(r: MarkerOfekTenderBoqItemRow) {
    if (!projectId) return
    const res = await insertBoqItem({
      tenderProjectId: projectId,
      version: "final",
      description: `${r.description} (עותק)`,
      unit: r.unit,
      quantity: r.quantity,
      unitPrice: r.unit_price,
      wbsCode: r.wbs_code,
    })
    if (!res.ok) toast.error(res.error)
    else {
      toast.success("שורה שוכפלה ב־BoQ סופי")
      void load()
    }
  }

  function contextActionsForRow(r: MarkerOfekTenderBoqItemRow): SmartContextMenuAction[] {
    return [
      {
        id: "dup",
        label: "שכפול שורה",
        icon: contextMenuIcons.duplicate,
        onSelect: () => void duplicateRow(r),
      },
      {
        id: "save",
        label: "שמירת קוד WBS",
        icon: contextMenuIcons.edit,
        onSelect: () => void saveWbs(r.id),
      },
      {
        id: "catalog",
        label: "קישור לקטלוג",
        icon: contextMenuIcons.catalog,
        onSelect: () => router.push("/marker-ofek/procurement/catalog"),
      },
      {
        id: "ai",
        label: "סנכרון AI (מסמכים)",
        icon: contextMenuIcons.aiSync,
        onSelect: () => router.push("/marker-ofek/procurement/ai-import"),
      },
      {
        id: "hist",
        label: "היסטוריית שינויים",
        icon: contextMenuIcons.history,
        onSelect: () =>
          toast.message("היסטוריית שינויים", {
            description: "בקרוב: מעקב אחר קידודי WBS.",
          }),
      },
      {
        id: "del",
        label: "מחיקת שורה",
        icon: contextMenuIcons.delete,
        destructive: true,
        onSelect: () => void deleteRow(r.id),
      },
    ]
  }

  async function deleteRow(id: string) {
    const res = await deleteBoqItem(id)
    if (!res.ok) toast.error(res.error)
    else {
      toast.success("השורה נמחקה")
      void load()
    }
  }

  const ctxNavItems = projectId
    ? [
        { label: "כתבי כמויות", href: `${TENDERS_ROUTES.boq}?projectId=${encodeURIComponent(projectId)}` },
        { label: "מרכז מכרזים", href: TENDERS_ROUTES.hub },
        { label: "קטלוג", href: "/marker-ofek/procurement/catalog" },
      ]
    : undefined

  if (!projectId) {
    return (
      <div className="bg-white px-2 py-10 text-center text-sm text-slate-500">
        בחרו מכרז ב{" "}
        <Link className="text-indigo-600 underline" href={TENDERS_ROUTES.hub}>
          מרכז המכרזים
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 bg-white pb-10">
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          value={tableSearch}
          onChange={(e) => setTableSearch(e.target.value)}
          placeholder="חיפוש לפי תיאור או קוד WBS…"
          className="h-10 border-slate-100 bg-white pe-10"
          aria-label="חיפוש בטבלת WBS"
        />
      </div>

      <SmartTableContextMenuPortal
        open={ctxMenu != null}
        x={ctxMenu?.x ?? 0}
        y={ctxMenu?.y ?? 0}
        onClose={() => setCtxMenu(null)}
        actions={ctxMenu ? contextActionsForRow(ctxMenu.row) : []}
        navItems={ctxNavItems}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          טוען…
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-slate-100 px-4 py-8 text-center text-sm text-slate-500">
          אין שורות ב-BoQ סופי — הוסיפו שורות בכרטיסיית &quot;כתבי כמויות&quot; (גרסה סופי).
        </p>
      ) : (
        <div className="space-y-8">
          {grouped.map(([phase, lines]) => (
            <section key={phase} className="rounded-xl border border-slate-100">
              <div className="border-b border-slate-100 px-4 py-2 md:px-6">
                <h2 className="text-sm font-semibold text-[#1e293b]">
                  שלב / קידוד:{" "}
                  <span className="font-currency-mono tabular-nums text-indigo-700">{phase}</span>
                </h2>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 bg-white hover:bg-white">
                      <TableHead className="w-[140px] font-currency-mono">קוד WBS</TableHead>
                      <TableHead className="text-start">תיאור</TableHead>
                      <TableHead className="text-end font-currency-mono">סה״כ ₪</TableHead>
                      <TableHead className="w-[120px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((r) => {
                      const line = boqLineTotal(r.quantity, r.unit_price)
                      return (
                        <TableRow
                          key={r.id}
                          className="border-slate-100"
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setCtxMenu({ x: e.clientX, y: e.clientY, row: r })
                          }}
                        >
                          <TableCell>
                            <Input
                              value={drafts[r.id] ?? ""}
                              onChange={(e) => setDraft(r.id, e.target.value)}
                              className="h-9 border-slate-100 font-currency-mono text-sm tabular-nums"
                              placeholder="1.2.3"
                            />
                          </TableCell>
                          <TableCell className="max-w-[320px]">{r.description}</TableCell>
                          <TableCell className="text-end">
                            <TenderNum>
                              {line.toLocaleString("he-IL", { maximumFractionDigits: 2 })}
                            </TenderNum>
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-slate-100"
                              disabled={savingId === r.id}
                              onClick={() => void saveWbs(r.id)}
                            >
                              {savingId === r.id ? "שומר…" : "שמירה"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500">
        <span className="font-medium text-slate-600">טיפ:</span> קודים כמו 1.0, 1.1 מקובצים לפי הקידומת הראשונה
        לתצוגת שלבים. לחצן ימני על שורה לתפריט מהיר.
      </p>
    </div>
  )
}
