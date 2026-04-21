"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { Save } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { saveMyWorkspaceSettings } from "@/lib/marker-ofek/user-workspace-actions"

import { useSmartWorkspace } from "./smart-workspace-context"

export function SaveWorkspaceButton() {
  const ws = useSmartWorkspace()
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  function onSave() {
    if (!ws) return
    startTransition(async () => {
      const projectFromPath =
        pathname?.match(/^\/marker-ofek\/projects\/([^/]+)/)?.[1] ?? null
      const defaultProjectId =
        projectFromPath ?? ws.defaultProjectId ?? null

      const res = await saveMyWorkspaceSettings({
        pinnedWidgets: ws.pinnedWidgets,
        sidePanelOpen: ws.sidePanelOpen,
        defaultBrowserHomepage: ws.defaultBrowserHomepage,
        workspacePersona: ws.workspacePersona,
        openTabs: ws.openTabs,
        splitView: ws.splitView,
        secondaryTabHref: ws.secondaryTabHref,
        splitPrimaryPinnedHref: ws.splitPrimaryPinnedHref,
        assistantSplitDocked: ws.assistantSplitDocked,
        browserPanelEnabled: ws.browserPanelEnabled,
        defaultProjectId,
        emailBridgeSso: ws.emailBridgeSso,
        browserBookmarks: ws.browserBookmarks,
        diamondWorkspaceLayout: ws.diamondWorkspaceLayout,
        ...(ws.commandCenterLayout != null
          ? { commandCenterLayout: ws.commandCenterLayout }
          : {}),
        sidebarExpanded: false,
        persistScrollForPath: {
          path: pathname ?? "/",
          y: typeof window !== "undefined" ? window.scrollY : 0,
        },
      })
      if (res.ok) {
        toast.success("שולחן העבודה נשמר")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="inline-flex gap-1.5 border-slate-200 text-foreground hover:border-emerald-500/40 hover:bg-emerald-500/5"
      disabled={pending || !ws}
      onClick={onSave}
      title="שמירת סרגל, לשוניות, פרויקט פעיל, העדפות תצוגה וגלילה"
    >
      <Save className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
      <span className="max-sm:sr-only">שמור שולחן עבודה</span>
      <span className="sm:hidden">שמור</span>
    </Button>
  )
}
