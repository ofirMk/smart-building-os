import { redirect } from "next/navigation"

/** נתיב אלטרנטיבי: `…/projects/contracts/billing/[partialId]` → מרכז החיוב המלא. */
export default async function ProjectsContractsBillingRedirectPage({
  params,
}: {
  params: Promise<{ partialId: string }> | { partialId: string }
}) {
  const resolved = await Promise.resolve(params)
  const partialId =
    typeof resolved.partialId === "string" ? resolved.partialId : ""
  if (!partialId) {
    redirect("/marker-ofek/finance/billing")
  }
  redirect(`/marker-ofek/finance/contracts/billing/${partialId}`)
}
