import type { Metadata } from "next"

import { resolveEntityTitle } from "@/lib/metadata/dynamic-titles"

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ id: string }> | { id: string }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const resolved = await Promise.resolve(params)
  const id = String(resolved.id ?? "").trim()
  const title = id ? await resolveEntityTitle(id) : "ישות"
  return { title }
}

export default function EntityDetailLayout({ children }: LayoutProps) {
  return children
}

