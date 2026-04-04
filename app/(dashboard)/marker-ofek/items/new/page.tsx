import type { Metadata } from "next"

import { NewCatalogItemClient } from "./new-catalog-item-client"

export const metadata: Metadata = {
  title: "פריט קטלוג חדש",
}

export default function NewCatalogItemPage() {
  return <NewCatalogItemClient />
}
