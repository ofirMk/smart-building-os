import { redirect } from "next/navigation"

/** Legacy URL — module lives under Marker Ofek. */
export default function PartnerFinanceLegacyRedirectPage() {
  redirect("/marker-ofek/partner-finance")
}
