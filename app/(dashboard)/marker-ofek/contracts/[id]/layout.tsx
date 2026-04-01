import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "פרטי חוזה — מרקר אופק",
  description: "כתב כמויות והגשת חשבון חלקי — מרקר אופק",
}

export default function ContractDetailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
