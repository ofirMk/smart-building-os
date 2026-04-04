import { redirect } from "next/navigation"

/** נקודת כניסה היסטורית — מרכז החיוב עבר ל־`/marker-ofek/finance/billing`. */
export default function BillingPillarRedirectPage() {
  redirect("/marker-ofek/finance/billing")
}
