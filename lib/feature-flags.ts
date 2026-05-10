/**
 * Centralized feature flags.
 *
 * Source of truth: environment variables. All flag reads MUST go through this
 * module so a future migration to a remote flag service (LaunchDarkly,
 * ConfigCat, …) is a single-file change.
 *
 * ===== IS_DEMO_MODE =====
 * When `true`, the app exposes investor-pitch UI surfaces:
 *   • `/marker-ofek/pitch` lobby route
 *   • Global "🚀 חמ"ל משקיעים" header button
 *   • Hardcoded demo PDF buttons in CEO Command Center
 *     (subcontractor contract / partial bill / purchase order)
 *
 * In production for a paying customer (e.g. Lihtman onboarding), set
 * `NEXT_PUBLIC_DEMO_MODE=false` (or unset). Pitch UI vanishes; demo data
 * remains in the DB until the cleanup migration is run by the operator
 * (`supabase/migrations/20260822100000_purge_demo_seed_data.sql`).
 *
 * Default: `false` — production-safe by default. CI/dev opt-in via env.
 */
export const IS_DEMO_MODE: boolean =
  String(process.env.NEXT_PUBLIC_DEMO_MODE ?? "").toLowerCase() === "true"
