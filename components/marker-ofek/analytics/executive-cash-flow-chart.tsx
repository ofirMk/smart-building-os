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

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const CHART_IN = "expectedIn"
const CHART_OUT = "expectedOut"

export type ExecutiveCashFlowChartDatum = {
  name: string
  [CHART_IN]: number
  [CHART_OUT]: number
}

export function ExecutiveCashFlowChart({
  data,
}: {
  data: ExecutiveCashFlowChartDatum[]
}) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="h-[280px] animate-pulse rounded-lg bg-background" aria-hidden />
    )
  }

  return (
    <div className="h-[280px] w-full min-h-[260px]" dir="ltr">
      <ResponsiveContainer width="100%" height={280} minWidth={0} minHeight={260}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-slate-200"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#64748b" }}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748b" }}
            width={64}
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
              border: "1px solid #e2e8f0",
              background: "#ffffff",
              color: "#0f172a",
            }}
            formatter={(value, name) => {
              const n =
                typeof value === "number" ? value : Number(value ?? 0)
              const label =
                name === CHART_IN
                  ? "צפי הכנסות"
                  : name === CHART_OUT
                    ? "צפי הוצאות"
                    : String(name)
              return [ils.format(n), label]
            }}
          />
          <Legend
            wrapperStyle={{ direction: "rtl", fontSize: 12 }}
            formatter={(value) =>
              value === CHART_IN
                ? "צפי הכנסות"
                : value === CHART_OUT
                  ? "צפי הוצאות"
                  : value
            }
          />
          <Bar
            dataKey={CHART_IN}
            name={CHART_IN}
            fill="#059669"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
          <Bar
            dataKey={CHART_OUT}
            name={CHART_OUT}
            fill="#dc2626"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
