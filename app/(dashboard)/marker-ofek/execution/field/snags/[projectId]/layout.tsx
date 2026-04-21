import type { Metadata } from "next"

import { resolveProjectTitle } from "@/lib/metadata/dynamic-titles"

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ projectId: string }> | { projectId: string }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const resolved = await Promise.resolve(params)
  const id = String(resolved.projectId ?? "").trim()
  const title = id ? await resolveProjectTitle(id) : "ליקויים"
  return { title: `ליקויים - ${title}` }
}

export default function SnagsLayout({ children }: LayoutProps) {
  return children
}

