"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Package, Plus } from "lucide-react"

import {
  DenseMasterDetailTemplate,
  DenseDetailPanel,
  DenseMasterPanel,
  ERP_DENSE_LABEL_CLASS,
} from "@/components/layout/DenseMasterDetailTemplate"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  PROCUREMENT_DASHBOARD_MOCK_ORDERS,
  type PoStatusEn,
} from "@/lib/marker-ofek/procurement-mock-dashboard-pos"
import { cn } from "@/lib/utils"

function statusHe(s: PoStatusEn): string {
  switch (s) {
    case "Draft":
      return "טיוטה"
    case "Sent":
      return "נשלח"
    case "Received":
      return "התקבל"
    default:
      return s
  }
}

function statusClass(s: PoStatusEn): string {
  switch (s) {
    case "Draft":
      return "bg-slate-100 text-slate-800 ring-1 ring-slate-200"
    case "Sent":
      return "bg-background text-slate-800 ring-1 ring-slate-300"
    case "Received":
      return "bg-card text-foreground ring-1 ring-slate-400"
    default:
      return "bg-slate-100 text-slate-800"
  }
}

function formatIls(n: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n)
}

export default function ProcurementDashboardPage() {
  const router = useRouter()

  return (
    <DenseMasterDetailTemplate
      dir="rtl"
      className="bg-card text-foreground"
      eyebrow="Lightman · רכש"
      title="לוח רכש — חשמל ותשתיות"
      description="הזמנות רכש אחרונות (דמו). פרויקטים: רמת עיר היין (אשקלון), גינדי סביון, ריינבו שדה דב."
      leading={<Package className="size-5 text-slate-700" aria-hidden />}
      backLink={{ href: "/marker-ofek/command-center", label: "מרכז הפיקוד" }}
      headerActions={
        <Link
          href="/marker-ofek/procurement/purchase-orders/new"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-medium text-white",
            "transition-colors duration-200 hover:bg-slate-800"
          )}
        >
          <Plus className="size-3.5" aria-hidden />
          הזמנת רכש חדשה
        </Link>
      }
      master={
        <div className="rounded-md border border-slate-200 bg-card p-2.5 shadow-sm">
          <p className={cn(ERP_DENSE_LABEL_CLASS, "text-slate-600")}>
            סיכום מהיר
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-foreground">
            <span>
              <span className="font-semibold tabular-nums">
                {PROCUREMENT_DASHBOARD_MOCK_ORDERS.length}
              </span>
              <span className="text-slate-600"> רשומות אחרונות</span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-xs text-slate-600">
              תאורה, חשמל חזק, תקשורת, מיזוג — Holden / Marker Ofek
            </span>
          </div>
        </div>
      }
      detail={
        <DenseDetailPanel className="border-slate-200 bg-card p-0 shadow-sm">
          <div className="border-b border-slate-200 bg-card px-2.5 py-2">
            <h2 className="text-start text-sm font-semibold text-foreground">
              הזמנות רכש אחרונות
            </h2>
            <p className="text-[11px] text-slate-600">
              מספר הזמנה · תאריך · פרויקט · ספק · סה״כ · סטטוס — לחיצה פותחת טיוטה
              לעריכה במנוע הזמנה
            </p>
          </div>
          <div className="w-full overflow-x-auto bg-card">
            <Table>
              <TableHeader>
                <TableRow className="h-9 border-slate-200 hover:bg-transparent">
                  <TableHead className="min-w-[7rem] px-2 py-1.5 text-start text-[11px] font-semibold text-slate-700">
                    מס&apos; הזמנה
                  </TableHead>
                  <TableHead className="min-w-[6.5rem] px-2 py-1.5 text-start text-[11px] font-semibold text-slate-700">
                    תאריך
                  </TableHead>
                  <TableHead className="min-w-[9rem] px-2 py-1.5 text-start text-[11px] font-semibold text-slate-700">
                    פרויקט
                  </TableHead>
                  <TableHead className="min-w-[10rem] px-2 py-1.5 text-start text-[11px] font-semibold text-slate-700">
                    ספק
                  </TableHead>
                  <TableHead className="min-w-[7rem] px-2 py-1.5 text-start text-[11px] font-semibold text-slate-700">
                    סה״כ
                  </TableHead>
                  <TableHead className="min-w-[6rem] px-2 py-1.5 text-start text-[11px] font-semibold text-slate-700">
                    סטטוס
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PROCUREMENT_DASHBOARD_MOCK_ORDERS.map((row, i) => (
                  <motion.tr
                    key={row.id}
                    role="link"
                    tabIndex={0}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: i * 0.035,
                      duration: 0.28,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="h-9 cursor-pointer border-slate-100 hover:bg-background/80"
                    onClick={() =>
                      router.push(
                        `/marker-ofek/procurement/purchase-orders/new?mockPo=${encodeURIComponent(row.poNumber)}`
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        router.push(
                          `/marker-ofek/procurement/purchase-orders/new?mockPo=${encodeURIComponent(row.poNumber)}`
                        )
                      }
                    }}
                  >
                    <TableCell className="px-2 py-1.5 font-mono text-xs font-medium text-foreground">
                      {row.poNumber}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-xs tabular-nums text-slate-800">
                      {new Date(row.date).toLocaleDateString("he-IL")}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-xs text-foreground">
                      {row.project}
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate px-2 py-1.5 text-xs text-slate-800">
                      {row.supplier}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-xs font-medium tabular-nums text-foreground">
                      {formatIls(row.totalAmount)}
                    </TableCell>
                    <TableCell className="px-2 py-1.5">
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium",
                          statusClass(row.status)
                        )}
                      >
                        {statusHe(row.status)}
                        <span className="ms-1 text-[10px] opacity-70">
                          ({row.status})
                        </span>
                      </span>
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </div>
        </DenseDetailPanel>
      }
    />
  )
}
