import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { TenantShell } from "@/components/tenant/tenant-shell"
import { getTenantAuthUser } from "@/lib/auth-tenant"

/**
 * פריסת פורטל דיירים — נפרדת מ־(dashboard) וללא סרגל ניהול אדמין.
 * רק מסלולי ‎/tenant/**‎ — אימות דייר נדרש.
 */
export const metadata: Metadata = {
  title: "אזור אישי - דיירים",
  description: "שירותים, קריאות ותשלומים — פורטל דיירים",
}

export default async function TenantLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const auth = await getTenantAuthUser()
  if (!auth) {
    redirect("/login")
  }

  return <TenantShell>{children}</TenantShell>
}
