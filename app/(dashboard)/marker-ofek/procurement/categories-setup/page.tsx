import Link from "next/link"
import { ArrowRight, Tags } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/** יעד לקיצור F2 ממודאל Copilot — ניהול קטגוריות רכש */
export default function MarkerOfekProcurementCategoriesSetupPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-10">
      <Link
        href="/marker-ofek/procurement"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לרכש
      </Link>
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300">
              <Tags className="size-5" aria-hidden />
            </div>
            <div>
              <CardTitle>קטגוריות רכש (מסך עזר)</CardTitle>
              <CardDescription>
                נפתח מעוזר הקליטה (F2) — טבלת{" "}
                <code className="rounded bg-muted px-1 text-xs">mo_categories</code>{" "}
                ב-Supabase
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6 text-sm text-muted-foreground">
          <p>
            קטגוריות ברירת מחדל נטענות מ־
            <code className="rounded bg-muted px-1 text-xs">
              marker_ofek_shadow_catalog.sql
            </code>
            . שינויים דורשים הרשאות אדמין במערכת ובמסד.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button render={<Link href="/marker-ofek/procurement/ai-import" />}>
              חזרה לקליטת AI
            </Button>
            <Button variant="outline" render={<Link href="/marker-ofek/settings" />}>
              הגדרות מרקר אופק
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
