"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  Flame,
  FolderKanban,
  ShieldCheck,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
}

const item = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
  },
}

const KPI = [
  {
    key: "projects",
    label: "פרויקטים פעילים",
    value: "14",
    sub: "מתוך 18 בתיק",
    icon: FolderKanban,
  },
  {
    key: "burn",
    label: "שורף חודשי (₪)",
    value: "₪18.2M",
    sub: "ממוצע 3 חודשים",
    icon: Flame,
  },
  {
    key: "pos",
    label: "הזמנות רכש פתוחות",
    value: "47",
    sub: "ממתינות לאספקה / חלקית",
    icon: ClipboardList,
  },
  {
    key: "appr",
    label: "אישורים ממתינים",
    value: "6",
    sub: "PO / חשבונות חלקיים",
    icon: ShieldCheck,
  },
] as const

const MOCK_SUB_BILLS = [
  {
    id: "1",
    billNo: "ח\"ח 2025-441",
    project: "רמת עיר היין",
    subcontractor: 'י.ב. שלד חשמלי בע"מ',
    amount: 312_400,
    status: "בביקורת",
  },
  {
    id: "2",
    billNo: "ח\"ח 2025-438",
    project: "גינדי סביון",
    subcontractor: "חשמל ישיר",
    amount: 198_900,
    status: "אושר",
  },
  {
    id: "3",
    billNo: "ח\"ח 2025-429",
    project: "ריינבו שדה דב",
    subcontractor: 'א.א. מערכות בע"מ',
    amount: 524_000,
    status: "בביקורת",
  },
  {
    id: "4",
    billNo: "ח\"ח 2025-415",
    project: "רמת עיר היין",
    subcontractor: "תאורה תעשייתית פלוס",
    amount: 87_200,
    status: "אושר",
  },
  {
    id: "5",
    billNo: "ח\"ח 2025-402",
    project: "גינדי סביון",
    subcontractor: "כבלי נחושת וצינורות",
    amount: 156_780,
    status: "נדחה",
  },
] as const

const MOCK_BUDGET_ALERTS = [
  {
    id: "a1",
    project: "רמת עיר היין",
    phase: "גוף B — חשמל",
    pct: 92,
    cap: "₪42.1M",
  },
  {
    id: "a2",
    project: "גינדי סביון",
    phase: "ליבת MEP",
    pct: 88,
    cap: "₪28.4M",
  },
  {
    id: "a3",
    project: "ריינבו שדה דב",
    phase: "תאורה חיצונית",
    pct: 81,
    cap: "₪11.2M",
  },
  {
    id: "a4",
    project: "רמת עיר היין",
    phase: "גנרטור ו-UPS",
    pct: 76,
    cap: "₪6.8M",
  },
] as const

function formatIls(n: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n)
}

export function CommandCenterLightman() {
  return (
    <div
      dir="rtl"
      className="flex w-full min-w-0 max-w-none flex-col gap-4 bg-card text-foreground"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Lightman ERP · Holden Group
          </p>
          <h1 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
            מרכז הפיקוד
          </h1>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-600">
            תמונת מצב תפעולית — נתוני דמו; חיבור למסד יופעל בהמשך.
          </p>
        </div>
        <Link
          href="/marker-ofek/procurement"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-card px-3 text-xs font-medium text-slate-800",
            "shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow"
          )}
        >
          <ArrowLeft className="size-3.5 rotate-180" aria-hidden />
          מעבר לרכש
        </Link>
      </div>

      <motion.section
        className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {KPI.map((k) => (
          <motion.div key={k.key} variants={item} layout={false}>
            <Card className="border-slate-200 bg-card shadow-sm transition-shadow duration-200 hover:shadow-md">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-1.5 pt-3">
                <CardTitle className="text-[11px] font-medium text-slate-500">
                  {k.label}
                </CardTitle>
                <k.icon className="size-4 text-slate-400" aria-hidden />
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {k.value}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">{k.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.section>

      <section className="grid gap-3 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-lg border border-slate-200 bg-card shadow-sm"
        >
          <div className="border-b border-slate-200 px-3 py-2">
            <h2 className="text-sm font-semibold text-foreground">
              חשבונות קבלני משנה — אחרונים
            </h2>
            <p className="text-[11px] text-slate-500">דמו · ללא מסד נתונים</p>
          </div>
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-9 border-slate-200 hover:bg-transparent">
                  <TableHead className="px-2 text-[11px] font-semibold">מספר</TableHead>
                  <TableHead className="px-2 text-[11px] font-semibold">פרויקט</TableHead>
                  <TableHead className="px-2 text-[11px] font-semibold">קבלן</TableHead>
                  <TableHead className="px-2 text-[11px] font-semibold">סכום</TableHead>
                  <TableHead className="px-2 text-[11px] font-semibold">סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_SUB_BILLS.map((r, i) => (
                  <motion.tr
                    key={r.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: 0.12 + i * 0.04,
                      duration: 0.25,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="h-9 border-slate-100 hover:bg-background/90"
                  >
                    <TableCell className="px-2 py-1.5 font-mono text-[11px]">
                      {r.billNo}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-xs">{r.project}</TableCell>
                    <TableCell className="max-w-[8rem] truncate px-2 py-1.5 text-xs">
                      {r.subcontractor}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-xs tabular-nums">
                      {formatIls(r.amount)}
                    </TableCell>
                    <TableCell className="px-2 py-1.5">
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-800 ring-1 ring-slate-200">
                        {r.status}
                      </span>
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-lg border border-slate-200 bg-card shadow-sm"
        >
          <div className="border-b border-slate-200 px-3 py-2">
            <h2 className="text-sm font-semibold text-foreground">התראות תקציב</h2>
            <p className="text-[11px] text-slate-500">
              פרויקטים הקרובים לתקרת ביצוע
            </p>
          </div>
          <ul className="divide-y divide-slate-100 p-2">
            {MOCK_BUDGET_ALERTS.map((a, i) => (
              <motion.li
                key={a.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
                className="flex flex-wrap items-start gap-2 rounded-md px-2 py-2 transition-colors hover:bg-background"
              >
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-slate-600"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">{a.project}</p>
                  <p className="text-[11px] text-slate-600">{a.phase}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <div className="h-1.5 min-w-[6rem] flex-1 overflow-hidden rounded-full bg-slate-100">
                      <motion.div
                        className="h-full rounded-full bg-slate-700"
                        initial={{ width: 0 }}
                        animate={{ width: `${a.pct}%` }}
                        transition={{
                          duration: 0.8,
                          delay: 0.3 + i * 0.08,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      />
                    </div>
                    <span className="text-[11px] tabular-nums text-slate-700">
                      {a.pct}% · תקרה {a.cap}
                    </span>
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </section>
    </div>
  )
}
