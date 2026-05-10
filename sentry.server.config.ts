/**
 * Sentry Node.js Server SDK configuration.
 *
 * Loaded by `instrumentation.ts` for the Node runtime (App Router server
 * components, route handlers, server actions). No-op if DSN is missing.
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
