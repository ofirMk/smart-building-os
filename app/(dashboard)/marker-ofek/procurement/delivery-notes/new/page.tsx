"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Loader2, Package, Search } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
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
import { recordIncomingTransaction } from "@/lib/marker-ofek/reconciliation-actions"
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
    <div
      dir="rtl"
      className="bg-card p-8 font-sans text-foreground"
    >
      <div className="mx-auto mb-8 flex max-w-4xl items-center justify-between border-b border-slate-100 pb-6">
        <div className="flex items-center gap-4">
          <div className="rounded-full bg-background p-3 text-indigo-600">
            <Package size={24} aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              קליטת סחורה - תעודת משלוח
            </h1>
            <p className="text-sm text-slate-400">
              רישום ומעקב מלאי פרויקטלי
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="text-slate-400 hover:text-indigo-600"
          render={
            <Link href="/marker-ofek/procurement" className="inline-flex items-center gap-2">
              <ArrowRight className="size-[18px]" aria-hidden />
              חזרה לרכש
            </Link>
          }
        />
      </div>

      <form onSubmit={onSubmit} className="mx-auto grid max-w-4xl gap-8">
        <Card className="border-slate-100 bg-card p-8 shadow-sm">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label
                htmlFor="projectId"
                className="me-1 text-xs font-bold uppercase text-slate-500"
              >
                בחירת פרויקט
              </Label>
              <Select
                value={projectId || undefined}
                onValueChange={(value) => setProjectId(value ?? "")}
                disabled={loading || submitting}
              >
                <SelectTrigger
                  id="projectId"
                  className="h-10 border-slate-200 bg-card"
                >
                  <SelectValue placeholder="בחר פרויקט..." />
                </SelectTrigger>
                <SelectContent diamondEntity="projects">
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

            <div className="space-y-2">
              <Label
                htmlFor="itemSearch"
                className="me-1 text-xs font-bold uppercase text-slate-500"
              >
                חיפוש פריט מהקטלוג
              </Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute right-3 top-1/2 size-[18px] -translate-y-1/2 text-slate-300"
                  aria-hidden
                />
                <Input
                  id="itemSearch"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="חפש לפי תיאור או SKU..."
                  className="border-slate-200 pe-10"
                  disabled={loading || submitting}
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label
                htmlFor="itemCatalogId"
                className="me-1 text-xs font-bold uppercase text-slate-500"
              >
                פריט מלאי
              </Label>
              <Select
                value={itemCatalogId || undefined}
                onValueChange={(value) => setItemCatalogId(value ?? "")}
                disabled={loading || submitting}
              >
                <SelectTrigger
                  id="itemCatalogId"
                  className="h-10 border-slate-200 bg-card"
                >
                  <SelectValue placeholder="בחר פריט מהקטלוג" />
                </SelectTrigger>
                <SelectContent diamondEntity="items">
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
              <Label
                htmlFor="quantity"
                className="me-1 text-xs font-bold uppercase text-slate-500"
              >
                כמות
              </Label>
              <Input
                id="quantity"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0.00"
                className="border-slate-200"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="unit"
                className="me-1 text-xs font-bold uppercase text-slate-500"
              >
                יחידה
              </Label>
              <Input
                id="unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder={'יח\', ק"ג, מ"ק...'}
                className="border-slate-200"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label
                htmlFor="notes"
                className="me-1 text-xs font-bold uppercase text-slate-500"
              >
                הערות / אסמכתא
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="מספר תעודה, ספק, הערות קליטה..."
                className="min-h-[100px] rounded-md border-slate-200 bg-card text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end border-t border-slate-50 pt-6">
            <Button
              type="submit"
              disabled={submitting || loading}
              className="h-11 gap-2 rounded-lg bg-indigo-600 px-8 font-bold text-white hover:bg-indigo-700"
            >
              {submitting ? (
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
              ) : null}
              שמירת קליטת סחורה
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
