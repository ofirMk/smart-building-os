import type { Metadata } from "next"

import { resolvePurchaseOrderTitle } from "@/lib/metadata/dynamic-titles"

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ id: string }> | { id: string }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const resolved = await Promise.resolve(params)
  const id = String(resolved.id ?? "").trim()
  const title = id ? await resolvePurchaseOrderTitle(id) : "רכש"
  return { title: `רכש ${title}` }
}

export default function ProcurementEntityLayout({ children }: LayoutProps) {
  return children
}

