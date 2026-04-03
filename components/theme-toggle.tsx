"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="size-10 rounded-sm border border-slate-300 bg-white text-slate-900 shadow-[0_6px_20px_-8px_rgba(15,23,42,0.2)] dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
        aria-label="החלפת ערכת נושא"
      >
        <Sun className="size-4" aria-hidden />
      </Button>
    )
  }

  const active = theme === "system" ? resolvedTheme : theme
  const isDark = active === "dark"

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative size-10 rounded-sm border border-slate-300 bg-white text-slate-900 shadow-[0_6px_20px_-8px_rgba(15,23,42,0.2)] transition-all hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700"
      aria-label={isDark ? "מעבר למצב בהיר" : "מעבר למצב כהה"}
      title={isDark ? "מצב בהיר" : "מצב כהה"}
    >
      <Sun
        className={`size-4 transition-all ${isDark ? "scale-0 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"}`}
        aria-hidden
      />
      <Moon
        className={`absolute size-4 transition-all ${isDark ? "scale-100 rotate-0 opacity-100" : "scale-0 -rotate-90 opacity-0"}`}
        aria-hidden
      />
    </Button>
  )
}
