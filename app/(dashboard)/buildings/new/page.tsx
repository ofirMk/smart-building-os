import type { Metadata } from "next"

import { NewBuildingWizard } from "./new-building-wizard"

export const metadata: Metadata = {
  title: "הקמת בניין חדש",
}

export const dynamic = "force-dynamic"

export default function NewBuildingPage() {
  return <NewBuildingWizard />
}
