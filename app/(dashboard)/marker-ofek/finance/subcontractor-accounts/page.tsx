"use client"

import * as React from "react"
import { FileSpreadsheet, Printer, Save } from "lucide-react"

import {
  DenseMasterDetailTemplate,
  ERP_DENSE_INPUT_CLASS,
  ERP_DENSE_LABEL_CLASS,
} from "@/components/layout/DenseMasterDetailTemplate"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

// --- Mock catalog (Israeli construction — no DB) ---------------------------------

const MOCK_PROJECTS = [
  { id: "pr-wine", name: "רמת עיר היין" },
  { id: "pr-ganei", name: "גני הדר — בניין B" },
] as const

const MOCK_SUBCONTRACTORS: {
  id: string
  projectId: string
  name: string
}[] = [
  { id: "sub-aa", projectId: "pr-wine", name: 'א.א. מערכות בע"מ' },
  { id: "sub-yb", projectId: "pr-wine", name: "י.ב. שלד פלדה ועבודות מתכת" },
  { id: "sub-dk", projectId: "pr-ganei", name: "ד.כ. גמר בניין (שיש וקרמיקה)" },
]

type KpiRow = { contract: number; approvedCumulative: number; balance: number }

const MOCK_KPIS: Record<string, KpiRow> = {
  "pr-wine|sub-aa": {
    contract: 4_850_000,
    approvedCumulative: 3_120_400,
    balance: 1_729_600,
  },
  "pr-wine|sub-yb": {
    contract: 2_100_000,
    approvedCumulative: 1_890_000,
    balance: 210_000,
  },
  "pr-ganei|sub-dk": {
    contract: 980_000,
    approvedCumulative: 612_300,
    balance: 367_700,
  },
}

type LineItem = {
  id: string
  wbs: string
  description: string
  unit: string
  quantity: number
  percentDone: number
  paymentRequest: number
}

const MOCK_LINES: Record<string, LineItem[]> = {
  "pr-wine|sub-aa": [
    {
      id: "L1",
      wbs: "3.2.1",
      description: "אספקה והתקנת צינורות פלדה מגולוון — קומות 2–8",
      unit: "מ״ר",
      quantity: 2_400,
      percentDone: 78,
      paymentRequest: 186_500,
    },
    {
      id: "L2",
      wbs: "3.2.2",
      description: "מסגרות תמיכה ומעקות זמניים — ליבת מדרגות",
      unit: "יח׳",
      quantity: 18,
      percentDone: 100,
      paymentRequest: 94_200,
    },
    {
      id: "L3",
      wbs: "3.2.5",
      description: "השלמות אטימה וצבע — אזור חניון תת-קרקעי",
      unit: "מ״ר",
      quantity: 1_100,
      percentDone: 42,
      paymentRequest: 58_750,
    },
    {
      id: "L4",
      wbs: "3.3.1",
      description: "עבודות נוספות מוסכמות (שינויי שטח — הזמנה מס׳ 14)",
      unit: "סכום",
      quantity: 1,
      percentDone: 100,
      paymentRequest: 127_800,
    },
  ],
  "pr-wine|sub-yb": [
    {
      id: "S1",
      wbs: "4.1",
      description: "שלד פלדה — כניסה ראשית וקונסטרוקציה מבואה",
      unit: "טון",
      quantity: 42,
      percentDone: 100,
      paymentRequest: 410_000,
    },
    {
      id: "S2",
      wbs: "4.2",
      description: "חיבורים מבורגים ואנודייז — קומות גג",
      unit: "נקודה",
      quantity: 220,
      percentDone: 65,
      paymentRequest: 198_000,
    },
  ],
  "pr-ganei|sub-dk": [
    {
      id: "G1",
      wbs: "6.1",
      description: "ריצוף פורצלן 60×60 — דירות טיפוס",
      unit: "מ״ר",
      quantity: 3_200,
      percentDone: 55,
      paymentRequest: 284_000,
    },
    {
      id: "G2",
      wbs: "6.4",
      description: "חיפוי קירות רטוב — חדרי רחצה",
      unit: "מ״ר",
      quantity: 890,
      percentDone: 30,
      paymentRequest: 112_300,
    },
  ],
}

type DeductionDefaults = {
  retentionPct: string
  insurance: string
  safety: string
  warranty: string
  other: string
}

const MOCK_DEDUCTIONS: Record<string, DeductionDefaults> = {
  "pr-wine|sub-aa": {
    retentionPct: "5",
    insurance: "4,200",
    safety: "2,800",
    warranty: "0",
    other: "0",
  },
  "pr-wine|sub-yb": {
    retentionPct: "5",
    insurance: "2,100",
    safety: "1,500",
    warranty: "0",
    other: "3,400",
  },
  "pr-ganei|sub-dk": {
    retentionPct: "5",
    insurance: "1,800",
    safety: "900",
    warranty: "2,000",
    other: "0",
  },
}

