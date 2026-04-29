"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { addBoqLineAction, createProjectAction } from "@/app/actions/projects"
import { EntityWorkspace } from "@/components/layout/EntityWorkspace"
import { BentoSmartList, type BentoSmartListColumn, SmartListStatusPill } from "@/components/ui/bento-smart-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { ProjectBudgetControlRow } from "@/lib/marker-ofek/projects-budget-control-data"
import { cn } from "@/lib/utils"

type ProjectsBudgetControlScaffoldProps = {
  title: string
  subtitle: string
  focusPaneTitle?: string
  rows: ProjectBudgetControlRow[]
  initialError?: string | null
  initialSelectedNodeId?: string | null
}

export function ProjectsBudgetControlScaffold({
  title,
  subtitle,
  focusPaneTitle = "Focus Pane: עץ מוצר לפעילות (Task BOM / Pricing)",
  rows,
  initialError = null,
  initialSelectedNodeId = null,
}: ProjectsBudgetControlScaffoldProps) {
  const router = useRouter()
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(initialSelectedNodeId)
  const [createProjectOpen, setCreateProjectOpen] = React.useState(false)
  const [projectCode, setProjectCode] = React.useState("")
  const [projectName, setProjectName] = React.useState("")
  const [clientName, setClientName] = React.useState("")
  const [boqCode, setBoqCode] = React.useState("")
  const [boqTitle, setBoqTitle] = React.useState("")
  const [boqQty, setBoqQty] = React.useState("1")
  const [boqUnitCost, setBoqUnitCost] = React.useState("0")
  const [pending, startTransition] = React.useTransition()

  const selectedNode = rows.find((row) => row.id === selectedNodeId) ?? null
  const focusOpen = Boolean(selectedNode)

  const columns = React.useMemo<BentoSmartListColumn<ProjectBudgetControlRow>[]>(
    () => [
      {
        key: "structureCode",
        title: "קוד BOQ",
        className: "w-[7.5rem] font-currency-mono text-xs",
        render: (item) => item.structureCode,
      },
      {
        key: "title",
        title: "סעיף",
        className: "min-w-[14rem]",
        render: (item) => (
          <span className="block truncate font-medium text-foreground">
            {item.projectName} · {item.title}
          </span>
        ),
      },
      {
        key: "versionType",
        title: "מהדורה",
        className: "w-[7.5rem]",
        render: (item) => (
          <SmartListStatusPill
            tone={
              item.versionType === "EXECUTION"
                ? "info"
                : item.versionType === "ZERO"
                  ? "warning"
                  : "neutral"
            }
          >
            {item.versionType}
          </SmartListStatusPill>
        ),
      },
      {
        key: "versionNumber",
        title: "מס׳ מהדורה",
        className: "w-[7rem] font-currency-mono text-xs",
        render: (item) => String(item.versionNumber),
      },
      {
        key: "progress",
        title: "אחוז ביצוע",
        className: "w-[8rem] font-currency-mono text-xs",
        render: (item) => `${item.progressPercent.toFixed(1)}%`,
      },
      {
        key: "planned",
        title: "תקציב מתוכנן",
        className: "w-[9rem] font-currency-mono text-xs",
        render: (item) => formatNis(item.plannedBudget),
      },
      {
        key: "actual",
        title: "בפועל",
        className: "w-[8rem] font-currency-mono text-xs",
        render: (item) => formatNis(item.actualCost),
      },
    ],
    []
  )

  const originalBudget = rows.reduce((sum, row) => sum + row.plannedBudget, 0)
  const actualBudget = rows.reduce((sum, row) => sum + row.actualCost, 0)
  const variance = actualBudget - originalBudget
  const overallProgress =
    rows.length > 0
      ? rows.reduce((sum, row) => sum + row.progressPercent, 0) / rows.length
      : 0

  const forecast = originalBudget - actualBudget

  const sidebar = (
    <div className="space-y-2">
      <KpiCard title="תקציב מתוכנן מול בפועל" value={`${formatNis(originalBudget)} -> ${formatNis(actualBudget)}`} />
      <KpiCard title="אחוז ביצוע כולל" value={`${overallProgress.toFixed(1)}%`} />
      <KpiCard
        title="חריגות"
        value={formatNis(variance)}
        valueClassName={variance > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-300"}
      />
      <KpiCard title="רווח/הפסד חזוי" value={formatNis(forecast)} />
    </div>
  )

  async function onCreateProject() {
    const projectCodeTrimmed = projectCode.trim()
    const projectNameTrimmed = projectName.trim()
    if (!projectCodeTrimmed || !projectNameTrimmed) {
      toast.error("יש למלא קוד ושם פרויקט")
      return
    }

    startTransition(async () => {
      const result = await createProjectAction({
        projectCode: projectCodeTrimmed,
        name: projectNameTrimmed,
        clientName: clientName.trim() || undefined,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("פרויקט נוצר בהצלחה")
      setCreateProjectOpen(false)
      setProjectCode("")
      setProjectName("")
      setClientName("")
      router.refresh()
    })
  }

  async function onAddBoqLine() {
    if (!selectedNode) {
      toast.error("יש לבחור שורת BOQ לפני הוספת סעיף")
      return
    }
    if (!boqCode.trim() || !boqTitle.trim()) {
      toast.error("יש למלא קוד BOQ וכותרת סעיף")
      return
    }
    startTransition(async () => {
      const result = await addBoqLineAction({
        projectId: selectedNode.projectId,
        versionId: selectedNode.versionId,
        structureCode: boqCode.trim(),
        title: boqTitle.trim(),
        plannedQuantity: Number(boqQty || "0"),
        plannedUnitCost: Number(boqUnitCost || "0"),
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("שורת BOQ נוספה")
      setBoqCode("")
      setBoqTitle("")
      setBoqQty("1")
      setBoqUnitCost("0")
      router.refresh()
    })
  }

  const main = (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <BentoSmartList
        items={rows}
        columns={columns}
        rowKey={(item) => item.id}
        onRowClick={(item) => setSelectedNodeId(item.id)}
        selectedRowKey={selectedNodeId}
        emptyState={initialError ? "אירעה שגיאה בטעינת נתוני פרויקטים/BOQ" : "לא נמצאו סעיפי BOQ למהדורה"}
      />
      {initialError ? (
        <p className="text-xs text-destructive">שגיאה: {initialError}</p>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        70/30 `EntityWorkspace`: נתוני Projects + BOQ בזמן אמת עם Focus Pane לעריכה.
      </p>
    </div>
  )

  return (
    <>
      <EntityWorkspace
        title={title}
        description={subtitle}
        headerActions={
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => setCreateProjectOpen(true)}>
              פרויקט חדש
            </Button>
            <Button type="button" size="sm" onClick={() => selectedNode && setSelectedNodeId(selectedNode.id)}>
              פתיחת סעיף נבחר
            </Button>
          </>
        }
        sidebar={sidebar}
        main={main}
      />

      <Sheet open={focusOpen} onOpenChange={(open) => !open && setSelectedNodeId(null)}>
        <SheetContent side="left" className="w-[min(40rem,100vw)] p-0">
          <SheetHeader className="border-b border-border/70">
            <SheetTitle>{focusPaneTitle}</SheetTitle>
            <SheetDescription>
              {selectedNode
                ? `פרויקט ${selectedNode.projectCode} · מהדורה ${selectedNode.versionNumber} · סעיף ${selectedNode.structureCode}`
                : "פירוק סעיף BOQ למשאבים"}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 p-4">
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Task BOM / Pricing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <p>
                  {selectedNode
                    ? `${selectedNode.projectName} · ${selectedNode.title}`
                    : "יש לבחור שורת BOQ להצגת פירוט"}
                </p>
                <p>תקציב מתוכנן: {selectedNode ? formatNis(selectedNode.plannedBudget) : "—"}</p>
                <p>בפועל: {selectedNode ? formatNis(selectedNode.actualCost) : "—"}</p>
                <div className="space-y-2 rounded-md border border-border/70 p-3">
                  <p className="font-medium text-foreground/90">הוספת שורת BOQ מהירה</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="new-boq-code">קוד סעיף</Label>
                      <Input
                        id="new-boq-code"
                        value={boqCode}
                        onChange={(event) => setBoqCode(event.target.value)}
                        placeholder="01.02.03.0040"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-boq-title">כותרת</Label>
                      <Input
                        id="new-boq-title"
                        value={boqTitle}
                        onChange={(event) => setBoqTitle(event.target.value)}
                        placeholder="עבודות בקרה"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-boq-qty">כמות</Label>
                      <Input
                        id="new-boq-qty"
                        value={boqQty}
                        type="number"
                        min="0"
                        step="0.001"
                        onChange={(event) => setBoqQty(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-boq-unit-cost">עלות יחידה</Label>
                      <Input
                        id="new-boq-unit-cost"
                        value={boqUnitCost}
                        type="number"
                        min="0"
                        step="0.01"
                        onChange={(event) => setBoqUnitCost(event.target.value)}
                      />
                    </div>
                  </div>
                  <Button type="button" size="sm" onClick={() => void onAddBoqLine()} disabled={!selectedNode || pending}>
                    הוסף סעיף BOQ
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>יצירת פרויקט חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="project-code">קוד פרויקט</Label>
              <Input
                id="project-code"
                value={projectCode}
                onChange={(event) => setProjectCode(event.target.value)}
                placeholder="MO-2026-001"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="project-name">שם פרויקט</Label>
              <Input
                id="project-name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="גינדי 0163 - שלב ב'"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="project-client">לקוח</Label>
              <Input
                id="project-client"
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                placeholder="שם לקוח (אופציונלי)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateProjectOpen(false)}>
              ביטול
            </Button>
            <Button type="button" onClick={() => void onCreateProject()} disabled={pending}>
              שמירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function formatNis(value: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value)
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
