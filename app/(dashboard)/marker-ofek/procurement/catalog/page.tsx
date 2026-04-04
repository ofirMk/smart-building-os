"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { ArrowRight, LayoutGrid, Loader2, Plus, Search } from "lucide-react"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { procurementCurrencyFormatter } from "@/lib/marker-ofek/procurement/format"
import { TENDERS_ROUTES } from "@/lib/marker-ofek/tenders/nav"
import { ITEMS_CATALOG_COLUMNS } from "@/lib/marker-ofek/supabase-fields"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"
import type { MarkerOfekItemsCatalogRow } from "@/types/marker-ofek"

const PAGE_SIZE = 80

const currencyFormatter = procurementCurrencyFormatter()

export default function ProcurementCatalogPage() {
  const router = useRouter()
  const [rows, setRows] = React.useState<MarkerOfekItemsCatalogRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [ctxMenu, setCtxMenu] = React.useState<{
    x: number
    y: number
    row: MarkerOfekItemsCatalogRow
  } | null>(null)
  const [form, setForm] = React.useState({
    sku: "",
    description: "",
    unit: "",
    category: "",
    default_price: "",
    is_inventory: false,
  })

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error: qErr } = await supabase
        .schema("public")
        .from("items_catalog")
        .select(ITEMS_CATALOG_COLUMNS)
        .order("sku", { ascending: true })
        .limit(PAGE_SIZE)
      if (qErr) throw qErr
      setRows((data as MarkerOfekItemsCatalogRow[]) ?? [])
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
      const supabase = createSupabaseBrowserClient()
      const { data, error: insErr } = await supabase
        .from("items_catalog")
        .insert({
          sku,
          description,
          unit: form.unit.trim() || null,
          category: form.category.trim() || null,
          default_price: defaultPrice,
          is_inventory: form.is_inventory,
        })
        .select("id")
        .single()
      if (insErr) throw insErr
      toast.success("הפריט נוסף לקטלוג")
      setDialogOpen(false)
      setForm({
        sku: "",
        description: "",
        unit: "",
        category: "",
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

  function catalogContextActions(r: MarkerOfekItemsCatalogRow): SmartContextMenuAction[] {
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
            unit: r.unit ?? "",
            category: r.category ?? "",
            default_price: r.default_price != null ? String(r.default_price) : "",
            is_inventory: r.is_inventory,
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
    <div className="flex min-h-0 flex-1 flex-col gap-6 bg-white pb-10">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-700"
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
                "shrink-0 gap-2 bg-indigo-600 hover:bg-indigo-500"
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
                    items_catalog
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
                    <Label htmlFor="cat-cat">קטגוריה</Label>
                    <Input
                      id="cat-cat"
                      value={form.category}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, category: e.target.value }))
                      }
                      className="border-slate-200"
                    />
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
                <Button type="submit" disabled={saving} className="bg-indigo-600">
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
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 stroke-[1.5] text-indigo-600"
            aria-hidden
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש לפי מק״ט, תיאור או קטגוריה…"
            className="h-11 border-slate-100 bg-white ps-10"
            aria-label="חיפוש בקטלוג"
          />
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-100 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 md:px-6">
          <p className="text-sm font-medium text-[#1e293b]">
            {loading ? "טוען…" : `${filtered.length} פריטים`}
          </p>
          <Link
            href="/marker-ofek/items"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-indigo-600 hover:text-indigo-500"
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
                <TableRow className="border-slate-100 bg-white hover:bg-white">
                  <TableHead className="text-start text-indigo-950">מק״ט</TableHead>
                  <TableHead className="text-start text-indigo-950">תיאור</TableHead>
                  <TableHead className="text-start text-indigo-950">יחידה</TableHead>
                  <TableHead className="text-start text-indigo-950">קטגוריה</TableHead>
                  <TableHead className="text-end text-indigo-950">מחיר ברירת מחדל</TableHead>
                  <TableHead className="text-start text-indigo-950">מלאי</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow
                    key={row.id}
                    className="border-slate-100"
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setCtxMenu({ x: e.clientX, y: e.clientY, row })
                    }}
                  >
                    <TableCell className="font-mono text-sm text-indigo-950">
                      <Link
                        href={`/marker-ofek/items/${row.id}`}
                        className="font-medium text-indigo-600 underline-offset-2 hover:underline"
                      >
                        {row.sku}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[280px]">{row.description}</TableCell>
                    <TableCell>{row.unit ?? "—"}</TableCell>
                    <TableCell>{row.category ?? "—"}</TableCell>
                    <TableCell className="text-end font-currency-mono tabular-nums text-indigo-950">
                      {row.default_price != null
                        ? currencyFormatter.format(Number(row.default_price))
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {row.is_inventory ? (
                        <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-800">
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
    </div>
  )
}
