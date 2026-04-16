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
      className="hover-effect h-7 shrink-0 gap-1 border-border bg-card px-2 font-currency-mono text-[10px] text-foreground transition-all duration-200 active:scale-[0.98] hover:border-primary/35 hover:bg-primary/10 sm:h-7 sm:text-[11px]"
      onClick={() => diamond?.openNavigator()}
    >
      <Sparkles className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
      סיור 360°
    </Button>
  )
}
