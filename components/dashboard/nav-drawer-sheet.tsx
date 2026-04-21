"use client"

import { motion } from "framer-motion"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

import { useNavDrawer } from "./nav-drawer-context"

export function NavDrawerSheet({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useNavDrawer()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        dir="rtl"
        overlayClassName="z-[55] cursor-pointer bg-black/50 backdrop-blur-md supports-[backdrop-filter]:backdrop-blur-md"
        className={cn(
          "z-[60] w-[min(20rem,100vw)] shrink-0 overflow-hidden border-0 bg-sidebar p-0 text-sidebar-foreground shadow-2xl [&>button]:hidden",
          "duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform"
        )}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>תפריט ניווט</SheetTitle>
          <SheetDescription>ניווט מערכת</SheetDescription>
        </SheetHeader>
        <motion.div
          className="flex h-full max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden"
          initial={{ opacity: 0.94, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      </SheetContent>
    </Sheet>
  )
}
