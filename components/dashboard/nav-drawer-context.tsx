"use client"

import * as React from "react"

type NavDrawerContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const NavDrawerContext = React.createContext<NavDrawerContextValue | null>(null)

export function NavDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const toggle = React.useCallback(() => setOpen((o) => !o), [])
  const value = React.useMemo(
    () => ({ open, setOpen, toggle }),
    [open, toggle]
  )
  return (
    <NavDrawerContext.Provider value={value}>
      {children}
    </NavDrawerContext.Provider>
  )
}

export function useNavDrawer() {
  const ctx = React.useContext(NavDrawerContext)
  if (!ctx) {
    throw new Error("useNavDrawer must be used within NavDrawerProvider")
  }
  return ctx
}
