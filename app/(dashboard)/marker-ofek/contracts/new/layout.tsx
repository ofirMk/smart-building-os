import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "חוזה חדש — מרקר אופק",
  description: "יצירת חוזה חדש וכתב כמויות — מרקר אופק",
}

export default function NewContractLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
