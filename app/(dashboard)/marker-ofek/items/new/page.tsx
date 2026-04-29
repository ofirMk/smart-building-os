import type { Metadata } from "next"

import { PriorityItemFormClient } from "./priority-item-form-client"

export const metadata: Metadata = {
  title: "פריט קטלוג חדש",
}

export default function NewCatalogItemPage() {
  return <PriorityItemFormClient />
}
