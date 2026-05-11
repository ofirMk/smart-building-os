import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { ArrowRight, Settings2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { SystemParametersEditor } from "@/components/marker-ofek/settings/system-parameters-editor"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { listSystemParameters } from "@/lib/erp/system-parameters"
import { formatError } from "@/lib/utils"

export const metadata: Metadata = {
  title: "פרמטרים גלובליים",
  description:
    "מסך ניהול לפרמטרים דינמיים של המערכת — מע״מ, עכבון, תחיליות מספור, ספי AI, ועוד.",
}

export const dynamic = "force-dynamic"

export default async function SystemParametersPage() {
  const store = await cookies()
  const companyId = resolveCompanyContext(store.get(COMPANY_COOKIE_KEY)?.value)

  return (
    <div dir="rtl" lang="he" className="mx-auto w-full max-w-6xl space-y-6 p-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            href="/marker-ofek/settings"
            className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
          >
            <ArrowRight className="size-3" />
            הגדרות
          </Link>
          <span>/</span>
          <span>פרמטרים גלובליים</span>
        </div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Settings2 className="size-6 text-amber-500" />
          פרמטרים דינמיים של המערכת
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          הערכים הללו זמינים לקריאה מכל המערכת (PDFs, חישובי חשבונות, מנועי AI,
          MASAV וכו&apos;) ומחליפים ערכים שהיו מקודדים-בקוד. שינוי תקף מיידית, עם
          cache TTL של דקה לכל שירות.
        </p>
      </header>

      {!companyId && (
        <Alert variant="destructive">
          <AlertTitle>חסר הקשר חברה</AlertTitle>
          <AlertDescription>
            יש לבחור חברה פעילה לפני שינוי פרמטרים. חיזרו לעמוד הראשי ובחרו חברה.
          </AlertDescription>
        </Alert>
      )}

      {companyId && (
        <SystemParametersBootstrap companyId={companyId} />
      )}
    </div>
  )
}

async function SystemParametersBootstrap({ companyId }: { companyId: string }) {
  /**
   * Resolve params outside JSX so any thrown error is captured before render.
   * Avoids the react-hooks/error-boundaries lint about JSX in try/catch.
   */
  let params: Awaited<ReturnType<typeof listSystemParameters>> | null = null
  let loadError: string | null = null
  try {
    params = await listSystemParameters(companyId)
  } catch (e) {
    loadError = formatError(e)
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>שגיאה בטעינת הפרמטרים</AlertTitle>
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    )
  }

  return (
    <SystemParametersEditor
      companyId={companyId}
      initialParameters={params ?? []}
    />
  )
}
