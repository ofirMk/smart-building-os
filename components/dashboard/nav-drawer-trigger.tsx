"use client"

import { PanelLeftIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { useNavDrawer } from "./nav-drawer-context"

/** Hamburger / panel control — opens the slide-over navigation (no shadcn SidebarProvider). */
export function NavDrawerTrigger({ className }: { className?: string }) {
  const { toggle } = useNavDrawer()

  return (
    <Button
      type="button"
      data-slot="nav-drawer-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn(className)}
      onClick={toggle}
      aria-label="פתיחת תפריט ניווט"
    >
      <PanelLeftIcon className="size-5" aria-hidden />
      <span className="sr-only">הצגה או הסתרה של תפריט הניווט</span>
    </Button>
  )
}
