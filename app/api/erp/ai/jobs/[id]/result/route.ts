import { createHmac, timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { createSupabaseServiceRoleClientSafe } from "@/lib/supabase/service-role"
import {
  AI_JOB_RESULT_SCHEMAS,
  type AiJobType,
} from "@/lib/ai/jobs/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** שם ה-Header שבו Python Worker שולח חתימת HMAC */
const SIGNATURE_HEADER = "x-ai-signature"

/** מחזיר את ה-secret מה-env או זורק שגיאה */
function requireWorkerSecret(): string {
  const s = process.env.AI_WORKER_SECRET?.trim()
  if (!s) throw new Error("AI_WORKER_SECRET is not configured in environment")
  return s
}

/**
 * אימות HMAC-SHA256 בזמן קבוע (מניעת Timing Attacks).
 * פורמט חתימה: `sha256=<hex_digest>` (זהה ל-GitHub Webhooks).
 */
function verifyHmacSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`
  try {
    const expectedBuf = Buffer.from(expected, "utf8")
    const actualBuf = Buffer.from(signatureHeader, "utf8")
    if (expectedBuf.length !== actualBuf.length) return false
    return timingSafeEqual(expectedBuf, actualBuf)
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────
// Body schema — discriminated union לפי status
// ─────────────────────────────────────────────

const resultBodySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("done"),
    result: z.record(z.string(), z.unknown()),
    error_message: z.string().optional(),
  }),
  z.object({
    status: z.literal("failed"),
    result: z.record(z.string(), z.unknown()).optional(),
    error_message: z.string().min(1, "error_message is required for failed jobs"),
  }),
])

type ResultBody = z.infer<typeof resultBodySchema>

type ResultResponse =
  | { ok: true; job_id: string; status: "done" | "failed"; finished_at: string }
  | { ok: false; error: string; code?: string; issues?: z.ZodIssue[] }

// ─────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
): Promise<NextResponse<ResultResponse>> {
  // 1. קריאת ה-raw body לפני כל parsing — חייבים לפני JSON.parse לצורך HMAC
  const rawBody = await req.text()

  // 2. אימות HMAC
  const signature = req.headers.get(SIGNATURE_HEADER) ?? ""

  let secret: string
  try {
    secret = requireWorkerSecret()
  } catch {
    return NextResponse.json(
      { ok: false, error: "Server misconfiguration: AI_WORKER_SECRET missing" },
      { status: 500 }
    )
  }

  if (!signature || !verifyHmacSignature(rawBody, signature, secret)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized: invalid or missing HMAC signature", code: "INVALID_SIGNATURE" },
      { status: 401 }
    )
  }

  // 3. Parse + validate body structure
  let body: ResultBody
  try {
    const parsed = resultBodySchema.safeParse(JSON.parse(rawBody))
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message ?? "Invalid request body",
          issues: parsed.error.issues,
        },
        { status: 400 }
      )
    }
    body = parsed.data
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be valid JSON" },
      { status: 400 }
    )
  }

  // 4. Resolve dynamic route param
  const { id } = await Promise.resolve(params)
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "Missing job id" }, { status: 400 })
  }

  // 5. Service Role client — ללא RLS כי זו קריאה service-to-service
  const gate = createSupabaseServiceRoleClientSafe()
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.error },
      { status: 500 }
    )
  }
  const supabase = gate.client

  // 6. שליפת ה-Job — אימות קיום + שמירת type לvalidation
  const { data: job, error: fetchError } = await supabase
    .from("ai_jobs")
    .select("id, type, status")
    .eq("id", id)
    .single()

  if (fetchError || !job) {
    return NextResponse.json(
      { ok: false, error: "Job not found", code: "NOT_FOUND" },
      { status: 404 }
    )
  }

  // 7. Idempotency guard — לא מאפשר לדרוס תוצאה קיימת
  if (job.status === "done" || job.status === "failed") {
    return NextResponse.json(
      { ok: false, error: `Job is already in terminal state: ${job.status}`, code: "CONFLICT" },
      { status: 409 }
    )
  }

  // 8. Type-specific result validation (רק ל-done עם result)
  if (body.status === "done") {
    const resultSchema = AI_JOB_RESULT_SCHEMAS[job.type as AiJobType]
    if (resultSchema) {
      const validation = resultSchema.safeParse(body.result)
      if (!validation.success) {
        return NextResponse.json(
          {
            ok: false,
            error: `Result does not match schema for job type '${job.type}'`,
            code: "SCHEMA_MISMATCH",
            issues: validation.error.issues,
          },
          { status: 422 }
        )
      }
    }
  }

  // 9. עדכון הרשומה ב-ai_jobs
  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from("ai_jobs")
    .update({
      status: body.status,
      result: body.status === "done" ? (body.result ?? null) : null,
      error_message: body.error_message ?? null,
      finished_at: now,
      updated_at: now,
    })
    .eq("id", id)

  if (updateError) {
    return NextResponse.json(
      { ok: false, error: updateError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    job_id: id,
    status: body.status,
    finished_at: now,
  })
}
