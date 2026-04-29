import type { ReactNode } from "react"

export function RouteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
      {children}
    </div>
  )
}
