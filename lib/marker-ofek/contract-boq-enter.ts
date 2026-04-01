import type * as React from "react"

/** Enter בשורת BoQ לא שולח את הטופס — מוסיף שורה חדשה */
export function onBoqRowInputKeyDown(
  e: React.KeyboardEvent<HTMLInputElement>,
  appendRow: () => void
): void {
  if (e.key === "Enter") {
    e.preventDefault()
    appendRow()
  }
}
