"use client"

import Link from "next/link"
import * as React from "react"
import { Loader2, Plus, Search, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  ErpDataCard,
  ErpDenseHeaderRow,
  ErpDenseTable,
  ErpDenseTableBody,
  ErpDenseTableCell,
  ErpDenseTableHead,
  ErpDenseTableHeader,
  ErpDenseTableRow,
  ErpListBackLink,
  ErpListHeaderRow,
  ErpListPageRoot,
  ErpListTitleBlock,
  ErpListToolbar,
} from "@/components/marker-ofek/data-grid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

const TYPE_LABEL: Record<MoEntityType, string> = {
  client: "מזמין",
  supplier: "ספק",
  subcontractor: "קבלן משנה",
}

export default function MarkerOfekEntitiesPage() {
  const router = useRouter()
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

  function goToEntity(id: string) {
    router.push(`/marker-ofek/entities/${id}`)
  }

  return (
    <ErpListPageRoot>
      <ErpListBackLink href="/marker-ofek">חזרה למרכז מודולים</ErpListBackLink>

      <ErpListHeaderRow
        titleBlock={
          <ErpListTitleBlock
            icon={<Users className="size-5" aria-hidden />}
            title="ישויות עסקיות / ספקים"
            description="מזמינים, ספקים וקבלני משנה — רשימת MDM מאוחדת."
          />
        }
        actions={
          <>
            <Button className="gap-1.5" render={<Link href="/marker-ofek/entities/new" />}>
              <Plus className="size-4" aria-hidden />
              צור חדש
            </Button>
            <Button variant="outline" render={<Link href="/marker-ofek/entities/suppliers" />}>
              ספקים ותאימות מס
            </Button>
          </>
        }
      />

      <ErpDataCard>
        <ErpListToolbar
          filterSlot={
            <Select
              value={tab}
              onValueChange={(v) =>
                setTab(v as (typeof TABS)[number]["id"])
              }
            >
              <SelectTrigger
                dir="rtl"
                className="h-9 w-[min(100%,260px)] text-[13px]"
                aria-label="סינון לפי סוג ישות"
              >
                <SelectValue placeholder="סוג ישות" />
              </SelectTrigger>
              <SelectContent>
                {TABS.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          searchSlot={
            <>
              <Search
                className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                placeholder="חיפוש לפי שם, ח.פ או קוד…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 pe-10 text-[13px]"
                dir="rtl"
                aria-label="חיפוש בישויות"
              />
            </>
          }
        />
        <p className="border-b border-slate-100 px-4 pb-3 text-[12px] text-muted-foreground dark:border-slate-800">
          ליצירה מהירה ניתן גם להשתמש בכפתורי &quot;חדש&quot; בטפסי חוזה / הזמנת רכש.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 px-4 py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            טוען…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <ErpDenseTable>
              <ErpDenseTableHeader>
                <ErpDenseHeaderRow>
                  <ErpDenseTableHead>שם</ErpDenseTableHead>
                  <ErpDenseTableHead>סוג</ErpDenseTableHead>
                  <ErpDenseTableHead>ח.פ</ErpDenseTableHead>
                  <ErpDenseTableHead>קוד</ErpDenseTableHead>
                </ErpDenseHeaderRow>
              </ErpDenseTableHeader>
              <ErpDenseTableBody>
                {filtered.length === 0 ? (
                  <ErpDenseTableRow interactive={false}>
                    <ErpDenseTableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      אין רשומות
                    </ErpDenseTableCell>
                  </ErpDenseTableRow>
                ) : (
                  filtered.map((r) => (
                    <ErpDenseTableRow
                      key={r.id}
                      interactive
                      tabIndex={0}
                      onClick={() => goToEntity(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          goToEntity(r.id)
                        }
                      }}
                    >
                      <ErpDenseTableCell className="font-medium">{r.name}</ErpDenseTableCell>
                      <ErpDenseTableCell>{TYPE_LABEL[r.type] ?? r.type}</ErpDenseTableCell>
                      <ErpDenseTableCell className="font-mono text-[12px]" dir="ltr">
                        {r.legal_id ?? "—"}
                      </ErpDenseTableCell>
                      <ErpDenseTableCell className="font-mono text-[12px]" dir="ltr">
                        {r.mo_entity_code ?? "—"}
                      </ErpDenseTableCell>
                    </ErpDenseTableRow>
                  ))
                )}
              </ErpDenseTableBody>
            </ErpDenseTable>
          </div>
        )}
      </ErpDataCard>
    </ErpListPageRoot>
  )
}
