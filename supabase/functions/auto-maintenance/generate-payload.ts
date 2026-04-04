/**
 * SYNC עם lib/infrastructure/system-health-payload.ts — עדכנו את שני הקבצים יחד.
 */
export type MaintenanceHealthSnapshot = Record<string, unknown>

export type HealthIssue = {
  id: string
  severity: "critical" | "warning" | "info"
  title: string
  detail: string
  metric?: string
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

function trimBaseUrl(url: string): string {
  return url.replace(/\/+$/, "")
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function generateSystemHealthPayload(
  snapshot: MaintenanceHealthSnapshot | null,
  opts: { baseUrl: string; selfHealResult?: unknown }
): ExecutiveHealthReport {
  const base = trimBaseUrl(opts.baseUrl || "https://app.example.com")
  const issues: HealthIssue[] = []

  const o = (snapshot?.orphans ?? null) as Record<string, unknown> | null
  const s = (snapshot?.suppliers_tax ?? null) as Record<string, unknown> | null
  const d = (snapshot?.database ?? null) as Record<string, unknown> | null
  const err = (snapshot?.errors_7d ?? null) as Record<string, unknown> | null

  if (num(o?.contracts_invalid_project_count) > 0) {
    issues.push({
      id: "orphan-contracts",
      severity: "critical",
      title: "חוזים עם פרויקט לא תקין",
      detail: `${num(o?.contracts_invalid_project_count)} חוזים פעילים מצביעים על פרויקט חסר או מחוק.`,
      metric: String(o?.contracts_invalid_project_count),
      actionUrl: `${base}/marker-ofek/contracts`,
      actionLabel: "פתיחת חוזים",
    })
  }

  if (num(o?.partial_accounts_invalid_project_count) > 0) {
    issues.push({
      id: "orphan-partials",
      severity: "critical",
      title: "חשבונות חלקיים (יתומים)",
      detail: `${num(o?.partial_accounts_invalid_project_count)} רשומות ללא פרויקט תקף.`,
      metric: String(o?.partial_accounts_invalid_project_count),
      actionUrl: `${base}/marker-ofek/finance/partials`,
      actionLabel: "מודול חשבונות חלקיים",
    })
  }

  if (num(o?.mo_invoices_invalid_project_count) > 0) {
    issues.push({
      id: "orphan-invoices",
      severity: "critical",
      title: "חשבוניות מס ללא פרויקט תקף",
      detail: `${num(o?.mo_invoices_invalid_project_count)} רשומות דורשות קישור לפרויקט.`,
      metric: String(o?.mo_invoices_invalid_project_count),
      actionUrl: `${base}/marker-ofek/finance`,
      actionLabel: "כספים",
    })
  }

  if (num(o?.projects_missing_client_entity_count) > 0) {
    issues.push({
      id: "projects-no-client",
      severity: "warning",
      title: "פרויקטים בלי מזמין (client_entity_id)",
      detail: `${num(o?.projects_missing_client_entity_count)} פרויקטים פעילים ללא לקוח מקושר ב־MDM.`,
      metric: String(o?.projects_missing_client_entity_count),
      actionUrl: `${base}/marker-ofek/projects`,
      actionLabel: "מרכז פרויקטים",
    })
  }

  const taxAttention = num(s?.expiring_next_30_days_count) + num(s?.expired_last_30_days_count)
  if (taxAttention > 0) {
    issues.push({
      id: "supplier-tax",
      severity: "warning",
      title: "ספקים — חלון תוקף 30 יום",
      detail: `פג או עומד לפוג בתוך 30 יום: ${num(s?.expired_last_30_days_count)} פג לאחרונה, ${num(s?.expiring_next_30_days_count)} עומדים לפוג.`,
      metric: String(taxAttention),
      actionUrl: `${base}/marker-ofek/entities/suppliers`,
      actionLabel: "טבלת ספקים ותאימות",
    })
  }

  if (d?.database_size_bytes != null) {
    const bytes = num(d.database_size_bytes)
    const mb = Math.round(bytes / 1024 / 1024)
    issues.push({
      id: "db-size",
      severity: "info",
      title: "גודל מסד נתונים",
      detail: typeof d.note === "string" ? d.note : "נפח כולל + אינדקסים גדולים ב־public.",
      metric: `${mb} MB`,
      actionUrl: `${base}/marker-ofek/settings/system-rules`,
      actionLabel: "הגדרות מערכת",
    })
  }

  if (num(err?.event_count) > 0) {
    issues.push({
      id: "app-errors",
      severity: "warning",
      title: "אירועי שגיאה (7 ימים)",
      detail: `${num(err?.event_count)} רשומות ב־mo_system_error_events.`,
      metric: String(err?.event_count),
      actionUrl: `${base}/marker-ofek/settings`,
      actionLabel: "הגדרות",
    })
  }

  if (issues.length === 0) {
    issues.push({
      id: "all-clear",
      severity: "info",
      title: "אין חריגות קריטיות בבדיקה האוטומטית",
      detail: "המשיכו לנטר ידנית ובדקו דוחות תקופתיים.",
      actionUrl: `${base}/marker-ofek/executive`,
      actionLabel: "דשבורד הנהלה",
    })
  }

  const critical = issues.filter((i) => i.severity === "critical").length
  const summaryLine =
    critical > 0
      ? `Diamond Report: ${critical} נושאים קריטיים, ${issues.length} סה״כ`
      : `Diamond Report: מצב תקין יחסי — ${issues.length} סעיפים בדוח`

  const genAt =
    typeof snapshot?.generated_at === "string"
      ? snapshot.generated_at
      : new Date().toISOString()

  return {
    generatedAtIso: genAt,
    summaryLine,
    issues,
    rawSnapshot: snapshot,
    selfHeal: opts.selfHealResult ?? null,
    baseUrl: base,
  }
}
