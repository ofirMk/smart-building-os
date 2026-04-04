import type { GanttTaskSyncLite } from "@/lib/marker-ofek/gantt-billing-sync"
import type { DeductionPercents } from "@/lib/marker-ofek/partial-account-calc"
import type { MoPartialAccountStatus } from "@/types/marker-ofek"

export type ContractBillingInitial = {
  contractId: string
  projectId: string
  internalCode: string
  projectName: string
  contractLabel: string
  totalContract: number | null
  recognizedFromInvoices: number
  recognizedFromApprovedPartials: number
  totalRecognized: number
  contractGanttProgress: number | null
  /** Lightweight task list for Gantt ↔ billing sync (name fuzzy fallback). */
  ganttTasksForSync: GanttTaskSyncLite[]
  billingDraftParams: {
    deductionPercents: DeductionPercents
    indexCoefficient: number
  }
  /** Template for the next partial account (latest by account #). */
  newAccountBaseline: null | {
    sourcePartialAccountId: string
    sourceAccountNumber: number
    previousCumulativeApproved: number
    lines: Array<{
      contract_line_item_id: string | null
      contract_milestone_id: string | null
      label: string
      lineBase: number
      quantityPreviousEnd: number
      ganttSuggestedPercent: number | null
    }>
  }
  partialAccounts: Array<{
    id: string
    account_number: number
    status: MoPartialAccountStatus
    payment_due: number
    total_cumulative_amount: number
    current_progress_percent: number | null
    created_at: string
    /** ברוטו תקופתי (אחרי חישוב מצטבר) */
    period_work_gross: number
    period_work_indexed: number
    indexation_adjustment_amount: number
    retainage_amount: number
    lines: Array<{
      id: string
      contract_line_item_id: string | null
      contract_milestone_id: string | null
      quantity_previous: number
      quantity_current: number
      line_total_price: number
      cumulative_amount: number
      line_base_amount: number
      gantt_suggested_percent: number | null
      label: string
    }>
  }>
}
