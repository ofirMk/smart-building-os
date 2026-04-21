"use client"

import Link from "next/link"
import * as React from "react"
import { AlertTriangle, Camera, ClipboardList, Gauge } from "lucide-react"

import { Progress } from "@/components/ui/progress"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import type {
  MarkerOfekProjectDailyLogRow,
  MarkerOfekSiteMediaRow,
} from "@/types/marker-ofek"

import { ProjectMiniGantt } from "./project-mini-gantt"

const SITE_MEDIA_BUCKET =
  process.env.NEXT_PUBLIC_SITE_MEDIA_BUCKET?.trim() || "project_documents"

type ProjectExecutionCommandViewProps = {
  projectId: string
  progressPercent: number | null
  siteLabel: string | null
  media: MarkerOfekSiteMediaRow[]
  issues: MarkerOfekProjectDailyLogRow[]
}

export function ProjectExecutionCommandView({
  projectId,
  progressPercent,
  siteLabel,
  media,
  issues,
}: ProjectExecutionCommandViewProps) {
  const [urls, setUrls] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const supabase = createSupabaseBrowserClient()
      const next: Record<string, string> = {}
      for (const m of media.slice(0, 8)) {
        const { data, error } = await supabase.storage
          .from(SITE_MEDIA_BUCKET)
          .createSignedUrl(m.storage_path, 3600)
        if (!error && data?.signedUrl) next[m.id] = data.signedUrl
      }
      if (!cancelled) setUrls(next)
    })()
    return () => {
      cancelled = true
    }
  }, [media])

  const pct = progressPercent != null ? Math.max(0, Math.min(100, progressPercent)) : null

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <section
          className="rounded-xl border border-slate-100 bg-card p-5 shadow-sm lg:col-span-1"
          aria-labelledby="exec-progress-heading"
        >
          <div className="flex items-center gap-2 text-[#1e293b]">
            <Gauge className="size-5 text-indigo-600" aria-hidden />
            <h2 id="exec-progress-heading" className="text-base font-semibold">
              התקדמות כוללת
            </h2>
          </div>
          {siteLabel ? (
            <p className="mt-1 font-currency-mono text-xs text-slate-500">{siteLabel}</p>
          ) : null}
          <div className="mt-4 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-currency-mono text-3xl font-semibold tabular-nums text-[#1e293b]">
                {pct != null ? `${pct}%` : "—"}
              </span>
              <span className="font-currency-mono text-xs text-slate-400">משקל לפי משימות עלה</span>
            </div>
            <Progress value={pct ?? 0} className="h-2 bg-slate-100" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/marker-ofek/execution/gantt/${projectId}`}
              className="inline-flex rounded-lg border border-slate-100 bg-background px-3 py-2 text-sm font-medium text-[#1e293b] hover:bg-slate-100"
            >
              גאנט מלא
            </Link>
            <Link
              href={`/marker-ofek/projects/${projectId}/daily-log`}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              <ClipboardList className="size-4" aria-hidden />
              יומן שטח
            </Link>
          </div>
        </section>

        <section
          className="rounded-xl border border-slate-100 bg-card p-5 shadow-sm lg:col-span-1"
          aria-labelledby="exec-media-heading"
        >
          <div className="flex items-center gap-2 text-[#1e293b]">
            <Camera className="size-5 text-teal-600" aria-hidden />
            <h2 id="exec-media-heading" className="text-base font-semibold">
              תמונות אחרונות
            </h2>
          </div>
          {media.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">אין מדיה — העלו מיומן השטח או ממשק ניהול.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
              {media.slice(0, 8).map((m) => {
                const src = urls[m.id]
                return (
                  <li
                    key={m.id}
                    className="aspect-square overflow-hidden rounded-lg border border-slate-100 bg-background"
                  >
                    {src && String(m.mime_type ?? "").startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center p-2 text-center font-currency-mono text-[10px] text-slate-500">
                        {m.caption?.trim() || m.storage_path}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section
          className="rounded-xl border border-slate-100 bg-card p-5 shadow-sm lg:col-span-1"
          aria-labelledby="exec-issues-heading"
        >
          <div className="flex items-center gap-2 text-[#1e293b]">
            <AlertTriangle className="size-5 text-amber-600" aria-hidden />
            <h2 id="exec-issues-heading" className="text-base font-semibold">
              דגלים אדומים
            </h2>
          </div>
          {issues.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">אין דיווחי חריגה ביומן השטח.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {issues.map((log) => (
                <li
                  key={log.id}
                  className="rounded-lg border border-amber-100 bg-amber-50/80 p-3 text-amber-950"
                >
                  <p className="font-currency-mono text-xs text-amber-800/90">{log.log_date}</p>
                  <p className="mt-1 text-sm">{log.red_flags}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ProjectMiniGantt projectId={projectId} />
    </div>
  )
}
