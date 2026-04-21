import type { Metadata } from "next"

import { resolveContractTitle } from "@/lib/metadata/dynamic-titles"

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ id: string }> | { id: string }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const resolved = await Promise.resolve(params)
  const id = String(resolved.id ?? "").trim()
  const title = id ? await resolveContractTitle(id) : "פרטי חוזה"
  return {
    title,
    description: "כתב כמויות והגשת חשבון חלקי",
  }
}

export default function ContractDetailLayout({
  children,
}: LayoutProps) {
  return children
}
