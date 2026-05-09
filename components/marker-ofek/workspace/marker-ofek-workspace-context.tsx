"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

const MAX_RECENT_TABS = 3

export type MarkerOfekRecentTab = {
  href: string
  label: string
}

function tabLabelForPath(pathname: string): string {
  if (pathname === "/marker-ofek" || pathname === "/marker-ofek/")
    return "לוח בקרה"
  if (pathname.startsWith("/marker-ofek/contracts/new")) return "חוזה חדש"
  if (pathname.startsWith("/marker-ofek/contracts/") && pathname !== "/marker-ofek/contracts")
    return "פרטי חוזה"
  if (pathname === "/marker-ofek/contracts") return "חוזים"
  if (pathname.startsWith("/marker-ofek/procurement/new")) return "הזמנת רכש חדשה"
  if (pathname.startsWith("/marker-ofek/procurement/receipt/")) return "קבלת סחורה"
  if (pathname.startsWith("/marker-ofek/procurement/orders")) return "הזמנות"
  if (pathname.startsWith("/marker-ofek/procurement/suppliers")) return "ספקים"
  if (pathname.startsWith("/marker-ofek/procurement/inventory")) return "ניהול מלאי"
  if (pathname.startsWith("/marker-ofek/procurement/catalog")) return "קטלוג פריטים"
  if (pathname.startsWith("/marker-ofek/procurement/assets")) return "נכסי חברה"
  if (pathname.startsWith("/marker-ofek/procurement/") && pathname !== "/marker-ofek/procurement")
    return "הזמנת רכש"
  if (pathname === "/marker-ofek/procurement") return "רכש"
  if (pathname === "/marker-ofek/tenders" || pathname === "/marker-ofek/tenders/")
    return "מכרזים והערכות"
  if (pathname.startsWith("/marker-ofek/tenders/pricing")) return "תמחור — מכרזים"
  if (pathname.startsWith("/marker-ofek/tenders/boq")) return "כתבי כמויות"
  if (pathname.startsWith("/marker-ofek/tenders/comparison")) return "השוואת הצעות"
  if (pathname.startsWith("/marker-ofek/tenders/wbs")) return "מבנה WBS"
  if (pathname.startsWith("/marker-ofek/projects/new")) return "הקמת פרויקט"
  if (
    pathname.includes("/contract-ai") &&
    pathname.startsWith("/marker-ofek/projects/")
  )
    return "עוזר AI חוזי"
  if (
    pathname.startsWith("/marker-ofek/projects/") &&
    pathname !== "/marker-ofek/projects"
  )
    return "מרכז פרויקט"
  if (pathname === "/marker-ofek/projects") return "פרויקטים"
  if (pathname.startsWith("/marker-ofek/execution/progress-reports"))
    return "חשבונות חלקיים"
  if (pathname.startsWith("/marker-ofek/execution/plans")) return "תוכניות ו-Takeoff"
  if (pathname.startsWith("/marker-ofek/execution/daily-logs"))
    return "יומני עבודה"
  if (pathname.startsWith("/marker-ofek/schedule")) return "לוח זמנים"
  if (pathname.startsWith("/marker-ofek/budget")) return "תקציב"
  if (pathname.startsWith("/marker-ofek/items")) return "קטלוג"
  if (pathname.startsWith("/marker-ofek/holden-erp")) return "Holden ERP"
  if (pathname.startsWith("/marker-ofek/finance")) return "כספים"
  if (pathname === "/marker-ofek/dms" || pathname === "/marker-ofek/dms/")
    return "כספת מסמכים (DMS)"
  if (pathname.startsWith("/marker-ofek/dms/")) return "DMS — מסמכי פרויקט"
  if (pathname.startsWith("/marker-ofek/settings")) return "הגדרות"
  return "מערכת הביצוע"
}

type MarkerOfekWorkspaceContextValue = {
  recentTabs: MarkerOfekRecentTab[]
  contextProjectId: string | null
  setContextProjectId: (id: string | null) => void
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void
  projectDrawerOpen: boolean
  setProjectDrawerOpen: (open: boolean) => void
  supplierDrawerOpen: boolean
  setSupplierDrawerOpen: (open: boolean) => void
  contextSupplierId: string | null
  contextSupplierName: string | null
  openSupplierDrawer: (payload?: { supplierId?: string | null; supplierName?: string | null }) => void
  openCommandPalette: () => void
  openProjectDrawer: () => void
}

