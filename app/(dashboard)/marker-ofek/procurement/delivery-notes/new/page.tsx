"use client"

import * as React from "react"
import { ArrowRight, Boxes, Loader2, PackagePlus, Search } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { recordIncomingTransaction } from "@/lib/actions/reconciliation-actions"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"

type ProjectOption = {
  id: string
  name: string
  internal_project_code: string | null
}

type ItemOption = {
  id: string
  description: string
  sku: string | null
  unit: string | null
}

function toNum(value: string): number {
  const normalized = String(value).replace(",", ".").trim()
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

export default function NewDeliveryNotePage() {
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [items, setItems] = React.useState<ItemOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)

  const [projectId, setProjectId] = React.useState("")
  const [itemCatalogId, setItemCatalogId] = React.useState("")
  const [itemSearch, setItemSearch] = React.useState("")
  const [quantity, setQuantity] = React.useState("")
  const [unit, setUnit] = React.useState("")
  const [notes, setNotes] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const [{ data: projectsData, error: projectsError }, { data: itemsData, error: itemsError }] =
          await Promise.all([
            supabase
              .schema("public")
              .from("projects")
              .select("id, name, internal_project_code")
              .eq("is_deleted", false)
              .order("created_at", { ascending: false })
              .limit(300),
            supabase
              .schema("public")
              .from("items_catalog")
              .select("id, description, sku, unit")
              .eq("is_inventory", true)
              .order("description", { ascending: true })
              .limit(1000),
          ])

        if (projectsError) throw projectsError
        if (itemsError) throw itemsError
        if (cancelled) return

        setProjects((projectsData as ProjectOption[] | null) ?? [])
        setItems((itemsData as ItemOption[] | null) ?? [])
      } catch (error) {
        if (!cancelled) toast.error(formatError(error))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredItems = React.useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const haystack = `${item.description} ${item.sku ?? ""}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [itemSearch, items])

  React.useEffect(() => {
    if (!itemCatalogId) return
    const selected = items.find((row) => row.id === itemCatalogId)
    if (!selected) return
    const nextUnit = String(selected.unit ?? "").trim()
    if (nextUnit) setUnit(nextUnit)
  }, [itemCatalogId, items])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const qty = toNum(quantity)

    if (!projectId) {
      toast.error("נא לבחור פרויקט.")
      return
    }
    if (!itemCatalogId) {
      toast.error("נא לבחור פריט.")
      return
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("יש להזין כמות תקינה גדולה מאפס.")
      return
    }

    setSubmitting(true)
    try {
      const result = await recordIncomingTransaction({
        projectId,
        itemCatalogId,
        quantity: qty,
        unit,
        notes,
      })
      toast.success("קליטת הסחורה נשמרה בהצלחה.")
      setQuantity("")
      setNotes("")
      setItemSearch("")
      setItemCatalogId("")
      if (!String(unit).trim()) setUnit("")
      if (!result?.id) {
        toast.error("התנועה נשמרה אך מזהה פעולה לא הוחזר.")
      }
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <a
        href="/marker-ofek/procurement"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-violet-300"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לרכש
      </a>

      <header className="space-y-2 rounded-2xl border border-violet-500/20 bg-slate-950/40 p-5 shadow-[0_0_30px_-20px_rgba(139,92,246,0.7)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300">
            <PackagePlus className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/90">
              Marker Ofek Logistics
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-50">
              קליטת סחורה - תעודת משלוח
            </h1>
          </div>
        </div>
        <p className="text-sm text-slate-300">
          רישום קליטת סחורה ישירות למלאי הפרויקט עם בקרה מסודרת על פריט, כמות ויחידה.
        </p>
      </header>

      <form onSubmit={onSubmit}>
        <Card className="border-violet-500/20 bg-slate-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Boxes className="size-5 text-violet-300" aria-hidden />
              טופס קליטה מקצועי
            </CardTitle>
            <CardDescription>
              בחירת פרויקט + פריט, כמות, יחידה והערות אסמכתא
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="projectId">פרויקט</Label>
              <Select
                value={projectId || undefined}
                onValueChange={(value) => setProjectId(value)}
                disabled={loading || submitting}
              >
                <SelectTrigger id="projectId">
                  <SelectValue placeholder="בחר פרויקט" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                      {project.internal_project_code
                        ? ` (${project.internal_project_code})`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="itemSearch">חיפוש פריט</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute inset-y-0 right-3 my-auto size-4 text-muted-foreground" />
                <Input
                  id="itemSearch"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="חפש לפי תיאור או SKU"
                  className="pr-9"
                  disabled={loading || submitting}
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="itemCatalogId">פריט מלאי</Label>
              <Select
                value={itemCatalogId || undefined}
                onValueChange={(value) => setItemCatalogId(value)}
                disabled={loading || submitting}
              >
                <SelectTrigger id="itemCatalogId">
                  <SelectValue placeholder="בחר פריט מהקטלוג" />
                </SelectTrigger>
                <SelectContent>
                  {filteredItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.description}
                      {item.sku ? ` - ${item.sku}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">כמות</Label>
              <Input
                id="quantity"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0.00"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">יחידה</Label>
              <Input
                id="unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="יח', ק\"ג, מ\"ק..."
                disabled={submitting}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">הערות / אסמכתא</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="מספר תעודה, ספק, הערות קליטה..."
                className="min-h-[88px]"
                disabled={submitting}
              />
            </div>

            <div className="md:col-span-2">
              <Button
                type="submit"
                disabled={submitting || loading}
                className="w-full gap-2 bg-violet-600 text-white hover:bg-violet-500 md:w-auto"
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <PackagePlus className="size-4" aria-hidden />
                )}
                שמירת קליטת סחורה
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
