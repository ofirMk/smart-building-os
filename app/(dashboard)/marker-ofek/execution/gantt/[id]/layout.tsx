import type { Metadata } from "next"

import { fallbackTaskTitle } from "@/lib/metadata/dynamic-titles"

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ id: string }> | { id: string }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const resolved = await Promise.resolve(params)
  const id = String(resolved.id ?? "").trim()
  return { title: id ? fallbackTaskTitle("גאנט ביצוע", id) : "גאנט ביצוע" }
}

export default function ExecutionGanttLayout({ children }: LayoutProps) {
  return children
}

