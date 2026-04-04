"use client"

import * as React from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  DIAMOND_NAVIGATOR_STEPS,
  DIAMOND_TRACK_MENU,
  QUICK_TOUR_STEPS,
  type DiamondNavigatorPreferences,
  type DiamondTrackId,
  type NavigatorStep,
} from "@/lib/marker-ofek/diamond-navigator-curriculum"
import { saveDiamondNavigatorPreferences } from "@/lib/marker-ofek/user-dashboard-config-actions"
import { cn } from "@/lib/utils"

type TourMode = { kind: "track"; id: DiamondTrackId } | { kind: "quick" }

function querySpotlightRect(anchor: string | undefined): DOMRect | null {
  if (!anchor || typeof document === "undefined") return null
  const el = document.querySelector(`[data-diamond-spotlight="${anchor}"]`)
  if (!el || !(el instanceof HTMLElement)) return null
  return el.getBoundingClientRect()
}

function SpotlightLayers({ rect }: { rect: DOMRect | null }) {
  const pad = 10
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return (
      <div
        className="pointer-events-none fixed inset-0 z-[115] bg-slate-950/55 backdrop-blur-[1px]"
        aria-hidden
      />
    )
  }
  const t = Math.max(0, rect.top - pad)
  const l = Math.max(0, rect.left - pad)
  const r = rect.right + pad
  const b = rect.bottom + pad
  const w = typeof window !== "undefined" ? window.innerWidth : 0
  const h = typeof window !== "undefined" ? window.innerHeight : 0
  return (
    <>
      <div
        className="pointer-events-none fixed z-[115] bg-slate-950/55 backdrop-blur-[1px]"
        style={{ top: 0, left: 0, right: 0, height: t }}
        aria-hidden
      />
      <div
        className="pointer-events-none fixed z-[115] bg-slate-950/55 backdrop-blur-[1px]"
        style={{ top: t, left: 0, width: l, height: b - t }}
        aria-hidden
      />
      <div
        className="pointer-events-none fixed z-[115] bg-slate-950/55 backdrop-blur-[1px]"
        style={{ top: t, left: r, right: 0, height: b - t }}
        aria-hidden
      />
      <div
        className="pointer-events-none fixed z-[115] bg-slate-950/55 backdrop-blur-[1px]"
        style={{ top: b, left: 0, right: 0, bottom: 0 }}
        aria-hidden
      />
      <div
        className="pointer-events-none fixed z-[116] rounded-xl ring-2 ring-indigo-400/90 ring-offset-2 ring-offset-transparent"
        style={{
          top: t,
          left: l,
          width: Math.min(r - l, w - l),
          height: Math.min(b - t, h - t),
        }}
        aria-hidden
      />
    </>
  )
}

