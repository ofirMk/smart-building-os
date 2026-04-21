"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ExternalLink, GraduationCap } from "lucide-react"

import {
  DiamondQualificationCertificate,
  readDiamondCertDismissed,
} from "@/components/marker-ofek/onboarding/diamond-qualification-certificate"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { MARKER_DEMO_SANDBOX_PROJECT_ID } from "@/lib/marker-ofek/hr-qualification-gate"

export function OnboardingSandboxClient({
  isQualified,
}: {
  isQualified: boolean
}) {
  const router = useRouter()
  const [showCert, setShowCert] = React.useState(false)

  React.useEffect(() => {
    if (!isQualified) return
    if (readDiamondCertDismissed()) return
    setShowCert(true)
  }, [isQualified])

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 pb-16" dir="rtl">
      <DiamondQualificationCertificate show={showCert} onClose={() => setShowCert(false)} />

      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-100 bg-card px-3 py-1 text-[11px] font-medium text-indigo-700">
          <GraduationCap className="size-3.5" aria-hidden />
          Diamond Qualification
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">ארגז חול — הכשרה</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
          עברו את שלושת השלבים בפרויקט הדמו בלבד. נתוני האימון אינם נכללים בדשבורד הנהלה או במדדי
          רווח.
        </p>
      </header>

      {isQualified ? (
        <Card className="border-emerald-100 bg-emerald-50/40">
          <CardHeader>
            <CardTitle className="text-base text-emerald-950">הסמכה הושלמה</CardTitle>
            <CardDescription className="text-emerald-900/80">
              ניתן לעבור למרכז הפיקוד או להמשיך לתרגל בארגז החול.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => router.push("/marker-ofek/command-center")}>
              מרכז הפיקוד
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowCert(true)}>
              הצגת תעודה
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-1">
        <Card className="border-slate-100 bg-[#FFFFFF] shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-foreground">שלב 1 — ספק חדש</CardTitle>
            <CardDescription>
              הקימו ספק עם ח.פ / ע.מ. ממסכי רכש ניתן לפתוח הקמה מהירה ב־F2 (חלון חדש).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-slate-200"
              render={<Link href="/marker-ofek/entities/suppliers" />}
            >
              <ExternalLink className="size-3.5" aria-hidden />
              ניהול ספקים
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-100 bg-[#FFFFFF] shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-foreground">שלב 2 — ניכוי מס במקור</CardTitle>
            <CardDescription>
              בכרטיס הספק: הגדירו אחוז ניכוי במקור ותאריכי תוקף (תאימות מס) לפי חוקי הברזל בארגון.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-200"
              render={<Link href="/marker-ofek/entities/suppliers" />}
            >
              לרשימת הספקים
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-100 bg-[#FFFFFF] shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-foreground">שלב 3 — הזמנת רכש ראשונה</CardTitle>
            <CardDescription>
              צרו הזמנה לפרויקט האימון «אימון Diamond — ארגז חול», ובמסך ההזמנה שמרו בשדות המס אחוז
              ניכוי גדול מ־0.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-200"
              render={<Link href="/marker-ofek/procurement/purchase-orders/new" />}
            >
              הזמנת רכש חדשה
            </Button>
            <p className="w-full font-mono text-[11px] text-slate-500" dir="ltr">
              project_id: {MARKER_DEMO_SANDBOX_PROJECT_ID}
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-[11px] text-slate-400">
        העוזר החכם (למטה) מציג גם את תסריט המשימות בהקשר זה.
      </p>
    </div>
  )
}
