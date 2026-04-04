import { redirect } from "next/navigation"

/** Legacy URL — Marker Ofek module canonical route is `/marker-ofek/partner-finance`. */
export default function PartnerMetricsLegacyRedirectPage() {
  redirect("/marker-ofek/partner-finance")
}