const MarkerOfekWorkspaceContext =
  React.createContext<MarkerOfekWorkspaceContextValue | null>(null)

export function MarkerOfekWorkspaceProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? ""
  const [recentTabs, setRecentTabs] = React.useState<MarkerOfekRecentTab[]>([])
  const [contextProjectId, setContextProjectId] = React.useState<string | null>(
    null
  )
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false)
  const [projectDrawerOpen, setProjectDrawerOpen] = React.useState(false)
  const [supplierDrawerOpen, setSupplierDrawerOpen] = React.useState(false)
  const [contextSupplierId, setContextSupplierId] = React.useState<string | null>(null)
  const [contextSupplierName, setContextSupplierName] = React.useState<string | null>(null)

  const lastRecorded = React.useRef<string>("")

  React.useEffect(() => {
    if (!pathname.startsWith("/marker-ofek")) return
    if (pathname === lastRecorded.current) return
    lastRecorded.current = pathname

    const label = tabLabelForPath(pathname)
    setRecentTabs((prev) => {
      const next = prev.filter((t) => t.href !== pathname)
      next.unshift({ href: pathname, label })
      return next.slice(0, MAX_RECENT_TABS)
    })
  }, [pathname])

  const openCommandPalette = React.useCallback(() => {
    setCommandPaletteOpen(true)
  }, [])

  const openProjectDrawer = React.useCallback(() => {
    setProjectDrawerOpen(true)
  }, [])

  const openSupplierDrawer = React.useCallback(
    (payload?: { supplierId?: string | null; supplierName?: string | null }) => {
      const supplierId = payload?.supplierId?.trim() || null
      const supplierName = payload?.supplierName?.trim() || null
      if (supplierId) setContextSupplierId(supplierId)
      if (supplierName) setContextSupplierName(supplierName)
      setSupplierDrawerOpen(true)
    },
    []
  )

  React.useEffect(() => {
    function onOpenSupplierDrawer(event: Event) {
      const custom = event as CustomEvent<{ supplierId?: string; supplierName?: string }>
      openSupplierDrawer({
        supplierId: custom.detail?.supplierId ?? null,
        supplierName: custom.detail?.supplierName ?? null,
      })
    }
    window.addEventListener(
      "marker-ofek:open-supplier-drawer",
      onOpenSupplierDrawer as EventListener
    )
    return () => {
      window.removeEventListener(
        "marker-ofek:open-supplier-drawer",
        onOpenSupplierDrawer as EventListener
      )
    }
  }, [openSupplierDrawer])

  const value = React.useMemo(
    () => ({
      recentTabs,
      contextProjectId,
      setContextProjectId,
      commandPaletteOpen,
      setCommandPaletteOpen,
      projectDrawerOpen,
      setProjectDrawerOpen,
      supplierDrawerOpen,
      setSupplierDrawerOpen,
      contextSupplierId,
      contextSupplierName,
      openSupplierDrawer,
      openCommandPalette,
      openProjectDrawer,
    }),
    [
      recentTabs,
      contextProjectId,
      commandPaletteOpen,
      projectDrawerOpen,
      supplierDrawerOpen,
      contextSupplierId,
      contextSupplierName,
      openSupplierDrawer,
      openCommandPalette,
      openProjectDrawer,
    ]
  )

  return (
    <MarkerOfekWorkspaceContext.Provider value={value}>
      {children}
    </MarkerOfekWorkspaceContext.Provider>
  )
}

export function useMarkerOfekWorkspace() {
  const ctx = React.useContext(MarkerOfekWorkspaceContext)
  if (!ctx) {
    throw new Error(
      "useMarkerOfekWorkspace must be used within MarkerOfekWorkspaceProvider"
    )
  }
  return ctx
}

export function useMarkerOfekWorkspaceOptional() {
  return React.useContext(MarkerOfekWorkspaceContext)
}
