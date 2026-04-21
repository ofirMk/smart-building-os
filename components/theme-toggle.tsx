"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Toggles `light` ↔ `dark` via next-themes (`attribute="class"` on `<html>`).
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const activeTheme = theme === "system" ? resolvedTheme : theme
  const isDark = activeTheme === "dark"

  return (
    <Button
      type="button"
      size="icon-lg"
      variant="ghost"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      disabled={!mounted}
      className={cn(
        "relative shrink-0 rounded-lg border border-border bg-card shadow-sm transition-colors",
        "text-foreground hover:bg-accent",
        "disabled:pointer-events-none disabled:opacity-60"
      )}
      aria-label={mounted ? (isDark ? "מעבר למצב בהיר" : "מעבר למצב כהה") : "טעינת ערכת נושא"}
      title={mounted ? (isDark ? "מצב בהיר" : "מצב כהה") : undefined}
    >
      {mounted ? (
        <>
          <Sun
            strokeWidth={1.5}
            className={cn(
              "size-[18px] transition-all",
              isDark ? "scale-0 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
            )}
            aria-hidden
          />
          <Moon
            strokeWidth={1.5}
            className={cn(
              "absolute size-[18px] transition-all",
              isDark ? "scale-100 rotate-0 opacity-100" : "scale-0 -rotate-90 opacity-0"
            )}
            aria-hidden
          />
        </>
      ) : (
        <span className="size-[18px]" aria-hidden />
      )}
    </Button>
  )
}
