import type { Metadata } from "next"

/**
 * Sprint T14 — Public route group root layout.
 *
 * The global `app/layout.tsx` enforces `overflow-hidden h-[100dvh]` so the
 * authenticated dashboard never page-scrolls. Public pages — especially the
 * mobile-first vendor bidding portal — need NORMAL vertical scrolling, so
 * we wrap children in a scrollable container that opts out of the root's
 * overflow lock while still inheriting the theme + fonts.
 *
 * This layout intentionally has NO authentication checks: every route under
 * `app/(public)/**` is anonymous-accessible.
 */

export const metadata: Metadata = {
  title: {
    template: "%s · Marker Ofek",
    default: "Marker Ofek · Vendor Portal",
  },
}

export default function PublicRouteGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      dir="rtl"
      className="flex h-[100dvh] w-full flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-slate-50 via-white to-indigo-50/40"
      data-layout-region="public-root"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col">{children}</div>
    </div>
  )
}
