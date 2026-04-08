import { NextResponse, type NextRequest } from "next/server"

import {
  parseAndExecuteHoldenErpUtterance,
  parseHoldenErpUtterance,
} from "@/lib/holden-erp/erp-intent-parser"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Body = {
  text?: string
  /** אם true — רק ניתוח כוונה ללא ביצוע BPM */
  dryRun?: boolean
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null
  const text = typeof body?.text === "string" ? body.text : ""
  if (!text.trim()) {
    return NextResponse.json({ ok: false, error: "Missing text" }, { status: 400 })
  }

  if (body?.dryRun) {
    const parsed = await parseHoldenErpUtterance(text)
    if (!parsed.ok) {
      return NextResponse.json(parsed, { status: 400 })
    }
    return NextResponse.json({ ok: true, intent: parsed.intent, executed: false })
  }

  const full = await parseAndExecuteHoldenErpUtterance(text)
  if (!full.ok) {
    return NextResponse.json(full, { status: 400 })
  }

  if (!full.result.ok) {
    return NextResponse.json(
      { ok: false, intent: full.intent, error: full.result.error },
      { status: 422 }
    )
  }

  const detail = full.result.detail
  return NextResponse.json({
    ok: true,
    intent: full.intent,
    message: full.result.message,
    detail,
    path: detail?.path,
    url: detail?.url,
  })
}
