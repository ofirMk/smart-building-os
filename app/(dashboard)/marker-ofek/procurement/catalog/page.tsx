"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import {
  ArrowRight,
  Boxes,
  CircleDollarSign,
  Hash,
  LayoutGrid,
  Loader2,
  Package,
  Plus,
  Search,
  Tag,
} from "lucide-react"
import { toast } from "sonner"

import { CatalogVsSheetHint } from "@/components/marker-ofek/catalog-vs-sheet-hint"
import {
  contextMenuIcons,
  SmartTableContextMenuPortal,
  type SmartContextMenuAction,
} from "@/components/marker-ofek/smart-table-context-menu"
import { ProcurementCommandSubnav } from "@/components/marker-ofek/procurement/procurement-command-subnav"
import { ProcurementPageHeader } from "@/components/marker-ofek/procurement/procurement-page-header"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { procurementCurrencyFormatter } from "@/lib/marker-ofek/procurement/format"
import { TENDERS_ROUTES } from "@/lib/marker-ofek/tenders/nav"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn, formatError } from "@/lib/utils"

const PAGE_SIZE = 80

const currencyFormatter = procurementCurrencyFormatter()

type CatalogRow = {
  id: string
  sku: string
  description: string
  uom: string | null
  legacyDefaultPrice: number | null
  isInventoryManaged: boolean
  category: string | null
  productFamilyId: string | null
}

type ProductFamilyRow = {
  id: string
  familyCode: string
  familyName: string
}

