import type { Metadata } from "next"

import { resolvePartialTitle } from "@/lib/metadata/dynamic-titles"

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ id: string }> | { id: string }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const resolved = await Promise.resolve(params)
  const id = String(resolved.id ?? "").trim()
  const title = id ? await resolvePartialTitle(id) : "חשבון חלקי"
  return { title }
}

export default function HoldenPartialAccountLayout({ children }: LayoutProps) {
  return children
}

