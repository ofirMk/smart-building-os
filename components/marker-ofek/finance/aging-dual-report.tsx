"use client"

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AgingReport } from "@/lib/marker-ofek/finance/t6-ar-ap-actions"

const FMT = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

function fmt(n: number): string {
  return FMT.format(n)
}

export function AgingDualReport({
  arReport,
  apReport,
  errors,
}: {
  arReport: AgingReport | null
  apReport: AgingReport | null
  errors: { ar: string | null; ap: string | null }
}) {
  const [side, setSide] = useState<"AR" | "AP">("AR")

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">דוח גילאי חוב</h1>
        <p className="text-sm text-muted-foreground">
          חתך פתוח של חייבים (AR) וזכאים (AP) — מבוסס חשבוניות מאושרות שטרם שולמו במלואן.
        </p>
      </header>

      <Tabs
        value={side}
        onValueChange={(v: string) => setSide(v as "AR" | "AP")}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <TabsList>
          <TabsTrigger value="AR">חייבים (AR)</TabsTrigger>
          <TabsTrigger value="AP">זכאים (AP)</TabsTrigger>
        </TabsList>

        <TabsContent value="AR" className="flex min-h-0 flex-1 flex-col gap-3">
          <SidePanel report={arReport} error={errors.ar} side="AR" />
        </TabsContent>
        <TabsContent value="AP" className="flex min-h-0 flex-1 flex-col gap-3">
          <SidePanel report={apReport} error={errors.ap} side="AP" />
        </TabsContent>
      </Tabs>
    </section>
  )
}

function SidePanel({
  report,
  error,
  side,
}: {
  report: AgingReport | null
  error: string | null
  side: "AR" | "AP"
}) {
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        שגיאה: {error}
      </div>
    )
  }
  if (!report) {
    return <div className="text-sm text-muted-foreground">אין נתונים</div>
  }

  const totalLabel = side === "AR" ? "סה״כ פתוח מלקוחות" : "סה״כ פתוח לספקים"

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Card>
          <CardContent className="space-y-1 p-4">
            <div className="text-xs text-muted-foreground">{totalLabel}</div>
            <div className="font-mono text-lg font-semibold text-foreground">
              {fmt(report.totalOpen)}
            </div>
          </CardContent>
        </Card>
        {report.buckets.map((b) => (
          <Card key={b.key}>
            <CardContent className="space-y-1 p-4">
              <div className="text-xs text-muted-foreground">{b.label}</div>
              <div
                className={`font-mono text-lg font-semibold ${
                  b.key === "d91_plus"
                    ? "text-rose-600 dark:text-rose-400"
                    : b.key === "d61_90"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-foreground"
                }`}
              >
                {fmt(b.amount)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {side === "AR" ? "חשבונות לקוח פתוחים" : "חשבוניות ספק פתוחות"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{side === "AR" ? "לקוח" : "ספק"}</TableHead>
                  <TableHead>מסמך</TableHead>
                  <TableHead>תאריך הנפקה</TableHead>
                  <TableHead>תאריך לתשלום</TableHead>
                  <TableHead className="text-end">סכום מלא</TableHead>
                  <TableHead className="text-end">שולם</TableHead>
                  <TableHead className="text-end">פתוח</TableHead>
                  <TableHead className="text-end">איחור</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                      אין יתרות פתוחות 🎉
                    </TableCell>
                  </TableRow>
                ) : (
                  report.rows.map((r) => (
                    <TableRow
                      key={r.documentId}
                      className="transition-colors hover:bg-muted/40"
                    >
                      <TableCell className="max-w-[200px] truncate">{r.entityName}</TableCell>
                      <TableCell className="font-mono text-xs">{r.documentNumber ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.documentDate}</TableCell>
                      <TableCell className="text-xs">{r.dueDate}</TableCell>
                      <TableCell className="text-end font-mono text-sm">{fmt(r.totalAmount)}</TableCell>
                      <TableCell className="text-end font-mono text-sm text-emerald-600 dark:text-emerald-400">
                        {fmt(r.paidAmount)}
                      </TableCell>
                      <TableCell className="text-end font-mono text-sm font-semibold">
                        {fmt(r.openAmount)}
                      </TableCell>
                      <TableCell className="text-end">
                        {r.daysPastDue === 0 ? (
                          <Badge variant="outline">במועד</Badge>
                        ) : (
                          <Badge
                            variant={r.daysPastDue > 60 ? "destructive" : "secondary"}
                            className="font-mono"
                          >
                            {r.daysPastDue}d
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
