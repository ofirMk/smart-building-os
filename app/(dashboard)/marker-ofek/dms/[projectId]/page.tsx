import type { Metadata } from "next"
import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { DmsBrowser } from "@/components/marker-ofek/dms/dms-browser"
import { loadDmsBrowserBootstrap } from "@/lib/marker-ofek/dms/dms-data"

export const metadata: Metadata = {
  title: "DMS — ניהול מסמכי פרויקט",
  description: "כספת מסמכים מאובטחת ברמת פרויקט עם הרשאות, גרסאות וביקורת.",
}

type PageProps = {
  params: Promise<{ projectId: string }>
}

export default async function ProjectDmsPage({ params }: PageProps) {
  const { projectId } = await params
  const result = await loadDmsBrowserBootstrap(projectId)

  if (!result.ok) {
    return (
      <div dir="rtl" lang="he" className="mx-auto w-full max-w-3xl p-6">
        <Alert variant="destructive">
          <AlertTitle>לא ניתן לפתוח את ה-DMS</AlertTitle>
          <AlertDescription className="mt-2">
            <div className="mb-3">{result.error}</div>
            <Link
              href="/marker-ofek"
              className="text-sm underline-offset-4 hover:underline"
            >
              חזרה ל-Marker-Ofek
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return <DmsBrowser bootstrap={result.data} />
}
