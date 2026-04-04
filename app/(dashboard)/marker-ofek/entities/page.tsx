"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, Loader2, Plus, Search, Users } from "lucide-react"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"
import type { MoEntityType } from "@/types/marker-ofek"

type Row = {
  id: string
  name: string
  type: MoEntityType
  legal_id: string | null
  mo_entity_code: string | null
}

const TABS: { id: MoEntityType | "all"; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "client", label: "מזמינים" },
  { id: "supplier", label: "ספקים" },
  { id: "subcontractor", label: "קבלנים משנה" },
]

export default function MarkerOfekEntitiesPage() {
  const [tab, setTab] = React.useState<(typeof TABS)[number]["id"]>("all")
  const [query, setQuery] = React.useState("")
  const [rows, setRows] = React.useState<Row[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const supabase = createSupabaseBrowserClient()
        let q = supabase
          .from("entities")
          .select("id,name,type,legal_id,mo_entity_code")
          .eq("is_deleted", false)
          .order("name", { ascending: true })
          .limit(800)
        if (tab !== "all") {
          q = q.eq("type", tab)
        }
        const { data, error } = await q
        if (error) throw error
        if (!cancelled) setRows((data ?? []) as Row[])
      } catch (e) {
        if (!cancelled) {
          setRows([])
          toast.error(formatError(e))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.legal_id ?? "").toLowerCase().includes(q) ||
        (r.mo_entity_code ?? "").toLowerCase().includes(q)
    )
  }, [rows, query])

  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-12 pt-2"
    >
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה למרכז מודולים
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-teal-500/15 text-teal-700 dark:text-teal-400">
            <Users className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ישויות (MDM)</h1>
            <p className="text-sm text-muted-foreground">
              לקוחות, ספקים וקבלני משנה — רשימה מאוחדת.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="gap-1" render={<Link href="/marker-ofek/entities/new" />}>
            <Plus className="size-4" aria-hidden />
            ישות חדשה
          </Button>
          <Button variant="outline" render={<Link href="/marker-ofek/entities/suppliers" />}>
            מסך ספקים ותאימות מס
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Button
                key={t.id}
                type="button"
                size="sm"
                variant={tab === t.id ? "default" : "outline"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם, ח.פ או קוד…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pe-10"
              dir="rtl"
            />
          </div>
          <CardDescription>
            ליצירה מהירה השתמשו בכפתורי &quot;חדש&quot; בטפסי חוזה / הזמנת רכש.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              טוען…
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">שם</TableHead>
                    <TableHead className="text-start">סוג</TableHead>
                    <TableHead className="text-start">ח.פ</TableHead>
                    <TableHead className="text-start">קוד</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        אין רשומות
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.type}</TableCell>
                        <TableCell className="font-mono text-xs" dir="ltr">
                          {r.legal_id ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs" dir="ltr">
                          {r.mo_entity_code ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
