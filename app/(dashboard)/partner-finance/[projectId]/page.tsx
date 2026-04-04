import { redirect } from "next/navigation"

type Props = { params: Promise<{ projectId: string }> }

/** Legacy URL — module lives under Marker Ofek. */
export default async function PartnerFinanceProjectLegacyRedirectPage({ params }: Props) {
  const { projectId } = await params
  const id = String(projectId ?? "").trim()
  if (!id) redirect("/marker-ofek/partner-finance")
  redirect(`/marker-ofek/partner-finance/${id}`)
}
