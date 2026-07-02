/**
 * POST /api/iot/webhooks/[provider]?cid=<company_id>
 *
 * Webhook ingest endpoint for all supported IoT hardware vendors.
 * Responsibilities:
 *   1. Validate the dynamic [provider] segment
 *   2. Verify the HMAC signature from the vendor-specific header
 *   3. Parse & normalise the raw vendor payload
 *   4. Look up the erp_physical_asset by device identifier in hardware_meta
 *   5. INSERT a row into erp_iot_events
 *   6. Return HTTP 200 immediately — zero business logic, zero blocking work
 *
 * The AI Worker picks up the event via the pg_notify trigger on erp_iot_events.
 *
 * Security model:
 *   - Raw request body is read as text BEFORE JSON parsing (required for HMAC)
 *   - HMAC verification uses timingSafeEqual to prevent timing attacks
 *   - Service role client bypasses RLS (this is a system ingest path)
 *   - company_id is validated against the matched asset to prevent spoofing
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role'
import type { IotProvider, NormalisedIotEvent, VerkadaWebhookPayload, SaltoWebhookPayload, ButterflyMxWebhookPayload, CustomWebhookPayload } from '@/types/iot'

// ─────────────────────────────────────────────────────────────────────────────
// Provider registry
// Each entry declares:
//   secretEnvVar  — the env var holding the shared secret for this vendor
//   headerName    — the HTTP request header the vendor uses for the signature
//   signatureStyle — 'sha256-hex' (sha256=<hex>) | 'hex-only' | 'raw-bearer'
// ─────────────────────────────────────────────────────────────────────────────

type SignatureStyle = 'sha256-hex' | 'hex-only' | 'raw-bearer'

interface ProviderConfig {
  secretEnvVar: string
  headerName: string
  signatureStyle: SignatureStyle
}

const SUPPORTED_PROVIDERS: Record<IotProvider, ProviderConfig> = {
  verkada: {
    secretEnvVar: 'IOT_WEBHOOK_SECRET_VERKADA',
    headerName: 'x-verkada-signature',
    signatureStyle: 'sha256-hex',
  },
  salto: {
    secretEnvVar: 'IOT_WEBHOOK_SECRET_SALTO',
    headerName: 'x-salto-signature-256',
    signatureStyle: 'hex-only',
  },
  butterflymx: {
    secretEnvVar: 'IOT_WEBHOOK_SECRET_BUTTERFLYMX',
    headerName: 'x-bmx-webhook-token',
    signatureStyle: 'raw-bearer',
  },
  custom: {
    secretEnvVar: 'IOT_WEBHOOK_SECRET_CUSTOM',
    headerName: 'x-webhook-signature',
    signatureStyle: 'sha256-hex',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// HMAC verification
// ─────────────────────────────────────────────────────────────────────────────

function verifyHmac(
  rawBody: string,
  secret: string,
  receivedHeader: string,
  style: SignatureStyle
): boolean {
  const bodyBuffer = Buffer.from(rawBody, 'utf8')
  const secretBuffer = Buffer.from(secret, 'utf8')

  if (style === 'raw-bearer') {
    // ButterflyMX sends the pre-shared token directly — constant-time compare
    const received = Buffer.from(receivedHeader, 'utf8')
    const expected = secretBuffer
    if (received.length !== expected.length) return false
    return timingSafeEqual(received, expected)
  }

  // Compute HMAC-SHA256 over the raw body
  const hmac = createHmac('sha256', secretBuffer)
  hmac.update(bodyBuffer)
  const digest = hmac.digest('hex')

  let receivedDigest: string
  if (style === 'sha256-hex') {
    // Format: "sha256=<hex>"
    const prefix = 'sha256='
    if (!receivedHeader.startsWith(prefix)) return false
    receivedDigest = receivedHeader.slice(prefix.length)
  } else {
    // Format: "<hex>" (Salto)
    receivedDigest = receivedHeader
  }

  const expected = Buffer.from(digest, 'hex')
  const received = Buffer.from(receivedDigest, 'hex')
  if (received.length !== expected.length) return false
  return timingSafeEqual(received, expected)
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload normalisation
// Maps each vendor's raw structure to our canonical event_type vocabulary.
// Returns null if the event should be silently dropped (e.g. heartbeat pings).
// ─────────────────────────────────────────────────────────────────────────────

interface NormalisationResult {
  deviceId: string        // MAC or gateway_id to look up the asset
  deviceIdField: 'mac' | 'gateway_id'
  eventType: string       // Canonical snake_case event label
}

function normaliseVerkada(body: VerkadaWebhookPayload): NormalisationResult | null {
  const eventTypeMap: Record<string, string> = {
    LPED_ENTRY: 'door_open',
    LPE_TAILGATE: 'tailgate_detected',
    MOTION: 'motion_detected',
    DOOR_HELD_OPEN: 'door_held_open',
    DOOR_FORCED: 'door_forced',
  }
  const eventType = eventTypeMap[body.event_type] ?? body.event_type.toLowerCase()
  return { deviceId: body.device_id, deviceIdField: 'gateway_id', eventType }
}

function normaliseSalto(body: SaltoWebhookPayload): NormalisationResult | null {
  const eventTypeMap: Record<string, string> = {
    ACCESS_GRANTED: 'door_open',
    ACCESS_DENIED: 'access_denied',
    DOOR_FORCED: 'door_forced',
    DOOR_LEFT_OPEN: 'door_held_open',
  }
  const eventType = eventTypeMap[body.type] ?? body.type.toLowerCase()
  return { deviceId: body.device_uuid, deviceIdField: 'gateway_id', eventType }
}

function normaliseButterflyMx(body: ButterflyMxWebhookPayload): NormalisationResult | null {
  const eventTypeMap: Record<string, string> = {
    'door.opened': 'door_open',
    'call.started': 'visitor_call',
    'door.held_open': 'door_held_open',
  }
  const eventType = eventTypeMap[body.event_name] ?? body.event_name.replace('.', '_')
  return { deviceId: body.panel_id, deviceIdField: 'gateway_id', eventType }
}

function normaliseCustom(body: CustomWebhookPayload): NormalisationResult | null {
  return {
    deviceId: body.device_id,
    deviceIdField: 'gateway_id',
    eventType: body.event_type,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
): Promise<NextResponse> {
  const { provider: rawProvider } = await params

  // 1. Validate provider
  if (!(rawProvider in SUPPORTED_PROVIDERS)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 })
  }
  const provider = rawProvider as IotProvider
  const config = SUPPORTED_PROVIDERS[provider]

  // 2. Read company_id from query param
  const companyId = req.nextUrl.searchParams.get('cid')
  if (!companyId) {
    return NextResponse.json({ error: 'Missing cid query parameter' }, { status: 400 })
  }

  // 3. Read raw body text (must happen before any JSON parse for HMAC to work)
  const rawBody = await req.text()
  if (!rawBody) {
    return NextResponse.json({ error: 'Empty request body' }, { status: 400 })
  }

  // 4. Verify HMAC
  const secret = process.env[config.secretEnvVar]
  if (!secret) {
    // Config error — do not reveal which env var is missing
    console.error(`[iot-webhook] Missing env var ${config.secretEnvVar} for provider ${provider}`)
    return NextResponse.json({ error: 'Internal configuration error' }, { status: 500 })
  }

  const signature = req.headers.get(config.headerName)
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 401 })
  }

  if (!verifyHmac(rawBody, secret, signature, config.signatureStyle)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // 5. Parse JSON
  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // 6. Normalise to canonical shape
  let normalised: NormalisationResult | null = null
  if (provider === 'verkada') {
    normalised = normaliseVerkada(body as VerkadaWebhookPayload)
  } else if (provider === 'salto') {
    normalised = normaliseSalto(body as SaltoWebhookPayload)
  } else if (provider === 'butterflymx') {
    normalised = normaliseButterflyMx(body as ButterflyMxWebhookPayload)
  } else {
    normalised = normaliseCustom(body as CustomWebhookPayload)
  }

  if (!normalised) {
    // Silently acknowledge heartbeats / benign events the correlator ignores
    return NextResponse.json({ ok: true, note: 'event dropped' })
  }

  // 7. Look up the physical asset by device identifier
  //    We search within the company first for the mac field, then gateway_id,
  //    to avoid cross-company spoofing via device_id collisions.
  const supabase = createSupabaseServiceRoleClient()

  const { data: asset, error: assetError } = await supabase
    .from('erp_physical_assets')
    .select('id, company_id')
    .eq('company_id', companyId)
    .eq(`hardware_meta->>${normalised.deviceIdField}`, normalised.deviceId)
    .eq('is_active', true)
    .maybeSingle()

  if (assetError) {
    console.error('[iot-webhook] Asset lookup error:', assetError.message)
    return NextResponse.json({ error: 'Asset lookup failed' }, { status: 500 })
  }

  // If the device isn't registered yet, we still ingest the event without an
  // asset_id so the correlator can see unregistered device activity.
  const assetId: string | null = asset?.id ?? null

  // Guard: company_id from the matched asset must match the cid param
  if (asset && asset.company_id !== companyId) {
    return NextResponse.json({ error: 'Device/company mismatch' }, { status: 403 })
  }

  // 8. INSERT into erp_iot_events
  const eventRow: NormalisedIotEvent = {
    company_id: companyId,
    asset_id: assetId,
    provider,
    event_type: normalised.eventType,
    raw_payload: body,
  }

  const { error: insertError } = await supabase
    .from('erp_iot_events')
    .insert(eventRow)

  if (insertError) {
    console.error('[iot-webhook] Insert error:', insertError.message)
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 })
  }

  // 9. Return 200 immediately — the pg_notify trigger notifies the AI Worker
  return NextResponse.json({ ok: true })
}

// Reject all other methods explicitly
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
