/**
 * Smoke test for the transactional email pipeline.
 *
 * Loads `.env.local`, then calls the real `sendTransactionalEmail` wrapper
 * (`lib/infrastructure/email-service.ts`) — same code path used by the PO
 * send route in production. Verifies that:
 *   1. RESEND_API_KEY is valid (no 401/403 from Resend).
 *   2. RESEND_FROM_EMAIL domain is verified in the Resend dashboard.
 *   3. The recipient receives the message in their inbox.
 *
 * Usage:
 *   npx tsx scripts/email-smoke-test.ts <recipient@example.com>
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local")
  const raw = readFileSync(path, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    // strip surrounding quotes (Vercel env pull wraps values in double quotes)
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    // Vercel env pull sometimes returns values with trailing literal `\r\n`
    // (4 ASCII chars: backslash-r-backslash-n) — strip them, plus any real
    // CR/LF whitespace, before exposing to the runtime.
    val = val.replace(/(\\r|\\n|\r|\n)+$/g, "").trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnvLocal()

const recipient = process.argv[2]
if (!recipient || !recipient.includes("@")) {
  console.error("Usage: npx tsx scripts/email-smoke-test.ts <recipient@example.com>")
  process.exit(2)
}

// Mask helper for log lines
function mask(v: string | undefined, keep = 4): string {
  if (!v) return "(empty)"
  if (v.length <= keep) return "***"
  return v.slice(0, keep) + "…[" + v.length + " chars]"
}

console.log("─".repeat(60))
console.log("📧  Email smoke test")
console.log("─".repeat(60))
console.log("RESEND_API_KEY     :", mask(process.env.RESEND_API_KEY))
console.log("RESEND_FROM_EMAIL  :", process.env.RESEND_FROM_EMAIL || "(empty)")
console.log("EMAIL_PROVIDER     :", process.env.EMAIL_PROVIDER || "(default → resend)")
console.log("Recipient          :", recipient)
console.log("─".repeat(60))

async function main(): Promise<void> {
  // Dynamic import so the env vars above are loaded BEFORE the module reads
  // them at evaluation time (it doesn't, but the order is safer this way).
  const { sendTransactionalEmail } = await import(
    "../lib/infrastructure/email-service"
  )

  const subject = "Smoke test — Marker-Ofek email pipeline"
  const html = `
    <!doctype html>
    <html lang="he" dir="rtl">
      <body style="font-family: Arial, sans-serif; padding: 24px; color: #0f172a;">
        <h2 style="margin: 0 0 12px;">בדיקת אימייל — צינור Resend</h2>
        <p style="margin: 0 0 8px; line-height: 1.55;">
          הודעה זו נשלחה ע&quot;י <code>scripts/email-smoke-test.ts</code>
          כדי לאמת שה-<code>RESEND_API_KEY</code> וה-<code>RESEND_FROM_EMAIL</code>
          תקינים, ושה-domain מאומת ב-Resend.
        </p>
        <p style="margin: 12px 0 0; color: #64748b; font-size: 12px;">
          Timestamp: ${new Date().toISOString()}
        </p>
      </body>
    </html>
  `

  const start = Date.now()
  const res = await sendTransactionalEmail({
    to: recipient,
    subject,
    html,
  })
  const ms = Date.now() - start

  console.log(`\nResult (${ms}ms):`, JSON.stringify(res, null, 2))

  if (!res.ok) {
    console.error("\n❌  FAILED — see error above.")
    process.exit(1)
  }
  console.log(
    `\n✅  SUCCESS — provider=${res.provider}, id=${res.id ?? "(none)"}`,
  )
  console.log("Check the recipient's inbox (and spam folder) within ~30s.")
}

main().catch((err) => {
  console.error("\n💥  Unexpected error:", err)
  process.exit(1)
})
