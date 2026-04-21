"use client"

import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels"

import { Button } from "@/components/ui/button"
import { saveMyWorkspaceSettings } from "@/lib/marker-ofek/user-workspace-actions"
import type { DiamondWorkspaceLayoutState } from "@/lib/marker-ofek/workspace-types"
import { cn } from "@/lib/utils"

type DiamondWorkspaceLayoutProps = {
  initialLayout: DiamondWorkspaceLayoutState
  /** עמודת ניווט WBS (שמאל ב־LTR / ימין ב־RTL ויזואלי) */
  navigationPane: React.ReactNode
  workArea: React.ReactNode
  silentGuard: React.ReactNode
  dataConsole: React.ReactNode
  className?: string
}

const SAVE_DEBOUNCE_MS = 650

export function DiamondWorkspaceLayout({
  initialLayout,
  navigationPane,
  workArea,
  silentGuard,
  dataConsole,
  className,
}: DiamondWorkspaceLayoutProps) {
  const consolePanelRef = React.useRef<ImperativePanelHandle>(null)
  const layoutRef = React.useRef<DiamondWorkspaceLayoutState>(initialLayout)
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [consoleCollapsedUi, setConsoleCollapsedUi] = React.useState(
    initialLayout.consoleCollapsed
  )

  const persist = React.useCallback((next: DiamondWorkspaceLayoutState) => {
    layoutRef.current = next
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void saveMyWorkspaceSettings({ diamondWorkspaceLayout: next })
    }, SAVE_DEBOUNCE_MS)
  }, [])

  const onVerticalLayout = React.useCallback(
    (sizes: number[]) => {
      if (sizes.length < 2) return
      const collapsed =
        consolePanelRef.current?.isCollapsed() ?? layoutRef.current.consoleCollapsed
      persist({
        ...layoutRef.current,
        vertical: [sizes[0]!, sizes[1]!],
        consoleCollapsed: collapsed,
      })
    },
    [persist]
  )

  const onHorizontalLayout = React.useCallback(
    (sizes: number[]) => {
      if (sizes.length < 3) return
      persist({
        ...layoutRef.current,
        horizontal: [sizes[0]!, sizes[1]!, sizes[2]!],
      })
    },
    [persist]
  )

  React.useEffect(() => {
    layoutRef.current = initialLayout
    setConsoleCollapsedUi(initialLayout.consoleCollapsed)
  }, [initialLayout])

  React.useEffect(() => {
    if (!initialLayout.consoleCollapsed) return
    const id = window.requestAnimationFrame(() => {
      consolePanelRef.current?.collapse()
    })
    return () => window.cancelAnimationFrame(id)
  }, [initialLayout.consoleCollapsed])

  const [v0, v1] = initialLayout.vertical
  const [h0, h1, h2] = initialLayout.horizontal

  const toggleConsole = React.useCallback(() => {
    const p = consolePanelRef.current
    if (!p) return
    if (p.isCollapsed()) {
      p.expand(12)
      setConsoleCollapsedUi(false)
      persist({ ...layoutRef.current, consoleCollapsed: false })
    } else {
      p.collapse()
      setConsoleCollapsedUi(true)
      persist({ ...layoutRef.current, consoleCollapsed: true })
    }
  }, [persist])

  return (
    <div
      className={cn(
        "flex h-[min(100dvh,100vh)] min-h-0 w-full flex-col bg-card",
        className
      )}
      dir="rtl"
    >
      <PanelGroup
        direction="vertical"
        className="min-h-0 flex-1"
        onLayout={onVerticalLayout}
      >
        <Panel defaultSize={v0} minSize={32} className="min-h-0">
          <PanelGroup
            direction="horizontal"
            className="h-full min-h-0"
            dir="ltr"
            onLayout={onHorizontalLayout}
          >
            <Panel
              defaultSize={h0}
              minSize={12}
              maxSize={32}
              className="min-h-0 min-w-0 overflow-hidden"
            >
              {navigationPane}
            </Panel>
            <PanelResizeHandle
              title="גרירה לשינוי רוחב עמודת הניווט"
              className="relative w-1 shrink-0 bg-slate-100 transition-colors hover:bg-slate-200 data-[panel-resize-handle-active]:bg-indigo-300"
            />
            <Panel
              defaultSize={h1}
              minSize={36}
              className="min-h-0 min-w-0 overflow-hidden"
            >
              {workArea}
            </Panel>
            <PanelResizeHandle
              title="גרירה לשינוי רוחב בין הגאנט למשמר השקט"
              className="relative w-1 shrink-0 bg-slate-100 transition-colors hover:bg-slate-200 data-[panel-resize-handle-active]:bg-indigo-300"
            />
            <Panel
              defaultSize={h2}
              minSize={14}
              maxSize={42}
              className="min-h-0 min-w-[180px] overflow-hidden border-s border-slate-100/90 bg-background/40"
            >
              {silentGuard}
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle
          title="גרירה לשינוי גובה הקונסול התחתון"
          className="relative h-1 shrink-0 bg-slate-100 transition-colors hover:bg-slate-200 data-[panel-resize-handle-active]:bg-indigo-300"
        />
        <Panel
          ref={consolePanelRef}
          id="diamond-data-console"
          defaultSize={v1}
          minSize={6}
          maxSize={48}
          collapsible
          collapsedSize={3}
          onCollapse={() => {
            setConsoleCollapsedUi(true)
            persist({ ...layoutRef.current, consoleCollapsed: true })
          }}
          onExpand={() => {
            setConsoleCollapsedUi(false)
            persist({ ...layoutRef.current, consoleCollapsed: false })
          }}
          className="min-h-0 overflow-hidden border-t border-slate-100 bg-card"
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">
                קונסול נתונים
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs font-normal text-slate-500"
                onClick={toggleConsole}
              >
                {consoleCollapsedUi ? (
                  <ChevronUp className="size-3.5" aria-hidden />
                ) : (
                  <ChevronDown className="size-3.5" aria-hidden />
                )}
                {consoleCollapsedUi ? "הרחבה" : "כיווץ"}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
              {dataConsole}
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
