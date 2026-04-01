import { PillarLandingShell } from "@/components/marker-ofek/pillar-landing-shell"
import { getPillarByHref } from "@/lib/marker-ofek/pillar-registry"

const pillar = getPillarByHref("/marker-ofek/financial-control")!

export default function FinancialControlPillarPage() {
  return <PillarLandingShell pillar={pillar} />
}
