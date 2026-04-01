import { TenantPortalHome } from "@/components/tenant/tenant-portal-home"
import { getTenantAuthUser } from "@/lib/auth-tenant"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function TenantHomePage() {
  const auth = await getTenantAuthUser()
  if (!auth) {
    redirect("/login")
  }

  return <TenantPortalHome />
}
