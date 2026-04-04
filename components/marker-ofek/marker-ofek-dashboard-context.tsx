"use client"

import * as React from "react"
import { toast } from "sonner"

import { saveMyDashboardModules } from "@/lib/marker-ofek/user-dashboard-config-actions"
import {
  DEFAULT_MODULE_VISIBILITY,
  loadModuleVisibilityFromStorage,
  saveModuleVisibilityToStorage,
  type ModuleId,
  type ModuleVisibilityState,
  isPathAllowedByModules,
} from "@/lib/marker-ofek/module-registry"
import {
  DEFAULT_MARKER_ACCESS,
  type MarkerAccessFlags,
} from "@/lib/marker-ofek/marker-access-flags"

export type MarkerOfekDashboardContextValue = {
  /** Mirror / partner scope: filter client project lists to this `managing_partner_id` */
  managingPartnerFilterId: string | null
  modules: ModuleVisibilityState
  markerAccess: MarkerAccessFlags
  hydrated: boolean
  setModule: (id: ModuleId, value: boolean) => void
  resetAll: () => void
  isModuleEnabled: (id: ModuleId) => boolean
  isPathAllowed: (pathname: string) => boolean
}

const MarkerOfekDashboardContext = React.createContext<
  MarkerOfekDashboardContextValue | undefined
>(undefined)

/**
 * Single provider for Marker Ofek **module toggles** (server + local cache) and
 * **mirror-mode partner filter** (server-driven via layout props). One tree avoids drift.
 */
export function MarkerOfekDashboardProvider({
  children,
  initialModules,
  managingPartnerFilterId,
  initialMarkerAccess,
}: {
  children: React.ReactNode
  initialModules?: ModuleVisibilityState
  managingPartnerFilterId?: string | null
  initialMarkerAccess?: MarkerAccessFlags
}) {
  const [modules, setModules] = React.useState<ModuleVisibilityState>(
    () => initialModules ?? DEFAULT_MODULE_VISIBILITY
  )
  const [markerAccess, setMarkerAccess] = React.useState<MarkerAccessFlags>(
    () => initialMarkerAccess ?? DEFAULT_MARKER_ACCESS
  )
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    if (initialModules) {
      setModules(initialModules)
    } else {
      const stored = loadModuleVisibilityFromStorage()
      if (stored) setModules(stored)
    }
    if (initialMarkerAccess) {
      setMarkerAccess(initialMarkerAccess)
    }
    setHydrated(true)
  }, [initialModules, initialMarkerAccess])

  const setModule = React.useCallback((id: ModuleId, value: boolean) => {
    setModules((prev) => {
      const next = { ...prev, [id]: value }
      void saveMyDashboardModules(next).then((r) => {
        if (!r.ok) {
          toast.error(r.error)
          setModules((p) => ({ ...p, [id]: !value }))
        }
      })
      saveModuleVisibilityToStorage(next)
      return next
    })
  }, [])

  const resetAll = React.useCallback(() => {
    const next = { ...DEFAULT_MODULE_VISIBILITY }
    setModules(next)
    void saveMyDashboardModules(next).then((r) => {
      if (!r.ok) toast.error(r.error)
    })
    saveModuleVisibilityToStorage(next)
  }, [])

  const isModuleEnabled = React.useCallback(
    (id: ModuleId) => modules[id] === true,
    [modules]
  )

  const isPathAllowed = React.useCallback(
    (pathname: string) => isPathAllowedByModules(pathname, modules),
    [modules]
  )

  const mp = managingPartnerFilterId ?? null

  const value = React.useMemo(
    () => ({
      managingPartnerFilterId: mp,
      modules,
      markerAccess,
      hydrated,
      setModule,
      resetAll,
      isModuleEnabled,
      isPathAllowed,
    }),
    [
      mp,
      modules,
      markerAccess,
      hydrated,
      setModule,
      resetAll,
      isModuleEnabled,
      isPathAllowed,
    ]
  )

  return (
    <MarkerOfekDashboardContext.Provider value={value}>
      {children}
    </MarkerOfekDashboardContext.Provider>
  )
}

export function useMarkerOfekDashboard(): MarkerOfekDashboardContextValue {
  const ctx = React.useContext(MarkerOfekDashboardContext)
  if (!ctx) {
    throw new Error(
      "useMarkerOfekDashboard must be used within MarkerOfekDashboardProvider"
    )
  }
  return ctx
}

export function useModuleVisibility(): Omit<
  MarkerOfekDashboardContextValue,
  "managingPartnerFilterId"
> {
  const d = useMarkerOfekDashboard()
  return {
    modules: d.modules,
    markerAccess: d.markerAccess,
    hydrated: d.hydrated,
    setModule: d.setModule,
    resetAll: d.resetAll,
    isModuleEnabled: d.isModuleEnabled,
    isPathAllowed: d.isPathAllowed,
  }
}

export function useModuleVisibilityOptional(): Omit<
  MarkerOfekDashboardContextValue,
  "managingPartnerFilterId"
> | null {
  const ctx = React.useContext(MarkerOfekDashboardContext)
  if (!ctx) return null
  return {
    modules: ctx.modules,
    markerAccess: ctx.markerAccess,
    hydrated: ctx.hydrated,
    setModule: ctx.setModule,
    resetAll: ctx.resetAll,
    isModuleEnabled: ctx.isModuleEnabled,
    isPathAllowed: ctx.isPathAllowed,
  }
}

export function useMirrorPartnerFilter(): string | null {
  const ctx = React.useContext(MarkerOfekDashboardContext)
  return ctx?.managingPartnerFilterId ?? null
}
