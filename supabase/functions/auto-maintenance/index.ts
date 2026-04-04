/**
 * Auto-maintenance & weekly Diamond report (Edge Function).
 *
 * Schedule (hosted Supabase): Dashboard → Edge Functions → auto-maintenance → Cron
 *   Recommended cron (UTC): "0 2 * * 0" = Sunday 02:00 UTC (adjust for Israel).
 *
 * Secrets (set in Supabase project):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY + RESEND_FROM_EMAIL  OR  POSTMARK_SERVER_TOKEN + POSTMARK_FROM_EMAIL
 *   APP_BASE_URL (e.g. https://app.yourbrand.co.il)
 *   SYSTEM_SUPPORT_EMAIL (default support@yourbrand.co.il)
 *   MAINTENANCE_CRON_SECRET (optional) — require Authorization: Bearer <secret>
 *   MAINTENANCE_SELF_HEAL=true (optional) — runs mo_maintenance_self_heal_stale_entities()
 *
 * Local: supabase functions serve auto-maintenance --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8"
import { generateSystemHealthPayload } from "./generate-payload.ts"
import { buildDiamondSystemReportHtml } from "./report-html.ts"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function safeString(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

async function sendReportEmail(html: string): Promise<{ ok: boolean; error?: string; provider?: string }> {
  const to = Deno.env.get("SYSTEM_SUPPORT_EMAIL")?.trim() || "support@yourbrand.co.il"
  const subject = `Diamond System Report — ${new Date().toISOString().slice(0, 10)}`

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim()
  const postmarkToken = Deno.env.get("POSTMARK_SERVER_TOKEN")?.trim()

  const from =
    Deno.env.get("RESEND_FROM_EMAIL")?.trim() ||
    Deno.env.get("POSTMARK_FROM_EMAIL")?.trim() ||
    "Diamond System <notifications@yourbrand.co.il>"

  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    })
    const body = (await res.json().catch(() => null)) as { message?: string; id?: string } | null
    if (!res.ok) {
      return { ok: false, error: body?.message || `Resend ${res.status}`, provider: "resend" }
    }
    return { ok: true, provider: "resend" }
  }

  if (postmarkToken) {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": postmarkToken,
      },
      body: JSON.stringify({
        From: from,
        To: to,
        Subject: subject,
        HtmlBody: html,
        MessageStream: "outbound",
      }),
    })
    const body = (await res.json().catch(() => null)) as { Message?: string } | null
    if (!res.ok) {
      return { ok: false, error: body?.Message || `Postmark ${res.status}`, provider: "postmark" }
    }
    return { ok: true, provider: "postmark" }
  }

  return { ok: false, error: "No RESEND_API_KEY or POSTMARK_SERVER_TOKEN", provider: "none" }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const started = Date.now()
  let logStatus: "completed" | "failed" | "partial" = "completed"
  let logPayload: Record<string, unknown> = { phase: "init" }
  let logError: string | null = null
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim()
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim()

  try {
    const secret = Deno.env.get("MAINTENANCE_CRON_SECRET")?.trim()
    if (secret) {
      const auth = req.headers.get("authorization") || ""
      if (auth !== `Bearer ${secret}`) {
        return jsonResponse({ ok: false, error: "Unauthorized" }, 401)
      }
    }

    if (!supabaseUrl || !serviceKey) {
      logStatus = "failed"
      logError = "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
      logPayload = { error: logError }
      return jsonResponse({ ok: false, error: logError }, 500)
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: rawHealth, error: healthErr } = await supabase.rpc("mo_maintenance_collect_health")
    if (healthErr) {
      throw new Error(`mo_maintenance_collect_health: ${healthErr.message}`)
    }

    let selfHeal: unknown = null
    if (Deno.env.get("MAINTENANCE_SELF_HEAL")?.trim() === "true") {
      const { data: hData, error: hErr } = await supabase.rpc("mo_maintenance_self_heal_stale_entities")
      if (hErr) {
        selfHeal = { error: hErr.message }
      } else {
        selfHeal = hData
      }
    }

    const baseUrl = Deno.env.get("APP_BASE_URL")?.trim() || "https://app.yourbrand.co.il"
    const snapshot = (rawHealth ?? null) as Record<string, unknown> | null
    const report = generateSystemHealthPayload(snapshot, {
      baseUrl,
      selfHealResult: selfHeal,
    })
    const html = buildDiamondSystemReportHtml(report)

    const emailResult = await sendReportEmail(html)
    if (!emailResult.ok) {
      logStatus = emailResult.provider === "none" ? "partial" : "partial"
      logError = emailResult.error ?? "Email failed"
    }

    logPayload = {
      ok: true,
      durationMs: Date.now() - started,
      reportSummary: report.summaryLine,
      email: emailResult,
      selfHeal,
      rawHealth: snapshot,
    }

    return jsonResponse(logPayload, 200)
  } catch (e) {
    logStatus = "failed"
    logError = safeString(e)
    logPayload = {
      ok: false,
      durationMs: Date.now() - started,
      error: logError,
    }
    return jsonResponse(logPayload, 500)
  } finally {
    try {
      if (supabaseUrl && serviceKey) {
        const supabase = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
        const { error: insErr } = await supabase.from("mo_maintenance_logs").insert({
          task_name: "auto-maintenance",
          status: logStatus,
          payload: logPayload as unknown as Record<string, unknown>,
          error_message: logError,
        })
        if (insErr) {
          console.error("mo_maintenance_logs insert failed:", insErr.message)
        }
      }
    } catch (finalErr) {
      console.error("maintenance finally block:", safeString(finalErr))
    }
  }
})
