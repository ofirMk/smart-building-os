"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import {
  ArrowRight,
  FileSearch,
  Library,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { CatalogVsSheetHint } from "@/components/marker-ofek/catalog-vs-sheet-hint"
import {
  contextMenuIcons,
  SmartTableContextMenuPortal,
  type SmartContextMenuAction,
} from "@/components/marker-ofek/smart-table-context-menu"
import { TendersSubnav } from "@/components/marker-ofek/tenders/tenders-subnav"
import { TenderNum } from "@/components/marker-ofek/tenders/tender-numeric"
import { ProcurementPageHeader } from "@/components/marker-ofek/procurement/procurement-page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DekelPricePickerDialog } from "@/components/marker-ofek/tenders/dekel-price-picker-dialog"
import { BOQ_VERSIONS, boqLineTotal } from "@/lib/marker-ofek/tenders/calc"
import {
  getTenderDekelDefaults,
  updateTenderDefaultDekelMultiplier,
} from "@/lib/marker-ofek/tenders/dekel-actions"
import {
  deleteBoqItem,
  insertBoqItem,
  listBoqItems,
} from "@/lib/marker-ofek/tenders/tender-actions"
import { TENDERS_ROUTES } from "@/lib/marker-ofek/tenders/nav"
import { cn } from "@/lib/utils"
import type { MarkerOfekTenderBoqItemRow, MoBoqVersion } from "@/types/marker-ofek"

