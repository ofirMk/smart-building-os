"use client"

/**
 * Procurement Orders Landing — Phase 7.1
 *
 * מסך הנחיתה של מודול הזמנות הרכש. בנוי כ-Data Grid מקצועי בסגנון `ItemsDataGrid`
 * (Phase 6) לאחידות חוויית משתמש ברחבי המערכת.
 *
 * חוויית משתמש:
 *   • טעינה ראשונית: ספינר במרכז.
 *   • Empty state: כרטיס דקורטיבי עם CTA "יצירת הזמנת רכש" כשאין רשומות.
 *   • Populated: טבלה עם 7 עמודות + Badge סטטוס צבעוני + שורות hover-able.
 *
 * המסך צורך את `/api/procurement/orders` שמחזיר Header + JOIN לשם הספק —
 * לא נדרשת קריאה משנית לטבלת הספקים.
 *
 * הערה: רכיב `OrdersDashboard` הישן (`@/components/marker-ofek/procurement/orders-dashboard`)
 * משתמש בטבלאות legacy ובקליינט Supabase ישיר; נשמר זמנית ב-repo כ-orphan ויפונה
 * לאחר שהמסך החדש יקבל את כל יכולות ה-CRUD.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { FileText, Loader2, Plus, Search, ShoppingCart } from "lucide-react"
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

type ProcurementOrderRow = {
  id: string
  poNumber: string
  title: string
  status: string
  totalAmount: number
  currency: string
  issuedAt: string | null
  createdAt: string
  notes: string | null
  supplier: {
    id: string
    name: string
    supplierNum: string | null
  } | null
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "טיוטה",
  PENDING: "ממתין לאישור",
  PENDING_APPROVAL: "ממתין לאישור",
  PENDING_CEO_APPROVAL: "ממתין למנכ\"ל",
  APPROVED: "מאושר",
  ISSUED: "הונפק",
  RECEIVED: "התקבל",
  CLOSED: "סגור",
  CANCELED: "מבוטל",
  CANCELLED: "מבוטל",
}

// קלאסים סטטיים כדי ש-Tailwind יקלוט בזמן build (אין string interpolation בקלאסים).
const STATUS_BADGE_CLASS: Record<string, string> = {
  DRAFT: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  PENDING: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  PENDING_APPROVAL: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  PENDING_CEO_APPROVAL: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  APPROVED: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  ISSUED: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  RECEIVED: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30",
  CLOSED: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  CANCELED: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  CANCELLED: "bg-rose-500/15 text-rose-700 border-rose-500/30",
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })
const numberFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export default function ProcurementOrdersPage() {
  const router = useRouter()
  const [rows, setRows] = React.useState<ProcurementOrderRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    masterDataFetch<ProcurementOrderRow[]>("/api/procurement/orders")
      .then((data) => {
        if (cancelled) return
        setRows(data)
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(
          error instanceof Error ? error.message : "טעינת הזמנות הרכש נכשלה"
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

  // סינון client-side. הרשימה הראשונית צפויה להיות מוגבלת בגודל; אם נחרוג נעבור
  // ל-`?q=` של ה-API שכבר תומך ב-ilike על po_number ו-title.
  const filteredRows = React.useMemo(() => {
    const trimmed = searchTerm.trim().toLowerCase()
    if (!trimmed) return rows
    return rows.filter(
      (row) =>
        row.poNumber.toLowerCase().includes(trimmed) ||
        row.title.toLowerCase().includes(trimmed) ||
        (row.supplier?.name ?? "").toLowerCase().includes(trimmed)
    )
  }, [rows, searchTerm])

  const handleCreatePO = React.useCallback(() => {
    router.push("/marker-ofek/procurement/orders/new")
  }, [router])

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col gap-3 p-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingCart className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold">הזמנות רכש</h1>
            <p className="text-xs text-muted-foreground">
              {loading
                ? "טוען..."
                : rows.length === 0
                  ? "אין הזמנות רכש בחברה"
                  : `${filteredRows.length} מתוך ${rows.length} הזמנות`}
            </p>
          </div>
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
              placeholder="חיפוש לפי מספר הזמנה / כותרת / ספק..."
              className="ps-3 pe-8 sm:w-72"
              aria-label="חיפוש הזמנות רכש"
              disabled={rows.length === 0 && !loading}
            />
          </div>
          <Button type="button" onClick={handleCreatePO} className="gap-2">
            <Plus className="size-4" aria-hidden />
            יצירת הזמנת רכש
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            טוען הזמנות רכש...
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState onCreate={handleCreatePO} />
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
          <div className="h-full overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="text-start">מספר הזמנה</TableHead>
                  <TableHead className="text-start">כותרת</TableHead>
                  <TableHead className="text-start">ספק</TableHead>
                  <TableHead className="text-start">תאריך</TableHead>
                  <TableHead className="text-start">סטטוס</TableHead>
                  <TableHead className="text-end">סכום סופי</TableHead>
                  <TableHead className="text-start">מטבע</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-12 text-center text-sm text-muted-foreground"
                    >
                      לא נמצאו הזמנות התואמות לחיפוש.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => {
                    const statusLabel = STATUS_LABEL[row.status] ?? row.status
                    const statusClass =
                      STATUS_BADGE_CLASS[row.status] ??
                      "bg-slate-500/15 text-slate-700 border-slate-500/30"
                    const dateRaw = row.issuedAt ?? row.createdAt
                    const dateLabel = dateRaw
                      ? dateFormatter.format(new Date(dateRaw))
                      : "—"
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          "transition-colors",
                          "hover:bg-primary/5"
                        )}
                      >
                        <TableCell className="font-mono text-sm font-medium">
                          {row.poNumber}
                        </TableCell>
                        <TableCell className="max-w-md truncate">
                          {row.title}
                        </TableCell>
                        <TableCell>
                          {row.supplier ? (
                            <span className="text-sm">
                              {row.supplier.supplierNum ? (
                                <span className="font-mono text-xs text-muted-foreground">
                                  {row.supplier.supplierNum}
                                  {" · "}
                                </span>
                              ) : null}
                              {row.supplier.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {dateLabel}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("font-medium", statusClass)}
                          >
                            {statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-end font-medium tabular-nums">
                          {numberFormatter.format(row.totalAmount)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.currency}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}

/** Empty state — מודגש ויפה כשאין הזמנות רכש בחברה הפעילה. */
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-border/70 bg-muted/20 px-8 py-12 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <FileText className="size-8" aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">אין הזמנות רכש בחברה</h2>
          <p className="text-sm text-muted-foreground">
            שרשרת הרכש שלך מתחילה כאן. צור את הזמנת הרכש הראשונה כדי לעקוב אחר
            הזמנות, מחירים וקבלות מספקים.
          </p>
        </div>
        <Button type="button" onClick={onCreate} className="gap-2" size="lg">
          <Plus className="size-4" aria-hidden />
          יצירת הזמנת רכש ראשונה
        </Button>
      </div>
    </div>
  )
}
