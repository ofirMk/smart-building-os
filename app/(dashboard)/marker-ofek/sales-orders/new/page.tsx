"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2, Plus, ShoppingBag, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  DenseMasterDetailTemplate,
  ERP_DENSE_INPUT_CLASS,
} from "@/components/layout/DenseMasterDetailTemplate"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const lineExitEase = [0.22, 1, 0.36, 1] as const

const MotionTableRow = motion.tr
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { createSalesOrderAction } from "@/lib/marker-ofek/sales-order-actions"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn, formatError } from "@/lib/utils"

type ClientRow = { id: string; name: string }
type ProjectRow = { id: string; name: string }
type CatalogItem = {
  id: string
  sku: string | null
  description: string
}

type LineRow = {
  key: string
  itemCatalogId: string
  quantity: string
  unitPrice: string
}

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `l-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function parseNum(s: string): number {
  const n = Number(String(s).replace(",", ".").trim())
  return Number.isFinite(n) ? n : 0
}

export default function NewSalesOrderPage() {
  const [clients, setClients] = React.useState<ClientRow[]>([])
  const [projects, setProjects] = React.useState<ProjectRow[]>([])
  const [catalog, setCatalog] = React.useState<CatalogItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)

  const [clientId, setClientId] = React.useState("")
  const [projectId, setProjectId] = React.useState<string>("__none__")
  const [orderDate, setOrderDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [notes, setNotes] = React.useState("")

  const [lines, setLines] = React.useState<LineRow[]>([
    { key: newKey(), itemCatalogId: "", quantity: "1", unitPrice: "0" },
  ])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const [c, p, items] = await Promise.all([
          supabase
            .from("entities")
            .select("id, name")
            .eq("type", "client")
            .eq("is_deleted", false)
            .order("name", { ascending: true })
            .limit(800),
          supabase
            .from("projects")
            .select("id, name")
            .eq("is_deleted", false)
            .order("name", { ascending: true })
            .limit(800),
          Promise.resolve({
            data: await masterDataFetch<Array<{ id: string; sku: string; description: string }>>(
              "/api/erp/master-data/items"
            ),
            error: null,
          }),
        ])
        if (c.error) throw c.error
        if (p.error) throw p.error
        if (items.error) throw items.error
        if (cancelled) return
        setClients((c.data ?? []) as ClientRow[])
        setProjects((p.data ?? []) as ProjectRow[])
        setCatalog((items.data ?? []) as CatalogItem[])
      } catch (e) {
        if (!cancelled) toast.error(formatError(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const catalogById = React.useMemo(() => {
    const m = new Map<string, CatalogItem>()
    for (const it of catalog) m.set(it.id, it)
    return m
  }, [catalog])

  const lineTotals = React.useMemo(() => {
    let sum = 0
    for (const ln of lines) {
      const q = parseNum(ln.quantity)
      const p = parseNum(ln.unitPrice)
      sum += Math.round(q * p * 100) / 100
    }
    return Math.round(sum * 100) / 100
  }, [lines])

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: newKey(), itemCatalogId: "", quantity: "1", unitPrice: "0" },
    ])
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)))
  }

  function patchLine(key: string, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) {
      toast.error("נא לבחור לקוח")
      return
    }
    const payloadLines = lines
      .map((ln) => {
        const it = catalogById.get(ln.itemCatalogId)
        const qty = parseNum(ln.quantity)
        const up = parseNum(ln.unitPrice)
        return {
          itemCatalogId: ln.itemCatalogId.trim(),
          sku: it?.sku ?? null,
          description: it?.description ?? "",
          quantity: qty,
          unitPrice: up,
        }
      })
      .filter((l) => l.itemCatalogId && l.quantity > 0)

    if (payloadLines.length === 0) {
      toast.error("נא למלא לפחות שורה עם פריט וכמות")
      return
    }

    setSubmitting(true)
    try {
      const res = await createSalesOrderAction({
        clientEntityId: clientId,
        projectId:
          projectId && projectId !== "__none__" ? projectId : null,
        orderDate,
        internalNotes: notes.trim() || null,
        lines: payloadLines,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("הזמנת הלקוח נשמרה")
      setNotes("")
      setLines([{ key: newKey(), itemCatalogId: "", quantity: "1", unitPrice: "0" }])
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const currency = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
  })

  const denseField = "space-y-1 text-start"
  const denseLbl = "text-xs font-medium text-muted-foreground"

  return (
    <form onSubmit={onSubmit} className="block w-full min-w-0">
      <DenseMasterDetailTemplate
        title="הזמנת לקוח"
        eyebrow="מכירות"
        description="כותרת (לקוח, תאריך, פרויקט) ושורות פירוט — SKU, תיאור, כמות ומחיר."
        backLink={{ href: "/marker-ofek/command-center", label: "מרכז הפיקוד" }}
        leading={<ShoppingBag className="size-5" aria-hidden />}
        headerActions={
          <Button
            type="submit"
            size="sm"
            disabled={submitting || loading}
            className="min-w-[9rem] gap-1.5"
          >
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <ShoppingBag className="size-3.5" aria-hidden />
            )}
            שמירת הזמנה
          </Button>
        }
        master={
          <Tabs defaultValue="header" className="w-full">
            <TabsList className="grid h-8 w-full max-w-lg grid-cols-2 p-0.5">
              <TabsTrigger value="header" className="px-2 text-xs">
                כותרת
              </TabsTrigger>
              <TabsTrigger value="notes" className="px-2 text-xs">
                הערות וסיכום
              </TabsTrigger>
            </TabsList>
            <TabsContent value="header" className="mt-2 focus-visible:outline-none">
              <div className="grid gap-2 md:grid-cols-2">
                <div className={cn(denseField, "md:col-span-2")}>
                  <Label htmlFor="client" className={denseLbl}>
                    לקוח
                  </Label>
                  <Select
                    value={clientId || undefined}
                    onValueChange={(v) => setClientId(v ?? "")}
                    disabled={loading || submitting}
                  >
                    <SelectTrigger id="client" className={cn(ERP_DENSE_INPUT_CLASS)}>
                      <SelectValue placeholder={loading ? "טוען…" : "בחרו לקוח"} />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={denseField}>
                  <Label htmlFor="orderDate" className={denseLbl}>
                    תאריך הזמנה
                  </Label>
                  <Input
                    id="orderDate"
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    disabled={submitting}
                    className={cn("font-mono", ERP_DENSE_INPUT_CLASS)}
                    dir="ltr"
                  />
                </div>
                <div className={denseField}>
                  <Label htmlFor="project" className={denseLbl}>
                    פרויקט (אופציונלי)
                  </Label>
                  <Select
                    value={projectId}
                    onValueChange={(v) => setProjectId(v ?? "__none__")}
                    disabled={loading || submitting}
                  >
                    <SelectTrigger id="project" className={cn(ERP_DENSE_INPUT_CLASS)}>
                      <SelectValue placeholder="ללא פרויקט" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">ללא פרויקט</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="notes" className="mt-2 focus-visible:outline-none">
              <div className="grid gap-2">
                <div className={denseField}>
                  <Label htmlFor="notes" className={denseLbl}>
                    הערות פנימיות
                  </Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={submitting}
                    rows={2}
                    className="min-h-[3.25rem] resize-y px-2 py-1.5 text-sm leading-snug"
                  />
                </div>
                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5"
                  )}
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    סה״כ הזמנה (מחושב)
                  </span>
                  <span className="font-currency-mono text-sm font-semibold tabular-nums text-foreground">
                    {currency.format(lineTotals)}
                  </span>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        }
        detail={
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 px-0 pb-1.5 pt-0 text-start">
              <div>
                <CardTitle className="text-sm">שורות הזמנה</CardTitle>
                <CardDescription className="text-xs">
                  פריטים מקטלוג — כמות ומחיר ליחידה
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-2 text-xs"
                onClick={addLine}
                disabled={submitting || loading}
              >
                <Plus className="size-3.5" aria-hidden />
                שורה
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto px-0 pb-0 pt-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 min-w-[200px] px-1.5 text-start text-xs">
                      פריט
                    </TableHead>
                    <TableHead className="h-8 w-24 px-1.5 text-start text-xs">
                      מק״ט
                    </TableHead>
                    <TableHead className="h-8 min-w-[160px] px-1.5 text-start text-xs">
                      תיאור
                    </TableHead>
                    <TableHead className="h-8 w-24 px-1.5 text-start text-xs">
                      כמות
                    </TableHead>
                    <TableHead className="h-8 w-28 px-1.5 text-start text-xs">
                      מחיר יחידה
                    </TableHead>
                    <TableHead className="h-8 w-24 px-1.5 text-start text-xs">
                      סה״כ שורה
                    </TableHead>
                    <TableHead className="h-8 w-10 px-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence initial={false} mode="popLayout">
                  {lines.map((ln) => {
                    const it = ln.itemCatalogId
                      ? catalogById.get(ln.itemCatalogId)
                      : undefined
                    const q = parseNum(ln.quantity)
                    const p = parseNum(ln.unitPrice)
                    const rowTot = Math.round(q * p * 100) / 100
                    return (
                      <MotionTableRow
                        key={ln.key}
                        layout
                        initial={false}
                        exit={{
                          opacity: 0,
                          scale: 0.98,
                          transition: { duration: 0.22, ease: lineExitEase },
                        }}
                        transition={{
                          layout: { duration: 0.24, ease: lineExitEase },
                        }}
                        className="hover:bg-muted/30"
                        style={{ display: "table-row" }}
                      >
                        <TableCell className="align-top px-1.5 py-1">
                          <Select
                            value={ln.itemCatalogId || undefined}
                            onValueChange={(v) =>
                              patchLine(ln.key, { itemCatalogId: v ?? "" })
                            }
                            disabled={submitting || loading}
                          >
                            <SelectTrigger
                              className={cn(
                                ERP_DENSE_INPUT_CLASS,
                                "h-8 w-full min-w-[11rem]"
                              )}
                            >
                              <SelectValue placeholder="בחרו פריט" />
                            </SelectTrigger>
                            <SelectContent>
                              {catalog.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {(c.description || "").slice(0, 80)}
                                  {c.sku ? ` · ${c.sku}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="align-top px-1.5 py-1 text-start text-xs text-muted-foreground">
                          {it?.sku ?? "—"}
                        </TableCell>
                        <TableCell className="align-top px-1.5 py-1 text-start text-xs">
                          {it?.description ?? "—"}
                        </TableCell>
                        <TableCell className="align-top px-1.5 py-1">
                          <Input
                            className={cn(ERP_DENSE_INPUT_CLASS, "tabular-nums")}
                            dir="ltr"
                            inputMode="decimal"
                            value={ln.quantity}
                            onChange={(e) =>
                              patchLine(ln.key, { quantity: e.target.value })
                            }
                            disabled={submitting}
                          />
                        </TableCell>
                        <TableCell className="align-top px-1.5 py-1">
                          <Input
                            className={cn(ERP_DENSE_INPUT_CLASS, "tabular-nums")}
                            dir="ltr"
                            inputMode="decimal"
                            value={ln.unitPrice}
                            onChange={(e) =>
                              patchLine(ln.key, { unitPrice: e.target.value })
                            }
                            disabled={submitting}
                          />
                        </TableCell>
                        <TableCell className="align-top px-1.5 py-1 text-xs font-medium tabular-nums">
                          {currency.format(rowTot)}
                        </TableCell>
                        <TableCell className="align-top px-0 py-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeLine(ln.key)}
                            disabled={submitting || lines.length <= 1}
                            aria-label="מחק שורה"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      </MotionTableRow>
                    )
                  })}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        }
      />
    </form>
  )
}
