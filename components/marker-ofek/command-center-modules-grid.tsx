"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { LayoutGroup, motion } from "framer-motion"
import {
  Briefcase,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileSearch,
  Landmark,
  RotateCcw,
  ShoppingCart,
  Wallet,
  X,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import {
  applyCommandCenterLayout,
  normalizeCommandCenterOrder,
} from "@/lib/marker-ofek/command-center-layout"
import type { CommandCenterTile } from "@/lib/marker-ofek/command-center-types"
import type { CommandCenterWorkspaceLayout } from "@/lib/marker-ofek/workspace-types"
import { saveCommandCenterLayout } from "@/lib/marker-ofek/user-workspace-actions"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useSmartWorkspace } from "@/components/marker-ofek/workspace/smart-workspace-context"

const tileIcons = [ShoppingCart, FileSearch, Briefcase, Landmark, Wallet] as const

/** ידית גרירה בסגנון נקודות (6) — ללא תלות חיצונית */
function DotsSixDragIcon({ className }: { className?: string }) {
  const dots = [
    [5, 5],
    [5, 12],
    [5, 19],
    [12, 5],
    [12, 12],
    [12, 19],
  ] as const
  return (
    <svg
      className={cn("shrink-0 text-current", className)}
      width="16"
      height="24"
      viewBox="0 0 17 24"
      fill="currentColor"
      aria-hidden
    >
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="2" />
      ))}
    </svg>
  )
}

function statusMeta(level: CommandCenterTile["level"]) {
  if (level === "green") {
    return {
      label: "תקין",
      dot: "bg-emerald-500",
      badge:
        "border border-emerald-200/90 bg-emerald-50/90 text-slate-900 shadow-sm",
    }
  }
  if (level === "yellow") {
    return {
      label: "למעקב",
      dot: "bg-amber-400",
      badge: "border border-amber-200/90 bg-amber-50 text-slate-900 shadow-sm",
    }
  }
  return {
    label: "סיכון",
    dot: "bg-red-500",
    badge: "border border-red-200/90 bg-red-50 text-slate-900 shadow-sm",
  }
}

function iconForTile(masterTiles: CommandCenterTile[], tile: CommandCenterTile) {
  const idx = masterTiles.findIndex((t) => t.href === tile.href)
  const Icon =
    idx >= 0 && idx < tileIcons.length ? tileIcons[idx]! : FileSearch
  return Icon
}

type ModuleCardShellProps = {
  tile: CommandCenterTile
  masterTiles: CommandCenterTile[]
  editMode: boolean
  isHidden: boolean
  isDragging?: boolean
  dragHandleSlot?: ReactNode
  onHide?: () => void
  onRestore?: () => void
}

