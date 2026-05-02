"use client"

/**
 * MasterDetailShell — Phase 8.3.X **System Standard** for linked data.
 *
 * ## Vision
 *   "דפוס Priority" — מסך אב למעלה + מסך בן למטה, אותו template ויזואלי
 *   לשני הצדדים (BentoSmartList). שורה אקטיבית במסך האב מזינה את מסך
 *   הבן. מסך הבן מכיל tabs לבחירת **סוג הרשומות הקשורות** (ספקים,
 *   היסטוריית רכש, חשבוניות, נכסים וכו׳).
 *
 * ## Design principles
 *   1. **אותה טבלה** — מסך הבן *חייב* להיות מבנה tabular זהה לאב. אסור
 *      להציג כרטיס/preview-card של הישות עצמה (זה מה שהלקוח פסל).
 *   2. **נתונים רלוונטיים לפעולה** — ה-tabs במסך הבן נבחרים לפי
 *      ההקשר של המסך האב. בקטלוג פריטים: ספקים / היסטוריית רכש / נכסים.
 *      ב-PO creation: ספקים שמספקים את הפריט, מחירים.
 *   3. **סינגל קליק = בחירה; דו-קליק = drill-in עמוק** — סינגל עובר לאב,
 *      דו-קליק ב-BentoSmartList מפעיל ניווט מלא לכרטיס הישות.
 *   4. **Keyboard-first** — ↑/↓ על ה-master, Tab להתחלף ל-tabs, ←/→
 *      בין ה-tabs, Enter = drill-in.
 *   5. **State sovereignty** — ה-caller מחזיק את `activeMasterId` כ-state
 *      רגיל. ה-shell הוא UI-only. URL sync (shareable links + back/forward)
 *      יתווסף ב-follow-up כ-opt-in prop אחרי שה-pattern יוכח; ב-MVP הוא
 *      יוצר loops ו-edge-cases בסנכרון דו-כיווני שלא שווה את הסיבוך.
 *   6. **Collapsible detail** — המשתמש יכול לקרוס את מסך הבן לגמרי
 *      (ה-handle נשאר נגיש) כדי להחזיר את האב לרוחב/גובה מלא.
 *
 * ## API shape
 *   הקומפוננטה **לא** מנהלת את ה-state של המסך האב (rows, filters, KPIs,
 *   search). היא מקבלת `masterContent` כ-ReactNode ומצפה שה-caller יעביר
 *   `activeMasterId` + `onActiveMasterIdChange`. זה משאיר את כל הלוגיקה
 *   הספציפית למסך (חיפוש, columns, onRowDoubleClick) אצל ה-caller ומקל
 *   על אימוץ הדרגתי.
 */

import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { ChevronDown, ChevronUp } from "lucide-react"
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MasterDetailTabSpec = {
  /** מזהה יחיד של ה-tab; מופיע ב-URL ב-`?tab=`. */
  id: string
  /** תווית UI בעברית. */
  label: string
  /** אייקון lucide (אופציונלי). */
  icon?: LucideIcon
  /**
   * פונקציה שמרנדרת את תוכן ה-tab. תקבל את המזהה של השורה הפעילה
   * ב-master; אם אין בחירה, `activeMasterId` יהיה `null` וה-caller אחראי
   * להציג empty state הולם (למשל: "בחר פריט כדי לראות ספקים").
   */
  render: (activeMasterId: string | null) => React.ReactNode
  /** disabled = tab מופיע אבל לא נלחץ (למשל: אין הרשאה). */
  disabled?: boolean
}

