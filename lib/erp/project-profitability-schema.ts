import { z } from "zod"

export const projectProfitabilitySchema = z.object({
  budgetVsActual: z.array(
    z.object({
      category: z.enum(["Subcontractors", "Materials", "Overhead"]),
      budget: z.coerce.number(),
      actual: z.coerce.number(),
    })
  ),
  submittedVsApproved: z.object({
    submittedTotal: z.coerce.number(),
    approvedTotal: z.coerce.number(),
    gap: z.coerce.number(),
  }),
  profitMarginHeatmap: z.array(
    z.object({
      subChapter: z.string(),
      expectedRevenue: z.coerce.number(),
      expectedCost: z.coerce.number(),
      lineCount: z.coerce.number(),
      marginPct: z.coerce.number(),
      risk: z.enum(["LOW", "MEDIUM", "HIGH"]),
    })
  ),
  netProfitability: z.coerce.number(),
  totalApprovedClientAmount: z.coerce.number().optional(),
  totalSubcontractorBills: z.coerce.number().optional(),
  directMaterialCosts: z.coerce.number().optional(),
  totalOffsetsAndCommissions: z.coerce.number().optional(),
  offsetExposure: z.coerce.number(),
  currentMarginPct: z.coerce.number().optional(),
  targetMarginPct: z.coerce.number().optional(),
  profitabilityScore: z
    .object({
      currentMarginPct: z.coerce.number(),
      targetMarginPct: z.coerce.number(),
      deltaPctFormatted: z.string(),
    })
    .optional(),
  riskMap: z
    .object({
      openOffsetsCount: z.coerce.number(),
      openOffsetsAmount: z.coerce.number(),
      highVarianceOverridesCount: z.coerce.number(),
      highestVariancePct: z.string(),
    })
    .optional(),
  healthScore: z.coerce.number().optional(),
  healthScoreBreakdown: z
    .object({
      marginVsTargetScore: z.coerce.number(),
      cashFlowVelocityScore: z.coerce.number(),
      priceOverrideScore: z.coerce.number(),
    })
    .optional(),
  cashFlowForecast: z
    .object({
      haircutFactor: z.coerce.number(),
      monthlyApprovedRunRate: z.coerce.number(),
      forecast90d: z.coerce.number(),
      averageApprovalLagDays: z.coerce.number().optional(),
      lookaheadDays: z.coerce.number().optional(),
      totals: z
        .object({
          confirmedInflow: z.coerce.number(),
          expectedInflow: z.coerce.number(),
          totalInflow: z.coerce.number(),
        })
        .optional(),
      timeline: z
        .array(
          z.object({
            billId: z.string(),
            billNumber: z.string(),
            contractId: z.string(),
            forecastType: z.enum(["CONFIRMED", "EXPECTED"]),
            amount: z.coerce.number(),
            approvalDate: z.string().nullable(),
            cashArrivalDate: z.string(),
            paymentTermsDays: z.coerce.number(),
          })
        )
        .optional(),
    })
    .optional(),
  subcontractorPerformance: z
    .array(
      z.object({
        subcontractorId: z.string(),
        subcontractorName: z.string(),
        revenueLeakage: z.coerce.number(),
        overrideCount: z.coerce.number(),
        avgVariancePct: z.coerce.number(),
        historicalSampleCount: z.coerce.number(),
      })
    )
    .optional(),
})

export type ProjectProfitabilityPayload = z.infer<typeof projectProfitabilitySchema>
