"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { Columns2 } from "lucide-react"
import { motion } from "framer-motion"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

import { useSmartWorkspace } from "./smart-workspace-context"

function normalizePath(p: string): string {
  const t = p.replace(/\/$/, "") || "/"
  return t
}

export function WorkspaceParallelSplitControl() {
  const pathname = usePathname() ?? ""
  const ws = useSmartWorkspace()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [secondaryPick, setSecondaryPick] = React.useState("")

  if (!pathname.startsWith("/marker-ofek") || !ws) return null

  const cur = normalizePath(pathname)
  const candidates = ws.openTabs.filter((t) => normalizePath(t.href) !== cur)
  const canPickSecondary = candidates.length > 0

  const openDialog = () => {
    const first = candidates[0]?.href ?? ""
    setSecondaryPick((prev) =>
      prev && candidates.some((c) => c.href === prev) ? prev : first
    )
    setDialogOpen(true)
  }

  const confirmSplit = () => {
    if (!secondaryPick) return
    ws.setSecondaryTabHref(secondaryPick)
    ws.setSplitView(true)
    setDialogOpen(false)
  }

  return (
    <>
      <motion.div whileTap={{ scale: 0.97 }} className="print:hidden">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title={
            !ws.splitView && !canPickSecondary
              ? "פתחו מודול נוסף מהתפריט כדי לחלק את המסך"
              : undefined
          }
          disabled={!ws.splitView && !canPickSecondary}
          className={cn(
            "h-9 gap-1.5 text-[11px] text-slate-600",
            ws.splitView &&
              "bg-indigo-950 text-white hover:bg-indigo-900 hover:text-white"
          )}
          onClick={() => {
            if (ws.splitView) {
              ws.setSplitView(false)
              return
            }
            openDialog()
          }}
        >
          <Columns2 className="size-3.5 shrink-0" aria-hidden />
          מסך מקביל
        </Button>
      </motion.div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>תצוגה מקבילה (50/50)</DialogTitle>
            <p className="text-xs text-muted-foreground">
              צד אחד: הנתיב הנוכחי · צד שני: לשונית שתבחרו מהסרגל.
            </p>
          </DialogHeader>
          <label className="grid gap-1.5 text-xs font-medium text-slate-600">
            לשונית משנית
            <select
              className="h-10 w-full rounded-lg border border-slate-200 bg-card px-2 text-sm text-foreground"
              value={secondaryPick}
              onChange={(e) => setSecondaryPick(e.target.value)}
            >
              {candidates.map((t) => (
                <option key={t.id} value={t.href}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <DialogFooter className="mt-2 border-0 bg-transparent p-0 sm:flex-row sm:justify-end sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              ביטול
            </Button>
            <Button type="button" onClick={confirmSplit} disabled={!secondaryPick}>
              הפעל חלוקה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
