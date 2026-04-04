/**
 * שירות התראות מערכת — Resend (ברירת מחדל) או Postmark.
 * משתני סביבה:
 * - EMAIL_PROVIDER: resend | postmark (ברירת מחדל resend אם קיים RESEND_API_KEY)
 * - RESEND_API_KEY, RESEND_FROM_EMAIL
 * - POSTMARK_SERVER_TOKEN, POSTMARK_FROM_EMAIL
 * - SYSTEM_SUPPORT_EMAIL (ברירת מחדל support@yourbrand.co.il)
 */

export type SendTransactionalEmailInput = {
  to: string | string[]
  subject: string
  html: string
  /** כותרת Reply-To אופציונלית */
  replyTo?: string
}

export type SendTransactionalEmailResult =
  | { ok: true; provider: "resend" | "postmark"; id?: string }
  | { ok: false; error: string; provider?: string }

function resolveProvider(): "resend" | "postmark" {
  const p = process.env.EMAIL_PROVIDER?.trim().toLowerCase()
  if (p === "postmark") return "postmark"
  if (p === "resend") return "resend"
  if (process.env.POSTMARK_SERVER_TOKEN?.trim()) return "postmark"
  return "resend"
}

function defaultSupportEmail(): string {
  return process.env.SYSTEM_SUPPORT_EMAIL?.trim() || "support@yourbrand.co.il"
}

export function getDefaultSystemSupportEmail(): string {
  return defaultSupportEmail()
}

async function sendResend(input: SendTransactionalEmailInput): Promise<SendTransactionalEmailResult> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) return { ok: false, error: "חסר RESEND_API_KEY", provider: "resend" }

  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "Diamond System <notifications@yourbrand.co.il>"

  const to = Array.isArray(input.to) ? input.to : [input.to]

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: input.subject,
      html: input.html,
      reply_to: input.replyTo,
    }),
  })

  const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null
  if (!res.ok) {
    return {
      ok: false,
      error: body?.message || `Resend HTTP ${res.status}`,
      provider: "resend",
    }
  }
  return { ok: true, provider: "resend", id: body?.id }
}

async function sendPostmark(input: SendTransactionalEmailInput): Promise<SendTransactionalEmailResult> {
  const token = process.env.POSTMARK_SERVER_TOKEN?.trim()
  if (!token) return { ok: false, error: "חסר POSTMARK_SERVER_TOKEN", provider: "postmark" }

  const from =
    process.env.POSTMARK_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "Diamond System <notifications@yourbrand.co.il>"

  const to = Array.isArray(input.to) ? input.to.join(",") : input.to

  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": token,
    },
    body: JSON.stringify({
      From: from,
      To: to,
      Subject: input.subject,
      HtmlBody: input.html,
      ReplyTo: input.replyTo,
      MessageStream: "outbound",
    }),
  })

  const body = (await res.json().catch(() => null)) as {
    MessageID?: string
    Message?: string
  } | null

  if (!res.ok) {
    return {
      ok: false,
      error: body?.Message || `Postmark HTTP ${res.status}`,
      provider: "postmark",
    }
  }
  return { ok: true, provider: "postmark", id: body?.MessageID }
}

/**
 * שליחת מייל טרנזקציוני דרך הספק המוגדר.
 */
export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput
): Promise<SendTransactionalEmailResult> {
  try {
    const provider = resolveProvider()
    if (provider === "postmark") return await sendPostmark(input)
    return await sendResend(input)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

/**
 * דוח Diamond לתמיכה — נושא קבוע + HTML מוכן.
 */
export async function sendDiamondSystemReportEmail(args: {
  html: string
  /** אם חסר — SYSTEM_SUPPORT_EMAIL */
  to?: string
}): Promise<SendTransactionalEmailResult> {
  const to = args.to?.trim() || defaultSupportEmail()
  return sendTransactionalEmail({
    to,
    subject: `Diamond System Report — ${new Date().toISOString().slice(0, 10)}`,
    html: args.html,
  })
}
