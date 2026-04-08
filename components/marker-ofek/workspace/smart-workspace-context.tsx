"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { titleForPath } from "@/lib/marker-ofek/route-page-title"
import { saveMyWorkspaceSettings } from "@/lib/marker-ofek/user-workspace-actions"
import type { SaveWorkspacePayload } from "@/lib/marker-ofek/user-workspace-shared"
import {
  WORKSPACE_BROADCAST_CHANNEL,
  type WorkspaceBroadcastMessage,
  type WorkspaceOpenTab,
  type WorkspaceSettingsSnapshot,
  type CommandCenterWorkspaceLayout,
} from "@/lib/marker-ofek/workspace-types"

function normPath(p: string): string {
  return p.replace(/\/$/, "") || "/"
}

type SmartWorkspaceContextValue = WorkspaceSettingsSnapshot & {
  setCommandCenterLayout: (layout: CommandCenterWorkspaceLayout | null) => void
  setSidePanelOpen: (open: boolean) => void
  setSplitView: (on: boolean) => void
  setSecondaryTabHref: (href: string | null) => void
  setSplitPrimaryPinnedHref: (href: string | null) => void
  setAssistantSplitDocked: (on: boolean) => void
  toggleSplitPrimaryPin: () => void
  setDefaultBrowserHomepage: (url: string) => void
  setOpenTabs: (tabs: WorkspaceOpenTab[]) => void
  togglePinTab: (id: string) => void
  closeTab: (id: string) => void
  closeAllTabs: () => void
  activateTab: (tab: WorkspaceOpenTab) => void
  ensureTabForPath: (href: string, title?: string) => void
  cycleWorkspaceTab: (delta: number) => void
  activateWorkspaceTabIndex: (index: number) => void
  closeCurrentWorkspaceTab: () => void
  toggleSplitViewHotkey: () => void
  broadcastInvalidate: (reason: string) => void
}

const SmartWorkspaceContext = React.createContext<SmartWorkspaceContextValue | null>(
  null
)

/** מרווח ארוך יותר — מפחית סערת כתיבות (טאבים / מפוצל) מול Supabase */
const WORKSPACE_PERSIST_DEBOUNCE_MS = 2000

function useDebouncedSave() {
  const t = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  return React.useCallback((patch: SaveWorkspacePayload) => {
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => {
      void saveMyWorkspaceSettings(patch).then((res) => {
        if (!res.ok && process.env.NODE_ENV === "development") {
          console.warn("[smart-workspace] persist failed:", res.error)
        }
      })
    }, WORKSPACE_PERSIST_DEBOUNCE_MS)
  }, [])
}

function postBroadcast(msg: WorkspaceBroadcastMessage) {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return
  try {
    const ch = new BroadcastChannel(WORKSPACE_BROADCAST_CHANNEL)
    ch.postMessage(msg)
    ch.close()
  } catch {
    /* ignore */
  }
}

