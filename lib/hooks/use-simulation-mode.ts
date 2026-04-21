"use client"

import * as React from "react"

/**
 * Simulation Mode — Ophir pattern.
 *
 * Drives a "what-if" editor overlay on top of persisted line data without
 * mutating the server. Callers pass the committed line array and a stable
 * `keyOf` function; the hook returns:
 *
 *   - `enabled` / `setEnabled` to toggle simulation mode on/off,
 *   - `overrides` — a keyed `Partial<Line>` map applied on top of the
 *     committed array when rendering,
 *   - `simulatedLines` — convenience: committed lines merged with overrides,
 *   - `overrideField(key, field, value)` — typed patch helper,
 *   - `clearOverride(key)` / `resetAll()` — drop local state back to zero,
 *   - `isDirty` / `dirtyCount` — surfaced in the header / sidebar so the
 *     user knows whether they're holding uncommitted edits.
 *
 * Toggling simulation OFF always clears overrides (directive §3: overrides
 * are local-only).
 */
export type SimulationOverrideMap<TLine> = Record<string, Partial<TLine>>

export type UseSimulationModeInput<TLine> = {
  lines: TLine[]
  keyOf: (line: TLine) => string
}

export type UseSimulationModeResult<TLine> = {
  enabled: boolean
  setEnabled: (next: boolean) => void
  toggle: () => void
  overrides: SimulationOverrideMap<TLine>
  simulatedLines: TLine[]
  isDirty: boolean
  dirtyCount: number
  overrideField: <K extends keyof TLine>(key: string, field: K, value: TLine[K]) => void
  replaceOverride: (key: string, patch: Partial<TLine>) => void
  clearOverride: (key: string) => void
  resetAll: () => void
}

export function useSimulationMode<TLine>({
  lines,
  keyOf,
}: UseSimulationModeInput<TLine>): UseSimulationModeResult<TLine> {
  const [enabled, setEnabledState] = React.useState(false)
  const [overrides, setOverrides] = React.useState<SimulationOverrideMap<TLine>>({})

  const setEnabled = React.useCallback((next: boolean) => {
    setEnabledState(next)
    if (!next) setOverrides({})
  }, [])

  const toggle = React.useCallback(() => {
    setEnabled(!enabled)
  }, [enabled, setEnabled])

  const overrideField = React.useCallback(
    <K extends keyof TLine>(key: string, field: K, value: TLine[K]) => {
      if (!enabled) return
      setOverrides((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? {}), [field]: value } as Partial<TLine>,
      }))
    },
    [enabled]
  )

  const replaceOverride = React.useCallback(
    (key: string, patch: Partial<TLine>) => {
      if (!enabled) return
      setOverrides((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? {}), ...patch },
      }))
    },
    [enabled]
  )

  const clearOverride = React.useCallback((key: string) => {
    setOverrides((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const resetAll = React.useCallback(() => setOverrides({}), [])

  const simulatedLines = React.useMemo<TLine[]>(() => {
    if (!enabled) return lines
    return lines.map((line) => {
      const key = keyOf(line)
      const patch = overrides[key]
      if (!patch) return line
      return { ...line, ...patch }
    })
  }, [enabled, lines, keyOf, overrides])

  const dirtyCount = React.useMemo(() => Object.keys(overrides).length, [overrides])
  const isDirty = dirtyCount > 0

  return {
    enabled,
    setEnabled,
    toggle,
    overrides,
    simulatedLines,
    isDirty,
    dirtyCount,
    overrideField,
    replaceOverride,
    clearOverride,
    resetAll,
  }
}
