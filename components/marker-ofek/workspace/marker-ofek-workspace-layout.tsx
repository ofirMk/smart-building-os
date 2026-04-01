"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Search } from "lucide-react"

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

function MarkerOfekWorkspaceChrome({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? ""
  const { recentTabs, openCommandPalette } = useMarkerOfekWorkspace()

  return (
    <>
      <motion.div
        layout
        className="sticky top-0 z-30 -mx-4 mb-4 flex flex-wrap items-center gap-2 border-b border-border/60 bg-background/85 px-2 py-2.5 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/70 md:-mx-6 md:px-4"
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
                  "inline-flex max-w-[11rem] truncate rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150",
                  pathname === tab.href
                    ? "bg-gradient-to-l from-violet-500/20 to-cyan-500/10 text-foreground shadow-sm ring-1 ring-violet-500/25"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
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
            className="h-9 gap-2 border-border/70 bg-background/80 shadow-sm"
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
      {children}
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
  return (
    <MarkerOfekWorkspaceProvider>
      <MarkerOfekWorkspaceChrome>{children}</MarkerOfekWorkspaceChrome>
    </MarkerOfekWorkspaceProvider>
  )
}
