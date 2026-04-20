import * as React from "react"
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"

import type { ProjectProfitabilityPayload } from "@/lib/erp/project-profitability-schema"
import { formatPricingDeltaPercent } from "@/lib/erp/notifications"

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 20,
    backgroundColor: "#F8FAFC",
    fontSize: 10,
    color: "#0f172a",
    fontFamily: "Helvetica",
  },
  brand: {
    backgroundColor: "#0f172a",
    color: "#ffffff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  brandTitle: { fontSize: 16, fontWeight: 700 },
  brandSubtitle: { fontSize: 9, opacity: 0.8, marginTop: 4 },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { color: "#475569" },
  value: { fontWeight: 700 },
  grid: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  card: {
    width: "48%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 8,
    marginBottom: 8,
  },
  cardTitle: { fontSize: 9, color: "#334155" },
  cardValue: { marginTop: 3, fontSize: 13, fontWeight: 700 },
  gaugeWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#eff6ff",
    padding: 10,
    marginBottom: 8,
    alignItems: "center",
  },
  gaugeValue: { fontSize: 28, fontWeight: 800, color: "#0f172a" },
  gaugeLabel: { marginTop: 2, fontSize: 9, color: "#334155" },
  gaugeTrack: {
    marginTop: 8,
    height: 8,
    width: "100%",
    borderRadius: 999,
    backgroundColor: "#dbeafe",
  },
  gaugeFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#2563eb",
  },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 3,
  },
  colSubbie: { width: "34%", fontSize: 9, color: "#0f172a" },
  colLeakage: { width: "22%", textAlign: "right", fontSize: 9 },
  colVariance: { width: "22%", textAlign: "right", fontSize: 9 },
  colCount: { width: "22%", textAlign: "right", fontSize: 9 },
  footer: { marginTop: 8, fontSize: 8, color: "#64748b" },
})

function money(value: number): string {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function pct(value: number): string {
  if (!Number.isFinite(value)) return "—"
  const fixed = Number(value).toFixed(1)
  const signed = Number(value) >= 0 ? `+${fixed}` : fixed
  return `${signed}%`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function ExecutiveSummaryDocument({
  projectId,
  projectName,
  generatedAtIso,
  data,
}: {
  projectId: string
  projectName: string
  generatedAtIso: string
  data: ProjectProfitabilityPayload
}) {
  const submitted = data.submittedVsApproved.submittedTotal
  const approved = data.submittedVsApproved.approvedTotal
  const currentMargin =
    data.profitabilityScore?.currentMarginPct ??
    (data.profitMarginHeatmap.length > 0
      ? data.profitMarginHeatmap.reduce((sum, row) => sum + row.marginPct, 0) /
        data.profitMarginHeatmap.length
      : 0)
  const targetMargin = data.profitabilityScore?.targetMarginPct ?? 18
  const marginDeltaRatio = (currentMargin - targetMargin) / 100
  const openOffsetsAmount = data.riskMap?.openOffsetsAmount ?? 0
  const openOffsetsCount = data.riskMap?.openOffsetsCount ?? 0
  const highVarianceCount = data.riskMap?.highVarianceOverridesCount ?? 0
  const highestVariancePct =
    data.riskMap?.highestVariancePct ?? formatPricingDeltaPercent(0)
  const healthScore = clamp(Number(data.healthScore ?? 0), 0, 100)
  const forecast = data.cashFlowForecast ?? {
    haircutFactor: submitted > 0 ? approved / submitted : 1,
    monthlyApprovedRunRate: approved,
    forecast90d: approved * 3,
  }
  const subcontractorRiskRows = (data.subcontractorPerformance ?? []).slice(0, 8)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.brand}>
          <Text style={styles.brandTitle}>Holden Group · Executive Summary</Text>
          <Text style={styles.brandSubtitle}>
            Project Hub snapshot · {projectName} · {projectId.slice(0, 8)} ·{" "}
            {new Date(generatedAtIso).toLocaleString("en-GB")}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Health Gauge (0-100)</Text>
          <View style={styles.gaugeWrap}>
            <Text style={styles.gaugeValue}>{healthScore.toFixed(0)}</Text>
            <Text style={styles.gaugeLabel}>Weighted by margin, cash-flow velocity and override pressure</Text>
            <View style={styles.gaugeTrack}>
              <View style={[styles.gaugeFill, { width: `${healthScore}%` }]} />
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Margin vs Target</Text>
            <Text style={styles.value}>{pct(data.healthScoreBreakdown?.marginVsTargetScore ?? 0)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Cash-Flow Velocity</Text>
            <Text style={styles.value}>{pct(data.healthScoreBreakdown?.cashFlowVelocityScore ?? 0)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Price Override Discipline</Text>
            <Text style={styles.value}>{pct(data.healthScoreBreakdown?.priceOverrideScore ?? 0)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cash Flow Forecast (90 Days)</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Submitted</Text>
            <Text style={styles.value}>{money(submitted)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Approved</Text>
            <Text style={styles.value}>{money(approved)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Haircut Factor (Approved / Submitted)</Text>
            <Text style={styles.value}>{forecast.haircutFactor.toFixed(3)}x</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Monthly Approved Run-Rate</Text>
            <Text style={styles.value}>{money(forecast.monthlyApprovedRunRate)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>90-Day Forecast</Text>
            <Text style={styles.value}>{money(forecast.forecast90d)}</Text>
          </View>
          <Text style={{ marginTop: 4, fontSize: 8, color: "#64748b" }}>
            Expected inflow is projected from current SUBMITTED bills using the historical haircut factor.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profitability Score (Current vs Target)</Text>
          <View style={styles.grid}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Current Margin</Text>
              <Text style={styles.cardValue}>{pct(currentMargin)}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Target Margin</Text>
              <Text style={styles.cardValue}>{pct(targetMargin)}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Delta</Text>
              <Text style={styles.cardValue}>{formatPricingDeltaPercent(marginDeltaRatio)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subcontractor Performance</Text>
          <View style={styles.tableHead}>
            <Text style={styles.colSubbie}>Subcontractor</Text>
            <Text style={styles.colLeakage}>Leakage</Text>
            <Text style={styles.colVariance}>Avg Variance</Text>
            <Text style={styles.colCount}>Overrides</Text>
          </View>
          {subcontractorRiskRows.length === 0 ? (
            <Text style={{ fontSize: 9, color: "#64748b" }}>No subcontractor override leakage identified.</Text>
          ) : (
            subcontractorRiskRows.map((row) => (
              <View style={styles.tableRow} key={row.subcontractorId}>
                <Text style={styles.colSubbie}>{row.subcontractorName}</Text>
                <Text style={styles.colLeakage}>{money(row.revenueLeakage)}</Text>
                <Text style={styles.colVariance}>{pct(row.avgVariancePct)}</Text>
                <Text style={styles.colCount}>{row.overrideCount}</Text>
              </View>
            ))
          )}
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 9, color: "#334155" }}>
              Open Offsets: {openOffsetsCount} · Exposure: {money(openOffsetsAmount)}
            </Text>
            <Text style={{ fontSize: 9, color: "#334155" }}>
              High-Variance Overrides: {highVarianceCount} · Peak: {highestVariancePct}
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          All pricing deltas are normalized to one decimal place per policy.
        </Text>
      </Page>
    </Document>
  )
}

export async function renderExecutiveSummaryPdf(args: {
  projectId: string
  projectName: string
  generatedAtIso: string
  data: ProjectProfitabilityPayload
}): Promise<Buffer> {
  return renderToBuffer(<ExecutiveSummaryDocument {...args} />)
}
