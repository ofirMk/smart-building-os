"use client"

import { Sparkles } from "lucide-react"

import { useDiamondOnboardingOptional } from "@/components/marker-ofek/diamond-onboarding"
import { Button } from "@/components/ui/button"

export function CommandCenterHeaderClient() {
  const diamond = useDiamondOnboardingOptional()

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 shrink-0 gap-1 border-slate-200 bg-card px-2 font-currency-mono text-[10px] text-foreground hover:border-emerald-500/35 hover:bg-emerald-500/5 sm:h-7 sm:text-[11px]"
      onClick={() => diamond?.openNavigator()}
    >
      <Sparkles className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
      סיור 360°
    </Button>
  )
}
