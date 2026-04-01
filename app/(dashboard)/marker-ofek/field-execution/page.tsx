import { PillarLandingShell } from "@/components/marker-ofek/pillar-landing-shell"
import { getPillarByHref } from "@/lib/marker-ofek/pillar-registry"

const pillar = getPillarByHref("/marker-ofek/field-execution")!

export default function FieldExecutionPillarPage() {
  return <PillarLandingShell pillar={pillar} />
}
