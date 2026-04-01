"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
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
import type { EvDailyKwhDatum } from "@/lib/dashboard-charts-data"

type EvEnergyChartProps = {
  data: EvDailyKwhDatum[]
}

export function EvEnergyChart({ data }: EvEnergyChartProps) {
  const maxKwh = Math.max(0, ...data.map((d) => d.kwh), 1)

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="border-b border-border/50 pb-3 text-start">
        <CardTitle className="text-base font-semibold">
          צריכת טעינה (7 ימים)
        </CardTitle>
        <CardDescription className="text-pretty">
          סכום קוט״ש לפי יום (לפי זמן ישראל), מתאריך התחלת הסשן
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="h-[300px] w-full min-h-[300px]" dir="ltr">
          <ResponsiveContainer
            width="100%"
            height={300}
            minWidth={0}
            minHeight={300}
          >
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, left: 4, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border/60"
                vertical={false}
              />
              <XAxis
                dataKey="labelHe"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                interval={0}
                angle={-18}
                textAnchor="end"
                height={56}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                width={44}
                tickFormatter={(v) =>
                  typeof v === "number"
                    ? v.toLocaleString("he-IL", { maximumFractionDigits: 0 })
                    : String(v)
                }
                domain={[0, Math.ceil(maxKwh * 1.1) || 1]}
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
                formatter={(value) => {
                  const v =
                    typeof value === "number"
                      ? value
                      : Number(value ?? 0)
                  const formatted = v.toLocaleString("he-IL", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })
                  return [formatted + " קוט״ש", "צריכה"]
                }}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as EvDailyKwhDatum | undefined
                  return row?.labelHe ?? ""
                }}
              />
              <Bar
                dataKey="kwh"
                fill="var(--chart-1)"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
