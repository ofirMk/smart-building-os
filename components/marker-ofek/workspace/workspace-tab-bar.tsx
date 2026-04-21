"use client"

import { usePathname } from "next/navigation"
import { Columns2, PanelLeft, Pin, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { useSmartWorkspace } from "./smart-workspace-context"

function normalizePath(p: string): string {
  const t = p.replace(/\/$/, "") || "/"
  return t
}

export function WorkspaceTabBar() {
  const pathname = usePathname()
  const ws = useSmartWorkspace()

  if (!pathname?.startsWith("/marker-ofek") || !ws) return null

  const {
    openTabs,
    splitView,
    splitPrimaryPinnedHref,
    setSplitView,
    activateTab,
    togglePinTab,
    closeTab,
    closeAllTabs,
    toggleSplitPrimaryPin,
  } = ws

  if (openTabs.length === 0) return null

  const pinActive =
    splitView &&
    splitPrimaryPinnedHref &&
    normalizePath(splitPrimaryPinnedHref) === normalizePath(pathname ?? "")

  return (
    <div
      dir="rtl"
      data-diamond-workspace-tabbar
      className="flex w-full shrink-0 items-center gap-1 border-b border-border bg-card px-2 py-1.5 print:hidden"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {openTabs.map((tab, tabIdx) => {
          const active = normalizePath(pathname) === normalizePath(tab.href)
          const hotkeyIdx = tabIdx < 9 ? tabIdx + 1 : null
          return (
            <div
              key={tab.id}
              className={cn(
                "flex max-w-[200px] shrink-0 items-center gap-0.5 rounded-md border text-[12px] transition-colors",
                active
                  ? "border-slate-700 bg-slate-800 text-slate-100"
                  : "border-transparent bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {hotkeyIdx != null ? (
                <span
                  className={cn(
                    "font-currency-mono tabular-nums text-[10px] font-semibold opacity-80",
                    active ? "text-slate-200" : "text-muted-foreground",
                    "ps-1.5"
                  )}
                  title={`Alt+${hotkeyIdx}`}
                >
                  {hotkeyIdx}
                </span>
              ) : null}
              <button
                type="button"
                className="min-w-0 flex-1 truncate px-2 py-1.5 text-start font-medium"
                title="Ctrl+Tab · Alt+מספר · Ctrl+Q לסגירה"
                onClick={() => activateTab(tab)}
              >
                {tab.title}
              </button>
              <button
                type="button"
                className={cn(
                  "shrink-0 rounded p-1",
                  active ? "text-slate-200 hover:bg-slate-700/70" : "text-muted-foreground hover:bg-accent"
                )}
                aria-label={tab.pinned ? "הסר נעיצה" : "נעץ לשונית"}
                onClick={() => togglePinTab(tab.id)}
              >
                <Pin className={cn("size-3.5", tab.pinned && "fill-current")} />
              </button>
              {!tab.pinned ? (
                <button
                  type="button"
                  className={cn(
                    "shrink-0 rounded p-1",
                    active ? "text-slate-200 hover:bg-slate-700/70" : "text-muted-foreground hover:bg-accent"
                  )}
                  aria-label="סגור לשונית"
                  onClick={() => closeTab(tab.id)}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="flex shrink-0 items-center gap-1 border-s border-border ps-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="נעיצת המסך הנוכחי בחלון ה-iframe (צד קבוע) — גלישה בצד הראשי"
          disabled={!splitView}
          className={cn(
            "h-8 gap-1 text-[11px]",
            pinActive && "bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-slate-100"
          )}
          onClick={() => toggleSplitPrimaryPin()}
        >
          <PanelLeft className="size-3.5" />
          נעץ iframe
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Ctrl+\\"
          className={cn(
            "h-8 gap-1 text-[11px]",
            splitView && "bg-muted text-foreground"
          )}
          onClick={() => setSplitView(!splitView)}
        >
          <Columns2 className="size-3.5" />
          חלוקה
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-[11px] text-muted-foreground"
          onClick={() => closeAllTabs()}
        >
          סגור הכל
        </Button>
      </div>
    </div>
  )
}
