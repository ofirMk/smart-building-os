import { randomUUID } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * מבנה בקשת AI Job — שער הכניסה הבלעדי לסוכני AI חיצוניים (Dify, Flowise וכו').
 * בשלב זה: stub שמאמת הרשאות ומחזיר job_id.
 * בשלב הבא: ישורשר לתור עבודה (queue) ויטופל אסינכרונית.
 */
type AiJobRequest = {
  /** סוג המשימה, למשל: "risk_scan", "progress_report", "procurement_audit" */
  type: string
  /** מטעין החופשי — תוכן המשימה (JSON object) */
  payload: unknown
  /** מזהה החברה הפעילה */
  company_id: string
}

type AiJobAccepted = {
  ok: true
  status: "accepted"
  job_id: string
  type: string
  company_id: string
}

type AiJobRejected = {
  ok: false
  error: string
  code: "UNAUTHORIZED" | "FORBIDDEN" | "BAD_REQUEST"
}

export async function POST(req: NextRequest): Promise<NextResponse<AiJobAccepted | AiJobRejected>> {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    )
  }

  const body = (await req.json().catch(() => null)) as AiJobRequest | null

  if (!body?.type?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Missing required field: type", code: "BAD_REQUEST" },
      { status: 400 }
    )
  }

  if (!body?.company_id?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Missing required field: company_id", code: "BAD_REQUEST" },
      { status: 400 }
    )
  }

  const cookieCompanyId = resolveCompanyContext(
    req.cookies.get(COMPANY_COOKIE_KEY)?.value
  )

  if (cookieCompanyId && cookieCompanyId !== body.company_id) {
    return NextResponse.json(
      { ok: false, error: "company_id mismatch with active session", code: "FORBIDDEN" },
      { status: 403 }
    )
  }

  const { data: job, error } = await supabase
    .from("ai_jobs")
    .insert({
      company_id: body.company_id.trim(),
      created_by: user.id,
      type: body.type.trim(),
      payload: (typeof body.payload === "object" && body.payload !== null ? body.payload : {}) as Record<string, unknown>,
      status: "accepted",
    })
    .select("id, type, company_id, status")
    .single()

  if (error || !job) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Failed to create job", code: "BAD_REQUEST" as const },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    status: "accepted" as const,
    job_id: job.id,
    type: job.type,
    company_id: job.company_id,
  })
}
