"use client"

import Link from "next/link"
import { ArrowRight, MessageCircleQuestion } from "lucide-react"

import { AiProgressBar } from "@/components/shared/ai-progress-bar"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAiScanner } from "@/hooks/use-ai-scanner"

export type ContractAiPageClientProps = {
  project: {
    id: string
    name: string
    internal_project_code: string
  }
}

/**
 * מעטפת לקוח — שימוש ב־useAiScanner + AiProgressBar לאחידות UX עם סריקות AI אחרות.
 * בעת חיבור פעולת שרת: קראו ל־startScanSimulation('contract') לפני הקריאה, ואז completeScan / resetScan.
 */
export function ContractAiPageClient({ project }: ContractAiPageClientProps) {
  const { isScanning, scanProgress, scanStatus } = useAiScanner()

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-10">
      <Link
        href={`/marker-ofek/projects/${project.id}`}
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה למרכז הפרויקט
      </Link>

      <Card className="border-border/70">
        <CardHeader className="border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300">
              <MessageCircleQuestion className="size-5" aria-hidden />
            </div>
            <div>
              <CardTitle>עוזר AI חוזי</CardTitle>
              <CardDescription>
                {project.name} · {project.internal_project_code}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
            <Badge variant="destructive" className="shrink-0 font-normal">
              אזהרה
            </Badge>
            <p className="text-sm leading-relaxed text-foreground">
              ה-AI מבסס תשובות אך ורק על מסמכי הכספת. תשובות שאינן מבוססות סעיף
              יסומנו כהמלצה מסחרית בלבד.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            ממשק שיחה מול מסמכי הכספת יתווסף בשלב הבא. בינתיים העלו חוזים ומפרטים
            בלשונית &quot;כספת מסמכים ו-AI&quot; במרכז הפרויקט.
          </p>

          <div role="status" aria-live="polite" aria-busy={isScanning}>
            <AiProgressBar
              isScanning={isScanning}
              progress={scanProgress}
              status={scanStatus}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
