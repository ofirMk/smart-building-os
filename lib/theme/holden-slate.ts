/**
 * Holden Slate — centralised design tokens for the dense, engineer-grade
 * "Marker Ofek" command-center UI.
 *
 * Every management screen should pull input / button / card / pill /
 * section classes from here instead of hand-rolling Tailwind strings.
 * This keeps the "Holden Slate" palette consistent when it rolls out
 * to new workspaces.
 */

/** Dense 32px-tall inputs used across every form in the ERP. */
export const HOLDEN_SLATE_INPUT_CLASS =
  "h-8 px-2 text-sm border-slate-200 bg-card text-foreground placeholder:text-slate-400 shadow-[inset_0_1px_0_rgba(15,23,42,0.03)] focus-visible:border-emerald-400 focus-visible:ring-emerald-500/15"

/** 11px uppercase tracking labels. */
export const HOLDEN_SLATE_LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wider text-slate-600"

/** Primary action button — slate-900 on white. */
export const HOLDEN_SLATE_BUTTON_PRIMARY =
  "h-8 px-3 text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 shadow-[0_1px_0_rgba(15,23,42,0.08)] transition-colors"

/** Secondary outline button. */
export const HOLDEN_SLATE_BUTTON_OUTLINE =
  "h-8 px-3 text-xs font-medium border-slate-200 bg-card text-slate-700 hover:bg-slate-50 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-colors"

/** Ghost button with muted affordance. */
export const HOLDEN_SLATE_BUTTON_GHOST =
  "h-7 px-2 text-xs text-slate-600 hover:bg-slate-100 transition-colors"

/** Destructive action button. */
export const HOLDEN_SLATE_BUTTON_DANGER =
  "h-8 px-3 text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 shadow-[0_1px_0_rgba(159,18,57,0.2)] transition-colors"

/** Bento card container with slate-200 hairline border + soft shadow. */
export const HOLDEN_SLATE_CARD_CLASS =
  "rounded-2xl border border-slate-200 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]"

/** Bento card with subtle tint for contextual intelligence panels. */
export const HOLDEN_SLATE_CARD_TINT =
  "rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"

/** Compact chip for status pills (emerald/amber/rose/blue variants). */
export const HOLDEN_SLATE_CHIP_BASE =
  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"

export const HOLDEN_SLATE_CHIP_TONES = {
  neutral: "border-slate-200 bg-background text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
} as const

export type HoldenSlateTone = keyof typeof HOLDEN_SLATE_CHIP_TONES

/**
 * Utility: 1-decimal Hebrew-locale currency formatter. Use everywhere the
 * directive asks for "1-decimal formatting".
 */
export function formatIls1Decimal(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return safe.toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/** Same but for raw numbers (margin %, ratios, etc.). */
export function formatNumber1Decimal(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return safe.toLocaleString("he-IL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/** Percentage string with +/- sign and 1 decimal. */
export function formatSignedPercent1Decimal(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  const abs = Math.abs(safe).toFixed(1)
  const sign = safe > 0 ? "+" : safe < 0 ? "-" : ""
  return `${sign}${abs}%`
}
