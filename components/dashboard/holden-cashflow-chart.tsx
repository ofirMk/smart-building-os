"use client"

import * as React from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { MonthlyCashflowDatum } from "@/lib/dashboard-billing-chart-data"
import { formatNisHe } from "@/lib/format-nis"

type HoldenCashflowChartProps = {
  data: MonthlyCashflowDatum[]
}

export function HoldenCashflowChart({ data }: HoldenCashflowChartProps) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const chartData = data.map((d) => ({
    name: d.labelHe,
    collected: d.collected,
    outstanding: d.outstanding,
  }))

  const hasAny = chartData.some(
    (r) => (r.collected ?? 0) > 0 || (r.outstanding ?? 0) > 0
  )

  if (!mounted) {
    return (
      <Card className="overflow-hidden border-border/70 shadow-sm">
        <div className="h-[380px] animate-pulse rounded-xl bg-muted/25" />
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="border-b border-border/50 pb-3 text-start">
        <CardTitle className="text-base font-semibold">
          הכנסות מגבייה מול יתרות לגבייה
        </CardTitle>
        <CardDescription className="text-pretty">
          סכומים משוערים לפי חודש — שולמו (לפי תאריך תשלום) וממתינים (לפי יעד
          תשלום)
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {!hasAny ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            אין נתוני חשבוניות להצגה בטווח זה
          </p>
        ) : (
          <div className="h-[320px] w-full min-h-[300px]" dir="ltr">
            <ResponsiveContainer
              width="100%"
              height={320}
              minWidth={0}
              minHeight={300}
            >
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 4, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border/60"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  interval={0}
                  angle={-12}
                  textAnchor="end"
                  height={52}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  width={56}
                  tickFormatter={(v) =>
                    typeof v === "number"
                      ? v.toLocaleString("he-IL", {
                          maximumFractionDigits: 0,
                          notation: v >= 1_000_000 ? "compact" : "standard",
                        })
                      : String(v)
                  }
                />
                <Tooltip
                  contentStyle={{
                    direction: "rtl",
                    textAlign: "right",
                    borderRadius: "0.5rem",
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--popover))",
                    color: "hsl(var(--popover-foreground))",
                  }}
                  formatter={(value, name) => {
                    const n =
                      typeof value === "number"
                        ? value
                        : Number(value ?? 0)
                    const label =
                      name === "collected"
                        ? "שולמו"
                        : name === "outstanding"
                          ? "ממתינים"
                          : String(name)
                    return [formatNisHe(n), label]
                  }}
                />
                <Legend
                  wrapperStyle={{ direction: "rtl", fontSize: 12 }}
                  formatter={(value) =>
                    value === "collected"
                      ? "שולמו בחודש"
                      : value === "outstanding"
                        ? "ממתינים (יעד בחודש)"
                        : value
                  }
                />
                <Bar
                  dataKey="collected"
                  fill="var(--chart-2)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                  name="collected"
                />
                <Bar
                  dataKey="outstanding"
                  fill="var(--chart-4)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                  name="outstanding"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
