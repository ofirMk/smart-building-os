/**
 * Sentry Browser SDK configuration.
 *
 * Loaded automatically by `@sentry/nextjs` for client bundles.
 * If `NEXT_PUBLIC_SENTRY_DSN` is not set, Sentry is a no-op (zero overhead).
 *
 * Tuning rationale:
 *   • tracesSampleRate 0.1 — 10% of transactions, balances cost vs visibility.
 *   • replaysSessionSampleRate 0 — no session replay by default (privacy +
 *     bandwidth). Bumped to 1.0 only on errored sessions via replaysOnError.
 *   • environment: NEXT_PUBLIC_VERCEL_ENV ?? NODE_ENV — segments dashboards
 *     between staging and production automatically.
 */
import * as Sentry from "@sentry/nextjs"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // PII scrubbing — Israeli privacy law (חוק הגנת הפרטיות) requires we don't
    // send users' personal info to third-party processors without DPA.
    sendDefaultPii: false,
  })
}
