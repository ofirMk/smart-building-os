import type { Metadata } from "next"

import { NewEntityClient } from "../../entities/new/new-entity-client"

export const metadata: Metadata = {
  title: "מזמין חדש",
}

export default function NewCustomerPage() {
  return <NewEntityClient initialKind="client" />
}
