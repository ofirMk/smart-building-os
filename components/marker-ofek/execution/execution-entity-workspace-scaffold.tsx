"use client"

import * as React from "react"

import { EntityWorkspace } from "@/components/layout/EntityWorkspace"
import { BentoSmartList, type BentoSmartListColumn, SmartListStatusPill } from "@/components/ui/bento-smart-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type ExecutionWorkspaceMode = "daily-logs" | "defects" | "checklists"

type ExecutionEntityWorkspaceScaffoldProps = {
  title: string
  subtitle: string
  mode: ExecutionWorkspaceMode
}

type DailyLogRow = {
  id: string
  projectLabel: string
  logDate: string
  weather: string
  workersOnSite: number
  progressSummary: string
}

type DefectStatus = "OPEN" | "IN_PROGRESS" | "FIXED" | "REJECTED"

type DefectRow = {
  id: string
  projectLabel: string
  subcontractor: string
  title: string
  status: DefectStatus
  dueDate: string
}

type ChecklistStatus = "OPEN" | "IN_PROGRESS" | "DONE"

type ChecklistRow = {
  id: string
  projectLabel: string
  category: "QA" | "SAFETY"
  title: string
  status: ChecklistStatus
  scorePercent: number
}

const DAILY_LOG_ROWS: DailyLogRow[] = [
  {
    id: "dl-2026-04-21-gindi",
    projectLabel: "גינדי 0163",
    logDate: "2026-04-21",
    weather: "בהיר",
    workersOnSite: 44,
    progressSummary: "התקדמות חשמל בקומות 4-6",
  },
  {
    id: "dl-2026-04-21-rainbow",
    projectLabel: "ריינבו שדה דב",
    logDate: "2026-04-21",
    weather: "מעונן חלקית",
    workersOnSite: 36,
    progressSummary: "עבודות תשתית וחיפוי לובי",
  },
  {
    id: "dl-2026-04-20-ramat",
    projectLabel: "רמת עיר היין",
    logDate: "2026-04-20",
    weather: "גשום קל",
    workersOnSite: 28,
    progressSummary: "עיכוב אספקה למחברים",
  },
]

const DEFECT_ROWS: DefectRow[] = [
  {
    id: "df-00091",
    projectLabel: "גינדי 0163",
    subcontractor: "ע.מ. חשמל",
    title: "איטום לא תקין בחדר חשמל",
    status: "OPEN",
    dueDate: "2026-04-25",
  },
  {
    id: "df-00092",
    projectLabel: "ריינבו שדה דב",
    subcontractor: "מנורה מערכות",
    title: "קו כיבוי אש ללא שילוט",
    status: "IN_PROGRESS",
    dueDate: "2026-04-24",
  },
  {
    id: "df-00093",
    projectLabel: "רמת עיר היין",
    subcontractor: "ברקת אינסטלציה",
    title: "סטייה במפלס יציקה מקומית",
    status: "FIXED",
    dueDate: "2026-04-19",
  },
]

const CHECKLIST_ROWS: ChecklistRow[] = [
  {
    id: "cl-2026-04-21-qa-001",
    projectLabel: "גינדי 0163",
    category: "QA",
    title: "בדיקת קונסטרוקציה קומות 4-5",
    status: "IN_PROGRESS",
    scorePercent: 88,
  },
  {
    id: "cl-2026-04-21-saf-001",
    projectLabel: "ריינבו שדה דב",
    category: "SAFETY",
    title: "בדיקת בטיחות מנופים ומעקות",
    status: "DONE",
    scorePercent: 95,
  },
  {
    id: "cl-2026-04-20-qa-002",
    projectLabel: "רמת עיר היין",
    category: "QA",
    title: "בדיקת גמר חשמל ציבורי",
    status: "OPEN",
    scorePercent: 74,
  },
]

function defectStatusLabelHe(status: DefectStatus): string {
  if (status === "OPEN") return "פתוח"
  if (status === "IN_PROGRESS") return "בטיפול"
  if (status === "FIXED") return "תוקן"
  return "נדחה"
}

function defectStatusTone(status: DefectStatus): "neutral" | "success" | "warning" | "info" {
  if (status === "FIXED") return "success"
  if (status === "IN_PROGRESS") return "warning"
  if (status === "REJECTED") return "neutral"
  return "info"
}

