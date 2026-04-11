"use client"

import * as React from "react"
import { Maximize, Minimize } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

function getFullscreenElement(): Element | null {
  const d = document as Document & {
    webkitFullscreenElement?: Element | null
  }
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

async function enterFullscreen(): Promise<void> {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => void
  }
  if (typeof el.requestFullscreen === "function") {
    await el.requestFullscreen()
  } else if (typeof el.webkitRequestFullscreen === "function") {
    el.webkitRequestFullscreen()
  }
}

async function exitFullscreen(): Promise<void> {
  const d = document as Document & { webkitExitFullscreen?: () => void }
  if (typeof document.exitFullscreen === "function") {
    await document.exitFullscreen()
  } else if (typeof d.webkitExitFullscreen === "function") {
    d.webkitExitFullscreen()
  }
}

export function FullscreenToggle({ className }: { className?: string }) {
  const [isFullscreen, setIsFullscreen] = React.useState(false)

  React.useEffect(() => {
    const sync = () => setIsFullscreen(!!getFullscreenElement())
    sync()
    document.addEventListener("fullscreenchange", sync)
    document.addEventListener("webkitfullscreenchange", sync as EventListener)
    return () => {
      document.removeEventListener("fullscreenchange", sync)
      document.removeEventListener(
        "webkitfullscreenchange",
        sync as EventListener
      )
    }
  }, [])

  async function toggle() {
    try {
      if (getFullscreenElement()) {
        await exitFullscreen()
      } else {
        await enterFullscreen()
      }
    } catch {
      /* unsupported, denied, or gesture-required */
    }
  }

  const label = isFullscreen ? "יציאה ממסך מלא" : "מסך מלא"

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        aria-pressed={isFullscreen}
        onClick={() => void toggle()}
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-full p-2 text-slate-500 transition-all duration-300",
          "hover:bg-slate-100 hover:text-slate-900",
          "outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
          className
        )}
      >
        {isFullscreen ? (
          <Minimize className="size-[1.125rem] shrink-0" strokeWidth={1.75} />
        ) : (
          <Maximize className="size-[1.125rem] shrink-0" strokeWidth={1.75} />
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
