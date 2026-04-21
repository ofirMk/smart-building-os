import type { Metadata } from "next"

import { fallbackTaskTitle } from "@/lib/metadata/dynamic-titles"

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ ganttId: string }> | { ganttId: string }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const resolved = await Promise.resolve(params)
  const id = String(resolved.ganttId ?? "").trim()
  return { title: id ? fallbackTaskTitle("גאנט", id) : "גאנט" }
}

export default function ProjectGanttLayout({ children }: LayoutProps) {
  return children
}