export default function ProcurementCatalogPage() {
  const router = useRouter()
  const [rows, setRows] = React.useState<CatalogRow[]>([])
  const [productFamilies, setProductFamilies] = React.useState<ProductFamilyRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [ctxMenu, setCtxMenu] = React.useState<{
    x: number
    y: number
    row: CatalogRow
  } | null>(null)
  // Floating spec preview shown on row hover. Tracks the hovered row + cursor
  // position so the card can be rendered as a fixed-positioned portal-style
  // panel near (but not overlapping) the pointer.
  const [hoverPreview, setHoverPreview] = React.useState<{
    x: number
    y: number
    row: CatalogRow
  } | null>(null)
  const [form, setForm] = React.useState({
    sku: "",
    description: "",
    unit: "",
    productFamilyId: "",
    default_price: "",
    is_inventory: false,
  })

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [items, families] = await Promise.all([
        masterDataFetch<
          Array<{
            id: string
            sku: string
            description: string
            uom: string | null
            legacyDefaultPrice: number | null
            isInventoryManaged: boolean
            productFamilyId: string | null
          }>
        >("/api/erp/master-data/items"),
        masterDataFetch<ProductFamilyRow[]>("/api/erp/master-data/product-families"),
      ])
      const familyMap = new Map(families.map((row) => [row.id, row.familyName]))
      setProductFamilies(families)
      setRows(
        items.slice(0, PAGE_SIZE).map((row) => ({
          id: row.id,
          sku: row.sku,
          description: row.description,
          uom: row.uom,
          legacyDefaultPrice: row.legacyDefaultPrice,
          isInventoryManaged: row.isInventoryManaged,
          productFamilyId: row.productFamilyId,
          category: row.productFamilyId ? familyMap.get(row.productFamilyId) ?? null : null,
        }))
      )
      if (!form.productFamilyId && families[0]?.id) {
        setForm((prev) => ({ ...prev, productFamilyId: families[0]!.id }))
      }
    } catch (e) {
      setError(formatError(e))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    const sku = form.sku.trim()
    const description = form.description.trim()
    if (!sku || !description) {
      toast.error("מק״ט ותיאור הם שדות חובה")
      return
    }
    const defaultPriceRaw = form.default_price.trim().replace(",", ".")
    const defaultPrice =
      defaultPriceRaw === "" ? null : parseFloat(defaultPriceRaw)
    if (defaultPriceRaw !== "" && !Number.isFinite(defaultPrice)) {
      toast.error("מחיר ברירת מחדל אינו מספר תקין")
      return
    }

    setSaving(true)
    try {
      const productFamilyId =
        form.productFamilyId.trim() || productFamilies[0]?.id || ""
      if (!productFamilyId) {
        toast.error("לא נמצאה משפחת מוצר פעילה")
        return
      }
      const data = await masterDataFetch<{ id: string }>("/api/erp/master-data/items", {
        method: "POST",
        body: JSON.stringify({
          sku,
          description,
          uom: form.unit.trim() || "יחידה",
          productFamilyId,
          isInventoryManaged: form.is_inventory,
          legacyDefaultPrice: defaultPrice,
        }),
        headers: { "Content-Type": "application/json" },
      })
      toast.success("הפריט נוסף לקטלוג")
      setDialogOpen(false)
      setForm({
        sku: "",
        description: "",
        unit: "",
        productFamilyId: productFamilyId,
        default_price: "",
        is_inventory: false,
      })
      await load()
      if (data?.id) router.push(`/marker-ofek/items/${data.id}`)
    } catch (err) {
      toast.error(formatError(err) || "שמירת הפריט נכשלה")
    } finally {
      setSaving(false)
    }
  }

  const filtered = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const t = `${r.sku} ${r.description} ${r.category ?? ""}`.toLowerCase()
      return t.includes(q)
    })
  }, [rows, searchQuery])

  function catalogContextActions(r: CatalogRow): SmartContextMenuAction[] {
    return [
      {
        id: "open",
        label: "פתיחת גיליון פריט",
        icon: contextMenuIcons.edit,
        onSelect: () => router.push(`/marker-ofek/items/${r.id}`),
      },
      {
        id: "dup",
        label: "שכפול מק״ט (טיוטה)",
        icon: contextMenuIcons.duplicate,
        onSelect: () => {
          setForm((p) => ({
            ...p,
            sku: `${r.sku}-COPY`,
            description: `${r.description} (עותק)`,
            unit: r.uom ?? "",
            productFamilyId: r.productFamilyId ?? "",
            default_price:
              r.legacyDefaultPrice != null ? String(r.legacyDefaultPrice) : "",
            is_inventory: r.isInventoryManaged,
          }))
          setDialogOpen(true)
          toast.message("טופס הוספה", { description: "עודכן לפי השורה — בדקו מק״ט לפני שמירה." })
        },
      },
      {
        id: "ai",
        label: "סנכרון AI (חשבוניות)",
        icon: contextMenuIcons.aiSync,
        onSelect: () => router.push("/marker-ofek/procurement/ai-import"),
      },
      {
        id: "boq",
        label: "קישור לכתב כמויות",
        icon: contextMenuIcons.catalog,
        onSelect: () => router.push(TENDERS_ROUTES.boq),
      },
    ]
  }

  const catalogCtxNav = [
    { label: "הזמנות רכש", href: "/marker-ofek/procurement/orders" },
    { label: "גיליון פריטים", href: "/marker-ofek/items" },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 bg-card pb-10">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-emerald-700"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח מרקר אופק
      </Link>

      <ProcurementCommandSubnav />

      <ProcurementPageHeader
        icon={LayoutGrid}
        kicker="מרקר אופק — רכש"
        title="קטלוג פריטים"
        titleAddon={<CatalogVsSheetHint variant="catalog" />}
        subtitle="מאסטר מק״טים וחלקים — חיפוש, הוספה וקישור לגיליון המלא."
        primaryAction={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              type="button"
              className={cn(
                buttonVariants({ size: "lg" }),
                "shrink-0 gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              )}
            >
              <Plus className="size-4 stroke-[1.5]" aria-hidden />
              + הוספת פריט
            </DialogTrigger>
          <DialogContent className="max-w-md" dir="rtl">
            <form onSubmit={(e) => void handleAddItem(e)}>
              <DialogHeader>
                <DialogTitle>פריט חדש בקטלוג</DialogTitle>
                <DialogDescription>
                  נשמר ב־<code className="rounded border border-slate-100 px-1 font-mono text-xs">
                    erp_md_items
                  </code>{" "}
                  וזמין לכל מסכי הרכש.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="cat-sku">מק״ט</Label>
                  <Input
                    id="cat-sku"
                    value={form.sku}
                    onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value }))}
                    required
                    className="border-slate-200"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cat-desc">תיאור</Label>
                  <Input
                    id="cat-desc"
                    value={form.description}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, description: e.target.value }))
                    }
                    required
                    className="border-slate-200"
                  />
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="cat-unit">יחידה</Label>
                    <Input
                      id="cat-unit"
                      value={form.unit}
                      onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                      className="border-slate-200"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="cat-family">משפחת מוצר</Label>
                    <Select
                      value={form.productFamilyId || undefined}
                      onValueChange={(value: string | null) =>
                        setForm((p) => ({ ...p, productFamilyId: value ?? "" }))
                      }
                    >
                      <SelectTrigger id="cat-family" className="border-slate-200 bg-card">
                        <SelectValue placeholder="בחרו משפחה" />
                      </SelectTrigger>
                      <SelectContent>
                        {productFamilies.map((family) => (
                          <SelectItem key={family.id} value={family.id}>
                            {family.familyCode} - {family.familyName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cat-price">מחיר ברירת מחדל (₪)</Label>
                  <Input
                    id="cat-price"
                    inputMode="decimal"
                    value={form.default_price}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, default_price: e.target.value }))
                    }
                    className="border-slate-200"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_inventory}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, is_inventory: e.target.checked }))
                    }
                    className="rounded border-slate-300"
                  />
                  פריט מלאי
                </label>
              </div>
              <DialogFooter className="gap-2 sm:justify-start">
                <Button type="submit" disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-700">
                  {saving ? "שומר…" : "שמירה"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 stroke-[1.5] text-emerald-600"
            aria-hidden
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש לפי מק״ט, תיאור או קטגוריה…"
            className="h-11 border-slate-100 bg-card ps-10"
            aria-label="חיפוש בקטלוג"
          />
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-100 bg-card">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 md:px-6">
          <p className="text-sm font-medium text-[#1e293b]">
            {loading ? "טוען…" : `${filtered.length} פריטים`}
          </p>
          <Link
            href="/marker-ofek/items"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            )}
          >
            לגיליון המלא →
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            טוען קטלוג…
          </div>
        ) : error ? (
          <div className="px-4 py-10 text-center text-sm text-destructive md:px-6">
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 bg-card hover:bg-card">
                  <TableHead className="text-start text-slate-700">מק״ט</TableHead>
                  <TableHead className="text-start text-slate-700">תיאור</TableHead>
                  <TableHead className="text-start text-slate-700">יחידה</TableHead>
                  <TableHead className="text-start text-slate-700">קטגוריה</TableHead>
                  <TableHead className="text-end text-slate-700">מחיר ברירת מחדל</TableHead>
                  <TableHead className="text-start text-slate-700">מלאי</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer border-slate-100 transition-colors hover:bg-emerald-50/50"
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setCtxMenu({ x: e.clientX, y: e.clientY, row })
                    }}
                    onMouseEnter={(e) =>
                      setHoverPreview({ row, x: e.clientX, y: e.clientY })
                    }
                    onMouseMove={(e) =>
                      setHoverPreview((prev) =>
                        prev && prev.row.id === row.id
                          ? { row, x: e.clientX, y: e.clientY }
                          : prev
                      )
                    }
                    onMouseLeave={() =>
                      setHoverPreview((prev) =>
                        prev && prev.row.id === row.id ? null : prev
                      )
                    }
                    onClick={() => router.push(`/marker-ofek/items/${row.id}`)}
                  >
                    <TableCell className="font-mono text-sm text-slate-800">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 group-hover:text-emerald-700">
                        <Hash className="size-3 text-emerald-500" aria-hidden />
                        {row.sku}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[280px] text-slate-700">
                      {row.description}
                    </TableCell>
                    <TableCell className="text-slate-600">{row.uom ?? "—"}</TableCell>
                    <TableCell className="text-slate-600">
                      {row.category ?? "—"}
                    </TableCell>
                    <TableCell className="text-end font-currency-mono tabular-nums text-slate-900">
                      {row.legacyDefaultPrice != null
                        ? currencyFormatter.format(Number(row.legacyDefaultPrice))
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {row.isInventoryManaged ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          <Boxes className="size-3" aria-hidden />
                          כן
                        </span>
                      ) : (
                        <span className="text-slate-400">לא</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                אין תוצאות — נסו חיפוש אחר או הוסיפו פריט.
              </p>
            ) : null}
          </div>
        )}
      </section>

      <SmartTableContextMenuPortal
        open={ctxMenu != null}
        x={ctxMenu?.x ?? 0}
        y={ctxMenu?.y ?? 0}
        onClose={() => setCtxMenu(null)}
        actions={ctxMenu ? catalogContextActions(ctxMenu.row) : []}
        navItems={catalogCtxNav}
      />

      {hoverPreview ? (
        <CatalogHoverPreview
          row={hoverPreview.row}
          x={hoverPreview.x}
          y={hoverPreview.y}
        />
      ) : null}
    </div>
  )
}

