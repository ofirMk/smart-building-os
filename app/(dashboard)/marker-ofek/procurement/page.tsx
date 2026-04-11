"use client"

import Link from "next/link"
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
import { cn } from "@/lib/utils"

type PoStatusEn = "Draft" | "Sent" | "Received"

type MockPurchaseOrder = {
  id: string
  poNumber: string
  date: string
  project: string
  supplier: string
  totalAmount: number
  status: PoStatusEn
}

/** Mock — אשקלון, סביון, שדה דב + תשתיות חשמל */
const MOCK_RECENT_PURCHASE_ORDERS: MockPurchaseOrder[] = [
  {
    id: "1",
    poNumber: "PO-2025-0152",
    date: "2025-12-01",
    project: "רמת עיר היין",
    supplier: "חשמל ישיר",
    totalAmount: 224_800,
    status: "Sent",
  },
  {
    id: "2",
    poNumber: "PO-2025-0148",
    date: "2025-11-28",
    project: "גינדי סביון",
    supplier: 'א.א. מערכות בע"מ',
    totalAmount: 318_400,
    status: "Received",
  },
  {
    id: "3",
    poNumber: "PO-2025-0141",
    date: "2025-11-22",
    project: "ריינבו שדה דב",
    supplier: "תאורת חירום וכבלי נחושת",
    totalAmount: 96_200,
    status: "Draft",
  },
  {
    id: "4",
    poNumber: "PO-2025-0138",
    date: "2025-11-18",
    project: "רמת עיר היין",
    supplier: "מסגרות תאורה — אגף B",
    totalAmount: 72_500,
    status: "Draft",
  },
  {
    id: "5",
    poNumber: "PO-2025-0124",
    date: "2025-10-30",
    project: "גינדי סביון",
    supplier: "כבישים ותשתיות דרום בע״מ",
    totalAmount: 512_000,
    status: "Received",
  },
  {
    id: "6",
    poNumber: "PO-2025-0110",
    date: "2025-10-12",
    project: "ריינבו שדה דב",
    supplier: "תקשורת וסיבים אופטיים",
    totalAmount: 188_900,
    status: "Sent",
  },
  {
    id: "7",
    poNumber: "PO-2025-0097",
    date: "2025-09-05",
    project: "רמת עיר היין",
    supplier: "מסגרות ודלתות תעשייתיות",
    totalAmount: 128_400,
    status: "Received",
  },
  {
    id: "8",
    poNumber: "PO-2025-0083",
    date: "2025-08-21",
    project: "גינדי סביון",
    supplier: "מיזוג ואוורור — צוות 3",
    totalAmount: 265_750,
    status: "Sent",
  },
]

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
      return "bg-slate-50 text-slate-800 ring-1 ring-slate-300"
    case "Received":
      return "bg-white text-slate-900 ring-1 ring-slate-400"
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
  return (
    <DenseMasterDetailTemplate
      dir="rtl"
      className="bg-white text-slate-900"
      eyebrow="Lightman · רכש"
      title="לוח רכש — חשמל ותשתיות"
      description="הזמנות רכש אחרונות (דמו). פרויקטים: רמת עיר היין (אשקלון), גינדי סביון, ריינבו שדה דב."
      leading={<Package className="size-5 text-slate-700" aria-hidden />}
      backLink={{ href: "/marker-ofek/command-center", label: "מרכז הפיקוד" }}
      headerActions={
        <Link
          href="/marker-ofek/procurement/purchase-order-delivery-flow"
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
        <div className="rounded-md border border-slate-200 bg-white p-2.5 shadow-sm">
          <p className={cn(ERP_DENSE_LABEL_CLASS, "text-slate-600")}>
            סיכום מהיר
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-slate-900">
            <span>
              <span className="font-semibold tabular-nums">
                {MOCK_RECENT_PURCHASE_ORDERS.length}
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
        <DenseDetailPanel className="border-slate-200 bg-white p-0 shadow-sm">
          <div className="border-b border-slate-200 bg-white px-2.5 py-2">
            <h2 className="text-start text-sm font-semibold text-slate-900">
              הזמנות רכש אחרונות
            </h2>
            <p className="text-[11px] text-slate-600">
              מספר הזמנה · תאריך · פרויקט · ספק · סה״כ · סטטוס
            </p>
          </div>
          <div className="w-full overflow-x-auto bg-white">
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
                {MOCK_RECENT_PURCHASE_ORDERS.map((row, i) => (
                  <motion.tr
                    key={row.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: i * 0.035,
                      duration: 0.28,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="h-9 border-slate-100 hover:bg-slate-50/80"
                  >
                    <TableCell className="px-2 py-1.5 font-mono text-xs font-medium text-slate-900">
                      {row.poNumber}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-xs tabular-nums text-slate-800">
                      {new Date(row.date).toLocaleDateString("he-IL")}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-xs text-slate-900">
                      {row.project}
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate px-2 py-1.5 text-xs text-slate-800">
                      {row.supplier}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-xs font-medium tabular-nums text-slate-900">
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