type HistoryRow = {
  id: string
  billNo: string
  date: string
  amountApproved: number
  status: "אושר לתשלום" | "בבקרה" | "סגור"
}

const MOCK_HISTORY: Record<string, HistoryRow[]> = {
  "pr-wine|sub-aa": [
    {
      id: "H1",
      billNo: "חשבון חלקי 2025-014",
      date: "2025-11-18",
      amountApproved: 512_400,
      status: "סגור",
    },
    {
      id: "H2",
      billNo: "חשבון חלקי 2025-008",
      date: "2025-09-02",
      amountApproved: 438_900,
      status: "סגור",
    },
    {
      id: "H3",
      billNo: "חשבון חלקי 2025-003",
      date: "2025-06-11",
      amountApproved: 621_000,
      status: "סגור",
    },
  ],
  "pr-wine|sub-yb": [
    {
      id: "HY1",
      billNo: "חשבון חלקי 2025-011",
      date: "2025-10-05",
      amountApproved: 890_000,
      status: "אושר לתשלום",
    },
  ],
  "pr-ganei|sub-dk": [
    {
      id: "HG1",
      billNo: "חשבון חלקי 2025-009",
      date: "2025-08-22",
      amountApproved: 412_300,
      status: "בבקרה",
    },
  ],
}

function scopeKey(projectId: string, subId: string) {
  return `${projectId}|${subId}`
}

function formatIls(n: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n)
}

function formatQty(n: number, unit: string) {
  if (unit === "סכום" || unit === "יח׳" || unit === "נקודה" || unit === "טון")
    return new Intl.NumberFormat("he-IL", { maximumFractionDigits: unit === "טון" ? 1 : 0 }).format(n)
  return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(n)
}

