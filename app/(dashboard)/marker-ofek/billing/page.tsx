import { PillarLandingShell } from "@/components/marker-ofek/pillar-landing-shell"
import { getPillarByHref } from "@/lib/marker-ofek/pillar-registry"

const pillar = getPillarByHref("/marker-ofek/billing")!

export default function BillingPillarPage() {
  return <PillarLandingShell pillar={pillar} />
}
