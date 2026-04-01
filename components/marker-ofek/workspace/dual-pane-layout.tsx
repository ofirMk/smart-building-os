"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Columns2, PanelRightClose } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const spring = { type: "spring" as const, stiffness: 380, damping: 34 }

export type DualPaneLayoutProps = {
  split: boolean
  onSplitChange: (next: boolean) => void
  referenceTitle: string
  reference: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function DualPaneLayout({
  split,
  onSplitChange,
  referenceTitle,
  reference,
  children,
  className,
}: DualPaneLayoutProps) {
  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 border-violet-500/30 bg-violet-500/5 shadow-sm transition-colors hover:bg-violet-500/10"
          onClick={() => onSplitChange(!split)}
          aria-pressed={split}
        >
          {split ? (
            <>
              <PanelRightClose className="size-4" aria-hidden />
              תצוגה מלאה
            </>
          ) : (
            <>
              <Columns2 className="size-4" aria-hidden />
              מצב תצוגה חצויה
            </>
          )}
        </Button>
        {split ? (
          <span className="text-xs text-muted-foreground">{referenceTitle}</span>
        ) : null}
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch"
        dir="ltr"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {split ? (
            <motion.aside
              key="mo-ref-pane"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={spring}
              className="hidden min-h-[280px] w-full max-w-sm shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/25 shadow-inner lg:flex lg:flex-col"
            >
              <div className="border-b border-border/50 px-3 py-2 text-xs font-semibold text-muted-foreground">
                {referenceTitle}
              </div>
              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
                dir="rtl"
              >
                {reference}
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>

        <motion.div
          layout
          transition={spring}
          className="min-w-0 flex-1"
        >
          {children}
        </motion.div>
      </div>

      <AnimatePresence>
        {split ? (
          <motion.div
            key="mo-ref-mobile"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border border-border/60 bg-muted/20 p-3 lg:hidden"
            dir="rtl"
          >
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              {referenceTitle}
            </p>
            <div className="max-h-64 overflow-y-auto">{reference}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
