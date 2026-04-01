import { PillarLandingShell } from "@/components/marker-ofek/pillar-landing-shell"
import { getPillarByHref } from "@/lib/marker-ofek/pillar-registry"

const pillar = getPillarByHref("/marker-ofek/handover")!

export default function HandoverPillarPage() {
  return <PillarLandingShell pillar={pillar} />
}
