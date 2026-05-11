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
  /** Attachments encoded as base64 content */
  attachments?: Array<{
    filename: string
    contentBase64: string
    contentType?: string
  }>
}

export type SendTransactionalEmailResult =
  | { ok: true; provider: "resend" | "postmark"; id?: string }
  | { ok: false; error: string; provider?: string }

/**
 * Read an env var and aggressively sanitize trailing whitespace AND any
 * literal `\r` / `\n` escape sequences (4-char ASCII pollution that
 * `vercel env pull` and some dashboard paste-flows leave behind). Without
 * this, Resend rejects auth with a generic "API key is invalid" because
 * the Bearer header contains stray bytes.
 */
function sanitizeEnv(name: string): string | undefined {
  const raw = process.env[name]
  if (raw === undefined) return undefined
  // Strip real CR/LF and the literal escape sequences \r and \n anywhere
  // in the value (most often trailing). Keep an inner trim for safety.
  const cleaned = raw.replace(/\\r|\\n|\r|\n/g, "").trim()
  return cleaned.length > 0 ? cleaned : undefined
}

function resolveProvider(): "resend" | "postmark" {
  const p = sanitizeEnv("EMAIL_PROVIDER")?.toLowerCase()
  if (p === "postmark") return "postmark"
  if (p === "resend") return "resend"
  if (sanitizeEnv("POSTMARK_SERVER_TOKEN")) return "postmark"
  return "resend"
}

function defaultSupportEmail(): string {
  return sanitizeEnv("SYSTEM_SUPPORT_EMAIL") || "support@yourbrand.co.il"
}

export function getDefaultSystemSupportEmail(): string {
  return defaultSupportEmail()
}

async function sendResend(input: SendTransactionalEmailInput): Promise<SendTransactionalEmailResult> {
  const key = sanitizeEnv("RESEND_API_KEY")
  if (!key) return { ok: false, error: "חסר RESEND_API_KEY", provider: "resend" }

  const from =
    sanitizeEnv("RESEND_FROM_EMAIL") ||
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
      attachments: (input.attachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        content: attachment.contentBase64,
        type: attachment.contentType ?? "application/octet-stream",
      })),
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
  const token = sanitizeEnv("POSTMARK_SERVER_TOKEN")
  if (!token) return { ok: false, error: "חסר POSTMARK_SERVER_TOKEN", provider: "postmark" }

  const from =
    sanitizeEnv("POSTMARK_FROM_EMAIL") ||
    sanitizeEnv("RESEND_FROM_EMAIL") ||
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
      Attachments: (input.attachments ?? []).map((attachment) => ({
        Name: attachment.filename,
        Content: attachment.contentBase64,
        ContentType: attachment.contentType ?? "application/octet-stream",
      })),
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
