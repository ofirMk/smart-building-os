# GEMINI_SYNC_BRIEF — Revenue Engine & Partner Metrics (2026-04-03)

## Purpose

Keep external agents (e.g. Gemini) aligned with **recognized revenue**, **contract billing**, and **partner profit** without re-deriving business rules from stale context.

## Income (partner / `getPartnerFinancials`)

- **Invoices:** Sum `mo_invoices.grand_total` where `status` ∈ `approved`, `paid`, scoped by project.
- **Partial accounts:** Sum `partial_accounts.payment_due` where `status` = `approved`, **excluding** rows whose `id` appears as `mo_invoices.linked_partial_account_id` (no double count with invoices).
- **Profit** = income − (subcontractors + salaries + petty + overhead + procurement). **Management fee** = 25% × net profit per project (and portfolio roll-up).

## Contract billing UI (`/marker-ofek/finance/contracts/[id]`)

- **Contract lines:** `contract_items` view → `contract_line_items` (WBS: `wbs_weight_percent`, `sort_order`); partial lines use `quantity_previous` / `quantity_current` (0–100% of line value), `line_total_price` for period work.
- **Deductions:** Table `contract_deduction_rules` (kinds: retention, insurance, lab_fees). Contracts also carry `lab_fees_pct`, `index_linkage_base_date`, `index_coefficient` (V1 default 1).
- **Server:** `calculatePartialAccount` + **`lib/marker-ofek/partial-account-calc.ts`** — period gross → × index → subtract three deductions; `revalidatePath` includes partner-finance routes.
- **Recognition display:** `getContractRecognizedTotals` — same split as partner income at **contract** scope (invoices + orphan approved partials).
- **Gantt hints:** `project_boq.item_code` ↔ `contract_line_items.section_number`; task links via `task_boq_links`; weighted progress suggests **נוכחי %**.

## Stabilization

- `npx tsc --noEmit` clean; Gantt uses `safeParseDay` / sanitized tasks for `gantt-task-react`.

## Files to read first

- `lib/actions/partner-metrics-actions.ts` — `getPartnerFinancials`
- `lib/actions/partial-account-actions.ts` — `calculatePartialAccount`
- `lib/marker-ofek/partial-account-calc.ts` — pure billing math (index + deductions)
- `lib/marker-ofek/contract-billing-revenue.ts` — `getContractRecognizedTotals`
- `app/(dashboard)/marker-ofek/finance/contracts/[id]/contract-billing-center-client.tsx` — pharmacy UI + progress bar
