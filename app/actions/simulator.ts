"use server"

/**
 * IoT Event Simulator — Server Action
 * =====================================
 * Acts as a mock hardware device: signs the payload with the correct
 * vendor HMAC scheme and POSTs it to our own webhook ingest endpoint.
 *
 * Security notes:
 *  - Secrets are read exclusively from process.env (never passed by the client)
 *  - companyId is resolved server-side from the authenticated session cookie
 *  - The self-request uses HMAC exactly as a real vendor device would
 *  - This action should only be reachable behind an admin/developer gate in production
 */

import { createHmac } from "crypto"
import { cookies } from "next/headers"

import { apiErrorPayload, type ApiErrorPayload } from "@/lib/api/api-error"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"

// ─────────────────────────────────────────────────────────────────────────────
// Provider registry — must mirror SUPPORTED_PROVIDERS in the ingest route
// ─────────────────────────────────────────────────────────────────────────────

type SignatureStyle = "sha256-hex" | "hex-only" | "raw-bearer"

interface ProviderConfig {
  secretEnvVar: string
  headerName: string
  signatureStyle: SignatureStyle
}

const PROVIDER_CONFIGS = {
  verkada: {
    secretEnvVar: "IOT_WEBHOOK_SECRET_VERKADA",
    headerName: "x-verkada-signature",
    signatureStyle: "sha256-hex",
  },
  salto: {
    secretEnvVar: "IOT_WEBHOOK_SECRET_SALTO",
    headerName: "x-salto-signature-256",
    signatureStyle: "hex-only",
  },
  butterflymx: {
    secretEnvVar: "IOT_WEBHOOK_SECRET_BUTTERFLYMX",
    headerName: "x-bmx-webhook-token",
    signatureStyle: "raw-bearer",
  },
} as const satisfies Record<string, ProviderConfig>

type SupportedProvider = keyof typeof PROVIDER_CONFIGS

// ─────────────────────────────────────────────────────────────────────────────
// HMAC builder — mirrors verifyHmac() in the ingest route (inverse operation)
// ─────────────────────────────────────────────────────────────────────────────

function buildSignatureHeader(
  body: string,
  secret: string,
  style: SignatureStyle
): string {
  if (style === "raw-bearer") {
    // ButterflyMX: the secret itself is sent verbatim
    return secret
  }

  const digest = createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(Buffer.from(body, "utf8"))
    .digest("hex")

  // Verkada / Custom: "sha256=<hex>"
  // Salto:            "<hex>"
  return style === "sha256-hex" ? `sha256=${digest}` : digest
}

// ─────────────────────────────────────────────────────────────────────────────
// Return type
// ─────────────────────────────────────────────────────────────────────────────

type SimulatorResult =
  | { ok: true; status: number; responseBody: string }
  | ApiErrorPayload

// ─────────────────────────────────────────────────────────────────────────────
// Action
// ─────────────────────────────────────────────────────────────────────────────

export async function fireSimulatedWebhook(
  provider: string,
  payload: Record<string, unknown>
): Promise<SimulatorResult> {
  // 1. Validate provider
  if (!(provider in PROVIDER_CONFIGS)) {
    return apiErrorPayload("VALIDATION_ERROR", `Unknown provider: "${provider}". Supported: ${Object.keys(PROVIDER_CONFIGS).join(", ")}`)
  }
  const config = PROVIDER_CONFIGS[provider as SupportedProvider]

  // 2. Resolve company from session cookie (server-side only — never trust client)
  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
  if (!companyId) {
    return apiErrorPayload("MISSING_COMPANY_CONTEXT", "No active company selected. Select a company first.")
  }

  // 3. Read shared secret from environment
  const secret = process.env[config.secretEnvVar]
  if (!secret) {
    return apiErrorPayload(
      "CONFIGURATION_ERROR",
      `Env var ${config.secretEnvVar} is not set. Add it to .env.local to test locally.`
    )
  }

  // 4. Serialise payload
  const body = JSON.stringify(payload)

  // 5. Compute HMAC signature — identical to what a real vendor device would send
  const signatureValue = buildSignatureHeader(body, secret, config.signatureStyle)

  // 6. Resolve the self-call base URL
  //    NEXT_PUBLIC_SITE_URL is authoritative; VERCEL_URL covers preview deployments;
  //    localhost:3000 is the safe local fallback.
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")

  const webhookUrl = `${baseUrl}/api/iot/webhooks/${provider}?cid=${encodeURIComponent(companyId)}`

  // 7. Fire
  let response: Response
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [config.headerName]: signatureValue,
      },
      body,
    })
  } catch (err) {
    return apiErrorPayload("NETWORK_ERROR", `Self-request failed: ${String(err)}`)
  }

  const responseBody = await response.text().catch(() => "")

  if (!response.ok) {
    return apiErrorPayload(
      "WEBHOOK_ERROR",
      `Ingest endpoint returned ${response.status}: ${responseBody.slice(0, 300)}`
    )
  }

  return { ok: true, status: response.status, responseBody }
}
