import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "יצירת חוזה מזמין חדש",
  description: "הקמת פרויקט וניתוח מסמכי התקשרות עם HR Agent",
}

export default function CreateClientContractLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
