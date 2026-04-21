import { z } from "zod"

import {
  COMPANY_COOKIE_KEY,
  type CompanyContextId,
  resolveCompanyContext,
} from "@/lib/company-context"

/**
 * The refined "Ophir Pattern" API client helper.
 *
 * Centralises the following resilience rules for every pricing / approval /
 * dashboard endpoint:
 *   1. `AbortSignal` is checked BEFORE parsing, AFTER reading the body,
 *      and AFTER Zod validation — so a late-aborting caller never commits
 *      stale state to a `setState` callback.
 *   2. Server-side error envelopes (`{ error: string }`) are surfaced as
 *      the thrown `Error.message` so UI layers can toast them verbatim.
 *   3. Zod validation runs on `result.data` when the envelope has one,
 *      and falls back to the raw body so non-enveloped responses still
 *      validate cleanly.
 */
export type ParseApiDataOptions<T> = {
  /** Zod schema that validates the unwrapped payload (i.e. `result.data`). */
  schema: z.ZodType<T>
  /** Optional AbortSignal to stop processing early. */
  signal?: AbortSignal
  /** Override for the generic validation error message shown to the user. */
  schemaErrorMessage?: string
}

export class AbortedError extends Error {
  constructor() {
    super("Request aborted")
    this.name = "AbortError"
  }
}

function assertNotAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new AbortedError()
  }
}

export async function parseApiData<T>(
  response: Response,
  schemaOrOptions: z.ZodType<T> | ParseApiDataOptions<T>,
  maybeSignal?: AbortSignal
): Promise<T> {
  const options: ParseApiDataOptions<T> =
    "safeParse" in schemaOrOptions
      ? { schema: schemaOrOptions, signal: maybeSignal }
      : schemaOrOptions
  const { schema, signal, schemaErrorMessage } = options

  assertNotAborted(signal)

  const result: unknown = await response.json().catch(() => ({}))

  assertNotAborted(signal)

  if (!response.ok) {
    const serverError =
      typeof result === "object" &&
      result !== null &&
      "error" in result &&
      typeof (result as { error?: unknown }).error === "string"
        ? (result as { error: string }).error
        : null
    throw new Error(serverError ?? `HTTP ${response.status}`)
  }

  const payload =
    typeof result === "object" && result !== null && "data" in result
      ? (result as { data: unknown }).data
      : result

  const validated = schema.safeParse(payload)
  if (!validated.success) {
    console.error("[parseApiData] schema validation failed:", validated.error.format())
    throw new Error(schemaErrorMessage ?? "נתוני המערכת אינם תואמים לפורמט הנדרש")
  }

  assertNotAborted(signal)

  return validated.data
}

/**
 * Reads the active company id from the browser cookie. Returns `null` when
 * running on the server. Safe to call inside React hooks.
 */
export function getActiveCompanyIdFromCookie(): CompanyContextId | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(
    new RegExp(
      `(?:^|;\\s*)${COMPANY_COOKIE_KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`
    )
  )
  return resolveCompanyContext(match?.[1]?.trim())
}

/**
 * Tiny convenience wrapper that pre-populates the headers every ERP API
 * route expects (`content-type`, `x-company-id`, `x-active-company-id`,
 * `no-store`).
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers ?? {})
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json")
  }
  const companyId = getActiveCompanyIdFromCookie()
  if (companyId) {
    if (!headers.has("x-company-id")) headers.set("x-company-id", companyId)
    if (!headers.has("x-active-company-id")) headers.set("x-active-company-id", companyId)
  }
  return fetch(input, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers,
  })
}

/**
 * End-to-end GET helper: fetches with `apiFetch`, then pipes the response
 * through `parseApiData`.
 */
export async function apiGet<T>(
  input: RequestInfo | URL,
  options: ParseApiDataOptions<T>,
  init?: Omit<RequestInit, "method" | "body">
): Promise<T> {
  const response = await apiFetch(input, { ...init, method: "GET", signal: options.signal })
  return parseApiData(response, options)
}

/** Same as `apiGet` but issues a POST with a JSON body. */
export async function apiPost<T>(
  input: RequestInfo | URL,
  body: unknown,
  options: ParseApiDataOptions<T>,
  init?: Omit<RequestInit, "method" | "body">
): Promise<T> {
  const response = await apiFetch(input, {
    ...init,
    method: "POST",
    body: JSON.stringify(body ?? {}),
    signal: options.signal,
  })
  return parseApiData(response, options)
}
