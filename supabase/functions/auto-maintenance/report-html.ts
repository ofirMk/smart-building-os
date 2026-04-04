/**
 * SYNC עם lib/infrastructure/email-templates/diamond-system-report.ts
 */
import type { ExecutiveHealthReport } from "./generate-payload.ts"

const brand = {
  accent: "#0d9488",
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  warn: "#ea580c",
  bad: "#dc2626",
}

function severityColor(s: string): string {
  if (s === "critical") return brand.bad
  if (s === "warning") return brand.warn
  return brand.accent
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;")
}

export function buildDiamondSystemReportHtml(report: ExecutiveHealthReport): string {
  const rows = report.issues
    .map(
      (it) => `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid ${brand.border};vertical-align:top;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${severityColor(it.severity)};margin-inline-end:8px;"></span>
          <strong style="color:${brand.text};font-size:15px;">${escapeHtml(it.title)}</strong>
          <div style="color:${brand.muted};font-size:13px;margin-top:6px;line-height:1.45;">${escapeHtml(it.detail)}</div>
          ${it.metric ? `<div style="margin-top:8px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:${brand.text};">${escapeHtml(it.metric)}</div>` : ""}
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid ${brand.border};text-align:end;vertical-align:middle;white-space:nowrap;">
          <a href="${escapeAttr(it.actionUrl)}" style="display:inline-block;padding:10px 16px;background:${brand.accent};color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">
            ${escapeHtml(it.actionLabel)}
          </a>
        </td>
      </tr>`
    )
    .join("")

  const selfHealBlock =
    report.selfHeal != null
      ? `<pre style="background:#f8fafc;border:1px solid ${brand.border};border-radius:10px;padding:14px;font-size:11px;overflow:auto;direction:ltr;text-align:left;">${escapeHtml(JSON.stringify(report.selfHeal, null, 2))}</pre>`
      : ""

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
        <tr><td style="background:linear-gradient(135deg,${brand.accent} 0%,#0f766e 100%);padding:28px 24px;color:#fff;">
          <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.9;">Executive summary</div>
          <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;">דוח בריאות מערכת — Diamond</h1>
          <p style="margin:10px 0 0;font-size:14px;opacity:0.95;line-height:1.5;">${escapeHtml(report.summaryLine)}</p>
          <p style="margin:12px 0 0;font-size:12px;opacity:0.85;">${escapeHtml(report.generatedAtIso)}</p>
        </td></tr>
        <tr><td style="padding:8px 0 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table></td></tr>
        <tr><td style="padding:20px 24px 28px;">
          <p style="color:${brand.muted};font-size:12px;line-height:1.5;margin:0 0 12px;">דוח אוטומטי לתמיכה — אין להשיב למייל זה.</p>
          <p style="color:${brand.muted};font-size:12px;margin:0 0 16px;"><strong>Self-heal</strong> (אם הופעל):</p>
          ${selfHealBlock}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