export type MasterDetailShellProps = {
  /** תוכן מלא של מסך האב (header + KPIs + search + BentoSmartList). */
  masterContent: React.ReactNode
  /** מזהה השורה הפעילה ב-master (null = אין בחירה). */
  activeMasterId: string | null
  /**
   * ה-shell קורא לזה אם הוא רוצה לבקש שינוי — כרגע רק מטעמי API סימטריים;
   * ב-MVP ה-caller מקליט ישירות state עדכון מתוך onRowClick של הטבלה.
   */
  onActiveMasterIdChange: (id: string | null) => void
  /** רשימת ה-tabs של מסך הבן. חייב להיות לפחות אחד. */
  detailTabs: MasterDetailTabSpec[]
  /** tab פעיל התחלתי (ברירת מחדל: הראשון ברשימה). */
  initialTabId?: string
  /** גודל התחלתי (%) של פאנל האב (ברירת מחדל: 60). */
  defaultMasterSize?: number
  /** האם לאפשר קריסה מלאה של הבן? (ברירת מחדל: true). */
  collapsibleDetail?: boolean
  /** RTL/LTR (ברירת מחדל: rtl). */
  dir?: "rtl" | "ltr"
  className?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function MasterDetailShell({
  masterContent,
  activeMasterId,
  onActiveMasterIdChange,
  detailTabs,
  initialTabId,
  defaultMasterSize = 60,
  collapsibleDetail = true,
  dir = "rtl",
  className,
}: MasterDetailShellProps) {
  const detailPanelRef = React.useRef<ImperativePanelHandle>(null)
  const [detailCollapsed, setDetailCollapsed] = React.useState(false)

  if (detailTabs.length === 0) {
    throw new Error(
      "MasterDetailShell: detailTabs must contain at least one tab.",
    )
  }

  // ── Active tab ─────────────────────────────────────────────
  const [activeTabId, setActiveTab] = React.useState<string>(() => {
    if (initialTabId && detailTabs.some((t) => t.id === initialTabId)) {
      return initialTabId
    }
    const firstEnabled = detailTabs.find((t) => !t.disabled) ?? detailTabs[0]!
    return firstEnabled.id
  })

  // Context לילדים של masterContent (אופציונלי — המשתמש יכול להעביר
  // דרך props רגיל; ה-context כאן רק למקרה של עץ עמוק).
  const ctxValue = React.useMemo<MasterDetailContextValue>(
    () => ({
      activeMasterId,
      selectMaster: onActiveMasterIdChange,
      activeTabId,
      setActiveTab,
    }),
    [activeMasterId, onActiveMasterIdChange, activeTabId],
  )

  // ── Panel collapse handlers ─────────────────────────────────────────────
  const toggleDetail = React.useCallback(() => {
    const p = detailPanelRef.current
    if (!p) return
    if (p.isCollapsed()) {
      p.expand(40)
      setDetailCollapsed(false)
    } else {
      p.collapse()
      setDetailCollapsed(true)
    }
  }, [])

  // Keyboard: Alt+D = toggle detail; Alt+← / Alt+→ = switch tabs
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === "d" || e.key === "D" || e.key === "ד") {
        e.preventDefault()
        toggleDetail()
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const currentIdx = detailTabs.findIndex((t) => t.id === activeTabId)
        if (currentIdx < 0) return
        const direction =
          dir === "rtl"
            ? e.key === "ArrowLeft"
              ? 1
              : -1
            : e.key === "ArrowRight"
              ? 1
              : -1
        const enabled = detailTabs.filter((t) => !t.disabled)
        if (enabled.length === 0) return
        const currInEnabled = enabled.findIndex((t) => t.id === activeTabId)
        const nextIdx =
          (currInEnabled + direction + enabled.length) % enabled.length
        e.preventDefault()
        setActiveTab(enabled[nextIdx]!.id)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [activeTabId, detailTabs, setActiveTab, toggleDetail, dir])

  const activeTab = detailTabs.find((t) => t.id === activeTabId) ?? detailTabs[0]!

  return (
    <MasterDetailContext.Provider value={ctxValue}>
      <div
        dir={dir}
        className={cn(
          "flex h-full min-h-0 min-w-0 flex-1 flex-col",
          className,
        )}
      >
        <PanelGroup direction="vertical" className="min-h-0 flex-1">
          {/* ── Master panel ───────────────────────────────────────── */}
          <Panel
            defaultSize={defaultMasterSize}
            minSize={30}
            className="min-h-0 min-w-0 overflow-hidden"
          >
            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-auto">
              {masterContent}
            </div>
          </Panel>

          <PanelResizeHandle
            title="גרירה לשינוי גובה מסך הבן (Alt+D לקריסה/פתיחה)"
            className={cn(
              "relative h-1.5 shrink-0 bg-slate-100 transition-colors",
              "hover:bg-slate-200",
              "data-[panel-resize-handle-active]:bg-indigo-300",
              "dark:bg-slate-800 dark:hover:bg-slate-700",
            )}
          />

          {/* ── Detail panel ───────────────────────────────────────── */}
          <Panel
            ref={detailPanelRef}
            defaultSize={100 - defaultMasterSize}
            minSize={12}
            collapsible={collapsibleDetail}
            collapsedSize={0}
            onCollapse={() => setDetailCollapsed(true)}
            onExpand={() => setDetailCollapsed(false)}
            className="min-h-0 min-w-0 overflow-hidden bg-background"
          >
            <div className="flex h-full min-h-0 flex-col">
              {/* Tabs strip */}
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/30 px-2 py-1">
                <div
                  role="tablist"
                  aria-label="פירוט נתונים קשורים"
                  className="flex min-w-0 flex-wrap items-center gap-1"
                >
                  {detailTabs.map((tab) => {
                    const Icon = tab.icon
                    const isActive = tab.id === activeTab.id
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`md-panel-${tab.id}`}
                        id={`md-tab-${tab.id}`}
                        disabled={tab.disabled}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                          tab.disabled &&
                            "cursor-not-allowed opacity-50",
                          !tab.disabled && isActive
                            ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                            : !tab.disabled &&
                                "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                        )}
                      >
                        {Icon ? (
                          <Icon className="size-3.5" aria-hidden />
                        ) : null}
                        {tab.label}
                      </button>
                    )
                  })}
                </div>
                {collapsibleDetail ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={toggleDetail}
                    title={
                      detailCollapsed
                        ? "הצג מסך בן (Alt+D)"
                        : "קרוס מסך בן (Alt+D)"
                    }
                    className="h-7 gap-1 px-2 text-[11px]"
                  >
                    {detailCollapsed ? (
                      <ChevronUp className="size-3.5" aria-hidden />
                    ) : (
                      <ChevronDown className="size-3.5" aria-hidden />
                    )}
                  </Button>
                ) : null}
              </div>

              {/* Tab content */}
              {!detailCollapsed ? (
                <div
                  key={`${activeTab.id}:${activeMasterId ?? "none"}`}
                  role="tabpanel"
                  id={`md-panel-${activeTab.id}`}
                  aria-labelledby={`md-tab-${activeTab.id}`}
                  className="min-h-0 flex-1 overflow-auto p-2"
                >
                  {activeTab.render(activeMasterId)}
                </div>
              ) : null}
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </MasterDetailContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Context (optional deep consumers)
// ─────────────────────────────────────────────────────────────────────────────

