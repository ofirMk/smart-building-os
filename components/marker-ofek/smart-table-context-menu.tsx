"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Bot, Copy, ExternalLink, History, Link2, Pencil, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"

export type SmartContextMenuAction = {
  id: string
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  disabled?: boolean
  destructive?: boolean
}

export type SmartContextNavItem = { label: string; href: string }

export function SmartTableContextMenuPortal({
  open,
  x,
  y,
  onClose,
  actions,
  navItems,
}: {
  open: boolean
  x: number
  y: number
  onClose: () => void
  actions: SmartContextMenuAction[]
  navItems?: SmartContextNavItem[]
}) {
  const layerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (layerRef.current?.contains(e.target as Node)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("mousedown", onPointerDown)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mousedown", onPointerDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  React.useEffect(() => {
    if (!open) return
    function onGlobalEsc() {
      onClose()
    }
    window.addEventListener("marker-ofek-global-escape", onGlobalEsc)
    return () => window.removeEventListener("marker-ofek-global-escape", onGlobalEsc)
  }, [open, onClose])

  if (!open || typeof document === "undefined") return null

  const pad = 8
  const w = 220
  const h = 280
  const left = Math.max(pad, Math.min(x, window.innerWidth - w - pad))
  const top = Math.max(pad, Math.min(y, window.innerHeight - h - pad))

  return createPortal(
    <div
      ref={layerRef}
      role="menu"
      className={cn(
        "fixed z-[200] w-[min(16rem,calc(100vw-1rem))] rounded-xl border border-slate-100 bg-white py-1 text-sm shadow-lg",
        "duration-100 animate-in fade-in-0 zoom-in-95"
      )}
      style={{ left, top }}
      dir="rtl"
    >
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          role="menuitem"
          disabled={a.disabled}
          onClick={() => {
            if (!a.disabled) {
              a.onSelect()
              onClose()
            }
          }}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-start text-slate-800 transition-colors",
            "hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40",
            a.destructive && "text-rose-700 hover:bg-rose-50"
          )}
        >
          <span className="shrink-0 text-slate-500">{a.icon}</span>
          {a.label}
        </button>
      ))}
      {navItems && navItems.length > 0 ? (
        <>
          <div className="my-1 border-t border-slate-100" />
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            קיצורי מסלול
          </p>
          {navItems.map((n) => (
            <Link
              key={n.href + n.label}
              href={n.href}
              role="menuitem"
              className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-indigo-50"
              onClick={onClose}
            >
              <ExternalLink className="size-3.5 shrink-0 text-indigo-500" aria-hidden />
              {n.label}
            </Link>
          ))}
        </>
      ) : null}
    </div>,
    document.body
  )
}

export const contextMenuIcons = {
  duplicate: <Copy className="size-3.5" aria-hidden />,
  delete: <Trash2 className="size-3.5" aria-hidden />,
  edit: <Pencil className="size-3.5" aria-hidden />,
  catalog: <Link2 className="size-3.5" aria-hidden />,
  history: <History className="size-3.5" aria-hidden />,
  aiSync: <Bot className="size-3.5" aria-hidden />,
}
