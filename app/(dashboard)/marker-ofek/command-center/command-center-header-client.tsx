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
      className="gap-2 border-slate-100 bg-white font-currency-mono text-xs text-indigo-950 hover:bg-slate-50"
      onClick={() => diamond?.openNavigator()}
    >
      <Sparkles className="size-3.5 shrink-0 text-indigo-600" aria-hidden />
      סיור 360°
    </Button>
  )
}