export default function SubcontractorPartialPaymentsPage() {
  const [projectId, setProjectId] = React.useState<string>(MOCK_PROJECTS[0].id)
  const subsForProject = React.useMemo(
    () => MOCK_SUBCONTRACTORS.filter((s) => s.projectId === projectId),
    [projectId]
  )
  const [subId, setSubId] = React.useState<string>(() => subsForProject[0]?.id ?? "")

  React.useEffect(() => {
    const list = MOCK_SUBCONTRACTORS.filter((s) => s.projectId === projectId)
    setSubId((prev) => (list.some((s) => s.id === prev) ? prev : list[0]?.id ?? ""))
  }, [projectId])

  const key = scopeKey(projectId, subId)
  const kpi = MOCK_KPIS[key] ?? {
    contract: 0,
    approvedCumulative: 0,
    balance: 0,
  }
  const lines = MOCK_LINES[key] ?? []
  const deductions = MOCK_DEDUCTIONS[key] ?? {
    retentionPct: "5",
    insurance: "0",
    safety: "0",
    warranty: "0",
    other: "0",
  }
  const history = MOCK_HISTORY[key] ?? []

  const [retentionPct, setRetentionPct] = React.useState(deductions.retentionPct)
  const [insurance, setInsurance] = React.useState(deductions.insurance)
  const [safety, setSafety] = React.useState(deductions.safety)
  const [warranty, setWarranty] = React.useState(deductions.warranty)
  const [otherDed, setOtherDed] = React.useState(deductions.other)

  React.useEffect(() => {
    setRetentionPct(deductions.retentionPct)
    setInsurance(deductions.insurance)
    setSafety(deductions.safety)
    setWarranty(deductions.warranty)
    setOtherDed(deductions.other)
  }, [key, deductions])

  const totalRequest = React.useMemo(
    () => lines.reduce((s, r) => s + r.paymentRequest, 0),
    [lines]
  )

  return (
    <DenseMasterDetailTemplate
      dir="rtl"
      className="bg-card"
      eyebrow="כספים · קבלנים"
      title='חשבונות קבלני משנה — תשלומים חלקיים'
      description="ניהול חשבון חלקי מול קבלן משנה: שורות כתב כמויות, קיזוזים, והיסטוריית אישורים — תצוגת עבודה לבדיקות והדגמות."
      leading={<FileSpreadsheet className="size-5 text-primary" aria-hidden />}
      backLink={{ href: "/marker-ofek/finance", label: "חזרה לכספים" }}
      headerActions={
        <>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs">
            <Printer className="size-3.5" aria-hidden />
            הדפסה
          </Button>
          <Button type="button" variant="secondary" size="sm" className="h-8 gap-1 px-2 text-xs">
            <Save className="size-3.5" aria-hidden />
            שמור טיוטה
          </Button>
          <Button type="button" size="sm" className="h-8 px-2 text-xs">
            שלח לאישור
          </Button>
        </>
      }
      master={
        <div className="space-y-2 bg-card">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-[12rem] flex-1 gap-1">
              <Label className={ERP_DENSE_LABEL_CLASS}>פרויקט</Label>
              <Select
                value={projectId}
                onValueChange={(v) => {
                  if (v) setProjectId(v)
                }}
              >
                <SelectTrigger className={cn(ERP_DENSE_INPUT_CLASS, "w-full bg-card")}>
                  <SelectValue placeholder="בחר פרויקט" />
                </SelectTrigger>
                <SelectContent>
                  {MOCK_PROJECTS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-sm">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-[14rem] flex-1 gap-1">
              <Label className={ERP_DENSE_LABEL_CLASS}>קבלן משנה</Label>
              <Select
                value={subId}
                onValueChange={(v) => {
                  if (v) setSubId(v)
                }}
              >
                <SelectTrigger className={cn(ERP_DENSE_INPUT_CLASS, "w-full bg-card")}>
                  <SelectValue placeholder="בחר קבלן" />
                </SelectTrigger>
                <SelectContent>
                  {subsForProject.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-sm">
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="ms-auto text-[11px] text-muted-foreground">
              חוזה: HC-2024-881 · תאריך דוח: {new Date().toLocaleDateString("he-IL")}
            </div>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-3">
            <Card className="border-slate-200 bg-card py-2 shadow-sm">
              <CardHeader className="px-2.5 py-1.5 pb-0">
                <CardTitle className="text-[11px] font-medium text-muted-foreground">
                  סכום חוזה
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2.5 pb-2 pt-0">
                <p className="text-base font-semibold tabular-nums text-foreground">
                  {formatIls(kpi.contract)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-card py-2 shadow-sm">
              <CardHeader className="px-2.5 py-1.5 pb-0">
                <CardTitle className="text-[11px] font-medium text-muted-foreground">
                  מאושר מצטבר (לתאריך)
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2.5 pb-2 pt-0">
                <p className="text-base font-semibold tabular-nums text-foreground">
                  {formatIls(kpi.approvedCumulative)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-emerald-200/80 bg-emerald-50/50 py-2 shadow-sm">
              <CardHeader className="px-2.5 py-1.5 pb-0">
                <CardTitle className="text-[11px] font-medium text-emerald-800">
                  יתרה לתשלום
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2.5 pb-2 pt-0">
                <p className="text-base font-semibold tabular-nums text-emerald-900">
                  {formatIls(kpi.balance)}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      }
      detail={
        <div className="flex min-h-[22rem] flex-col gap-1 bg-card">
          <Tabs defaultValue="current" className="w-full gap-1" dir="rtl">
            <TabsList className="h-8 w-full justify-start bg-slate-100/90 p-0.5 sm:w-auto">
              <TabsTrigger value="current" className="px-2.5 text-xs">
                חשבון נוכחי
              </TabsTrigger>
              <TabsTrigger value="deductions" className="px-2.5 text-xs">
                קיזוזים וניכויים
              </TabsTrigger>
              <TabsTrigger value="history" className="px-2.5 text-xs">
                היסטוריית חשבונות
              </TabsTrigger>
            </TabsList>

            <TabsContent value="current" className="mt-1">
              <div className="overflow-x-auto rounded border border-slate-200 bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="h-8 border-slate-200 hover:bg-transparent">
                      <TableHead className="h-8 w-14 px-2 text-start text-[11px] font-semibold">
                        WBS
                      </TableHead>
                      <TableHead className="h-8 min-w-[14rem] px-2 text-start text-[11px] font-semibold">
                        תיאור שורה
                      </TableHead>
                      <TableHead className="h-8 w-16 px-2 text-start text-[11px] font-semibold">
                        יח׳
                      </TableHead>
                      <TableHead className="h-8 w-24 px-2 text-start text-[11px] font-semibold">
                        כמות
                      </TableHead>
                      <TableHead className="h-8 w-20 px-2 text-start text-[11px] font-semibold">
                        % ביצוע
                      </TableHead>
                      <TableHead className="h-8 w-32 px-2 text-start text-[11px] font-semibold">
                        בקשת תשלום נוכחית
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((row) => (
                      <TableRow key={row.id} className="h-8 border-slate-100">
                        <TableCell className="px-2 py-1 font-mono text-xs text-muted-foreground">
                          {row.wbs}
                        </TableCell>
                        <TableCell className="px-2 py-1 text-xs">{row.description}</TableCell>
                        <TableCell className="px-2 py-1 text-xs">{row.unit}</TableCell>
                        <TableCell className="px-2 py-1 text-xs tabular-nums">
                          {formatQty(row.quantity, row.unit)}
                        </TableCell>
                        <TableCell className="px-2 py-1 text-xs tabular-nums">
                          {row.percentDone}%
                        </TableCell>
                        <TableCell className="px-2 py-1 text-xs font-medium tabular-nums">
                          {formatIls(row.paymentRequest)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-1.5 text-xs">
                <span className="text-muted-foreground">סה״כ בקשה לחשבון נוכחי</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatIls(totalRequest)}
                </span>
              </div>
            </TabsContent>

            <TabsContent value="deductions" className="mt-1">
              <div className="grid gap-2 rounded border border-slate-200 bg-card p-2 sm:grid-cols-2 lg:grid-cols-3">
                <div className="grid gap-1">
                  <Label className={ERP_DENSE_LABEL_CLASS}>עיכבון (מקובל 5%)</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      value={retentionPct}
                      onChange={(e) => setRetentionPct(e.target.value)}
                      className={cn(ERP_DENSE_INPUT_CLASS, "max-w-[5rem] bg-card")}
                      inputMode="decimal"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className={ERP_DENSE_LABEL_CLASS}>ביטוח קבלן (ניכוי)</Label>
                  <Input
                    value={insurance}
                    onChange={(e) => setInsurance(e.target.value)}
                    className={cn(ERP_DENSE_INPUT_CLASS, "bg-card")}
                    placeholder="₪"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className={ERP_DENSE_LABEL_CLASS}>בטיחות ופיקוח</Label>
                  <Input
                    value={safety}
                    onChange={(e) => setSafety(e.target.value)}
                    className={cn(ERP_DENSE_INPUT_CLASS, "bg-card")}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className={ERP_DENSE_LABEL_CLASS}>ערבות טיב / השתתפות</Label>
                  <Input
                    value={warranty}
                    onChange={(e) => setWarranty(e.target.value)}
                    className={cn(ERP_DENSE_INPUT_CLASS, "bg-card")}
                  />
                </div>
                <div className="grid gap-1 sm:col-span-2">
                  <Label className={ERP_DENSE_LABEL_CLASS}>ניכויים אחרים (קנסות / הערות שדה)</Label>
                  <Input
                    value={otherDed}
                    onChange={(e) => setOtherDed(e.target.value)}
                    className={cn(ERP_DENSE_INPUT_CLASS, "bg-card")}
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                הניכויים מחושבים על בסיס החשבון הנוכחי בלבד; אישור סופי יתבצע במסך אישור תשלום
                וברישום לחשבון חלקי ב-ERP.
              </p>
            </TabsContent>

            <TabsContent value="history" className="mt-1">
              <div className="overflow-x-auto rounded border border-slate-200 bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="h-8 border-slate-200 hover:bg-transparent">
                      <TableHead className="h-8 px-2 text-start text-[11px] font-semibold">
                        מספר חשבון
                      </TableHead>
                      <TableHead className="h-8 w-32 px-2 text-start text-[11px] font-semibold">
                        תאריך
                      </TableHead>
                      <TableHead className="h-8 w-36 px-2 text-start text-[11px] font-semibold">
                        סכום מאושר
                      </TableHead>
                      <TableHead className="h-8 w-28 px-2 text-start text-[11px] font-semibold">
                        סטטוס
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.length === 0 ? (
                      <TableRow className="h-10">
                        <TableCell
                          colSpan={4}
                          className="px-2 py-2 text-center text-xs text-muted-foreground"
                        >
                          אין חשבונות מאושרים קודמים בהיקף זה (דמו).
                        </TableCell>
                      </TableRow>
                    ) : (
                      history.map((h) => (
                        <TableRow key={h.id} className="h-8 border-slate-100">
                          <TableCell className="px-2 py-1 text-xs font-medium">{h.billNo}</TableCell>
                          <TableCell className="px-2 py-1 text-xs tabular-nums">
                            {new Date(h.date).toLocaleDateString("he-IL")}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-xs tabular-nums">
                            {formatIls(h.amountApproved)}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-xs">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5",
                                h.status === "סגור" && "bg-slate-100 text-slate-800",
                                h.status === "אושר לתשלום" && "bg-emerald-100 text-emerald-900",
                                h.status === "בבקרה" && "bg-amber-100 text-amber-900"
                              )}
                            >
                              {h.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      }
    />
  )
}