export function SmartWorkspaceProvider({
  children,
  initial,
}: {
  children: React.ReactNode
  initial: WorkspaceSettingsSnapshot
}) {
  const router = useRouter()
  const pathname = usePathname()
  const debouncedSave = useDebouncedSave()

  const [state, setState] = React.useState<WorkspaceSettingsSnapshot>(initial)
  const openTabsRef = React.useRef(state.openTabs)
  React.useEffect(() => {
    openTabsRef.current = state.openTabs
  }, [state.openTabs])

  const workspaceSyncKey = React.useMemo(
    () =>
      JSON.stringify({
        scenarios: initial.workspaceScenarios.map((s) => ({ id: s.id, n: s.name })),
        active: initial.activeScenarioId,
        dismissed: initial.aiDismissedPatterns,
        cc: initial.commandCenterLayout,
      }),
    [
      initial.workspaceScenarios,
      initial.activeScenarioId,
      initial.aiDismissedPatterns,
      initial.commandCenterLayout,
    ]
  )

  React.useEffect(() => {
    setState((prev) => ({
      ...prev,
      workspaceScenarios: initial.workspaceScenarios,
      workspaceActivityLog: initial.workspaceActivityLog,
      activeScenarioId: initial.activeScenarioId,
      aiDismissedPatterns: initial.aiDismissedPatterns,
      commandCenterLayout: initial.commandCenterLayout,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- סנכרון מ־SSR כשמתעדכן workspaceSyncKey
  }, [workspaceSyncKey])

  const persist = React.useCallback(
    (next: WorkspaceSettingsSnapshot) => {
      debouncedSave({
        pinnedWidgets: next.pinnedWidgets,
        sidePanelOpen: next.sidePanelOpen,
        defaultBrowserHomepage: next.defaultBrowserHomepage,
        workspacePersona: next.workspacePersona,
        openTabs: next.openTabs,
        splitView: next.splitView,
        secondaryTabHref: next.secondaryTabHref,
        splitPrimaryPinnedHref: next.splitPrimaryPinnedHref,
        assistantSplitDocked: next.assistantSplitDocked,
        browserPanelEnabled: next.browserPanelEnabled,
        defaultProjectId: next.defaultProjectId,
        emailBridgeSso: next.emailBridgeSso,
        browserBookmarks: next.browserBookmarks,
        diamondWorkspaceLayout: next.diamondWorkspaceLayout,
        ...(next.commandCenterLayout != null
          ? { commandCenterLayout: next.commandCenterLayout }
          : {}),
      })
    },
    [debouncedSave]
  )

  const patch = React.useCallback(
    (updater: (s: WorkspaceSettingsSnapshot) => WorkspaceSettingsSnapshot) => {
      setState((prev) => {
        const next = updater(prev)
        persist(next)
        return next
      })
    },
    [persist]
  )

  const setCommandCenterLayout = React.useCallback(
    (layout: CommandCenterWorkspaceLayout | null) => {
      patch((s) => ({ ...s, commandCenterLayout: layout }))
    },
    [patch]
  )

  const setSidePanelOpen = React.useCallback(
    (open: boolean) => {
      patch((s) => ({ ...s, sidePanelOpen: open }))
    },
    [patch]
  )

  const setSplitView = React.useCallback(
    (on: boolean) => {
      patch((s) => ({
        ...s,
        splitView: on,
        ...(!on
          ? { splitPrimaryPinnedHref: null as string | null, assistantSplitDocked: false }
          : {}),
      }))
      postBroadcast({ type: "workspace-settings-patch", patch: { splitView: on } })
    },
    [patch]
  )

  const setSecondaryTabHref = React.useCallback(
    (href: string | null) => {
      patch((s) => ({ ...s, secondaryTabHref: href }))
    },
    [patch]
  )

  const setSplitPrimaryPinnedHref = React.useCallback(
    (href: string | null) => {
      patch((s) => ({ ...s, splitPrimaryPinnedHref: href }))
    },
    [patch]
  )

  const setAssistantSplitDocked = React.useCallback(
    (on: boolean) => {
      patch((s) => ({ ...s, assistantSplitDocked: on }))
    },
    [patch]
  )

  const toggleSplitPrimaryPin = React.useCallback(() => {
    patch((s) => {
      const cur = normPath(pathname ?? "")
      const pin = s.splitPrimaryPinnedHref ? normPath(s.splitPrimaryPinnedHref) : null
      if (pin === cur) {
        return { ...s, splitPrimaryPinnedHref: null }
      }
      return { ...s, splitPrimaryPinnedHref: pathname ?? null, splitView: true }
    })
  }, [patch, pathname])

  const setDefaultBrowserHomepage = React.useCallback(
    (url: string) => {
      patch((s) => ({ ...s, defaultBrowserHomepage: url }))
    },
    [patch]
  )

  const setOpenTabs = React.useCallback(
    (tabs: WorkspaceOpenTab[]) => {
      patch((s) => ({ ...s, openTabs: tabs }))
    },
    [patch]
  )

  const togglePinTab = React.useCallback(
    (id: string) => {
      patch((s) => ({
        ...s,
        openTabs: s.openTabs.map((t) =>
          t.id === id ? { ...t, pinned: !t.pinned } : t
        ),
      }))
    },
    [patch]
  )

  const closeTab = React.useCallback(
    (id: string) => {
      patch((s) => {
        const tab = s.openTabs.find((t) => t.id === id)
        if (tab?.pinned) return s
        const rest = s.openTabs.filter((t) => t.id !== id)
        let splitPrimaryPinnedHref = s.splitPrimaryPinnedHref
        if (
          tab &&
          s.splitPrimaryPinnedHref &&
          normPath(tab.href) === normPath(s.splitPrimaryPinnedHref)
        ) {
          splitPrimaryPinnedHref = null
        }
        if (tab && normPath(pathname ?? "") === normPath(tab.href)) {
          if (rest.length > 0) {
            router.push(rest[rest.length - 1]!.href)
          } else {
            router.push("/marker-ofek/command-center")
          }
        }
        return {
          ...s,
          openTabs: rest,
          splitPrimaryPinnedHref,
          ...(rest.length === 0
            ? {
                splitView: false,
                secondaryTabHref: null as string | null,
                assistantSplitDocked: false,
              }
            : {}),
        }
      })
    },
    [patch, pathname, router]
  )

  const closeAllTabs = React.useCallback(() => {
    patch((s) => ({
      ...s,
      openTabs: [],
      splitView: false,
      secondaryTabHref: null,
      splitPrimaryPinnedHref: null,
      assistantSplitDocked: false,
    }))
    router.push("/marker-ofek/command-center")
  }, [patch, router])

  const activateTab = React.useCallback(
    (tab: WorkspaceOpenTab) => {
      router.push(tab.href)
    },
    [router]
  )

  const ensureTabForPath = React.useCallback(
    (href: string, title?: string) => {
      const t = title ?? titleForPath(href)
      const nh = normPath(href)
      patch((s) => {
        const existing = s.openTabs.find((x) => normPath(x.href) === nh)
        if (existing) return s
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `tab-${Date.now()}`
        return {
          ...s,
          openTabs: [...s.openTabs, { id, href, title: t, pinned: false }],
        }
      })
    },
    [patch]
  )

  const cycleWorkspaceTab = React.useCallback(
    (delta: number) => {
      const tabs = openTabsRef.current
      if (tabs.length < 2) return
      const cur = normPath(pathname ?? "")
      let idx = tabs.findIndex((t) => normPath(t.href) === cur)
      if (idx < 0) idx = 0
      const nextIdx = (idx + delta + tabs.length) % tabs.length
      const tab = tabs[nextIdx]
      if (tab) router.push(tab.href)
    },
    [pathname, router]
  )

  const activateWorkspaceTabIndex = React.useCallback(
    (index: number) => {
      const tab = openTabsRef.current[index]
      if (tab) router.push(tab.href)
    },
    [router]
  )

  const closeCurrentWorkspaceTab = React.useCallback(() => {
    const cur = normPath(pathname ?? "")
    patch((s) => {
      const tab = s.openTabs.find((t) => normPath(t.href) === cur)
      if (!tab || tab.pinned) return s
      const rest = s.openTabs.filter((t) => t.id !== tab.id)
      let splitPrimaryPinnedHref = s.splitPrimaryPinnedHref
      if (
        s.splitPrimaryPinnedHref &&
        normPath(tab.href) === normPath(s.splitPrimaryPinnedHref)
      ) {
        splitPrimaryPinnedHref = null
      }
      if (rest.length > 0) {
        router.push(rest[rest.length - 1]!.href)
      } else {
        router.push("/marker-ofek/command-center")
      }
      return {
        ...s,
        openTabs: rest,
        splitPrimaryPinnedHref,
        ...(rest.length === 0
          ? {
              splitView: false,
              secondaryTabHref: null as string | null,
              assistantSplitDocked: false,
            }
          : {}),
      }
    })
  }, [patch, pathname, router])

  const toggleSplitViewHotkey = React.useCallback(() => {
    patch((s) => {
      const next = !s.splitView
      return {
        ...s,
        splitView: next,
        ...(next
          ? {}
          : {
              splitPrimaryPinnedHref: null as string | null,
              assistantSplitDocked: false,
            }),
      }
    })
  }, [patch])

  React.useEffect(() => {
    if (!pathname?.startsWith("/marker-ofek")) return
    ensureTabForPath(pathname)
  }, [pathname, ensureTabForPath])

  const broadcastInvalidate = React.useCallback((reason: string) => {
    postBroadcast({ type: "workspace-invalidate", reason })
  }, [])

  const value = React.useMemo<SmartWorkspaceContextValue>(
    () => ({
      ...state,
      setCommandCenterLayout,
      setSidePanelOpen,
      setSplitView,
      setSecondaryTabHref,
      setSplitPrimaryPinnedHref,
      setAssistantSplitDocked,
      toggleSplitPrimaryPin,
      setDefaultBrowserHomepage,
      setOpenTabs,
      togglePinTab,
      closeTab,
      closeAllTabs,
      activateTab,
      ensureTabForPath,
      cycleWorkspaceTab,
      activateWorkspaceTabIndex,
      closeCurrentWorkspaceTab,
      toggleSplitViewHotkey,
      broadcastInvalidate,
    }),
    [
      state,
      setCommandCenterLayout,
      setSidePanelOpen,
      setSplitView,
      setSecondaryTabHref,
      setSplitPrimaryPinnedHref,
      setAssistantSplitDocked,
      toggleSplitPrimaryPin,
      setDefaultBrowserHomepage,
      setOpenTabs,
      togglePinTab,
      closeTab,
      closeAllTabs,
      activateTab,
      ensureTabForPath,
      cycleWorkspaceTab,
      activateWorkspaceTabIndex,
      closeCurrentWorkspaceTab,
      toggleSplitViewHotkey,
      broadcastInvalidate,
    ]
  )

  return (
    <SmartWorkspaceContext.Provider value={value}>
      {children}
    </SmartWorkspaceContext.Provider>
  )
}

export function useSmartWorkspace(): SmartWorkspaceContextValue | null {
  return React.useContext(SmartWorkspaceContext)
}

export function useWorkspaceBroadcast(
  onMessage: (msg: WorkspaceBroadcastMessage) => void
) {
  React.useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return
    const ch = new BroadcastChannel(WORKSPACE_BROADCAST_CHANNEL)
    const handler = (ev: MessageEvent<WorkspaceBroadcastMessage>) => {
      onMessage(ev.data)
    }
    ch.addEventListener("message", handler)
    return () => {
      ch.removeEventListener("message", handler)
      ch.close()
    }
  }, [onMessage])
}
