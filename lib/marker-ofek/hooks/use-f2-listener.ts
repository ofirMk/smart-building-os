/**
 * useF2Listener — hook להאזנה לקיצור F2 (Drill-Down).
 *
 * השימוש:
 * ```tsx
 * const onF2 = useF2Listener(() => setFamilyModalOpen(true))
 * return <select onKeyDown={onF2} ... />
 * ```
 *
 * החזרת קייבורד-handler מאפשרת:
 *  - אפס תלות ב-refs.
 *  - F2 מופעל רק כשהפוקוס על השדה הספציפי (לא גלובלי, לא חוטף קיצורים אחרים).
 *  - `preventDefault` + `stopPropagation` כדי שדפדפנים שמטפלים ב-F2
 *    כ"שינוי שם" (file managers / ChromeOS) לא יחטפו את האירוע.
 *  - מתעלם ממקרים של מפעיל-מקש (Alt/Ctrl/Meta) כדי לא להתנגש עם
 *    קיצורי dev-tools או OS.
 *
 * הערה: כשמודאל פתוח, יש לוודא שה-`enabled=false` או שהשדה נטרל focus
 * (Sheet של shadcn מבצע focus-trap אוטומטית, אז זה לרוב לא נדרש).
 */

import * as React from "react"

export type F2Handler = React.KeyboardEventHandler<HTMLElement>

export function useF2Listener(
  onF2: () => void,
  options: { enabled?: boolean } = {}
): F2Handler {
  const { enabled = true } = options

  return React.useCallback<F2Handler>(
    (event) => {
      if (!enabled) return
      if (event.key !== "F2") return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      event.stopPropagation()
      onF2()
    },
    [enabled, onF2]
  )
}