type MasterDetailContextValue = {
  activeMasterId: string | null
  selectMaster: (id: string | null) => void
  activeTabId: string
  setActiveTab: (id: string) => void
}

const MasterDetailContext =
  React.createContext<MasterDetailContextValue | null>(null)

/** Hook: גישה ל-master-detail state מעומק (למשל מתוך masterContent). */
export function useMasterDetail(): MasterDetailContextValue {
  const ctx = React.useContext(MasterDetailContext)
  if (!ctx) {
    throw new Error(
      "useMasterDetail must be used inside <MasterDetailShell>.",
    )
  }
  return ctx
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail body helpers — common empty/loading/error states for detail tabs
// ─────────────────────────────────────────────────────────────────────────────

export function MasterDetailTabEmpty({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-[8rem] items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/30 p-4 text-center text-xs text-muted-foreground">
      {children}
    </div>
  )
}

export function MasterDetailTabLoading({
  children = "טוען…",
}: {
  children?: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-[8rem] items-center justify-center gap-2 rounded-lg border border-border/60 bg-card p-4 text-xs text-muted-foreground">
      <svg
        className="size-4 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle
          className="opacity-20"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-80"
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {children}
    </div>
  )
}

export function MasterDetailTabError({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-800 dark:text-rose-300">
      {children}
    </div>
  )
}
