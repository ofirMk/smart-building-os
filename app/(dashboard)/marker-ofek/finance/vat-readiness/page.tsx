import { format } from "date-fns"

import { VatReadinessClient } from "@/app/(dashboard)/marker-ofek/finance/vat-readiness/vat-readiness-client"

export const dynamic = "force-dynamic"

export default function VatReadinessPage() {
  const initialMonth = format(new Date(), "yyyy-MM")
  return <VatReadinessClient initialMonth={initialMonth} />
}
