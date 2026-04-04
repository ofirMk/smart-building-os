"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { DiamondNavigatorModal } from "@/components/marker-ofek/diamond-navigator-modal"
import type { DiamondNavigatorPreferences } from "@/lib/marker-ofek/diamond-navigator-curriculum"

export type DiamondOnboardingCtx = {
  /** תאימות לאחור — תמיד false (אין כפיית אקורדיון בסיור) */
  tourActive: boolean
  tourStep: number
  navigatorOpen: boolean
  openNavigator: () => void
  openReplayTour: () => void
  closeNavigator: () => void
}

const Ctx = React.createContext<DiamondOnboardingCtx | null>(null)

export function useDiamondOnboarding(): DiamondOnboardingCtx {
  const v = React.useContext(Ctx)
  if (!v) throw new Error("useDiamondOnboarding outside provider")
  return v
}

export function useDiamondOnboardingOptional(): DiamondOnboardingCtx | null {
  return React.useContext(Ctx)
}

export function DiamondOnboardingProvider({
  initialNavigatorPreferences,
  children,
}: {
  /** מ־`user_dashboard_configs.diamond_navigator_preferences` */
  initialNavigatorPreferences?: DiamondNavigatorPreferences
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? ""
  const router = useRouter()
  const inMarker =
    pathname.startsWith("/marker-ofek") ||
    pathname === "/partner-finance" ||
    pathname.startsWith("/partner-finance/")

  const [prefs, setPrefs] = React.useState<DiamondNavigatorPreferences>(
    initialNavigatorPreferences ?? {}
  )
  React.useEffect(() => {
    setPrefs(initialNavigatorPreferences ?? {})
  }, [initialNavigatorPreferences])

  const [navigatorOpen, setNavigatorOpen] = React.useState(false)

  const openNavigator = React.useCallback(() => {
    setNavigatorOpen(true)
  }, [])

  const closeNavigator = React.useCallback(() => {
    setNavigatorOpen(false)
  }, [])

  const onPrefsSaved = React.useCallback(() => {
    router.refresh()
  }, [router])

  const value = React.useMemo<DiamondOnboardingCtx>(
    () => ({
      tourActive: false,
      tourStep: 0,
      navigatorOpen,
      openNavigator,
      openReplayTour: openNavigator,
      closeNavigator,
    }),
    [navigatorOpen, openNavigator, closeNavigator]
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      {inMarker ? (
        <DiamondNavigatorModal
          open={navigatorOpen}
          onClose={closeNavigator}
          initialPrefs={prefs}
          onPrefsSaved={onPrefsSaved}
        />
      ) : null}
    </Ctx.Provider>
  )
}
