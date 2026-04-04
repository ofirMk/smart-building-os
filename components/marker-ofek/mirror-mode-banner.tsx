"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"

import { setMirrorMode } from "@/lib/marker-ofek/mirror-mode-actions"
import { MIRROR_BANNER_H_CLASS } from "@/lib/marker-ofek/mirror-layout"
import { cn } from "@/lib/utils"

export function MirrorModeBanner({ label }: { label: string }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function exit() {
    setPending(true)
    const res = await setMirrorMode("global")
    setPending(false)
    if (res.ok) router.refresh()
  }

  return (
    <div
      className={cn(
        MIRROR_BANNER_H_CLASS,
        "fixed inset-x-0 top-0 z-[100] flex print:hidden",
        "border-b border-slate-100 bg-white/95 backdrop-blur-sm supports-[backdrop-filter]:bg-white/80"
      )}
      role="status"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-3 sm:px-6">
        <span className="min-w-0 truncate text-[11px] font-medium leading-tight text-slate-900 sm:text-xs">
          {label}
        </span>
        <button
          type="button"
          onClick={() => void exit()}
          disabled={pending}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-100 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-600 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 disabled:opacity-60"
        >
          <X className="size-3" aria-hidden />
          יציאה
        </button>
      </div>
    </div>
  )
}
