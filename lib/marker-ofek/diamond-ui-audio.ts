/**
 * צלילי משוב קלים (Web Audio) — ללא קבצים חיצוניים.
 * כבוי כשאין AudioContext (SSR) או כשהדפדפן חוסם אוטומטית.
 */

let audioCtx: AudioContext | null = null

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    if (audioCtx.state === "suspended") void audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

function beep(
  frequency: number,
  durationSec: number,
  type: OscillatorType,
  gainStart: number,
  gainEnd: number
) {
  const c = ctx()
  if (!c) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, c.currentTime)
  g.gain.setValueAtTime(gainStart, c.currentTime)
  g.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, gainEnd),
    c.currentTime + durationSec
  )
  osc.connect(g)
  g.connect(c.destination)
  osc.start(c.currentTime)
  osc.stop(c.currentTime + durationSec + 0.02)
}

/** שמירה / הצלחה — צימוק רך */
export function playDiamondSuccessChime() {
  const c = ctx()
  if (!c) return
  const t = c.currentTime
  ;[523.25, 659.25, 783.99].forEach((hz, i) => {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = "sine"
    osc.frequency.setValueAtTime(hz, t + i * 0.05)
    g.gain.setValueAtTime(0.0001, t + i * 0.05)
    g.gain.exponentialRampToValueAtTime(0.06, t + i * 0.05 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.05 + 0.18)
    osc.connect(g)
    g.connect(c.destination)
    osc.start(t + i * 0.05)
    osc.stop(t + i * 0.05 + 0.2)
  })
}

/** שגיאה — נקישה מעומעמת */
export function playDiamondErrorThud() {
  beep(110, 0.12, "triangle", 0.08, 0.001)
}

/** מעבר F2 / ESC */
export function playDiamondTransitionSwoosh() {
  const c = ctx()
  if (!c) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = "sine"
  const t = c.currentTime
  osc.frequency.setValueAtTime(320, t)
  osc.frequency.exponentialRampToValueAtTime(880, t + 0.08)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(t)
  osc.stop(t + 0.12)
}
