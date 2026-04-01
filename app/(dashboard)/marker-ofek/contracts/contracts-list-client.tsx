"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { ExternalLink, Loader2 } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn, formatError } from "@/lib/utils"

type ContractListRow = {
  id: string
  total_amount: number | null
  status: string
  contract_type: string
  projects:
    | { internal_project_code: string; name: string }
    | { internal_project_code: string; name: string }[]
    | null
  entities: { name: string } | { name: string }[] | null
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

const CONTRACT_LIST_PAGE_SIZE = 50

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function contractTypeLabel(t: string): string {
  if (t === "main_contract") return "חוזה מזמין"
  if (t === "sub_contract") return "חוזה קבלן משנה"
  return t
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: "טיוטה",
    active: "פעיל",
    closed: "סגור",
    terminated: "מבוטל",
  }
  return map[s] ?? s
}

export function ContractsListClient() {
  const router = useRouter()
  const [rows, setRows] = React.useState<ContractListRow[]>([])
  const rowsRef = React.useRef<ContractListRow[]>([])
  React.useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [hasMore, setHasMore] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const loadMoreBusyRef = React.useRef(false)

  const loadFirstPage = React.useCallback(async () => {
    setLoading(true)
    setHasMore(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error: qError } = await supabase
        .from("contracts")
        .select(
          `
            id,
            total_amount,
            status,
            contract_type,
            projects ( internal_project_code, name ),
            entities ( name )
          `
        )
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .range(0, CONTRACT_LIST_PAGE_SIZE - 1)

      if (qError) throw qError
      const batch = (data as ContractListRow[]) ?? []
      setRows(batch)
      setHasMore(batch.length === CONTRACT_LIST_PAGE_SIZE)
    } catch (e) {
      setRows([])
      setHasMore(false)
      setError(formatError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMore = React.useCallback(async () => {
    if (loadMoreBusyRef.current || !hasMore) return
    loadMoreBusyRef.current = true
    setLoadingMore(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const from = rowsRef.current.length
      const { data, error: qError } = await supabase
        .from("contracts")
        .select(
          `
            id,
            total_amount,
            status,
            contract_type,
            projects ( internal_project_code, name ),
            entities ( name )
          `
        )
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .range(from, from + CONTRACT_LIST_PAGE_SIZE - 1)

      if (qError) throw qError
      const batch = (data as ContractListRow[]) ?? []
      setRows((p) => [...p, ...batch])
      setHasMore(batch.length === CONTRACT_LIST_PAGE_SIZE)
    } catch (e) {
      setError(formatError(e))
    } finally {
      loadMoreBusyRef.current = false
      setLoadingMore(false)
    }
  }, [hasMore])

  React.useEffect(() => {
    void loadFirstPage()
  }, [loadFirstPage])

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <span>טוען חוזים…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-8 text-center text-sm text-destructive">
        שגיאה בטעינת החוזים: {error}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="px-4 py-16 text-center text-sm text-muted-foreground">
        אין חוזים במערכת. צרו חוזה חדש כדי להתחיל.
      </div>
    )
  }

  return (
    <div className="space-y-4 px-2 pb-4 pt-2 md:px-4">
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border/60 hover:bg-transparent">
            <TableHead className="text-start font-semibold text-foreground">
              מזהה פרויקט
            </TableHead>
            <TableHead className="text-start font-semibold text-foreground">
              שם ישות
            </TableHead>
            <TableHead className="text-start font-semibold text-foreground">
              סוג חוזה
            </TableHead>
            <TableHead className="text-start font-semibold text-foreground">
              סכום כולל
            </TableHead>
            <TableHead className="text-start font-semibold text-foreground">
              סטטוס
            </TableHead>
            <TableHead className="w-28 text-start font-semibold text-foreground">
              פעולות
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const href = `/marker-ofek/contracts/${row.id}/edit`
            const project = embedOne(row.projects)
            const entity = embedOne(row.entities)
            return (
              <TableRow
                key={row.id}
                className={cn(
                  "cursor-pointer border-border/50 transition-colors",
                  "hover:bg-muted/40 focus-within:bg-muted/40"
                )}
                role="link"
                tabIndex={0}
                onClick={() => router.push(href)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault()
                    router.push(href)
                  }
                }}
              >
                <TableCell className="font-mono text-sm">
                  {project?.internal_project_code ?? "—"}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {entity?.name ?? "—"}
                </TableCell>
                <TableCell>{contractTypeLabel(row.contract_type)}</TableCell>
                <TableCell className="tabular-nums">
                  {row.total_amount != null
                    ? currencyFormatter.format(Number(row.total_amount))
                    : "—"}
                </TableCell>
                <TableCell>{statusLabel(row.status)}</TableCell>
                <TableCell>
                  <Link
                    href={href}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "gap-1"
                    )}
                  >
                    צפייה
                    <ExternalLink className="size-3.5 opacity-70" aria-hidden />
                  </Link>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      </div>
      {hasMore ? (
        <div className="flex justify-center pb-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            className="gap-2"
          >
            {loadingMore ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            טען עוד ({CONTRACT_LIST_PAGE_SIZE})
          </Button>
        </div>
      ) : rows.length > 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          מוצגים {rows.length} חוזים · סוף הרשימה
        </p>
      ) : null}
    </div>
  )
}
