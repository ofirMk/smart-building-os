/**
 * Phase 8.1.4 — PO → Supplier Email Service
 *
 * עטיפה ל-`sendTransactionalEmail` שמטפלת בשני מצבים:
 *
 *   1. **Production** — יש `RESEND_API_KEY` או `POSTMARK_SERVER_TOKEN` בסביבה;
 *      המייל נשלח בפועל, מוחזר `{ delivery: "SUCCESS", providerMessage: id }`.
 *
 *   2. **MVP / Dev fallback** — אין שום ספק מייל מוגדר. במקום שנשבור, אנחנו
 *      רושמים ל-`console` את כל פרטי המייל (בלי ה-attachment בעצמו — רק
 *      הגודל) ומחזירים `{ delivery: "MOCK", providerMessage: "..." }`.
 *
 * הקוד הקורא (POST `/api/procurement/orders/[id]/send`) יודע להבדיל בין
 * SUCCESS ו-MOCK, רושם את התוצאה ל-`erp_po_sent_log`, ויודיע ל-UI אם
 * השליחה הייתה אמיתית או mock. ככה המעגל הפיננסי-SOX סגור — אין "נשלח"
 * ללא רישום, גם אם הקונפיגורציה חסרה.
 */

import "server-only"

import {
  sendTransactionalEmail,
  type SendTransactionalEmailInput,
} from "@/lib/infrastructure/email-service"

export type SendPoEmailInput = {
  recipientEmail: string
  officialPoNumber: string
  companyNameHe: string
  companyNameEn: string
  supplierName: string
  totalAmountGross: number
  currency: string
  note: string | null
  senderName: string | null
  /** Base64-encoded PDF payload (ללא data: prefix). */
  pdfBase64: string
}

export type SendPoEmailResult = {
  delivery: "SUCCESS" | "MOCK" | "FAILED"
  providerMessage: string | null
}

function hasProviderConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() ||
      process.env.POSTMARK_SERVER_TOKEN?.trim(),
  )
}

function buildEmailHtml(args: SendPoEmailInput): string {
  const amount = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: args.currency,
    minimumFractionDigits: 2,
  }).format(args.totalAmountGross)
  const noteBlock = args.note?.trim()
    ? `<p style="margin:12px 0;padding:12px 14px;background:#f8fafc;border-inline-start:3px solid #1e40af;color:#334155;line-height:1.5;white-space:pre-wrap;">${escapeHtml(args.note.trim())}</p>`
    : ""
  return `
<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 18px rgba(15,23,42,0.08);">
        <tr><td style="padding:22px 28px;background:#0f172a;color:#fff;">
          <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;opacity:0.8;">${escapeHtml(args.companyNameEn || args.companyNameHe)} · Purchase Order</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;">הזמנת רכש רשמית ${escapeHtml(args.officialPoNumber)}</div>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <p style="margin:0 0 10px;font-size:15px;">שלום ${escapeHtml(args.supplierName)},</p>
          <p style="margin:0 0 10px;line-height:1.55;">
            מצורפת בזאת הזמנת רכש מטעם <b>${escapeHtml(args.companyNameHe)}</b>
            בסך כולל של <b>${escapeHtml(amount)}</b> (כולל מע&quot;מ).
            מסמך ה-PDF המלא מצורף להודעה זו.
          </p>
          ${noteBlock}
          <p style="margin:14px 0 0;line-height:1.55;color:#475569;font-size:13px;">
            אנא אשרו קבלת ההזמנה בחוזר, וספקו ETA לאספקה.
            שמרו מסמך זה לצורך התאמה בעת הגשת חשבונית.
          </p>
          <p style="margin:18px 0 0;color:#475569;font-size:13px;">
            בברכה,<br/>
            ${escapeHtml(args.senderName ?? "מחלקת הרכש")}<br/>
            ${escapeHtml(args.companyNameHe)}
          </p>
        </td></tr>
        <tr><td style="padding:14px 28px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;">
          ההודעה נשלחה ממערכת ה-ERP של ${escapeHtml(args.companyNameHe)}. אין להשיב לכתובת אוטומטית זו ללא תיאום מוקדם.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export async function sendPoToSupplierEmail(
  input: SendPoEmailInput,
): Promise<SendPoEmailResult> {
  const subject = `הזמנת רכש ${input.officialPoNumber} — ${input.companyNameHe}`
  const html = buildEmailHtml(input)
  const filename = `PO_${input.officialPoNumber}.pdf`

  // ═════════ Mock fallback ═════════
  if (!hasProviderConfigured()) {
    const pdfSizeKb = Math.round((input.pdfBase64.length * 0.75) / 1024)
    // כותבים ל-console כדי שמפתחים יראו בדיוק מה "היה נשלח".
     
    console.warn(
      [
        "═══════════════════════════════════════════════════════════",
        "📧  PO EMAIL (MOCK) — no RESEND_API_KEY / POSTMARK_SERVER_TOKEN",
        "───────────────────────────────────────────────────────────",
        `To:          ${input.recipientEmail}`,
        `Subject:     ${subject}`,
        `PO:          ${input.officialPoNumber}`,
        `Supplier:    ${input.supplierName}`,
        `Amount:      ${input.totalAmountGross} ${input.currency}`,
        `Note:        ${input.note?.slice(0, 120) ?? "(none)"}`,
        `Attachment:  ${filename} (~${pdfSizeKb} KB)`,
        "═══════════════════════════════════════════════════════════",
      ].join("\n"),
    )
    return {
      delivery: "MOCK",
      providerMessage:
        "Mock delivery — no email provider configured. Payload logged to console.",
    }
  }

  // ═════════ Real send ═════════
  const payload: SendTransactionalEmailInput = {
    to: input.recipientEmail,
    subject,
    html,
    attachments: [
      {
        filename,
        contentBase64: input.pdfBase64,
        contentType: "application/pdf",
      },
    ],
  }

  const res = await sendTransactionalEmail(payload)
  if (res.ok) {
    return {
      delivery: "SUCCESS",
      providerMessage: res.id ? `${res.provider}:${res.id}` : res.provider,
    }
  }
  return {
    delivery: "FAILED",
    providerMessage: res.error,
  }
}
