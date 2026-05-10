/**
 * Sentry Edge Runtime SDK configuration.
 *
 * Loaded by `instrumentation.ts` for the Edge runtime (middleware, edge route
 * handlers). No-op if DSN is missing.
 */
import * as Sentry from "@sentry/nextjs"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  })
}
