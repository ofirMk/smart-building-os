import type { Metadata } from "next"

import { BusinessPartnerEntryForm } from "@/components/marker-ofek/entities/business-partner-entry-form"
import type { BpEntityType } from "@/lib/marker-ofek/business-partner-entry-schema"

export const metadata: Metadata = {
  title: "שותף עסקי חדש",
  description: "הקמת Business Partner — פרטים כלליים, כספים ואנשי קשר",
}

function parseKind(raw: string | string[] | undefined): BpEntityType | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw
  const k = typeof v === "string" ? v.toLowerCase().trim() : ""
  if (k === "client" || k === "supplier" || k === "subcontractor") return k
  return undefined
}

function parseLock(raw: string | string[] | undefined): boolean {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (v === "1" || v === "true") return true
  return false
}

export default async function NewEntityPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; lock?: string }>
}) {
  const sp = await searchParams
  const initialKind = parseKind(sp.kind)
  const lockKind = parseLock(sp.lock)

  return (
    <div className="mx-auto w-full max-w-4xl pb-10 pt-2">
      <BusinessPartnerEntryForm initialKind={initialKind} lockKind={lockKind} />
    </div>
  )
}
