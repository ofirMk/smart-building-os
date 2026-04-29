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

type FinanceWorkspaceMode = "payment-demands" | "cash-flow"

type FinanceEntityWorkspaceScaffoldProps = {
  title: string
  subtitle: string
  mode: FinanceWorkspaceMode
}

type PaymentDemandStatus = "PENDING" | "APPROVED_FOR_PAYMENT" | "PAID"

type PaymentDemandRow = {
  id: string
  sourceType: "CONTRACT_BILLING" | "SUPPLIER_INVOICE"
  sourceRef: string
  dueDate: string
  plannedAmount: number
  status: PaymentDemandStatus
}

type CashFlowKind = "OUTFLOW" | "INFLOW"

type CashFlowRow = {
  id: string
  monthKey: string
  kind: CashFlowKind
  sourceRef: string
  forecastAmount: number
  actualAmount: number
}

const PAYMENT_DEMAND_ROWS: PaymentDemandRow[] = [
  {
    id: "pd-1001",
    sourceType: "CONTRACT_BILLING",
    sourceRef: "CTR-001 / PB-04",
    dueDate: "2026-05-30",
    plannedAmount: 620000,
    status: "PENDING",
  },
  {
    id: "pd-1002",
    sourceType: "SUPPLIER_INVOICE",
    sourceRef: "PO-10092 / INV-7782",
    dueDate: "2026-06-15",
    plannedAmount: 245000,
    status: "APPROVED_FOR_PAYMENT",
  },
  {
    id: "pd-1003",
    sourceType: "CONTRACT_BILLING",
    sourceRef: "CTR-002 / PB-02",
    dueDate: "2026-04-27",
    plannedAmount: 540000,
    status: "PAID",
  },
]

const CASH_FLOW_ROWS: CashFlowRow[] = [
  {
    id: "cf-2026-04-out",
    monthKey: "2026-04",
    kind: "OUTFLOW",
    sourceRef: "Payment Demands",
    forecastAmount: 1840000,
    actualAmount: 1730000,
  },
  {
    id: "cf-2026-04-in",
    monthKey: "2026-04",
    kind: "INFLOW",
    sourceRef: "Client Billings",
    forecastAmount: 1610000,
    actualAmount: 1490000,
  },
  {
    id: "cf-2026-05-out",
    monthKey: "2026-05",
    kind: "OUTFLOW",
    sourceRef: "Payment Demands",
    forecastAmount: 2060000,
    actualAmount: 0,
  },
]

function formatNis(value: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value)
}

function paymentStatusLabelHe(status: PaymentDemandStatus): string {
  if (status === "PENDING") return "ממתין"
  if (status === "APPROVED_FOR_PAYMENT") return "אושר לתשלום"
  return "שולם"
}

function paymentStatusTone(
  status: PaymentDemandStatus
): "neutral" | "success" | "warning" | "info" {
  if (status === "PAID") return "success"
  if (status === "APPROVED_FOR_PAYMENT") return "info"
  return "warning"
}

function cashFlowKindLabelHe(kind: CashFlowKind): string {
  return kind === "INFLOW" ? "הכנסה" : "הוצאה"
}

