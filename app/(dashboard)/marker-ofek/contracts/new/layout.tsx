import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "חוזה חדש",
  description: "יצירת חוזה חדש וכתב כמויות",
}

export default function NewContractLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
