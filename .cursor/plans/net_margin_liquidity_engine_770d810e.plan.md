---
name: Net Margin Liquidity Engine
overview: Consolidate billing simulation into a single reliable hook and align the Client Contract Workspace with BOQ-based subcontractor mapping, net margin, and free-cash liquidity calculations. Ensure consistent 1-decimal presentation, margin-risk indicators, and a clean TypeScript pass.
todos:
  - id: consolidate-hook
    content: Refactor `use-billing-simulation.ts` to one canonical hook implementation with consistent types and AbortController-driven effects.
    status: completed
  - id: boq-mapping
    content: Restrict subcontractor linking logic to normalized `boqRef`/`boqLineId` matching and recompute payout breakdown accordingly.
    status: completed
  - id: financial-metrics
    content: Finalize `netMarginProfit` and `freeCashLiquidity` formulas using zod coercion and one-decimal outputs.
    status: completed
  - id: workspace-ui
    content: Wire/adjust sidebar cards and BOQ risk indicators in workspace UI to reflect updated simulation outputs and color semantics.
    status: completed
  - id: quality-gate
    content: Run TypeScript check (`npx tsc --noEmit`) and fix any introduced type issues.
    status: completed
isProject: false
---

# Net Margin & Free Cash Liquidity Plan

## Scope
Implement the liquidity engine inside the existing simulation flow so each BOQ progress edit immediately reflects:
- simulated client revenue,
- simulated subcontractor payout commitment,
- net margin (profit),
- free cash after client/subcontractor retentions and VAT.

## Files to Change
- [c:\Users\user\Desktop\smart-building-os\lib\hooks\use-billing-simulation.ts](c:\Users\user\Desktop\smart-building-os\lib\hooks\use-billing-simulation.ts)
- [c:\Users\user\Desktop\smart-building-os\components\erp\workspaces\client-contracts\client-contracts-workspace-client.tsx](c:\Users\user\Desktop\smart-building-os\components\erp\workspaces\client-contracts\client-contracts-workspace-client.tsx)
- [c:\Users\user\Desktop\smart-building-os\components\ui\bento-metric-card.tsx](c:\Users\user\Desktop\smart-building-os\components\ui\bento-metric-card.tsx) (only if value color token flexibility needs adjustment)

## Implementation Steps
1. **Unify the simulation hook implementation**
   - Remove the duplicated/legacy hook block in `use-billing-simulation.ts` and keep one exported `useBillingSimulation` implementation with a single type surface.
   - Keep `AbortController` behavior for both projection and subcontractor-link fetch effects.
   - Preserve stable hook call order and unconditional hook usage.

2. **Enforce BOQ-ref-only line linking for subcontractor cost attribution**
   - In `useBillingSimulation`, map client and subcontractor lines using normalized BOQ references (`clientLine.boqRef` ↔ `subLine.boqLineId`) only.
   - Stop using `itemId` fallback in payout/margin computations, so cost is contract-line aligned by BOQ reference as requested.
   - Continue returning per-line linked entries and payout breakdown for existing popovers.

3. **Compute projected subcontractor payouts from sandbox progress**
   - For each BOQ line, derive `simulatedCurrentPct = simulatedTotalPct - baselineApprovedPct`, clamp to `[0, 100]`.
   - Compute per-linked-line payout = `quantity * unitPrice * (simulatedCurrentPct / 100)`.
   - Aggregate to one-decimal `expectedSubcontractorPayout` (vendor commitment for this simulated bill).

4. **Align financial outputs with mission formulas**
   - `netMarginProfit = simulatedRevenue - simulatedSubcontractorCost` where simulated revenue is the projected bill total from the sandbox projection.
   - `freeCashLiquidity = clientCashAfterRetentionAndVAT - subcontractorCashAfterRetentionAndVAT`, using `z.coerce.number()` on every liquidity input.
   - Keep all returned financial outputs rounded to one decimal before exposure.

5. **Update sidebar metric presentation and risk signaling**
   - Ensure sidebar cards in `client-contracts-workspace-client.tsx` render:
     - `Net Margin (Profit)` with emerald/rose value styling based on sign/erosion threshold,
     - `Free Cash (Liquidity)` with emerald (>=0) / rose (<0),
     - sub-label: `Subcontractor Impact` showing total committed vendor amount for the simulated bill.
   - Confirm BOQ Progress Editor includes a visible margin-risk indicator whenever `SubcontractorPrice > ClientPrice`.
   - Normalize all metric and derived display numbers to one-decimal formatting paths.

6. **Type safety and quality gate**
   - Verify no conditional hooks introduced in edited components/hook.
   - Run TypeScript check: `npx tsc --noEmit` and resolve any introduced type errors until exit code is 0.

## Key Existing Logic to Preserve While Refactoring
```358:391:c:\Users\user\Desktop\smart-building-os\lib\hooks\use-billing-simulation.ts
export function useBillingSimulation(
  input: UseBillingSimulationInput
): UseBillingSimulationResult {
  const {
    isEnabled,
    calculateProjection,
    projectId,
    lines,
    clientRetentionPct = 0,
    subcontractorRetentionPct = 0,
    vatPct = 17,
  } = input

  const [simulationByLineId, setSimulationByLineId] = React.useState<Record<string, number>>({})
  const [projection, setProjection] = React.useState<BillingSimulationProjection>(ZERO_PROJECTION)

  React.useEffect(() => {
    if (!isEnabled) {
      setProjection(ZERO_PROJECTION)
      return
    }

    const controller = new AbortController()
```

```1668:1695:c:\Users\user\Desktop\smart-building-os\components\erp\workspaces\client-contracts\client-contracts-workspace-client.tsx
<div className="space-y-2">
  <div className="grid gap-2">
    <BentoMetricCard
      label="Net Margin (Profit)"
      value={sandboxMode ? netMarginProfit : 0}
      suffix="₪"
      subLabel={`Subcontractor Impact: ${moneyOneDecimal(sandboxMode ? expectedSubcontractorPayout : 0)}`}
      className={
        sandboxMode
          ? netMarginProfit > netMarginSafetyThreshold
            ? "border-emerald-200 bg-emerald-50"
            : "border-rose-200 bg-rose-50"
          : undefined
      }
```

## Validation Checklist
- BOQ line with linked subcontractor line updates vendor payout when sandbox `%` changes.
- Net Margin equals projected simulated revenue minus projected subcontractor payout.
- Free Cash reflects both retentions and VAT adjustments.
- Margin Risk indicator appears on BOQ rows where subcontractor unit price exceeds client unit price.
- All currency/percent values render with one decimal.
- `npx tsc --noEmit` succeeds.