/**
 * Next.js instrumentation hook.
 *
 * Next.js calls `register()` exactly once per runtime (Node / Edge) at boot,
 * before any user code runs. We use it to load the appropriate Sentry SDK
 * configuration so server-side errors are captured from the very first request.
 *
 * Browser-side init lives in `sentry.client.config.ts`, auto-loaded by
 * `@sentry/nextjs` via the build plugin (no manual import needed here).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}

/**
 * Forward request errors to Sentry. Required by `@sentry/nextjs` ≥ 8 to
 * capture errors thrown inside React Server Components.
 */
export { captureRequestError as onRequestError } from "@sentry/nextjs"
