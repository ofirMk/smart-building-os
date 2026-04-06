"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

function shortcutTargetHref(entityType: string): string {
  if (entityType === "projects") {
    return "/marker-ofek/projects"
  }
  return `/marker-ofek/${entityType}/new`
}

/**
 * קיצורי מקלדת גלובליים במסכי מרקר אופק.
 * @param entityType — קטע נתיב תחת `/marker-ofek/`. עבור `projects` — F2 פותח את **מסך הפרויקטים** (רשימה); אחרת — `/{entityType}/new`
 * @param returnPath — נתיב לשמירה ב־sessionStorage כחזרה מ־F2; אם חסר — נשמר `pathname` הנוכחי
 */
export function useSystemShortcuts(
  entityType?: string,
  returnPath?: string
): void {
  const router = useRouter()

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return

      if (e.key === "F2" && entityType) {
        if (isTypingTarget(e.target)) return
        e.preventDefault()
        const back =
          returnPath?.trim() ||
          (typeof window !== "undefined" ? window.location.pathname : "")
        if (back) {
          sessionStorage.setItem("returnUrl", back)
        }
        router.push(shortcutTargetHref(entityType))
        return
      }

      if (e.key === "Escape") {
        if (isTypingTarget(e.target)) return
        const stored = sessionStorage.getItem("returnUrl")
        if (stored) {
          sessionStorage.removeItem("returnUrl")
          router.push(stored)
        } else {
          router.back()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [entityType, returnPath, router])
}
