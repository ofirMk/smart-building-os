export type PreventiveTaskFrequency = "monthly" | "semi_annual" | "annual"

export type PreventiveTaskStatus = "pending" | "completed"

export type PreventiveTaskRow = {
  id: string
  title: string
  system_type: string
  frequency: PreventiveTaskFrequency
  next_due_date: string
  vendor_id: string | null
  status: PreventiveTaskStatus
  last_completed_at: string | null
  created_at: string
  updated_at: string
}
