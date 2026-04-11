"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { BarChart3 } from "lucide-react"

import {
  DenseMasterDetailTemplate,
  DenseDetailPanel,
  DenseMasterPanel,
  ERP_DENSE_INPUT_CLASS,
  ERP_DENSE_LABEL_CLASS,
} from "@/components/layout/DenseMasterDetailTemplate"
import { Label } from "@/components/ui/label"
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
import { cn } from "@/lib/utils"

const PROJECTS = [
  { id: "p1", name: "רמת עיר היין", totalBudget: 420_000_000, actualSpent: 318_400_000 },
  { id: "p2", name: "גינדי סביון", totalBudget: 285_000_000, actualSpent: 201_200_000 },
  { id: "p3", name: "ריינבו שדה דב", totalBudget: 112_000_000, actualSpent: 74_800_000 },
] as const

type WbsRow = {
  code: string
  name: string
  budget: number
  committed: number
  actual: number
}

const WBS_BY_PROJECT: Record<string, WbsRow[]> = {
  p1: [
    {
      code: "1.0",
      name: "שלד חשמלי — קומות מגורים",
      budget: 88_000_000,
      committed: 72_400_000,
      actual: 68_200_000,
    },
    {
      code: "1.1",
      name: "תאורה פנימית + חירום",
      budget: 42_000_000,
      committed: 38_100_000,
      actual: 35_800_000,
    },
    {
      code: "2.0",
      name: "תקשורת נתונים וסיבים",
      budget: 28_000_000,
      committed: 24_500_000,
      actual: 22_100_000,
    },
    {
      code: "2.1",
      name: "מיזוג אוויר — צ׳ילרים",
      budget: 56_000_000,
      committed: 51_200_000,
      actual: 48_900_000,
    },
    {
      code: "3.0",
      name: "גנרטור + UPS קריטי",
      budget: 18_500_000,
      committed: 17_800_000,
      actual: 16_400_000,
    },
  ],
  p2: [
    {
      code: "1.0",
      name: "מערכות MEP ליבה",
      budget: 120_000_000,
      committed: 98_000_000,
      actual: 91_500_000,
    },
    {
      code: "1.2",
      name: "חניון — תאורה וניהול אנרגיה",
      budget: 34_000_000,
      committed: 29_400_000,
      actual: 27_200_000,
    },
    {
      code: "2.0",
      name: "מעליות וחדרי משאבות",
      budget: 22_000_000,
      committed: 19_100_000,
      actual: 18_000_000,
    },
  ],
  p3: [
    {
      code: "1.0",
      name: "חזית — תאורה אדריכלית",
      budget: 24_000_000,
      committed: 19_800_000,
      actual: 17_200_000,
    },
    {
      code: "1.1",
      name: "חשמל חזק — קומות מסחר",
      budget: 31_000_000,
      committed: 26_400_000,
      actual: 24_100_000,
    },
    {
      code: "2.0",
      name: "מערכות בקרה BMS",
      budget: 15_000_000,
      committed: 11_200_000,
      actual: 9_800_000,
    },
  ],
}

function formatIls(n: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n)
}

function varianceOf(r: WbsRow) {
  return r.budget - r.actual
}

