import { PillarLandingShell } from "@/components/marker-ofek/pillar-landing-shell"
import { getPillarById } from "@/lib/marker-ofek/pillar-registry"

const pillar = getPillarById("field-execution")!

export default function FieldExecutionPillarPage() {
  return <PillarLandingShell pillar={pillar} />
}
