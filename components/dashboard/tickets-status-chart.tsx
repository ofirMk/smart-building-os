"use client"

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { TicketStatusDatum } from "@/lib/dashboard-charts-data"

const STATUS_FILL: Record<string, string> = {
  open: "var(--chart-1)",
  in_progress: "var(--chart-2)",
  resolved: "var(--chart-3)",
  closed: "var(--chart-4)",
}

type TicketsStatusChartProps = {
  data: TicketStatusDatum[]
}

export function TicketsStatusChart({ data }: TicketsStatusChartProps) {
  const chartData = data
    .filter((d) => d.count > 0)
    .map((d) => ({
      name: d.labelHe,
      value: d.count,
      status: d.status,
    }))

  const total = data.reduce((acc, d) => acc + d.count, 0)

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="border-b border-border/50 pb-3 text-start">
        <CardTitle className="text-base font-semibold">קריאות לפי סטטוס</CardTitle>
        <CardDescription className="text-pretty">
          התפלגות כלל הקריאות במערכת לפי מצב הטיפול
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {total === 0 || chartData.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            אין נתוני קריאות להצגה
          </p>
        ) : (
          <div className="h-[300px] w-full min-h-[300px]" dir="ltr">
            <ResponsiveContainer
              width="100%"
              height={300}
              minWidth={0}
              minHeight={300}
            >
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={88}
                  paddingAngle={2}
                  stroke="hsl(var(--border))"
                  strokeWidth={1}
                >
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.status}
                      fill={STATUS_FILL[entry.status] ?? "var(--chart-5)"}
                    />
                  ))}
                </Pie>
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
                    return [
                      `${n.toLocaleString("he-IL")} קריאות`,
                      String(name ?? ""),
                    ]
                  }}
                />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  wrapperStyle={{
                    direction: "rtl",
                    paddingTop: 12,
                    fontSize: 12,
                  }}
                  formatter={(value) => (
                    <span className="text-foreground">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
