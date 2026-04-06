import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "סוג חוזה חדש",
  description: "בחירת סוג התקשרות — מזמין או קבלן/ספק",
}

export default function SelectContractTypeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
