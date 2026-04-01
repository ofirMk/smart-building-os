import Link from "next/link"
import { ArrowRight, FolderCog } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/** יעד לקיצור F2 ממסך קליטת AI — הקמת פרויקט בלשונית נפרדת */
export default function MarkerOfekProjectSetupPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-10">
      <Link
        href="/marker-ofek/projects"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לפרויקטים
      </Link>
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300">
              <FolderCog className="size-5" aria-hidden />
            </div>
            <div>
              <CardTitle>הקמת פרויקט (מסך עזר)</CardTitle>
              <CardDescription>
                נפתח מקליטת מסמכי ספק (F2) כדי לא לאבד את טיוטת ה-OCR
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6 text-sm text-muted-foreground">
          <p>
            טופס הקמת פרויקט (מרכז רווח) זמין במסך ייעודי, כולל קישור למכרז זוכה.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button render={<Link href="/marker-ofek/projects/new" />}>
              הקמת פרויקט חדש
            </Button>
            <Button render={<Link href="/marker-ofek/procurement/ai-import" />}>
              חזרה לקליטת AI
            </Button>
            <Button
              variant="outline"
              render={<Link href="/marker-ofek/contracts" />}
            >
              חוזים
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