export default function BudgetControlPage() {
  const [projectId, setProjectId] = React.useState<string>(PROJECTS[0].id)
  const project = PROJECTS.find((p) => p.id === projectId) ?? PROJECTS[0]
  const rows = WBS_BY_PROJECT[projectId] ?? []
  const pctSpent =
    project.totalBudget > 0
      ? Math.round((project.actualSpent / project.totalBudget) * 1000) / 10
      : 0

  return (
    <DenseMasterDetailTemplate
      dir="rtl"
      className="bg-white text-slate-900"
      eyebrow="Lightman · תקציב"
      title="בקרת תקציב פרויקט"
      description="תקציב מתוכנן מול ביצוע — WBS מפורט (דמו). ללא חיבור למסד."
      leading={<BarChart3 className="size-5 text-slate-700" aria-hidden />}
      backLink={{ href: "/marker-ofek/command-center", label: "מרכז הפיקוד" }}
      master={
        <div className="grid gap-3 md:grid-cols-[minmax(0,14rem)_1fr]">
          <div className="grid gap-1">
            <Label className={ERP_DENSE_LABEL_CLASS}>פרויקט</Label>
            <Select
              value={projectId}
              onValueChange={(v) => {
                if (v) setProjectId(v)
              }}
            >
              <SelectTrigger className={cn(ERP_DENSE_INPUT_CLASS, "w-full bg-white")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECTS.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-sm">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <motion.div
            key={projectId}
            initial={{ opacity: 0.85, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="grid gap-2 sm:grid-cols-3"
          >
            <div className="rounded-md border border-slate-200 bg-slate-50/80 p-2.5">
              <p className="text-[11px] font-medium text-slate-500">תקציב כולל</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                {formatIls(project.totalBudget)}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-2.5">
              <p className="text-[11px] font-medium text-slate-500">בוצע בפועל</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                {formatIls(project.actualSpent)}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-2.5">
              <p className="text-[11px] font-medium text-slate-500">ניצול מצטבר</p>
              <div className="mt-1 flex items-center gap-1.5">
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <motion.div
                    className="h-full rounded-full bg-slate-700"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(pctSpent, 100)}%` }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <span className="text-xs font-semibold tabular-nums text-slate-800">
                  {pctSpent}%
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      }
      detail={
        <DenseDetailPanel className="border-slate-200 bg-white p-0 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-2.5 py-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                מבנה WBS — תקציב מול התחייבויות וביצוע
              </h2>
              <p className="text-[11px] text-slate-600">
                עמודות: קוד, תיאור, תקציב, התחייבות (PO), בפועל (חשבונות), וריאנס
              </p>
            </div>
            <Link
              href="/marker-ofek/procurement"
              className="text-[11px] font-medium text-slate-700 underline-offset-2 hover:underline"
            >
              מעבר לרכש
            </Link>
          </div>
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-9 border-slate-200 hover:bg-transparent">
                  <TableHead className="px-2 text-[11px] font-semibold">קוד</TableHead>
                  <TableHead className="min-w-[12rem] px-2 text-[11px] font-semibold">
                    תיאור WBS
                  </TableHead>
                  <TableHead className="px-2 text-[11px] font-semibold">תקציב</TableHead>
                  <TableHead className="px-2 text-[11px] font-semibold">
                    התחייבות (PO)
                  </TableHead>
                  <TableHead className="px-2 text-[11px] font-semibold">
                    בפועל (חשבונות)
                  </TableHead>
                  <TableHead className="px-2 text-[11px] font-semibold">וריאנס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const v = varianceOf(r)
                  const neg = v < 0
                  return (
                    <motion.tr
                      key={`${projectId}-${r.code}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: i * 0.04,
                        duration: 0.25,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="h-9 border-slate-100 hover:bg-slate-50/90"
                    >
                      <TableCell className="px-2 py-1.5 font-mono text-[11px] text-slate-800">
                        {r.code}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-xs text-slate-900">
                        {r.name}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-xs tabular-nums">
                        {formatIls(r.budget)}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-xs tabular-nums text-slate-800">
                        {formatIls(r.committed)}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-xs tabular-nums text-slate-800">
                        {formatIls(r.actual)}
                      </TableCell>
                      <TableCell className="px-2 py-1.5">
                        <span
                          className={cn(
                            "text-xs font-medium tabular-nums",
                            neg ? "text-slate-600" : "text-slate-900"
                          )}
                        >
                          {neg ? "▼ " : "▲ "}
                          {formatIls(v)}
                        </span>
                      </TableCell>
                    </motion.tr>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </DenseDetailPanel>
      }
    />
  )
}