export function DiamondNavigatorModal({
  open,
  onClose,
  initialPrefs,
  onPrefsSaved,
}: {
  open: boolean
  onClose: () => void
  initialPrefs: DiamondNavigatorPreferences
  onPrefsSaved?: () => void
}) {
  const [phase, setPhase] = React.useState<"menu" | "tour">("menu")
  const [mode, setMode] = React.useState<TourMode | null>(null)
  const [stepIndex, setStepIndex] = React.useState(0)
  const [deepOpen, setDeepOpen] = React.useState(false)
  const [deepEngaged, setDeepEngaged] = React.useState(false)
  const [suppressIntro, setSuppressIntro] = React.useState(
    Boolean(initialPrefs.suppressIntroTips)
  )
  const [spotRect, setSpotRect] = React.useState<DOMRect | null>(null)
  const [saving, setSaving] = React.useState(false)

  const steps: NavigatorStep[] = React.useMemo(() => {
    if (!mode) return []
    if (mode.kind === "quick") return QUICK_TOUR_STEPS
    return DIAMOND_NAVIGATOR_STEPS[mode.id]
  }, [mode])

  const step = steps[stepIndex]

  React.useEffect(() => {
    if (!open) {
      setPhase("menu")
      setMode(null)
      setStepIndex(0)
      setDeepOpen(false)
      setDeepEngaged(false)
      setSpotRect(null)
      return
    }
    setSuppressIntro(Boolean(initialPrefs.suppressIntroTips))
  }, [open, initialPrefs.suppressIntroTips])

  const updateSpotlight = React.useCallback(() => {
    if (!open || phase !== "tour" || !step) {
      setSpotRect(null)
      return
    }
    setSpotRect(querySpotlightRect(step.spotlightAnchor))
  }, [open, phase, step])

  React.useLayoutEffect(() => {
    updateSpotlight()
  }, [updateSpotlight, stepIndex])

  React.useEffect(() => {
    if (!open || phase !== "tour") return
    const onResize = () => updateSpotlight()
    window.addEventListener("resize", onResize)
    window.addEventListener("scroll", onResize, true)
    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onResize, true)
    }
  }, [open, phase, updateSpotlight])

  const persistSuppress = React.useCallback(async (v: boolean) => {
    setSaving(true)
    try {
      const res = await saveDiamondNavigatorPreferences({ suppressIntroTips: v })
      if (res.ok) onPrefsSaved?.()
    } finally {
      setSaving(false)
    }
  }, [onPrefsSaved])

  const markMasteredIfNeeded = React.useCallback(async () => {
    if (!mode || mode.kind !== "track" || !deepEngaged) return
    const id = mode.id
    const mastered = new Set(initialPrefs.masteredTracks ?? [])
    if (mastered.has(id)) return
    mastered.add(id)
    setSaving(true)
    try {
      const res = await saveDiamondNavigatorPreferences({
        masteredTracks: [...mastered],
      })
      if (res.ok) onPrefsSaved?.()
    } finally {
      setSaving(false)
    }
  }, [mode, deepEngaged, initialPrefs.masteredTracks, onPrefsSaved])

  const startTrack = (id: DiamondTrackId) => {
    setMode({ kind: "track", id })
    setStepIndex(0)
    setDeepOpen(false)
    setDeepEngaged(false)
    setPhase("tour")
  }

  const startQuick = () => {
    setMode({ kind: "quick" })
    setStepIndex(0)
    setDeepOpen(false)
    setDeepEngaged(false)
    setPhase("tour")
  }

  const exitToMenu = () => {
    setPhase("menu")
    setMode(null)
    setStepIndex(0)
    setDeepOpen(false)
    setDeepEngaged(false)
  }

  const finishTrack = async () => {
    await markMasteredIfNeeded()
    exitToMenu()
  }

  const handleClose = () => {
    if (phase === "tour") exitToMenu()
    onClose()
  }

  if (!open) return null

  const isLast = stepIndex >= steps.length - 1
  const masteredSet = new Set(initialPrefs.masteredTracks ?? [])

  return (
    <div
      className="fixed inset-0 z-[118] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={phase === "menu" ? undefined : "סיור מודרך"}
      aria-labelledby={phase === "menu" ? "diamond-nav-title" : undefined}
    >
      <button
        type="button"
        aria-label="סגירה"
        className="absolute inset-0 z-[114] bg-transparent"
        onClick={handleClose}
      />

      {phase === "tour" ? <SpotlightLayers rect={spotRect} /> : null}

      <AnimatePresence mode="wait">
        {phase === "menu" ? (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-[120] w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-700">
                  <Sparkles className="size-4" aria-hidden />
                </span>
                <div>
                  <p
                    id="diamond-nav-title"
                    className="text-lg font-bold tracking-tight text-indigo-950"
                  >
                    סיור 360°
                  </p>
                  <p className="text-xs text-slate-500">בחרו מיקוד או סיור מהיר</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-slate-400 hover:text-slate-700"
                onClick={handleClose}
                aria-label="יציאה"
              >
                <X className="size-5" />
              </Button>
            </div>

            <div className="mt-6 grid gap-2">
              {DIAMOND_TRACK_MENU.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => startTrack(t.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-xl border border-slate-100 bg-white px-4 py-3 text-start transition-colors hover:border-indigo-200 hover:bg-indigo-50/40",
                    masteredSet.has(t.id) && "border-emerald-100 bg-emerald-50/30"
                  )}
                >
                  <span className="text-sm font-semibold text-indigo-950">
                    {t.label}
                    {masteredSet.has(t.id) ? (
                      <span className="ms-2 font-currency-mono text-[10px] font-normal text-emerald-700">
                        מאסטר
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs leading-relaxed text-slate-600">
                    {t.subtitle}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl border-indigo-200 font-semibold text-indigo-950 hover:bg-indigo-50"
                onClick={() => startQuick()}
              >
                סיור מהיר (5 תחנות)
              </Button>
            </div>

            <div className="mt-6 flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
              <Checkbox
                id="suppress-intro"
                checked={suppressIntro}
                onCheckedChange={(c) => {
                  const v = c === true
                  setSuppressIntro(v)
                  void persistSuppress(v)
                }}
                disabled={saving}
              />
              <div className="space-y-0.5">
                <Label
                  htmlFor="suppress-intro"
                  className="cursor-pointer text-xs font-medium text-indigo-950"
                >
                  אל תציג טיפים אוטומטיים
                </Label>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  הסיור יישאר זמין תמיד דרך כפתור &quot;סיור 360°&quot; במרכז הפיקוד ובהגדרות.
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="tour"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-[120] w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-currency-mono text-[11px] text-slate-400">
                {mode?.kind === "track"
                  ? DIAMOND_TRACK_MENU.find((x) => x.id === mode.id)?.label ?? ""
                  : "סיור מהיר"}{" "}
                · {stepIndex + 1}/{steps.length}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-slate-500"
                onClick={exitToMenu}
              >
                חזרה לתפריט
              </Button>
            </div>

            <AnimatePresence mode="wait">
              {step ? (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.18 }}
                  className="mt-4"
                >
                  <h2 className="text-lg font-bold text-indigo-950 sm:text-xl">
                    {step.title}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{step.tip}</p>
                  {step.deepDive ? (
                    <div className="mt-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-lg border-indigo-200 text-indigo-950"
                        onClick={() => {
                          setDeepOpen((o) => !o)
                          setDeepEngaged(true)
                        }}
                      >
                        {deepOpen ? "הסתר עומק עסקי" : "עומק עסקי"}
                      </Button>
                      <AnimatePresence>
                        {deepOpen ? (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <p className="mt-3 rounded-xl border border-slate-100 bg-slate-50/90 p-3 text-xs leading-relaxed text-indigo-950">
                              {step.deepDive}
                            </p>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  ) : null}
                  {step.ctaHref ? (
                    <p className="mt-4">
                      <Link
                        href={step.ctaHref}
                        className="text-xs font-semibold text-indigo-600 underline-offset-2 hover:underline"
                        onClick={() => onClose()}
                      >
                        {step.ctaLabel ?? "פתיחת מסך"}
                      </Link>
                    </p>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-slate-500"
                onClick={handleClose}
              >
                יציאה
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={stepIndex <= 0}
                  onClick={() => {
                    setStepIndex((i) => Math.max(0, i - 1))
                    setDeepOpen(false)
                  }}
                  className="gap-1"
                >
                  <ChevronRight className="size-4" aria-hidden />
                  הקודם
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!step}
                  onClick={() => {
                    if (isLast) {
                      void finishTrack()
                    } else {
                      setStepIndex((i) => i + 1)
                      setDeepOpen(false)
                    }
                  }}
                  className="gap-1 rounded-xl bg-indigo-700 text-white hover:bg-indigo-800"
                >
                  {isLast ? "סיום" : "הבא"}
                  {!isLast ? <ChevronLeft className="size-4" aria-hidden /> : null}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
