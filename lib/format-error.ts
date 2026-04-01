const MAX_ERROR_UI_LENGTH = 2_000

function truncateForUi(s: string): string {
  if (s.length <= MAX_ERROR_UI_LENGTH) return s
  return `${s.slice(0, MAX_ERROR_UI_LENGTH)}…`
}

/**
 * Human-readable error text for UI (PostgREST payloads, Error subclasses, plain objects).
 * Avoids rendering caught values as `[object Object]`.
 * Truncates very long payloads (availability / UX; avoids locking the main thread on huge JSON).
 */
export function formatError(e: unknown): string {
  if (e instanceof Error) return truncateForUi(e.message)
  const msg = (e as { message?: unknown })?.message
  if (typeof msg === "string" && msg.length > 0) return truncateForUi(msg)
  try {
    return truncateForUi(JSON.stringify(e ?? null))
  } catch {
    return truncateForUi(String(e))
  }
}
