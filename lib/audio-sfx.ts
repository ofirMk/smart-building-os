/**
 * audio-sfx — Pure Web Audio API SFX synthesizer for the AI Copilot.
 *
 * אין צורך בקבצי MP3 חיצוניים: כל הצלילים מסונתזים ב-`OscillatorNode` בזמן אמת,
 * דרך `AudioContext` משותף יחיד שנוצר ב-lazy ומוחזק כ-singleton בחלון הדפדפן.
 *
 * **חשוב**: בכל הדפדפנים החדשים ה-`AudioContext` מתחיל במצב `"suspended"` עד
 * אינטראקציית משתמש (Autoplay Policy). לכן `ensureAudioContext()` קוראת ל-`resume()`
 * תמיד — בטוח לקרוא לה גם כשהיא כבר פעילה.
 *
 * השימוש:
 *   import { playMicStart, playSuccess } from "@/lib/audio-sfx"
 *   onMicClick: playMicStart()
 *   onAiResultArrived: playSuccess()
 */

type SfxWindow = Window & {
  __sbosAudioCtx?: AudioContext
  AudioContext?: typeof AudioContext
  webkitAudioContext?: typeof AudioContext
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null
  const w = window as SfxWindow
  return (w.AudioContext ?? w.webkitAudioContext) || null
}

function ensureAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null
  const w = window as SfxWindow
  if (w.__sbosAudioCtx) {
    void w.__sbosAudioCtx.resume().catch(() => {})
    return w.__sbosAudioCtx
  }
  const Ctor = getAudioContextCtor()
  if (!Ctor) return null
  try {
    const ctx = new Ctor()
    w.__sbosAudioCtx = ctx
    void ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

/**
 * Schedule a single tone with a quick exponential attack/release envelope.
 * Designed to sound clean (no clicks) and short enough for UI feedback (<300ms).
 */
function scheduleTone(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  durationSec: number,
  peakGain: number,
  type: OscillatorType = "sine",
): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, startAt)
  // ADSR-lite: tiny attack, exponential release to avoid clicks.
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec)
  osc.connect(gain).connect(ctx.destination)
  osc.start(startAt)
  osc.stop(startAt + durationSec + 0.02)
}

/**
 * Mic-start "bloop" — a single ascending sine ping reminiscent of voice
 * assistants waking up (Siri/Alexa style cue).
 */
export function playMicStart(): void {
  const ctx = ensureAudioContext()
  if (!ctx) return
  const t = ctx.currentTime
  // Two short stacked tones: 660 Hz → 990 Hz (perfect fifth) within 110 ms.
  scheduleTone(ctx, 660, t, 0.09, 0.18, "sine")
  scheduleTone(ctx, 990, t + 0.06, 0.12, 0.16, "sine")
}

/**
 * Mic-stop low blip — soft descending cue when the user releases the mic.
 * Optional helper — currently exported for future use.
 */
export function playMicStop(): void {
  const ctx = ensureAudioContext()
  if (!ctx) return
  const t = ctx.currentTime
  scheduleTone(ctx, 520, t, 0.08, 0.14, "sine")
  scheduleTone(ctx, 360, t + 0.05, 0.1, 0.12, "sine")
}

/**
 * Success "ding" — two-tone chime (major third) used when the AI returns
 * a successful result card (PO draft, extraction etc.).
 */
export function playSuccess(): void {
  const ctx = ensureAudioContext()
  if (!ctx) return
  const t = ctx.currentTime
  // C5 (523.25) → E5 (659.25) → G5 (783.99): cheerful ascending arpeggio.
  scheduleTone(ctx, 523.25, t, 0.18, 0.18, "triangle")
  scheduleTone(ctx, 659.25, t + 0.1, 0.18, 0.16, "triangle")
  scheduleTone(ctx, 783.99, t + 0.2, 0.26, 0.16, "triangle")
}

/**
 * Error buzz — two short low square pulses; not currently used but kept
 * available for the copilot tool-error path.
 */
export function playError(): void {
  const ctx = ensureAudioContext()
  if (!ctx) return
  const t = ctx.currentTime
  scheduleTone(ctx, 220, t, 0.12, 0.14, "square")
  scheduleTone(ctx, 180, t + 0.13, 0.14, 0.14, "square")
}
