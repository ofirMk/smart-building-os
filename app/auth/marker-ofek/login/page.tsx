import type { Metadata } from "next"
import { Suspense } from "react"

import { getOrganizationBranding } from "@/lib/marker-ofek/organization-branding"

import { MarkerOfekLoginClient } from "./marker-ofek-login-client"

export const metadata: Metadata = {
  title: "Holden Group Gatekeeper",
  description: "התחברות מאובטחת לפורטל הקבוצה",
}

function LoginFallback() {
  return (
    <div className="mx-auto w-full max-w-md animate-pulse space-y-6 rounded-2xl border border-border bg-card p-8">
      <div className="mx-auto h-16 w-16 rounded-2xl bg-muted" />
      <div className="mx-auto h-4 w-48 rounded bg-muted" />
      <div className="h-10 w-full rounded-lg bg-muted" />
    </div>
  )
}

export default async function MarkerOfekLoginPage() {
  const branding = await getOrganizationBranding()
  return (
    <div className="relative flex-1 min-h-0 overflow-y-auto bg-background px-4 py-16 text-foreground">
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 shadow-2xl backdrop-blur sm:p-10">
        <Suspense fallback={<LoginFallback />}>
          <MarkerOfekLoginClient branding={branding} />
        </Suspense>
      </div>
    </div>
  )
}
