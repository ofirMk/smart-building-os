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
        className="mb-3 flex w-full max-w-none flex-col gap-1.5 border-b border-slate-200 bg-card/95 px-2 py-2 shadow-sm backdrop-blur-sm supports-[backdrop-filter]:bg-card/90 md:px-3"
        dir="rtl"
        transition={{ type: "spring", stiffness: 400, damping: 38 }}
      >
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
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
                      ? "border border-slate-700 bg-slate-800 text-slate-100 shadow-sm"
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
        </div>
      </motion.div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          // Scroll discipline: overflow-y-auto מאפשר דפים רגילים (טפסים, דאשבורדים)
          // לגלול בתוך המעטפת. overflow-x-hidden מונע dump אופקי בזמן אנימציית slide.
          // דפים שמנהלים גלילה עצמית (HeavyItemMasterScreen, BoQ workspace) ממשיכים
          // לתפקד במצב self-managed (flex-1 + overflow-hidden בשורש שלהם) — ה-overflow-y-auto
          // כאן לא יקרה כי התוכן הפנימי לא גולש.
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden"
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
        className="flex min-h-[14rem] items-center justify-center rounded-xl border border-border bg-card px-6 py-20"
      >
        <p className="text-sm font-medium text-muted-foreground">טוען סביבת עבודה…</p>
      </div>
    )
  }

  return (
    <MarkerOfekWorkspaceProvider>
      <MarkerOfekWorkspaceChrome>{children}</MarkerOfekWorkspaceChrome>
    </MarkerOfekWorkspaceProvider>
  )
}
