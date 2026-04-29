"use client"

/**
 * ItemsDataGrid — Phase 6 (חדר הבקרה / שולחן עבודה של איש הרכש).
 *
 * מציג טבלה ראשית של כל פריטי המאסטר של החברה הפעילה, עם:
 *   • שורת חיפוש חופשית (SKU + תיאור) — סינון client-side ל-UX מהיר.
 *   • כפתור "פריט חדש" שמחבר ל-Quick Create של המודל הראשי (HeavyItemMasterScreen).
 *   • שורות קליקביליות עם hover מודגש — לחיצה מבצעת drill-down לכרטיס העשיר.
 *   • Badge סטטוס צבעוני (פעיל/לא פעיל/מעוכב/מיושן).
 *
 * הקומפוננטה צורכת את `/api/master-data/items` שכבר מחזיר `productFamily.familyName`
 * ו-`uomDescription` (lookup מ-`units_of_measure`) — לא נדרש מיפוי נוסף בצד הלקוח.
 */

import * as React from "react"
import { Loader2, Plus, Search } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
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
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"

type ItemRow = {
  id: string
  sku: string
  description: string
  status: string
  uom: string | null
  uomDescription: string | null
  productFamily: { familyCode: string; familyName: string } | null
}

type ItemsDataGridProps = {
  /** קולבק לפתיחת הכרטיס המלא של פריט (drill-down ל-HeavyItemMasterScreen). */
  onSelectItem: (itemId: string) => void
  /** קולבק לפתיחת מודל יצירת פריט חדש. */
  onCreateNew: () => void
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "פעיל",
  INACTIVE: "לא פעיל",
  PURCHASE_ONLY: "רק רכש",
  INTERNAL_ONLY: "פנימי",
  OBSOLETE: "מיושן",
}

// טבלת מיפוי סטטוס → סגנון Badge (מבוסס Tailwind). שמירה על קלאסים סטטיים
// כדי ש-Tailwind יקלוט אותם בזמן build.
const STATUS_BADGE_CLASS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  INACTIVE: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  PURCHASE_ONLY: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  INTERNAL_ONLY: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  OBSOLETE: "bg-rose-500/15 text-rose-700 border-rose-500/30",
}

export function ItemsDataGrid({
  onSelectItem,
  onCreateNew,
}: ItemsDataGridProps) {
  const [rows, setRows] = React.useState<ItemRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    masterDataFetch<ItemRow[]>("/api/master-data/items")
      .then((data) => {
        if (cancelled) return
        setRows(data)
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(
          error instanceof Error ? error.message : "טעינת רשימת הפריטים נכשלה"
        )
        setRows([])
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // חיפוש client-side. הרשימה צפויה להיות בגודל סביר (עד אלפי פריטים) ולכן
  // לא דורשת server-side filtering. אם נחרוג מ-5K רשומות נחזיר ל-`?q=` של ה-API.
  const filteredRows = React.useMemo(() => {
    const trimmed = searchTerm.trim().toLowerCase()
    if (!trimmed) return rows
    return rows.filter(
      (row) =>
        row.sku.toLowerCase().includes(trimmed) ||
        row.description.toLowerCase().includes(trimmed) ||
        (row.productFamily?.familyName ?? "").toLowerCase().includes(trimmed)
    )
  }, [rows, searchTerm])

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col gap-3 p-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">קטלוג פריטים</h1>
          <p className="text-xs text-muted-foreground">
            {loading
              ? "טוען..."
              : `${filteredRows.length} מתוך ${rows.length} פריטים`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute end-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="חיפוש לפי מק&quot;ט / תיאור / משפחה..."
              className="ps-3 pe-8 sm:w-72"
              aria-label="חיפוש פריטים"
            />
          </div>
          <Button type="button" onClick={onCreateNew} className="gap-2">
            <Plus className="size-4" aria-hidden />
            פריט חדש
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        <div className="h-full overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="text-start">סטטוס</TableHead>
                <TableHead className="text-start">מק&quot;ט</TableHead>
                <TableHead className="text-start">תיאור</TableHead>
                <TableHead className="text-start">משפחת מוצר</TableHead>
                <TableHead className="text-start">יחידת מידה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center">
                    <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      טוען פריטים...
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    {rows.length === 0
                      ? "אין פריטים בקטלוג. לחץ 'פריט חדש' כדי ליצור את הראשון."
                      : "לא נמצאו פריטים התואמים לחיפוש."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => {
                  const statusLabel = STATUS_LABEL[row.status] ?? row.status
                  const statusClass =
                    STATUS_BADGE_CLASS[row.status] ??
                    "bg-slate-500/15 text-slate-700 border-slate-500/30"
                  // תיאור UOM אם זמין, אחרת fallback לקוד עצמו (למשל "M" / "EA").
                  const uomLabel =
                    row.uomDescription && row.uomDescription !== row.uom
                      ? `${row.uom ?? "—"} · ${row.uomDescription}`
                      : (row.uom ?? "—")
                  return (
                    <TableRow
                      key={row.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`פתיחת כרטיס פריט ${row.sku}`}
                      onClick={() => onSelectItem(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          onSelectItem(row.id)
                        }
                      }}
                      className={cn(
                        "cursor-pointer transition-colors",
                        "hover:bg-primary/5 focus-visible:bg-primary/10",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      )}
                    >
                      <TableCell>
                        <Badge variant="outline" className={cn("font-medium", statusClass)}>
                          {statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.sku}
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {row.description}
                      </TableCell>
                      <TableCell>
                        {row.productFamily ? (
                          <span className="text-sm">
                            <span className="font-mono text-xs text-muted-foreground">
                              {row.productFamily.familyCode}
                            </span>
                            {" · "}
                            {row.productFamily.familyName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{uomLabel}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