function checklistStatusLabelHe(status: ChecklistStatus): string {
  if (status === "OPEN") return "פתוח"
  if (status === "IN_PROGRESS") return "בביצוע"
  return "הושלם"
}

function checklistStatusTone(status: ChecklistStatus): "neutral" | "success" | "warning" | "info" {
  if (status === "DONE") return "success"
  if (status === "IN_PROGRESS") return "warning"
  return "info"
}

function KpiCard({
  title,
  value,
  valueClassName,
}: {
  title: string
  value: string
  valueClassName?: string
}) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn("font-currency-mono text-sm font-semibold text-foreground", valueClassName)}>
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

export function ExecutionEntityWorkspaceScaffold({
  title,
  subtitle,
  mode,
}: ExecutionEntityWorkspaceScaffoldProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const isDailyLogs = mode === "daily-logs"
  const isDefects = mode === "defects"
  const isChecklists = mode === "checklists"

  const dailyLogColumns = React.useMemo<BentoSmartListColumn<DailyLogRow>[]>(
    () => [
      {
        key: "logDate",
        title: "תאריך",
        className: "w-[8rem] font-currency-mono text-xs",
        render: (item) => item.logDate,
      },
      {
        key: "project",
        title: "פרויקט",
        className: "min-w-[10rem]",
        render: (item) => <span className="font-medium text-foreground">{item.projectLabel}</span>,
      },
      {
        key: "weather",
        title: "מזג אוויר",
        className: "w-[7rem] text-xs",
        render: (item) => item.weather,
      },
      {
        key: "workers",
        title: "נוכחות פועלים",
        className: "w-[7rem] font-currency-mono text-xs",
        render: (item) => String(item.workersOnSite),
      },
      {
        key: "progress",
        title: "סיכום התקדמות",
        className: "min-w-[12rem]",
        render: (item) => item.progressSummary,
      },
    ],
    []
  )

  const defectsColumns = React.useMemo<BentoSmartListColumn<DefectRow>[]>(
    () => [
      {
        key: "title",
        title: "ליקוי",
        className: "min-w-[13rem]",
        render: (item) => <span className="font-medium text-foreground">{item.title}</span>,
      },
      {
        key: "project",
        title: "פרויקט / קבלן",
        className: "min-w-[12rem]",
        render: (item) => `${item.projectLabel} · ${item.subcontractor}`,
      },
      {
        key: "status",
        title: "סטטוס",
        className: "w-[8rem]",
        render: (item) => (
          <SmartListStatusPill tone={defectStatusTone(item.status)}>
            {defectStatusLabelHe(item.status)}
          </SmartListStatusPill>
        ),
      },
      {
        key: "dueDate",
        title: "יעד תיקון",
        className: "w-[8rem] font-currency-mono text-xs",
        render: (item) => item.dueDate,
      },
    ],
    []
  )

  const checklistColumns = React.useMemo<BentoSmartListColumn<ChecklistRow>[]>(
    () => [
      {
        key: "title",
        title: "צ׳קליסט",
        className: "min-w-[13rem]",
        render: (item) => <span className="font-medium text-foreground">{item.title}</span>,
      },
      {
        key: "project",
        title: "פרויקט",
        className: "min-w-[10rem]",
        render: (item) => item.projectLabel,
      },
      {
        key: "category",
        title: "קטגוריה",
        className: "w-[7rem]",
        render: (item) => (
          <SmartListStatusPill tone={item.category === "QA" ? "info" : "warning"}>
            {item.category}
          </SmartListStatusPill>
        ),
      },
      {
        key: "status",
        title: "סטטוס",
        className: "w-[8rem]",
        render: (item) => (
          <SmartListStatusPill tone={checklistStatusTone(item.status)}>
            {checklistStatusLabelHe(item.status)}
          </SmartListStatusPill>
        ),
      },
      {
        key: "score",
        title: "ציון",
        className: "w-[7rem] font-currency-mono text-xs",
        render: (item) => `${item.scorePercent.toFixed(0)}%`,
      },
    ],
    []
  )

  const sidebar = (
    <div className="space-y-2">
      {isDailyLogs ? (
        <>
          <KpiCard title="דוחות יומיים השבוע" value="34" />
          <KpiCard title="נוכחות פועלים היום באתר" value="108" valueClassName="text-blue-700 dark:text-blue-300" />
          <KpiCard title="חריגות מזג אוויר" value="3" />
        </>
      ) : null}
      {isDefects ? (
        <>
          <KpiCard title="תקלות פתוחות מול סגורות" value="18 / 43" />
          <KpiCard title="זמן תיקון ממוצע" value="2.8 ימים" />
          <KpiCard title="ליקויים קריטיים פתוחים" value="4" valueClassName="text-rose-600 dark:text-rose-400" />
        </>
      ) : null}
      {isChecklists ? (
        <>
          <KpiCard title="צ'קליסטים פתוחים" value="12" />
          <KpiCard title="ציון QA/Safety ממוצע" value="89%" />
          <KpiCard title="בדיקות שהושלמו השבוע" value="27" valueClassName="text-emerald-700 dark:text-emerald-300" />
        </>
      ) : null}
    </div>
  )

  const focusTitle = isDailyLogs
    ? "FocusPane: פרטי יומן עבודה יומי"
    : isDefects
      ? "FocusPane: פרטי ליקוי, תמונות והיסטוריית סטטוס"
      : "FocusPane: פרטי צ'קליסט QA/Safety ופעולות המשך"

  return (
    <>
      <EntityWorkspace
        title={title}
        description={subtitle}
        headerActions={
          isDailyLogs ? (
            <>
              <Button type="button" size="sm" variant="outline">
                פתיחת יומן חדש
              </Button>
              <Button type="button" size="sm">
                דיווח נוכחות קבלנים
              </Button>
            </>
          ) : isDefects ? (
            <>
              <Button type="button" size="sm" variant="outline">
                סינון לפי קבלן
              </Button>
              <Button type="button" size="sm">
                פתיחת ליקוי
              </Button>
            </>
          ) : (
            <>
              <Button type="button" size="sm" variant="outline">
                תבנית QA
              </Button>
              <Button type="button" size="sm">
                פתיחת צ׳קליסט
              </Button>
            </>
          )
        }
        sidebar={sidebar}
        main={
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {isDailyLogs ? (
              <BentoSmartList
                items={DAILY_LOG_ROWS}
                columns={dailyLogColumns}
                rowKey={(item) => item.id}
                selectedRowKey={selectedId}
                onRowClick={(item) => setSelectedId(item.id)}
                emptyState="אין יומני עבודה להצגה"
              />
            ) : isDefects ? (
              <BentoSmartList
                items={DEFECT_ROWS}
                columns={defectsColumns}
                rowKey={(item) => item.id}
                selectedRowKey={selectedId}
                onRowClick={(item) => setSelectedId(item.id)}
                emptyState="אין ליקויים להצגה"
              />
            ) : (
              <BentoSmartList
                items={CHECKLIST_ROWS}
                columns={checklistColumns}
                rowKey={(item) => item.id}
                selectedRowKey={selectedId}
                onRowClick={(item) => setSelectedId(item.id)}
                emptyState="אין צ׳קליסטים להצגה"
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              Canonical scaffold: 70/30 `EntityWorkspace` + `Sheet` FocusPane בלבד.
            </p>
          </div>
        }
      />

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="left" className="w-[min(42rem,100vw)] p-0">
          <SheetHeader className="border-b border-border/70">
            <SheetTitle>{focusTitle}</SheetTitle>
            <SheetDescription>
              {selectedId ? `Entity ID: ${selectedId}` : "פרטי ישות"}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 p-4">
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {isDailyLogs ? "Daily Log Workflow" : "Defect / Ticket Workflow"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                {isDailyLogs ? (
                  <>
                    <p>TODO: מזג אוויר, כוח אדם, ציוד והתקדמות יומית.</p>
                    <p>TODO: קישור לדוחות איכות ובטיחות של אותו יום.</p>
                  </>
                ) : isDefects ? (
                  <>
                    <p>TODO: תמונות שטח, תגובות מפקח/קבלן, ושינוי סטטוס לאורך זמן.</p>
                    <p>TODO: שיוך אוטומטי לקבלן משנה + תאריך יעד לתיקון.</p>
                  </>
                ) : (
                  <>
                    <p>TODO: סעיפי QA/Safety עם PASS/FAIL + ניקוד לכל סעיף.</p>
                    <p>TODO: המרת FAIL לליקוי פתוח עם שיוך אוטומטי לקבלן.</p>
                  </>
                )}
                <p className="font-medium text-foreground/90">Scaffold בלבד — ללא לוגיקה עסקית.</p>
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