function cashFlowKindTone(kind: CashFlowKind): "neutral" | "success" | "warning" | "info" {
  return kind === "INFLOW" ? "success" : "warning"
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

export function FinanceEntityWorkspaceScaffold({
  title,
  subtitle,
  mode,
}: FinanceEntityWorkspaceScaffoldProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const isPaymentDemands = mode === "payment-demands"

  const paymentColumns = React.useMemo<BentoSmartListColumn<PaymentDemandRow>[]>(
    () => [
      {
        key: "sourceRef",
        title: "מקור",
        className: "min-w-[13rem]",
        render: (item) => <span className="font-medium text-foreground">{item.sourceRef}</span>,
      },
      {
        key: "sourceType",
        title: "סוג",
        className: "w-[8rem] text-xs",
        render: (item) =>
          item.sourceType === "CONTRACT_BILLING" ? "חשבון חלקי" : "חשבונית ספק",
      },
      {
        key: "dueDate",
        title: "תאריך פירעון",
        className: "w-[8.5rem] font-currency-mono text-xs",
        render: (item) => item.dueDate,
      },
      {
        key: "plannedAmount",
        title: "סכום",
        className: "w-[8rem] font-currency-mono text-xs",
        render: (item) => formatNis(item.plannedAmount),
      },
      {
        key: "status",
        title: "סטטוס",
        className: "w-[9rem]",
        render: (item) => (
          <SmartListStatusPill tone={paymentStatusTone(item.status)}>
            {paymentStatusLabelHe(item.status)}
          </SmartListStatusPill>
        ),
      },
    ],
    []
  )

  const cashFlowColumns = React.useMemo<BentoSmartListColumn<CashFlowRow>[]>(
    () => [
      {
        key: "monthKey",
        title: "חודש",
        className: "w-[7rem] font-currency-mono text-xs",
        render: (item) => item.monthKey,
      },
      {
        key: "kind",
        title: "תנועה",
        className: "w-[7rem]",
        render: (item) => (
          <SmartListStatusPill tone={cashFlowKindTone(item.kind)}>
            {cashFlowKindLabelHe(item.kind)}
          </SmartListStatusPill>
        ),
      },
      {
        key: "sourceRef",
        title: "מקור",
        className: "min-w-[10rem]",
        render: (item) => item.sourceRef,
      },
      {
        key: "forecast",
        title: "תחזית",
        className: "w-[8rem] font-currency-mono text-xs",
        render: (item) => formatNis(item.forecastAmount),
      },
      {
        key: "actual",
        title: "בפועל",
        className: "w-[8rem] font-currency-mono text-xs",
        render: (item) => formatNis(item.actualAmount),
      },
    ],
    []
  )

  const focusTitle = isPaymentDemands
    ? "FocusPane: אישור / פיצול / עדכון תאריך דרישת תשלום"
    : "FocusPane: תחזית מול ביצוע תזרים"

  return (
    <>
      <EntityWorkspace
        title={title}
        description={subtitle}
        headerActions={
          isPaymentDemands ? (
            <>
              <Button type="button" size="sm" variant="outline">
                סינון חודשי
              </Button>
              <Button type="button" size="sm">
                אישור קבוצתי לתשלום
              </Button>
            </>
          ) : (
            <>
              <Button type="button" size="sm" variant="outline">
                כניסה צפויה
              </Button>
              <Button type="button" size="sm">
                יציאה צפויה
              </Button>
            </>
          )
        }
        sidebar={
          <div className="space-y-2">
            <KpiCard title="תחזית חודשית (הכנסות פחות הוצאות)" value="₪-0.22M" />
            <KpiCard title="סך דרישות תשלום פתוחות" value="₪3.41M" />
            <KpiCard
              title="קצב שריפת מזומנים (Burn Rate)"
              value="₪1.86M / חודש"
              valueClassName="text-rose-600 dark:text-rose-400"
            />
          </div>
        }
        main={
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {isPaymentDemands ? (
              <BentoSmartList
                items={PAYMENT_DEMAND_ROWS}
                columns={paymentColumns}
                rowKey={(item) => item.id}
                selectedRowKey={selectedId}
                onRowClick={(item) => setSelectedId(item.id)}
                emptyState="אין דרישות תשלום להצגה"
              />
            ) : (
              <BentoSmartList
                items={CASH_FLOW_ROWS}
                columns={cashFlowColumns}
                rowKey={(item) => item.id}
                selectedRowKey={selectedId}
                onRowClick={(item) => setSelectedId(item.id)}
                emptyState="אין רשומות תזרים להצגה"
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              Canonical scaffold: 70/30 `EntityWorkspace` + `Sheet` FocusPane בלבד.
            </p>
          </div>
        }
      />

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="left" className="w-[min(40rem,100vw)] p-0">
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
                  {isPaymentDemands ? "Payment Demand Workflow" : "Cash Flow Forecast Workflow"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                {isPaymentDemands ? (
                  <>
                    <p>TODO: אישור דרישת תשלום, פיצול תשלום, ועדכון תאריך פירעון.</p>
                    <p>TODO: קישור אוטומטי לחשבון מאושר מחוזים/רכש.</p>
                  </>
                ) : (
                  <>
                    <p>TODO: תכנון תחזית חודשית להכנסות והוצאות.</p>
                    <p>TODO: הצגת Cash Gap ויחס תחזית מול תשלום/תקבול בפועל.</p>
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
