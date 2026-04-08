"use client"

import * as React from "react"
import Draggable from "react-draggable"
import { AlertTriangle, GripHorizontal, X } from "lucide-react"

import { Button } from "@/components/ui/button"

export function TaxIdMismatchDraggableAlert({
  open,
  onDismiss,
  registryName,
  message,
}: {
  open: boolean
  onDismiss: () => void
  registryName: string | null
  message: string
}) {
  const nodeRef = React.useRef<HTMLDivElement>(null)

  if (!open) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <Draggable nodeRef={nodeRef} handle=".tax-mismatch-drag-handle" defaultPosition={{ x: 0, y: 0 }}>
        <div
          ref={nodeRef}
          className="pointer-events-auto absolute end-4 top-20 w-[min(calc(100vw-2rem),380px)]"
        >
          <div
            className="rounded-xl border-2 border-amber-500/60 bg-amber-950/95 p-3 text-amber-50 shadow-2xl ring-1 ring-amber-400/30 backdrop-blur-md"
            role="alertdialog"
            aria-labelledby="tax-mismatch-title"
            aria-describedby="tax-mismatch-desc"
          >
          <div className="tax-mismatch-drag-handle flex cursor-grab items-center justify-between gap-2 border-b border-amber-500/30 pb-2 active:cursor-grabbing">
            <div className="flex items-center gap-2">
              <GripHorizontal className="size-4 text-amber-300/80" aria-hidden />
              <AlertTriangle className="size-5 text-amber-400" aria-hidden />
              <span
                id="tax-mismatch-title"
                className="text-sm font-semibold tracking-tight"
              >
                Attention: Tax ID mismatch detected.
              </span>
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="shrink-0 text-amber-200 hover:bg-amber-900/50 hover:text-white"
              onClick={onDismiss}
              aria-label="סגירה"
            >
              <X className="size-4" />
            </Button>
          </div>
          <p id="tax-mismatch-desc" className="mt-3 text-sm leading-relaxed text-amber-100/95">
            {message}
          </p>
          {registryName ? (
            <p className="mt-2 rounded-lg border border-amber-500/25 bg-black/20 px-2 py-1.5 font-mono text-xs text-amber-200/90">
              שם במאגר: {registryName}
            </p>
          ) : null}
          <p className="mt-3 text-[11px] leading-snug text-amber-200/70">
            יש לאמת מול רשות המסים / רואה חשבון לפני הנפקת מסמכים.
          </p>
          </div>
        </div>
      </Draggable>
    </div>
  )
}
