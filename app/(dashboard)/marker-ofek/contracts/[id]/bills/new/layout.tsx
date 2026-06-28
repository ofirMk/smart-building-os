import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "חשבון חלקי חדש",
  description: "אשף יצירת חשבון חלקי לקבלן משנה",
}

export default function NewBillLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
