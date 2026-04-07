import type {
  ExecutiveHealthReport,
  HealthIssue,
  MaintenanceHealthSnapshot,
} from "@/lib/infrastructure/system-health-types"

function trimBaseUrl(url: string): string {
  return url.replace(/\/+$/, "")
}

/**
 * בונה מודל דוח מנהלים עם קישורי פעולה — משמש גם ב־Edge (העתק בתיקיית הפונקציה).
 */
export function generateSystemHealthPayload(
  snapshot: MaintenanceHealthSnapshot | null,
  opts: { baseUrl: string; selfHealResult?: unknown }
): ExecutiveHealthReport {
  const base = trimBaseUrl(opts.baseUrl || "https://app.example.com")
  const issues: HealthIssue[] = []
  const o = snapshot?.orphans
  const s = snapshot?.suppliers_tax
  const d = snapshot?.database
  const err = snapshot?.errors_7d

  if ((o?.contracts_invalid_project_count ?? 0) > 0) {
    issues.push({
      id: "orphan-contracts",
      severity: "critical",
      title: "חוזים עם פרויקט לא תקין",
      detail: `${o?.contracts_invalid_project_count} חוזים פעילים מצביעים על פרויקט חסר או מחוק.`,
      metric: String(o?.contracts_invalid_project_count),
      actionUrl: `${base}/marker-ofek/contracts`,
      actionLabel: "פתיחת חוזים",
    })
  }

  if ((o?.partial_accounts_invalid_project_count ?? 0) > 0) {
    issues.push({
      id: "orphan-partials",
      severity: "critical",
      title: "חשבונות חלקיים (יתומים)",
      detail: `${o?.partial_accounts_invalid_project_count} רשומות ללא פרויקט תקף.`,
      metric: String(o?.partial_accounts_invalid_project_count),
      actionUrl: `${base}/marker-ofek/finance/partials`,
      actionLabel: "מודול חשבונות חלקיים",
    })
  }

  if ((o?.mo_invoices_invalid_project_count ?? 0) > 0) {
    issues.push({
      id: "orphan-invoices",
      severity: "critical",
      title: "חשבוניות מס ללא פרויקט תקף",
      detail: `${o?.mo_invoices_invalid_project_count} רשומות דורשות קישור לפרויקט.`,
      metric: String(o?.mo_invoices_invalid_project_count),
      actionUrl: `${base}/marker-ofek/finance`,
      actionLabel: "כספים",
    })
  }

  if ((o?.projects_missing_client_entity_count ?? 0) > 0) {
    issues.push({
      id: "projects-no-client",
      severity: "warning",
      title: "פרויקטים בלי מזמין (client_entity_id)",
      detail: `${o?.projects_missing_client_entity_count} פרויקטים פעילים ללא לקוח מקושר ב־MDM.`,
      metric: String(o?.projects_missing_client_entity_count),
      actionUrl: `${base}/marker-ofek/projects`,
      actionLabel: "מרכז פרויקטים",
    })
  }

  const taxAttention =
    (s?.expiring_next_30_days_count ?? 0) +
    (s?.expired_last_30_days_count ?? 0)
  if (taxAttention > 0) {
    issues.push({
      id: "supplier-tax",
      severity: "warning",
      title: "ספקים — חלון תוקף 30 יום",
      detail: `פג או עומד לפוג בתוך 30 יום: ${s?.expired_last_30_days_count ?? 0} פג לאחרונה, ${s?.expiring_next_30_days_count ?? 0} עומדים לפוג.`,
      metric: String(taxAttention),
      actionUrl: `${base}/marker-ofek/entities/suppliers`,
      actionLabel: "טבלת ספקים ותאימות",
    })
  }

  if (d?.database_size_bytes != null) {
    const mb = Math.round(d.database_size_bytes / 1024 / 1024)
    issues.push({
      id: "db-size",
      severity: "info",
      title: "גודל מסד נתונים",
      detail: d.note ?? "נפח כולל + אינדקסים גדולים ב־public (לא אחוז נפח מת).",
      metric: `${mb} MB`,
      actionUrl: `${base}/marker-ofek/settings/system-rules`,
      actionLabel: "הגדרות מערכת",
    })
  }

  if ((err?.event_count ?? 0) > 0) {
    issues.push({
      id: "app-errors",
      severity: "warning",
      title: "אירועי שגיאה (7 ימים)",
      detail: `${err?.event_count} רשומות ב־mo_system_error_events. ודאו שהאפליקציה מדווחת לטבלה.`,
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
      actionUrl: `${base}/management`,
      actionLabel: "דשבורד הנהלה",
    })
  }

  const critical = issues.filter((i) => i.severity === "critical").length
  const summaryLine =
    critical > 0
      ? `Diamond Report: ${critical} נושאים קריטיים, ${issues.length} סה״כ`
      : `Diamond Report: מצב תקין יחסי — ${issues.length} סעיפים בדוח`

  return {
    generatedAtIso: snapshot?.generated_at ?? new Date().toISOString(),
    summaryLine,
    issues,
    rawSnapshot: snapshot,
    selfHeal: opts.selfHealResult ?? null,
    baseUrl: base,
  }
}
