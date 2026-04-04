import type { Metadata } from "next"

import { NewEntityClient } from "./new-entity-client"

export const metadata: Metadata = {
  title: "ישות חדשה",
}

export default function NewEntityPage() {
  return <NewEntityClient />
}
