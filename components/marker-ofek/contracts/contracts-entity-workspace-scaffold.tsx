"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { createSubcontractContractAction } from "@/app/actions/contracts"
import { EntityWorkspace } from "@/components/layout/EntityWorkspace"
import { BentoSmartList, type BentoSmartListColumn, SmartListStatusPill } from "@/components/ui/bento-smart-list"
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type {
  ContractPartnerOption,
  ContractProjectOption,
} from "@/lib/marker-ofek/contracts-data"
import { cn } from "@/lib/utils"

type ContractsEntityWorkspaceScaffoldProps = {
  title: string
  subtitle: string
  focusPaneTitle?: string
  rows: ContractRow[]
  projects: ContractProjectOption[]
  partners: ContractPartnerOption[]
  initialError?: string | null
}

export type ContractStatus = "DRAFT" | "ACTIVE" | "APPROVED" | "CLOSED"

export type ContractRow = {
  id: string
  contractNumber: string
  projectLabel: string
  subcontractor: string
  totalAmount: number
  retentionPct: number
  status: ContractStatus
}

function formatNis(value: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value)
}

function statusLabelHe(status: ContractStatus): string {
  if (status === "DRAFT") return "טיוטה"
  if (status === "ACTIVE") return "פעיל"
  if (status === "APPROVED") return "מאושר"
  return "סגור"
}

