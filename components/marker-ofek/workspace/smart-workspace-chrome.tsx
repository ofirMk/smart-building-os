"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

import { DiamondSidekick } from "./diamond-sidekick"
import { useSmartWorkspace } from "./smart-workspace-context"

function normalizePath(p: string): string {
  const t = p.replace(/\/$/, "") || "/"
  return t
}

function SplitIframePane({ href }: { href: string | null }) {
  const [src, setSrc] = React.useState("")

  React.useEffect(() => {
    if (typeof window === "undefined" || !href) {
      setSrc("")
      return
    }
    setSrc(`${window.location.origin}${href.startsWith("/") ? href : `/${href}`}`)
  }, [href])

  if (!href || !src) {
    return (
      <div className="flex min-h-[320px] flex-1 items-center justify-center border-s border-slate-100 bg-slate-50 text-[12px] text-slate-500">
        בחרו לשונית נוספת מהסרגל כדי להציג מסך במקביל (תצוגה משנית).
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="min-h-0 min-w-0 flex-1 border-s border-slate-100 bg-white"
    >
      <iframe
        title="מסך משני"
        src={src}
        className="size-full min-h-[50vh] bg-white"
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      />
    </motion.div>
  )
}

function WorkspaceChromeInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ""
  const ws = useSmartWorkspace()
  const split = ws?.splitView ?? false
  const cur = normalizePath(pathname)
  const secondaryHref =
    ws?.secondaryTabHref ??
    ws?.openTabs.find((t) => normalizePath(t.href) !== cur)?.href ??
    null

  const pinned = ws?.splitPrimaryPinnedHref?.trim() ?? ""
  const iframeHref =
    split && pinned ? pinned : split ? secondaryHref : null

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-white">
      <div className="flex min-h-0 flex-1 flex-col border-t border-slate-100 lg:flex-row">
        <motion.div
          layout
          className={cn(
            "min-h-0 min-w-0 flex-1 bg-white",
            split && "lg:max-w-[50%] lg:border-e lg:border-slate-100"
          )}
        >
          {children}
        </motion.div>
        {split ? <SplitIframePane href={iframeHref} /> : null}
      </div>
    </div>
  )
}

export function SmartWorkspaceChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ""

  if (!pathname.startsWith("/marker-ofek")) {
    return <>{children}</>
  }

  return (
    <>
      <WorkspaceChromeInner>{children}</WorkspaceChromeInner>
      <DiamondSidekick />
    </>
  )
}
