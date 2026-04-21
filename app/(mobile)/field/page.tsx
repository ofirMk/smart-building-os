import type { Metadata } from "next"

import { MobileFieldClient } from "@/components/mobile/field/mobile-field-client"

export const metadata: Metadata = {
  title: "Field Mobile Workspace",
  description: "Mobile-first interface for site managers: work logs, receipts, and field exceptions.",
}

export default function MobileFieldPage() {
  return <MobileFieldClient />
}
