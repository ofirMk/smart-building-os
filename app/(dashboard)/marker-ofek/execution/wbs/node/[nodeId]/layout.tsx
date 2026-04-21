import type { Metadata } from "next"

import { fallbackTaskTitle } from "@/lib/metadata/dynamic-titles"

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ nodeId: string }> | { nodeId: string }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const resolved = await Promise.resolve(params)
  const id = String(resolved.nodeId ?? "").trim()
  return { title: id ? fallbackTaskTitle("צומת WBS", id) : "צומת WBS" }
}

export default function WbsNodeLayout({ children }: LayoutProps) {
  return children
}

