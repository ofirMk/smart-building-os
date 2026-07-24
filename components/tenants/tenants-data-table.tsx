"use client"

import { Phone } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { TenantCrmRow, TenantCrmStatus } from "@/types/tenant-admin"

import { TenantRowActions } from "./tenant-row-actions"

const STATUS_LABEL: Record<TenantCrmStatus, string> = {
  active: "פעיל",
  pending: "ממתין",
  inactive: "לא פעיל",
}

function statusBadgeClass(status: TenantCrmStatus): string {
  switch (status) {
    case "active":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
    case "pending":
      return "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200"
    case "inactive":
      return "border-border bg-muted/70 text-muted-foreground"
    default:
      return ""
  }
}

type TenantsDataTableProps = {
  tenants: TenantCrmRow[]
}

export function TenantsDataTable({ tenants }: TenantsDataTableProps) {
  if (tenants.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center">
        <p className="text-sm font-medium text-foreground">אין דיירים רשומים</p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          כאשר יירשמו דיירים עם תפקיד &quot;דייר&quot; במערכת, הם יופיעו בטבלה זו.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
      <Table dir="rtl">
        <TableHeader className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur-sm supports-[backdrop-filter]:bg-card/80">
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[140px] ps-4 text-start font-semibold">
              שם הדייר
            </TableHead>
            <TableHead className="min-w-[200px] text-start font-semibold">
              אימייל
            </TableHead>
            <TableHead className="min-w-[130px] text-start font-semibold">
              טלפון
            </TableHead>
            <TableHead className="min-w-[160px] text-start font-semibold">
              בניין
            </TableHead>
            <TableHead className="w-[110px] text-start font-semibold">
              מספר דירה
            </TableHead>
            <TableHead className="w-[100px] text-start font-semibold">
              סטטוס
            </TableHead>
            <TableHead className="w-[52px] p-2 pe-4 text-end">
              <span className="sr-only">פעולות</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.map((t) => (
            <TableRow key={t.id} className="group">
              <TableCell className="max-w-[min(280px,28vw)] ps-4 align-middle">
                <span className="font-medium text-foreground">
                  {t.full_name ?? "—"}
                </span>
              </TableCell>
              <TableCell className="align-middle text-muted-foreground">
                <span className="break-all text-sm text-foreground/90">
                  {t.email ?? "—"}
                </span>
              </TableCell>
              <TableCell className="align-middle">
                {t.phone ? (
                  <a
                    href={`tel:${t.phone}`}
                    className="flex items-center gap-1.5 text-sm text-foreground/80 hover:text-primary transition-colors"
                    dir="ltr"
                  >
                    <Phone className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                    {t.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="align-middle text-muted-foreground">
                {t.building_name ?? "—"}
              </TableCell>
              <TableCell className="align-middle tabular-nums text-foreground">
                {t.unit_number ?? "—"}
              </TableCell>
              <TableCell className="align-middle">
                <Badge
                  variant="outline"
                  className={cn(
                    "border px-2 py-0 text-xs font-medium",
                    statusBadgeClass(t.status)
                  )}
                >
                  {STATUS_LABEL[t.status]}
                </Badge>
              </TableCell>
              <TableCell className="p-2 pe-4 text-end align-middle">
                <TenantRowActions tenantId={t.id} tenantName={t.full_name} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