function ModuleCardShell({
  tile,
  masterTiles,
  editMode,
  isHidden,
  isDragging,
  dragHandleSlot,
  onHide,
  onRestore,
}: ModuleCardShellProps) {
  const meta = statusMeta(tile.level)
  const Icon = iconForTile(masterTiles, tile)

  return (
    <motion.article
      layout={!isDragging}
      animate={isDragging ? { scale: 1.04 } : { scale: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 38 }}
      className={cn(
        "relative flex h-full min-h-0 flex-col justify-between rounded-xl border bg-white px-6 pb-6 pt-4 transition-[border-color,box-shadow,opacity] duration-200",
        isDragging
          ? "z-30 border-emerald-300/80 shadow-2xl ring-2 ring-emerald-500/15"
          : editMode
            ? "border-dashed border-slate-300/90 shadow-md hover:border-slate-400"
            : "border-slate-200/90 shadow-md hover:border-slate-300 hover:shadow-lg",
        isHidden && editMode && "opacity-55",
        tile.articleClassName
      )}
    >
      {editMode && (
        <div className="absolute start-2 top-2 z-10 flex items-center gap-1">
          {isHidden ? (
            <button
              type="button"
              onClick={onRestore}
              className="rounded-md border border-slate-200 bg-white/95 p-1 text-slate-600 shadow-sm hover:bg-slate-50"
              aria-label="הצג מודול"
            >
              <RotateCcw className="size-3.5" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={onHide}
              className="rounded-md border border-slate-200 bg-white/95 p-1 text-slate-600 shadow-sm hover:bg-red-50 hover:text-red-700"
              aria-label="הסתר מודול"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <Link
            href={tile.href}
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              editMode && "pointer-events-none"
            )}
            tabIndex={editMode ? -1 : 0}
          >
            <div className="mb-4 flex h-12 w-full items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {dragHandleSlot}
                <div className="shrink-0">
                  <span className="flex size-12 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-700 shadow-sm">
                    <Icon className="size-6 stroke-[1.5]" aria-hidden />
                  </span>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "h-7 shrink-0 gap-1.5 rounded-md px-2.5 py-0 text-[11px] font-semibold tabular-nums",
                  meta.badge
                )}
              >
                <span
                  className={cn("inline-block size-2 shrink-0 rounded-full", meta.dot)}
                  aria-hidden
                />
                {meta.label}
              </Badge>
            </div>
            <div className="mb-3 flex h-14 items-start">
              <h2 className="line-clamp-2 w-full text-start text-base font-bold leading-snug text-slate-900 lg:text-lg">
                {tile.title}
              </h2>
            </div>
            <p
              className={cn(
                "text-[12px] leading-relaxed text-slate-600",
                tile.summaryMono && "font-currency-mono tabular-nums"
              )}
            >
              {tile.summary}
            </p>
          </Link>
          <ul
            className={cn(
              "mt-3 min-h-0 flex-1 space-y-1.5 text-[11px] text-slate-600",
              editMode && "pointer-events-none"
            )}
          >
            {tile.highlights.map((line, hidx) => (
              <li key={`${tile.href}-${hidx}`} className="flex items-start gap-1.5">
                {hidx === 0 ? (
                  <Clock3 className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
                ) : hidx === 1 ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-slate-500" aria-hidden />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
                )}
                <span
                  className={cn(
                    (hidx === 1 || line.includes("₪")) && "font-currency-mono tabular-nums"
                  )}
                >
                  {line}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 shrink-0">
          <a
            href={tile.quickActionHref}
            className={cn(
              "flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-500",
              editMode && "pointer-events-none opacity-90"
            )}
          >
            <span className="truncate">{tile.quickActionLabel}</span>
            <FileCheck2 className="size-3.5 shrink-0 opacity-95" aria-hidden />
          </a>
        </div>
      </div>
    </motion.article>
  )
}

function SortableModuleCard({
  tile,
  masterTiles,
  isHidden,
  onHide,
  onRestore,
}: {
  tile: CommandCenterTile
  masterTiles: CommandCenterTile[]
  isHidden: boolean
  onHide: () => void
  onRestore: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tile.href,
    transition: {
      duration: 220,
      easing: "cubic-bezier(0.25, 1, 0.5, 1)",
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
  }

  const dragHandle = (
    <button
      type="button"
      className="touch-none pointer-events-auto cursor-grab rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 active:cursor-grabbing"
      aria-label="גרירה לשינוי סדר"
      {...attributes}
      {...listeners}
    >
      <DotsSixDragIcon />
    </button>
  )

  return (
    <div ref={setNodeRef} style={style} className="h-full min-h-0">
      <ModuleCardShell
        tile={tile}
        masterTiles={masterTiles}
        editMode
        isHidden={isHidden}
        isDragging={isDragging}
        onHide={onHide}
        onRestore={onRestore}
        dragHandleSlot={dragHandle}
      />
    </div>
  )
}

export function CommandCenterModulesGrid({
  masterTiles,
  layout,
}: {
  masterTiles: CommandCenterTile[]
  layout: CommandCenterWorkspaceLayout | null
}) {
  const router = useRouter()
  const ws = useSmartWorkspace()
  const [editMode, setEditMode] = useState(false)
  const [order, setOrder] = useState<string[]>(() =>
    normalizeCommandCenterOrder(
      layout?.order?.length ? layout.order : masterTiles.map((t) => t.href),
      masterTiles
    )
  )
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(layout?.hidden ?? [])
  )
  const hiddenRef = useRef(hidden)
  const orderRef = useRef(order)
  hiddenRef.current = hidden
  orderRef.current = order

  const layoutOrderKey = layout?.order?.join("\0") ?? ""
  const layoutHiddenKey = layout?.hidden?.join("\0") ?? ""

  useEffect(() => {
    setOrder(
      normalizeCommandCenterOrder(
        layout?.order?.length ? layout.order : masterTiles.map((t) => t.href),
        masterTiles
      )
    )
    setHidden(new Set(layout?.hidden ?? []))
  }, [masterTiles, layoutOrderKey, layoutHiddenKey])

  const byHref = useMemo(
    () => new Map(masterTiles.map((t) => [t.href, t])),
    [masterTiles]
  )

  const visibleTiles = useMemo(
    () => applyCommandCenterLayout(masterTiles, layout),
    [masterTiles, layout]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const pushLayoutToWorkspace = useCallback(
    (nextOrder: string[]) => {
      if (!ws?.setCommandCenterLayout) return
      ws.setCommandCenterLayout({
        order: normalizeCommandCenterOrder(nextOrder, masterTiles),
        hidden: Array.from(hiddenRef.current),
      })
    },
    [ws, masterTiles]
  )

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e
      if (!over || active.id === over.id) return
      setOrder((prev) => {
        const a = prev.indexOf(String(active.id))
        const b = prev.indexOf(String(over.id))
        if (a < 0 || b < 0) return prev
        const next = arrayMove(prev, a, b)
        pushLayoutToWorkspace(next)
        return next
      })
    },
    [pushLayoutToWorkspace]
  )

  const startEdit = () => {
    setOrder(
      normalizeCommandCenterOrder(
        layout?.order?.length ? layout.order : masterTiles.map((t) => t.href),
        masterTiles
      )
    )
    setHidden(new Set(layout?.hidden ?? []))
    setEditMode(true)
  }

  const finishEdit = async () => {
    const payload: CommandCenterWorkspaceLayout = {
      order: normalizeCommandCenterOrder(order, masterTiles),
      hidden: Array.from(hidden),
    }
    const res = await saveCommandCenterLayout(payload)
    if (res.ok) {
      setEditMode(false)
      toast.success("פריסת מרכז הפיקוד נשמרה")
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  const toggleHeader = () => {
    if (editMode) void finishEdit()
    else startEdit()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 md:text-start">
          ליבת המערכת
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 self-center sm:self-auto"
          onClick={toggleHeader}
        >
          {editMode ? "סיום" : "עריכת פריסה"}
        </Button>
      </div>

      <LayoutGroup>
        {!editMode ? (
          <section
            data-diamond-spotlight="cc-modules"
            className="grid auto-rows-fr grid-cols-1 items-stretch gap-8 md:grid-cols-3 lg:grid-cols-5 lg:gap-10"
            role="navigation"
            aria-label="מודולי המערכת"
          >
            {visibleTiles.length === 0 ? (
              <p className="col-span-full text-center text-sm text-slate-500">
                אין מודולים מוצגים. לחצו על &quot;עריכת פריסה&quot; כדי להחזיר מודולים.
              </p>
            ) : (
              visibleTiles.map((tile) => (
                <ModuleCardShell
                  key={tile.href}
                  tile={tile}
                  masterTiles={masterTiles}
                  editMode={false}
                  isHidden={false}
                />
              ))
            )}
          </section>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={order} strategy={rectSortingStrategy}>
              <section
                data-diamond-spotlight="cc-modules"
                className="grid auto-rows-fr grid-cols-1 items-stretch gap-8 md:grid-cols-3 lg:grid-cols-5 lg:gap-10"
                role="navigation"
                aria-label="עריכת מודולי המערכת"
              >
                {order.map((href) => {
                  const tile = byHref.get(href)
                  if (!tile) return null
                  const isHidden = hidden.has(href)
                  return (
                    <SortableModuleCard
                      key={href}
                      tile={tile}
                      masterTiles={masterTiles}
                      isHidden={isHidden}
                      onHide={() =>
                        setHidden((prev) => {
                          const next = new Set(prev).add(href)
                          hiddenRef.current = next
                          pushLayoutToWorkspace(orderRef.current)
                          return next
                        })
                      }
                      onRestore={() =>
                        setHidden((prev) => {
                          const next = new Set(prev)
                          next.delete(href)
                          hiddenRef.current = next
                          pushLayoutToWorkspace(orderRef.current)
                          return next
                        })
                      }
                    />
                  )
                })}
              </section>
            </SortableContext>
          </DndContext>
        )}
      </LayoutGroup>
    </div>
  )
}
