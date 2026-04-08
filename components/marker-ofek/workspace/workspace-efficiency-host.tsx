"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { useActivityMonitor } from "@/hooks/use-activity-monitor"
import {
  analyzeUserEfficiency,
  applyWorkspaceLayoutPreview,
  dismissEfficiencyPattern,
  restoreWorkspaceLayoutSnapshot,
} from "@/lib/marker-ofek/workspace-efficiency-actions"
import { getWorkspaceSettingsBootstrap } from "@/lib/marker-ofek/user-workspace-actions"
import { saveCurrentViewAsScenario } from "@/lib/marker-ofek/workspace-scenario-actions"
import type {
  WorkspaceEfficiencyAnalysis,
  WorkspaceSettingsSnapshot,
} from "@/lib/marker-ofek/workspace-types"

import { WorkspaceAiPrompt } from "./workspace-ai-prompt"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

const CONFIDENCE_THRESHOLD = 0.85
const ANALYZE_EVERY_NAV = 22

export function WorkspaceEfficiencyHost({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  useActivityMonitor(enabled)

  const [analysis, setAnalysis] = React.useState<WorkspaceEfficiencyAnalysis | null>(null)
  const navTicks = React.useRef(0)
  const analyzing = React.useRef(false)

  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [restore, setRestore] = React.useState<Pick<
    WorkspaceSettingsSnapshot,
    "commandCenterLayout" | "diamondWorkspaceLayout" | "pinnedWidgets" | "workspacePersona"
  > | null>(null)

  React.useEffect(() => {
    if (!enabled || !pathname?.startsWith("/marker-ofek")) return
    navTicks.current += 1
    if (navTicks.current < ANALYZE_EVERY_NAV || navTicks.current % ANALYZE_EVERY_NAV !== 0) return
    if (analyzing.current) return
    analyzing.current = true
    void analyzeUserEfficiency().then((res) => {
      analyzing.current = false
      if (!res.ok) return
      if ("skipped" in res && res.skipped) return
      if ("analysis" in res && res.analysis.confidence >= CONFIDENCE_THRESHOLD) {
        setAnalysis(res.analysis)
      }
    })
  }, [enabled, pathname])

  async function onShowPreview() {
    if (!analysis?.proposedLayout) return
    const snap = await getWorkspaceSettingsBootstrap()
    setRestore({
      commandCenterLayout: snap.commandCenterLayout,
      diamondWorkspaceLayout: snap.diamondWorkspaceLayout,
      pinnedWidgets: snap.pinnedWidgets,
      workspacePersona: snap.workspacePersona,
    })
    const res = await applyWorkspaceLayoutPreview(analysis.proposedLayout)
    if (res.ok) {
      setPreviewOpen(true)
      setAnalysis(null)
      router.refresh()
    }
  }

  async function onCancelPreview() {
    if (restore) {
      await restoreWorkspaceLayoutSnapshot(restore)
      setRestore(null)
      router.refresh()
    }
    setPreviewOpen(false)
  }

  async function onSaveLayoutFromPreview() {
    const res = await saveCurrentViewAsScenario({
      name: "פריסה מוצעת (AI)",
      icon: "sparkles",
    })
    if (res.ok) {
      setPreviewOpen(false)
      setRestore(null)
      router.refresh()
    }
  }

  async function onIgnore() {
    setAnalysis(null)
  }

  async function onDismissPattern() {
    if (!analysis) return
    await dismissEfficiencyPattern(analysis.patternId)
    setAnalysis(null)
    router.refresh()
  }

  const showPrompt =
    Boolean(analysis) && analysis!.confidence >= CONFIDENCE_THRESHOLD

  return (
    <>
      {showPrompt ? (
        <div className="pointer-events-none fixed bottom-4 start-4 z-[60] max-w-md md:bottom-6 md:start-6">
          <WorkspaceAiPrompt
            analysis={analysis!}
            onShowPreview={() => void onShowPreview()}
            onIgnore={() => void onIgnore()}
            onDismissPattern={() => void onDismissPattern()}
          />
        </div>
      ) : null}
      <Dialog open={previewOpen} onOpenChange={(o) => !o && void onCancelPreview()}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>שמירת פריסה?</DialogTitle>
            <DialogDescription>
              התצוגה המקדימה פעילה. תוכלו לשמור כתרחיש חדש או לבטל ולחזור לפריסה הקודמת.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" onClick={() => void onSaveLayoutFromPreview()}>
              שמור פריסה זו
            </Button>
            <Button type="button" variant="outline" onClick={() => void onCancelPreview()}>
              בטל והחזר
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
