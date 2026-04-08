export type TaxComplianceMode = "warning" | "blocking"

export type MoSystemSettingsComplianceSlice = {
  tax_compliance_mode: TaxComplianceMode
}

export type SupplierComplianceEntitySlice = {
  withholding_tax_expiry: string | null
  bookkeeping_auth_expiry: string | null
  /** אופציונלי — ממוזג מעל `bookkeeping_auth_expiry` כשקיים במסד */
  bookkeeping_cert_expiry?: string | null
  withholding_tax_expires_at?: string | null
}

const BOOKKEEPING_MSG =
  "אופיר, שים לב: לספק זה אין אישור ניכוי מס / ניהול ספרים בתוקף."

function parseIsoDate(d: string | null | undefined): Date | null {
  if (d == null || String(d).trim() === "") return null
  const s = String(d).slice(0, 10)
  const t = Date.parse(`${s}T12:00:00.000Z`)
  if (!Number.isFinite(t)) return null
  return new Date(t)
}

function isExpiredOrMissing(expiry: string | null | undefined, today: Date): boolean {
  const dt = parseIsoDate(expiry ?? null)
  if (dt == null) return true
  const eod = new Date(dt)
  eod.setUTCHours(23, 59, 59, 999)
  return eod < today
}

/**
 * בדיקת תוקף ניכוי / ניהול ספרים לספק.
 * אם אחד מהתאריכים חסר או פג — נחשב כלא תקין (אזהרה או חסימה לפי מצב המערכת).
 */
export function evaluateSupplierTaxCompliance(
  entity: SupplierComplianceEntitySlice | null | undefined,
  settings: MoSystemSettingsComplianceSlice | null | undefined,
  now: Date = new Date()
): {
  alertMessage: string | null
  submitBlocked: boolean
} {
  const mode = settings?.tax_compliance_mode ?? "warning"
  if (!entity) {
    return {
      alertMessage: BOOKKEEPING_MSG,
      submitBlocked: mode === "blocking",
    }
  }
  const wh = entity.withholding_tax_expires_at ?? entity.withholding_tax_expiry
  const books =
    entity.bookkeeping_cert_expiry ?? entity.bookkeeping_auth_expiry
  const badWithholding = isExpiredOrMissing(wh, now)
  const badBooks = isExpiredOrMissing(books, now)
  if (!badWithholding && !badBooks) {
    return { alertMessage: null, submitBlocked: false }
  }
  return {
    alertMessage: BOOKKEEPING_MSG,
    submitBlocked: mode === "blocking",
  }
}
