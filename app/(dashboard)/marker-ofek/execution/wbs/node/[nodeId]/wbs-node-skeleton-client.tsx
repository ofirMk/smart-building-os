"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { useDiamondNavigation } from "@/hooks/use-diamond-navigation"
import { Button } from "@/components/ui/button"

export function WbsNodeSkeletonClient({
  nodeId,
  projectIdHint,
}: {
  nodeId: string
  projectIdHint: string | null
}) {
  useDiamondNavigation(undefined, { enabled: true })

  const backHref = projectIdHint
    ? `/marker-ofek/execution/diamond-workspace/${projectIdHint}`
    : "/marker-ofek/execution/gantt"

  return (
    <div
      className="mx-auto flex min-h-[50vh] max-w-lg flex-col gap-6 p-8"
      dir="rtl"
    >
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לשולחן העבודה
      </Link>
      <div className="space-y-2">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-400">
          צומת WBS — טיוטה
        </p>
        <h1 className="text-2xl font-extralight text-foreground">עורך מבנה</h1>
        <p className="font-mono text-xs text-slate-500">{nodeId}</p>
        <p className="text-sm font-light leading-relaxed text-slate-600">
          נקודת כניסה ל-F2 מצומת WBS. עריכת תווית והיררכיה תתווסף בהמשך; Escape
          מחזיר לנתיב שנשמר ביהלום.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          className="rounded-full bg-slate-900 px-6 text-white hover:bg-slate-800"
          render={<Link href={backHref} />}
        >
          חזרה
        </Button>
        {projectIdHint ? (
          <Button
            variant="outline"
            className="rounded-full"
            render={
              <Link href={`/marker-ofek/execution/gantt/${projectIdHint}`} />
            }
          >
            גאנט מלא
          </Button>
        ) : null}
      </div>
    </div>
  )
}
