import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Lists Gemini models visible to `GEMINI_API_KEY` via the Generative Language API.
 * GET /api/check-gemini — native `fetch` to v1beta/models.
 */
export async function GET() {
  const key = process.env.GEMINI_API_KEY?.trim()
  if (!key) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set" },
      { status: 503 }
    )
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`

  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" })
    const data: unknown = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: "fetch_failed", message }, { status: 502 })
  }
}
