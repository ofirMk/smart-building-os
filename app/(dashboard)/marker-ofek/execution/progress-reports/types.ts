export type SaveProgressReportResult =
  | { ok: true }
  | { ok: false; error: string }

export type ProgressReportLineInput = {
  contractMilestoneId: string
  pctPreviousCumulative: number
  pctCurrentCumulative: number
}

export type ProgressReportSaveStatus = "draft" | "submitted"
