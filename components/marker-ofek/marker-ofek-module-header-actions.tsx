"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { HelpCircle, Settings } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  resolveModuleHelp,
  showMarkerOfekModuleChrome,
} from "@/lib/marker-ofek/marker-ofek-module-help"

export function MarkerOfekModuleHeaderActions() {
  const pathname = usePathname() ?? ""
  const [helpOpen, setHelpOpen] = React.useState(false)

  if (!showMarkerOfekModuleChrome(pathname)) {
    return null
  }

  const help = resolveModuleHelp(pathname)

  return (
    <>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          aria-label="עזרה והסבר למסך"
          title="עזרה"
          onClick={() => setHelpOpen(true)}
        >
          <HelpCircle className="size-[1.15rem]" aria-hidden />
        </Button>
        <Link
          href="/marker-ofek/settings/smart"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "size-9 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          )}
          aria-label="הגדרות חכמות"
          title="הגדרות"
        >
          <Settings className="size-[1.05rem]" aria-hidden />
        </Link>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md border-slate-100" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-[#1e293b]">{help.title}</DialogTitle>
            <DialogDescription className="space-y-3 pt-2 text-start leading-relaxed text-slate-600">
              {help.paragraphs.map((p, i) => (
                <span key={i} className="block">
                  {p}
                </span>
              ))}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  )
}
