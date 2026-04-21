import type { Metadata } from "next"

import { resolvePartialTitle } from "@/lib/metadata/dynamic-titles"

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ partialId: string }> | { partialId: string }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const resolved = await Promise.resolve(params)
  const id = String(resolved.partialId ?? "").trim()
  const title = id ? await resolvePartialTitle(id) : "חשבון חלקי"
  return { title }
}

export default function FinancePartialLayout({ children }: LayoutProps) {
  return children
}

