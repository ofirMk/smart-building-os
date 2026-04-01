import { Wallet } from "lucide-react"

import { formatIls } from "@/lib/billing-format"
import { getMyInvoices } from "@/lib/billing-tenant"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

function formatDue(iso: string) {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "medium",
      timeZone: "Asia/Jerusalem",
    }).format(new Date(iso + "T12:00:00"))
  } catch {
    return iso
  }
}

export default async function TenantBillingPage() {
  const { data: invoices, error } = await getMyInvoices()

  if (error) {
    return (
      <div
        className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-6 text-start"
        dir="rtl"
        role="alert"
      >
        <p className="font-semibold text-destructive">לא ניתן לטעון חיובים</p>
        <p className="mt-1 text-sm text-destructive/90">{error}</p>
      </div>
    )
  }

  const list = invoices ?? []

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      <header className="space-y-1 text-start">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          כספים
        </p>
        <div className="flex items-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Wallet className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">החיובים שלי</h1>
            <p className="text-sm text-muted-foreground">
              סטטוס תשלומים ויתרות לפי רישומי הנכס.
            </p>
          </div>
        </div>
      </header>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/50 pb-3">
          <CardTitle className="text-base">רשימת חיובים</CardTitle>
          <CardDescription>
            <span className="text-emerald-700 dark:text-emerald-400">שולם</span> —{" "}
            <span className="text-destructive">ממתין לתשלום</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {list.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              אין חיובים רשומים עבורכם כרגע.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[120px] ps-3 text-start">
                      תיאור
                    </TableHead>
                    <TableHead className="text-start">סכום</TableHead>
                    <TableHead className="text-start">יעד תשלום</TableHead>
                    <TableHead className="pe-3 text-start">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((inv) => {
                    const paid = inv.status === "paid"
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="max-w-[200px] ps-3 break-words font-medium">
                          {inv.description}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "tabular-nums font-semibold",
                            paid ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"
                          )}
                        >
                          {formatIls(inv.amount)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "tabular-nums text-sm",
                            paid ? "text-muted-foreground" : "text-destructive"
                          )}
                        >
                          {formatDue(inv.due_date)}
                        </TableCell>
                        <TableCell className="pe-3">
                          {paid ? (
                            <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
                              שולם
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-destructive/45 bg-destructive/10 text-destructive"
                            >
                              ממתין
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