export function TendersBoqClient({ projectId }: { projectId: string | null }) {
  const router = useRouter()
  const [version, setVersion] = React.useState<MoBoqVersion>("v1")
  const [rows, setRows] = React.useState<MarkerOfekTenderBoqItemRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [tableSearch, setTableSearch] = React.useState("")
  const [ctxMenu, setCtxMenu] = React.useState<{
    x: number
    y: number
    row: MarkerOfekTenderBoqItemRow
  } | null>(null)
  const [desc, setDesc] = React.useState("")
  const [unit, setUnit] = React.useState("")
  const [qty, setQty] = React.useState("1")
  const [price, setPrice] = React.useState("0")
  const [dekelOpen, setDekelOpen] = React.useState(false)
  const [dekelBoqId, setDekelBoqId] = React.useState<string | null>(null)
  const [defaultDekelMult, setDefaultDekelMult] = React.useState("1.10")
  const [savingMult, setSavingMult] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!projectId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    const res = await listBoqItems({ tenderProjectId: projectId, version })
    if (!res.ok) {
      toast.error(res.error)
      setRows([])
    } else {
      setRows(res.rows)
    }
    setLoading(false)
  }, [projectId, version])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void (async () => {
      const res = await getTenderDekelDefaults(projectId)
      if (cancelled) return
      if (res.ok) setDefaultDekelMult(String(res.defaultDekelMultiplier))
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  async function addLine(e: React.FormEvent) {
    e.preventDefault()
    if (!projectId) return
    const q = parseFloat(qty.replace(",", "."))
    const p = parseFloat(price.replace(",", "."))
    if (!Number.isFinite(q) || !Number.isFinite(p)) {
      toast.error("כמות ומחיר חייבים להיות מספרים")
      return
    }
    const res = await insertBoqItem({
      tenderProjectId: projectId,
      version,
      description: desc.trim() || "שורה",
      unit: unit.trim() || null,
      quantity: q,
      unitPrice: p,
    })
    if (!res.ok) toast.error(res.error)
    else {
      toast.success("נוספה שורה")
      setDesc("")
      setQty("1")
      setPrice("0")
      void load()
    }
  }

  async function remove(id: string) {
    const res = await deleteBoqItem(id)
    if (!res.ok) toast.error(res.error)
    else void load()
  }

  const filteredRows = React.useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const blob = `${r.description} ${r.unit ?? ""} ${r.quantity} ${r.unit_price}`.toLowerCase()
      return blob.includes(q)
    })
  }, [rows, tableSearch])

  async function duplicateBoqRow(r: MarkerOfekTenderBoqItemRow) {
    if (!projectId) return
    const res = await insertBoqItem({
      tenderProjectId: projectId,
      version,
      description: `${r.description} (עותק)`,
      unit: r.unit,
      quantity: r.quantity,
      unitPrice: r.unit_price,
    })
    if (!res.ok) toast.error(res.error)
    else {
      toast.success("נוצרה שורה משוכפלת")
      void load()
    }
  }

  function openEditFromRow(r: MarkerOfekTenderBoqItemRow) {
    setDesc(r.description)
    setUnit(r.unit ?? "")
    setQty(String(r.quantity))
    setPrice(String(r.unit_price))
    window.requestAnimationFrame(() => {
      document.getElementById("boq-add-line-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }

  function contextActionsForRow(r: MarkerOfekTenderBoqItemRow): SmartContextMenuAction[] {
    return [
      {
        id: "dup",
        label: "שכפול שורה",
        icon: contextMenuIcons.duplicate,
        onSelect: () => void duplicateBoqRow(r),
      },
      {
        id: "edit",
        label: "עריכה בטופס",
        icon: contextMenuIcons.edit,
        onSelect: () => openEditFromRow(r),
      },
      {
        id: "catalog",
        label: "קישור לקטלוג",
        icon: contextMenuIcons.catalog,
        onSelect: () => router.push("/marker-ofek/items"),
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
            description: "בקרוב: יומן גירסאות לשורות BoQ.",
          }),
      },
      {
        id: "del",
        label: "מחיקה",
        icon: contextMenuIcons.delete,
        destructive: true,
        onSelect: () => void remove(r.id),
      },
    ]
  }

  const ctxNavItems = projectId
    ? [
        { label: "מרכז מכרזים", href: TENDERS_ROUTES.hub },
        { label: "מבנה WBS", href: `${TENDERS_ROUTES.wbs}?projectId=${encodeURIComponent(projectId)}` },
        { label: "קטלוג פריטים", href: "/marker-ofek/items" },
      ]
    : undefined

  if (!projectId) {
    return (
      <div className="bg-card px-2 py-10 text-center text-sm text-slate-500">
        בחרו מכרז ב{" "}
        <Link className="text-indigo-600 underline" href={TENDERS_ROUTES.hub}>
          מרכז המכרזים
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 bg-card pb-10">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-700"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח הבקרה
      </Link>

      <TendersSubnav />

      <ProcurementPageHeader
        icon={FileSearch}
        kicker="כתבי כמויות"
        title="כתבי כמויות (BoQ)"
        titleAddon={<CatalogVsSheetHint variant="tenderBoqSheet" />}
        subtitle="היררכיה בסיסית — גרסאות V1, V2 וסופי. מחירי יעד לשורה. משיכה מדקל: לחצו על ספרייה בשורה."
        primaryAction={
          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-2 border-slate-100 bg-card"
              onClick={() => {
                setDekelBoqId(null)
                setDekelOpen(true)
              }}
            >
              <Library className="size-4 text-indigo-600" aria-hidden />
              משוך מדקל
            </Button>
            <span className="text-xs text-slate-500">לעדכון שורה — לחצו משוך מדקל באותה שורה</span>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-card p-4">
        <div className="grid min-w-[12rem] flex-1 gap-1">
          <Label htmlFor="tender-dekel-mult" className="text-xs text-slate-600">
            מקדם ברירת מחדל למכרז (מחיר דקל → המחיר שלך)
          </Label>
          <Input
            id="tender-dekel-mult"
            value={defaultDekelMult}
            onChange={(e) => setDefaultDekelMult(e.target.value)}
            className="max-w-[10rem] border-slate-100 bg-card font-currency-mono tabular-nums"
            inputMode="decimal"
            dir="ltr"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          className="border border-slate-100 bg-background"
          disabled={savingMult}
          onClick={() => {
            if (!projectId) return
            const m = parseFloat(defaultDekelMult.replace(",", "."))
            if (!Number.isFinite(m) || m <= 0) {
              toast.error("מקדם לא תקין")
              return
            }
            setSavingMult(true)
            void (async () => {
              const res = await updateTenderDefaultDekelMultiplier({
                tenderProjectId: projectId,
                multiplier: m,
              })
              setSavingMult(false)
              if (!res.ok) toast.error(res.error)
              else {
                toast.success("נשמר מקדם ברירת המחדל")
                const r2 = await getTenderDekelDefaults(projectId)
                if (r2.ok) setDefaultDekelMult(String(r2.defaultDekelMultiplier))
              }
            })()
          }}
        >
          {savingMult ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          שמירת מקדם
        </Button>
      </div>

      <DekelPricePickerDialog
        open={dekelOpen}
        onOpenChange={setDekelOpen}
        tenderProjectId={projectId}
        boqItemId={dekelBoqId}
        onApplied={() => void load()}
      />

      <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-2">
        {BOQ_VERSIONS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVersion(v.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium",
              version === v.id
                ? "border border-indigo-200 bg-card text-indigo-800 shadow-sm"
                : "border border-transparent text-slate-600 hover:border-slate-100"
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          value={tableSearch}
          onChange={(e) => setTableSearch(e.target.value)}
          placeholder="חיפוש בטבלת השורות…"
          className="h-10 border-slate-100 bg-card pe-10"
          aria-label="חיפוש בטבלת כתב כמויות"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          טוען…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-100 bg-card hover:bg-card">
                <TableHead className="text-start">תיאור</TableHead>
                <TableHead className="text-start">יח׳</TableHead>
                <TableHead className="text-end font-mono">כמות</TableHead>
                <TableHead className="text-end font-mono">מחיר יח׳</TableHead>
                <TableHead className="text-end font-mono">סה״כ</TableHead>
                <TableHead className="w-[1%] text-center text-xs text-slate-500">
                  משוך מדקל
                </TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((r) => {
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
                    <TableCell className="max-w-[280px]">{r.description}</TableCell>
                    <TableCell>{r.unit ?? "—"}</TableCell>
                    <TableCell className="text-end font-mono tabular-nums">
                      {r.quantity}
                    </TableCell>
                    <TableCell className="text-end font-mono tabular-nums">
                      {r.unit_price}
                    </TableCell>
                    <TableCell className="text-end text-[#1e293b]">
                      <TenderNum>
                        {line.toLocaleString("he-IL", { maximumFractionDigits: 2 })}
                      </TenderNum>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 border-slate-100"
                        title="משוך מדקל"
                        aria-label="משוך מדקל"
                        onClick={() => {
                          setDekelBoqId(r.id)
                          setDekelOpen(true)
                        }}
                      >
                        <Library className="size-4 text-indigo-600" aria-hidden />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-rose-600"
                        aria-label="מחיקה"
                        onClick={() => void remove(r.id)}
                      >
                        <Trash2 className="size-4 stroke-[1.5]" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <SmartTableContextMenuPortal
        open={ctxMenu != null}
        x={ctxMenu?.x ?? 0}
        y={ctxMenu?.y ?? 0}
        onClose={() => setCtxMenu(null)}
        actions={ctxMenu ? contextActionsForRow(ctxMenu.row) : []}
        navItems={ctxNavItems}
      />

      <form
        id="boq-add-line-form"
        onSubmit={(e) => void addLine(e)}
        className="grid gap-3 rounded-xl border border-slate-100 bg-card p-4 md:grid-cols-6"
      >
        <div className="md:col-span-2">
          <Label>תיאור</Label>
          <Input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="border-slate-100"
            placeholder="סעיף כמות"
          />
        </div>
        <div>
          <Label>יחידה</Label>
          <Input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="border-slate-100"
            placeholder="מ״ר"
          />
        </div>
        <div>
          <Label>כמות</Label>
          <Input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="border-slate-100 font-mono"
          />
        </div>
        <div>
          <Label>מחיר יחידה</Label>
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="border-slate-100 font-mono"
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500">
            <Plus className="size-4 stroke-[1.5]" aria-hidden />
            הוספה
          </Button>
        </div>
      </form>
    </div>
  )
}
