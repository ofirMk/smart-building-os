"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, CheckCircle2, Loader2, Link2 } from "lucide-react"
import { toast } from "sonner"

import { assignImportProfitCenter, listMarkerOfekProjectsForImport } from "../actions"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/format-error"

type PendingImportRow = {
  id: string
  supplier_name: string | null
  issue_date: string | null
  subtotal: number
  document_title: string | null
  allocation_status: string | null
}

export default function PendingAllocationPage() {
  const [rows, setRows] = React.useState<PendingImportRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [savingId, setSavingId] = React.useState<string | null>(null)
  const [projectOptions, setProjectOptions] = React.useState<
    Array<{ id: string; name: string; internal_project_code: string }>
  >([])
  const [selectedByImport, setSelectedByImport] = React.useState<Record<string, string>>({})

  const currencyFormatter = React.useMemo(
    () =>
      new Intl.NumberFormat("he-IL", {
        style: "currency",
        currency: "ILS",
        minimumFractionDigits: 2,
      }),
    []
  )

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase
        .from("mo_supplier_invoice_imports")
        .select("id, supplier_name, issue_date, subtotal, document_title, allocation_status")
        .is("profit_center_id", null)
        .order("created_at", { ascending: false })
        .limit(200)
      if (error) throw error
      setRows((data ?? []) as PendingImportRow[])
    } catch (e) {
      toast.error(formatError(e))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    let cancelled = false
    void listMarkerOfekProjectsForImport().then((r) => {
      if (cancelled) return
      if (r.ok) setProjectOptions(r.projects)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleAllocate(importId: string) {
    const projectId = selectedByImport[importId]?.trim()
    if (!projectId) {
      toast.error("בחרו מרכז רווח לפני שיוך")
      return
    }
    setSavingId(importId)
    try {
      const res = await assignImportProfitCenter({
        importId,
        profitCenterId: projectId,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("המסמך שויך למרכז רווח")
      await load()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-12">
      <Link
        href="/marker-ofek/procurement/ai-import"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לקליטת חשבונית AI
      </Link>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>Pending Allocation - מסמכים ממתינים לשיוך</CardTitle>
          <CardDescription>
            עדכון עלויות/תקציב יבוצע רק אחרי שיוך למרכז רווח (Profit Center).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              טוען מסמכים…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              אין מסמכים ממתינים — כל החשבוניות כבר משויכות.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">ספק</TableHead>
                    <TableHead className="text-start">מסמך</TableHead>
                    <TableHead className="text-start">תאריך</TableHead>
                    <TableHead className="text-start">סכום</TableHead>
                    <TableHead className="text-start">מרכז רווח</TableHead>
                    <TableHead className="text-start">פעולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.supplier_name?.trim() || "—"}</TableCell>
                      <TableCell className="max-w-[280px] truncate">
                        {r.document_title?.trim() || "—"}
                      </TableCell>
                      <TableCell>{r.issue_date || "—"}</TableCell>
                      <TableCell className="tabular-nums">
                        {currencyFormatter.format(Number(r.subtotal) || 0)}
                      </TableCell>
                      <TableCell className="min-w-[260px]">
                        <Select
                          value={selectedByImport[r.id] || undefined}
                          onValueChange={(v) =>
                            setSelectedByImport((prev) => ({ ...prev, [r.id]: v ?? "" }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="בחרו פרויקט / מרכז רווח" />
                          </SelectTrigger>
                          <SelectContent>
                            {projectOptions.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {`${p.internal_project_code} — ${p.name}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1.5"
                          disabled={savingId === r.id}
                          onClick={() => void handleAllocate(r.id)}
                        >
                          {savingId === r.id ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Link2 className="size-3.5" aria-hidden />
                          )}
                          שיוך
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!loading && rows.length > 0 ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 className="size-3.5" aria-hidden />
              לאחר שיוך, המסמך עובר מ־Pending Allocation.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
