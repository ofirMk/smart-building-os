import type { Metadata } from "next"
import { Suspense } from "react"

import { getOrganizationBranding } from "@/lib/marker-ofek/organization-branding"

import { MarkerOfekLoginClient } from "./marker-ofek-login-client"

export const metadata: Metadata = {
  title: "כניסה למערכת",
  description: "התחברות מאובטחת — ERP הנדסה וביצוע",
}

function LoginFallback() {
  return (
    <div className="mx-auto w-full max-w-md animate-pulse space-y-6 rounded-2xl border border-slate-100 bg-card p-8">
      <div className="mx-auto h-16 w-16 rounded-2xl bg-slate-100" />
      <div className="h-4 w-48 rounded bg-slate-100 mx-auto" />
      <div className="h-10 w-full rounded-lg bg-slate-100" />
    </div>
  )
}

export default async function MarkerOfekLoginPage() {
  const branding = await getOrganizationBranding()
  return (
    <div className="min-h-screen bg-card px-4 py-16">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-100 bg-card p-8 shadow-sm sm:p-10">
        <Suspense fallback={<LoginFallback />}>
          <MarkerOfekLoginClient branding={branding} />
        </Suspense>
      </div>
    </div>
  )
}
