"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, GitCompare, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { TendersSubnav } from "@/components/marker-ofek/tenders/tenders-subnav"
import { TenderNum } from "@/components/marker-ofek/tenders/tender-numeric"
import { ProcurementPageHeader } from "@/components/marker-ofek/procurement/procurement-page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { deviationTone } from "@/lib/marker-ofek/tenders/calc"
import {
  deleteVendorQuote,
  insertVendorQuote,
  listBoqItems,
  listVendorQuotesWithTargets,
  type VendorQuoteWithTarget,
} from "@/lib/marker-ofek/tenders/tender-actions"
import { TENDERS_ROUTES } from "@/lib/marker-ofek/tenders/nav"
import { cn } from "@/lib/utils"
import type { MarkerOfekTenderBoqItemRow } from "@/types/marker-ofek"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
})

export function TendersComparisonClient({ projectId }: { projectId: string | null }) {
  const [rows, setRows] = React.useState<VendorQuoteWithTarget[]>([])
  const [boqLines, setBoqLines] = React.useState<MarkerOfekTenderBoqItemRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [vendorName, setVendorName] = React.useState("")
  const [boqItemId, setBoqItemId] = React.useState("")
  const [quotedPrice, setQuotedPrice] = React.useState("")

  const load = React.useCallback(async () => {
    if (!projectId) {
      setRows([])
      setBoqLines([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [q, b] = await Promise.all([
      listVendorQuotesWithTargets({ tenderProjectId: projectId }),
      listBoqItems({ tenderProjectId: projectId, version: "final" }),
    ])
    if (!q.ok) toast.error(q.error)
    else setRows(q.rows)
    if (!b.ok) toast.error(b.error)
    else {
      setBoqLines(b.rows)
      setBoqItemId((prev) => {
        if (b.rows.length === 0) return ""
        if (prev && b.rows.some((x) => x.id === prev)) return prev
        return b.rows[0]!.id
      })
    }
    setLoading(false)
  }, [projectId])

  React.useEffect(() => {
    void load()
  }, [load])

  async function addQuote(e: React.FormEvent) {
    e.preventDefault()
    if (!projectId || !boqItemId) {
      toast.error("בחרו שורת BoQ (גרסה סופית)")
      return
    }
    const p = parseFloat(quotedPrice.replace(",", "."))
    if (!Number.isFinite(p)) {
      toast.error("מחיר הצעה חייב להיות מספר")
      return
    }
    const v = vendorName.trim()
    if (!v) {
      toast.error("שם ספק נדרש")
      return
    }
    const res = await insertVendorQuote({
      tenderProjectId: projectId,
      tenderBoqItemId: boqItemId,
      vendorName: v,
      quotedUnitPrice: p,
    })
    if (!res.ok) toast.error(res.error)
    else {
      toast.success("נוספה הצעה")
      setVendorName("")
      setQuotedPrice("")
      void load()
    }
  }

  async function removeQuote(id: string) {
    const res = await deleteVendorQuote(id)
    if (!res.ok) toast.error(res.error)
    else void load()
  }

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
    <div className="flex min-h-0 flex-1 flex-col gap-8 bg-white pb-10">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-700"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח הבקרה
      </Link>

      <TendersSubnav />

      <ProcurementPageHeader
        icon={GitCompare}
        kicker="השוואה"
        title="השוואת הצעות"
        subtitle="מחיר יחידה מול יעד ב-BoQ (גרסה סופי). ירוק — תחרותי; אדום — מעל היעד."
      />

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          טוען…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-100 bg-white hover:bg-white">
                <TableHead className="text-start">ספק</TableHead>
                <TableHead className="text-start">שורת BoQ</TableHead>
                <TableHead className="text-end font-mono">מחיר יעד</TableHead>
                <TableHead className="text-end font-mono">הצעה</TableHead>
                <TableHead className="text-end font-mono">סטייה %</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const tone = deviationTone(r.deviationPercent)
                return (
                  <TableRow
                    key={r.quoteId}
                    className={cn(
                      "border-slate-100",
                      tone === "good" && "bg-emerald-50/80",
                      tone === "bad" && "bg-rose-50/80"
                    )}
                  >
                    <TableCell className="font-medium text-[#1e293b]">{r.vendorName}</TableCell>
                    <TableCell className="max-w-[220px] text-sm">{r.boqDescription}</TableCell>
                    <TableCell className="text-end">
                      <TenderNum
                        className={tone === "good" ? "text-emerald-800" : tone === "bad" ? "text-rose-800" : ""}
                      >
                        {ils.format(r.targetUnitPrice)}
                      </TenderNum>
                    </TableCell>
                    <TableCell className="text-end">
                      <TenderNum
                        className={tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : ""}
                      >
                        {ils.format(r.quotedUnitPrice)}
                      </TenderNum>
                    </TableCell>
                    <TableCell className="text-end">
                      <TenderNum
                        className={cn(
                          "font-mono tabular-nums",
                          tone === "good" && "text-emerald-700",
                          tone === "bad" && "text-rose-700",
                          tone === "neutral" && "text-slate-600"
                        )}
                      >
                        {r.deviationPercent == null ? "—" : `${r.deviationPercent > 0 ? "+" : ""}${r.deviationPercent}%`}
                      </TenderNum>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-slate-500"
                        aria-label="מחיקה"
                        onClick={() => void removeQuote(r.quoteId)}
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

      <form
        onSubmit={(e) => void addQuote(e)}
        className="grid gap-3 rounded-xl border border-slate-100 bg-white p-4 md:grid-cols-4"
      >
        <div>
          <Label>שורת BoQ (סופי)</Label>
          {boqLines.length === 0 ? (
            <p className="rounded-md border border-amber-100 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
              אין שורות בגרסה הסופית — הוסיפו בכרטיסיית כתבי כמויות.
            </p>
          ) : (
            <Select value={boqItemId} onValueChange={(v) => setBoqItemId(v ?? "")}>
              <SelectTrigger className="border-slate-100">
                <SelectValue placeholder="בחרו שורה" />
              </SelectTrigger>
              <SelectContent>
                {boqLines.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div>
          <Label>שם ספק</Label>
          <Input
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            className="border-slate-100"
          />
        </div>
        <div>
          <Label>מחיר יחידה מוצע</Label>
          <Input
            value={quotedPrice}
            onChange={(e) => setQuotedPrice(e.target.value)}
            className="border-slate-100 font-mono"
          />
        </div>
        <div className="flex items-end">
          <Button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500"
            disabled={boqLines.length === 0}
          >
            <Plus className="size-4 stroke-[1.5]" aria-hidden />
            הוספת הצעה
          </Button>
        </div>
      </form>
    </div>
  )
}
