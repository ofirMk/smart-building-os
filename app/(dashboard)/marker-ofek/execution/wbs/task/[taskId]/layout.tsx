import type { Metadata } from "next"

import { fallbackTaskTitle } from "@/lib/metadata/dynamic-titles"

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ taskId: string }> | { taskId: string }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const resolved = await Promise.resolve(params)
  const id = String(resolved.taskId ?? "").trim()
  return { title: id ? fallbackTaskTitle("משימת WBS", id) : "משימת WBS" }
}

export default function WbsTaskLayout({ children }: LayoutProps) {
  return children
}

