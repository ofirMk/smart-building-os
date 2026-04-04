/** תוצאת RPC public.mo_maintenance_collect_health() */
export type MaintenanceHealthSnapshot = {
  generated_at?: string
  orphans?: {
    contracts_invalid_project_count?: number
    contracts_sample?: Array<{ contract_id: string; project_id: string }>
    partial_accounts_invalid_project_count?: number
    partial_accounts_sample?: Array<{ id: string; project_id: string }>
    mo_invoices_invalid_project_count?: number
    projects_missing_client_entity_count?: number
  }
  suppliers_tax?: {
    expiring_next_30_days_count?: number
    expired_last_30_days_count?: number
    attention_sample?: Array<{
      id: string
      name: string
      withholding_tax_expiry: string | null
      bookkeeping_auth_expiry: string | null
    }>
  }
  database?: {
    database_size_bytes?: number
    top_public_indexes?: Array<{
      index: string
      table: string
      size_bytes: number
    }>
    note?: string
  }
  errors_7d?: {
    event_count?: number
    sample?: Array<{
      id: string
      source: string
      message: string
      created_at: string
    }>
  }
}

export type HealthIssue = {
  id: string
  severity: "critical" | "warning" | "info"
  title: string
  detail: string
  metric?: string
  /** קישור ישיר לטיפול ב־ERP */
  actionUrl: string
  actionLabel: string
}

export type ExecutiveHealthReport = {
  generatedAtIso: string
  summaryLine: string
  issues: HealthIssue[]
  rawSnapshot: MaintenanceHealthSnapshot | null
  selfHeal: unknown
  baseUrl: string
}
