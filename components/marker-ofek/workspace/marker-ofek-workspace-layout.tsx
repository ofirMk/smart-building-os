"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Search } from "lucide-react"

import {
  isMarkerOfekDiamondFormPath,
  useDiamondNavigation,
} from "@/hooks/use-diamond-navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { MarkerOfekCommandPalette } from "./marker-ofek-command-palette"
import {
  MarkerOfekProjectDrawer,
  MarkerOfekProjectDrawerTrigger,
} from "./marker-ofek-project-drawer"
import {
  MarkerOfekSupplierDrawer,
  MarkerOfekSupplierDrawerTrigger,
} from "./marker-ofek-supplier-drawer"
import {
  MarkerOfekWorkspaceProvider,
  useMarkerOfekWorkspace,
} from "./marker-ofek-workspace-context"

/** רק כשאין פרויקט במגירה ולא בדף שכבר רושם ניווט יהלום בדף */
function MarkerOfekWorkspaceProjectShortcutInner() {
  useDiamondNavigation("projects")
  return null
}

/**
 * כשאין פרויקט במגירה — F2 מוביל ל־/marker-ofek/projects/new (יהלום).
 * בדפי טופס עם ‎useDiamondNavigation‎ בדף — בלי כפילות מאזינים.
 */
function MarkerOfekProjectContextShortcut() {
  const pathname = usePathname() ?? ""
  const { contextProjectId } = useMarkerOfekWorkspace()
  if (contextProjectId || isMarkerOfekDiamondFormPath(pathname)) return null
  return <MarkerOfekWorkspaceProjectShortcutInner />
}

function MarkerOfekWorkspaceChrome({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? ""
  const { recentTabs, openCommandPalette } = useMarkerOfekWorkspace()

  return (
    <>
      <MarkerOfekProjectContextShortcut />
      <motion.div
        layout
        className="sticky top-0 z-30 -mx-4 mb-6 flex flex-wrap items-center gap-2 border-b border-slate-200/80 bg-slate-50/95 px-3 py-3 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-slate-50/90 md:-mx-8 md:px-6"
        dir="rtl"
        transition={{ type: "spring", stiffness: 400, damping: 38 }}
      >
        <nav
          aria-label="כרטיסיות אחרונות"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
        >
          <span className="me-1 hidden text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline">
            אחרונים
          </span>
          {recentTabs.map((tab) => (
            <motion.div
              key={tab.href}
              layout
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
            >
              <Link
                href={tab.href}
                prefetch
                scroll
                className={cn(
                  "inline-flex max-w-[11rem] truncate rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
                  pathname === tab.href
                    ? "bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/20"
                    : "text-muted-foreground hover:bg-muted/90 hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            </motion.div>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2 border-border bg-card shadow-sm transition-all duration-200"
            onClick={openCommandPalette}
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="hidden sm:inline">חיפוש מהיר</span>
            <kbd className="hidden rounded border border-border/80 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
              Ctrl+K
            </kbd>
          </Button>
          <MarkerOfekProjectDrawerTrigger />
          <MarkerOfekSupplierDrawerTrigger />
        </div>
      </motion.div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="min-h-0 min-w-0 flex-1"
        >
          {children}
        </motion.div>
      </AnimatePresence>
      <MarkerOfekCommandPalette />
      <MarkerOfekProjectDrawer />
      <MarkerOfekSupplierDrawer />
    </>
  )
}

export function MarkerOfekWorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div
        dir="rtl"
        className="flex min-h-[14rem] items-center justify-center rounded-xl border border-slate-100 bg-[#FFFFFF] px-6 py-20"
      >
        <p className="text-sm font-medium text-slate-500">טוען סביבת עבודה…</p>
      </div>
    )
  }

  return (
    <MarkerOfekWorkspaceProvider>
      <MarkerOfekWorkspaceChrome>{children}</MarkerOfekWorkspaceChrome>
    </MarkerOfekWorkspaceProvider>
  )
}
