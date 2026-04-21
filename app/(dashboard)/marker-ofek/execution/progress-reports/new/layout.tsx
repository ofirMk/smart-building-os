import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "דיווח ביצוע חדש",
}

export default function NewProgressReportLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}

