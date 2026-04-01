import type { Metadata } from "next"

export const metadata: Metadata = {
  manifest: "/manifest-admin.json",
  appleWebApp: {
    title: "הולדן גרופ",
    capable: true,
    statusBarStyle: "default",
  },
}

export default function AdminGroupLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <>{children}</>
}
