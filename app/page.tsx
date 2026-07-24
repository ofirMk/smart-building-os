import type { Metadata } from "next"
import { Suspense } from "react"

import { getOrganizationBranding } from "@/lib/marker-ofek/organization-branding"
import { MarkerOfekLoginClient } from "@/app/auth/marker-ofek/login/marker-ofek-login-client"

export const metadata: Metadata = {
  title: "כניסה למערכת",
  description: "התחברות מאובטחת לפורטל ניהול הנכסים",
}

export const dynamic = "force-dynamic"

function LoginFallback() {
  return (
    <div className="mx-auto w-full max-w-md animate-pulse space-y-6 rounded-2xl border border-border bg-card p-8">
      <div className="mx-auto h-16 w-16 rounded-2xl bg-muted" />
      <div className="mx-auto h-4 w-48 rounded bg-muted" />
      <div className="h-10 w-full rounded-lg bg-muted" />
    </div>
  )
}

export default async function RootPage() {
  const branding = await getOrganizationBranding()

  return (
    <div
      dir="rtl"
      className="flex w-full flex-1 overflow-y-auto items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-12"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-card p-8 shadow-2xl shadow-black/60 backdrop-blur sm:p-10">
        <Suspense fallback={<LoginFallback />}>
          <MarkerOfekLoginClient branding={branding} />
        </Suspense>
      </div>
    </div>
  )
}