function statusTone(status: ContractStatus): "neutral" | "success" | "warning" | "info" {
  if (status === "CLOSED") return "success"
  if (status === "APPROVED") return "info"
  if (status === "ACTIVE") return "warning"
  return "neutral"
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

export function ContractsEntityWorkspaceScaffold({
  title,
  subtitle,
  focusPaneTitle = "FocusPane: חוזה / חשבון חלקי (Slide-over)",
  rows,
  projects,
  partners,
  initialError = null,
}: ContractsEntityWorkspaceScaffoldProps) {
  const router = useRouter()
  const [selectedContractId, setSelectedContractId] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [contractNumber, setContractNumber] = React.useState("")
  const [contractTitle, setContractTitle] = React.useState("")
  const [projectId, setProjectId] = React.useState("")
  const [partnerId, setPartnerId] = React.useState("")
  const [totalAmount, setTotalAmount] = React.useState("0")
  const [retentionPercent, setRetentionPercent] = React.useState("5")
  const [insurancePercent, setInsurancePercent] = React.useState("0")
  const [paymentTerms, setPaymentTerms] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  const selectedContract = rows.find((row) => row.id === selectedContractId) ?? null
  const focusOpen = Boolean(selectedContract)
  const totalActiveAmount = rows
    .filter((row) => row.status === "ACTIVE")
    .reduce((sum, row) => sum + row.totalAmount, 0)
  const averageRetentionPct =
    rows.length > 0
      ? rows.reduce((sum, row) => sum + row.retentionPct, 0) / rows.length
      : 0
  const approvedOrClosedCount = rows.filter(
    (row) => row.status === "APPROVED" || row.status === "CLOSED"
  ).length

  const columns = React.useMemo<BentoSmartListColumn<ContractRow>[]>(
    () => [
      {
        key: "contractNumber",
        title: "חוזה",
        className: "w-[7.5rem] font-currency-mono text-xs",
        render: (item) => item.contractNumber,
      },
      {
        key: "project",
        title: "פרויקט / קבלן",
        className: "min-w-[16rem]",
        render: (item) => (
          <span className="block truncate font-medium text-foreground">
            {item.projectLabel} · {item.subcontractor}
          </span>
        ),
      },
      {
        key: "total",
        title: "סכום חוזה",
        className: "w-[9rem] font-currency-mono text-xs",
        render: (item) => formatNis(item.totalAmount),
      },
      {
        key: "retention",
        title: "עיכבון",
        className: "w-[6rem] font-currency-mono text-xs",
        render: (item) => `${item.retentionPct}%`,
      },
      {
        key: "status",
        title: "סטטוס",
        className: "w-[7rem]",
        render: (item) => (
          <SmartListStatusPill tone={statusTone(item.status)}>
            {statusLabelHe(item.status)}
          </SmartListStatusPill>
        ),
      },
    ],
    []
  )

  function resetCreateForm() {
    setContractNumber("")
    setContractTitle("")
    setProjectId("")
    setPartnerId("")
    setTotalAmount("0")
    setRetentionPercent("5")
    setInsurancePercent("0")
    setPaymentTerms("")
  }

  async function onCreateContract() {
    if (!projectId) {
      toast.error("יש לבחור פרויקט לחוזה")
      return
    }

    startTransition(async () => {
      const result = await createSubcontractContractAction({
        contractNumber: contractNumber.trim(),
        title: contractTitle.trim(),
        projectId,
        businessPartnerId: partnerId || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
        totalAmount: Number(totalAmount || "0"),
        retentionPercent: Number(retentionPercent || "0"),
        insurancePercent: Number(insurancePercent || "0"),
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success("חוזה נוצר בהצלחה")
      setCreateOpen(false)
      resetCreateForm()
      router.refresh()
    })
  }

  return (
    <>
      <EntityWorkspace
        title={title}
        description={subtitle}
        headerActions={
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
            >
              מהדורת חוזה חדשה
            </Button>
            <Button type="button" size="sm">
              חשבון חלקי חדש
            </Button>
          </>
        }
        sidebar={
          <div className="space-y-2">
            <KpiCard title="סכום חוזים פעילים" value={formatNis(totalActiveAmount)} />
            <KpiCard title="עיכבון ממוצע" value={`${averageRetentionPct.toFixed(1)}%`} />
            <KpiCard title="חוזים מאושרים/סגורים" value={`${approvedOrClosedCount}`} />
          </div>
        }
        main={
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <BentoSmartList
              items={rows}
              columns={columns}
              rowKey={(item) => item.id}
              selectedRowKey={selectedContractId}
              onRowClick={(item) => setSelectedContractId(item.id)}
              emptyState={initialError ? "אירעה שגיאה בטעינת רשימת החוזים" : "אין חוזים להצגה"}
            />
            {initialError ? <p className="text-xs text-destructive">שגיאה: {initialError}</p> : null}
            <p className="text-[11px] text-muted-foreground">
              Canonical pattern: 70% master list + 30% KPI, details via slide-over FocusPane בלבד.
            </p>
          </div>
        }
      />

      <Sheet open={focusOpen} onOpenChange={(open) => !open && setSelectedContractId(null)}>
        <SheetContent side="left" className="w-[min(42rem,100vw)] p-0">
          <SheetHeader className="border-b border-border/70">
            <SheetTitle>{focusPaneTitle}</SheetTitle>
            <SheetDescription>
              {selectedContract
                ? `${selectedContract.contractNumber} · ${selectedContract.subcontractor}`
                : "פרטי חוזה / חשבון חלקי"}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 p-4">
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Progress Billing / Payer Account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <p>TODO: עדכון ביצוע מצטבר (Cumulative Progress) לכל שורת חוזה.</p>
                <p>TODO: חישוב לתשלום = מצטבר פחות חשבונות קודמים פחות עיכבון/מקדמה/קיזוזים.</p>
                <p className="font-medium text-foreground/90">Scaffold בלבד — ללא לוגיקה עסקית.</p>
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-[min(44rem,100vw)] p-0">
          <SheetHeader className="border-b border-border/70">
            <SheetTitle>יצירת חוזה חדש</SheetTitle>
            <SheetDescription>
              חוזה חדש חייב להיות משויך לפרויקט פעיל בחברה הנוכחית.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 p-4">
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">נתוני חוזה</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="contract-number">מספר חוזה</Label>
                    <Input
                      id="contract-number"
                      value={contractNumber}
                      onChange={(event) => setContractNumber(event.target.value)}
                      placeholder="CTR-2026-001"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="contract-title">כותרת</Label>
                    <Input
                      id="contract-title"
                      value={contractTitle}
                      onChange={(event) => setContractTitle(event.target.value)}
                      placeholder="עבודות שלד"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>פרויקט</Label>
                    <Select value={projectId} onValueChange={(value) => setProjectId(value ?? "")}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="בחרו פרויקט" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.code} · {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>שותף עסקי</Label>
                    <Select
                      value={partnerId || "__none__"}
                      onValueChange={(value) =>
                        setPartnerId(!value || value === "__none__" ? "" : value)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="לא חובה" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">ללא שותף עסקי</SelectItem>
                        {partners.map((partner) => (
                          <SelectItem key={partner.id} value={partner.id}>
                            {partner.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="contract-total">סכום חוזה</Label>
                    <Input
                      id="contract-total"
                      value={totalAmount}
                      type="number"
                      min="0"
                      step="0.01"
                      onChange={(event) => setTotalAmount(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="contract-retention">עיכבון (%)</Label>
                    <Input
                      id="contract-retention"
                      value={retentionPercent}
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      onChange={(event) => setRetentionPercent(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="contract-insurance">ביטוח (%)</Label>
                    <Input
                      id="contract-insurance"
                      value={insurancePercent}
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      onChange={(event) => setInsurancePercent(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="contract-payment-terms">תנאי תשלום</Label>
                    <Input
                      id="contract-payment-terms"
                      value={paymentTerms}
                      onChange={(event) => setPaymentTerms(event.target.value)}
                      placeholder="שוטף + 60"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateOpen(false)}
                    disabled={pending}
                  >
                    ביטול
                  </Button>
                  <Button type="button" onClick={() => void onCreateContract()} disabled={pending}>
                    יצירת חוזה
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