// ============================================================================
// CatalogHoverPreview — floating spec sheet shown when hovering a catalog row
// ============================================================================

function CatalogHoverPreview({
  row,
  x,
  y,
}: {
  row: CatalogRow
  x: number
  y: number
}) {
  // Position the card near the cursor but flip-aware: keep it inside the
  // viewport (assumes the page is RTL — the card should appear to the LEFT
  // of the pointer in RTL, so we offset negatively).
  const offset = 18
  const cardW = 320
  const cardH = 230
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280
  const vh = typeof window !== "undefined" ? window.innerHeight : 800

  // Default position: to the LEFT of the cursor (RTL-natural).
  let left = x - cardW - offset
  if (left < 8) left = x + offset
  // Clamp inside viewport horizontally too — guards against very wide cursors
  // or zoomed browser scenarios.
  if (left + cardW > vw - 8) left = vw - cardW - 8
  let top = y - 10
  if (top + cardH > vh - 8) top = vh - cardH - 8
  if (top < 8) top = 8

  return (
    <div
      role="dialog"
      aria-label={`פרטי פריט ${row.sku}`}
      style={{
        position: "fixed",
        left,
        top,
        width: cardW,
        zIndex: 60,
        pointerEvents: "none",
      }}
      className="animate-in fade-in zoom-in-95 duration-150"
      dir="rtl"
    >
      <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-[0_24px_60px_-20px_rgba(16,185,129,0.45)]">
        {/* accent strip */}
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-emerald-500 via-emerald-600 to-cyan-600" />

        <div className="p-4 pt-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                פריט קטלוג
              </div>
              <div className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-sm font-bold text-slate-900">
                <Hash className="size-3.5 text-emerald-500" aria-hidden />
                {row.sku}
              </div>
            </div>
            <span className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-emerald-700">
              <Package className="size-4" aria-hidden />
            </span>
          </div>

          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-800">
            {row.description}
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                <Tag className="size-3" aria-hidden />
                קטגוריה
              </dt>
              <dd className="mt-1 font-medium text-slate-800">
                {row.category ?? "—"}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                <Boxes className="size-3" aria-hidden />
                יחידה
              </dt>
              <dd className="mt-1 font-medium text-slate-800">
                {row.uom ?? "—"}
              </dd>
            </div>
            <div className="col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
              <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                <CircleDollarSign className="size-3" aria-hidden />
                מחיר ברירת מחדל
              </dt>
              <dd className="mt-1 font-currency-mono text-base font-bold tabular-nums text-emerald-900">
                {row.legacyDefaultPrice != null
                  ? currencyFormatter.format(Number(row.legacyDefaultPrice))
                  : "לא הוגדר"}
              </dd>
            </div>
          </dl>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
                row.isInventoryManaged
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-600"
              )}
            >
              {row.isInventoryManaged ? "מנוהל מלאי" : "ללא מלאי"}
            </span>
            <span className="text-slate-400">לחיצה לפתיחת הגיליון</span>
          </div>
        </div>
      </div>
    </div>
  )
}
