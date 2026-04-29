import type { Metadata } from "next"

import { CsvImportClient } from "./csv-import-client"

export const metadata: Metadata = {
  title: "ייבוא קטלוג פריטים (CSV)",
}

export default function ItemsImportPage() {
  return <CsvImportClient />
}
