import { NextResponse } from "next/server"

import { formatError } from "@/lib/format-error"

export type ApiErrorPayload = {
  ok: false
  error: string
  code: string
  details?: unknown
}

export function apiErrorPayload(
  code: string,
  error: string,
  details?: unknown
): ApiErrorPayload {
  return {
    ok: false,
    code,
    error,
    ...(details === undefined ? {} : { details }),
  }
}

export function apiErrorResponse(
  status: number,
  code: string,
  error: string,
  details?: unknown
) {
  return NextResponse.json(apiErrorPayload(code, error, details), { status })
}

export function unknownApiErrorResponse(
  status: number,
  code: string,
  input: unknown,
  fallback = "Unexpected server error"
) {
  const msg = formatError(input).trim() || fallback
  return apiErrorResponse(status, code, msg)
}
