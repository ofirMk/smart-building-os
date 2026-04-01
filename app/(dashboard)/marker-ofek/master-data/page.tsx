import { PillarLandingShell } from "@/components/marker-ofek/pillar-landing-shell"
import { getPillarByHref } from "@/lib/marker-ofek/pillar-registry"

const pillar = getPillarByHref("/marker-ofek/master-data")!

export default function MasterDataPillarPage() {
  return <PillarLandingShell pillar={pillar} />
}
