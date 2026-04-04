"use server"

import { insertMoAiJobResult } from "@/lib/marker-ofek/ai/mo-ai-job-results-actions"
import {
  generateMeetingMinutesFromAudioBase64,
  generateMeetingMinutesFromTranscript,
} from "@/lib/marker-ofek/ai/meetings/meeting-intel-gemini"
import { AI_ACTION_KINDS, AI_MODULES } from "@/lib/marker-ofek/ai/registry"
import { formatError } from "@/lib/utils"

/**
 * תשתית ישיבות: תמלול חיצוני → טקסט → פרוטוקול.
 * `sourceStoragePath` — נתיב עתידי ב-Supabase Storage (Zoom / העלאת קובץ).
 */
export async function runMeetingIntelligenceFromTranscript(input: {
  projectId: string
  transcript: string
  sourceStoragePath?: string | null
  meetingLabel?: string | null
}): Promise<
  | {
      ok: true
      minutes: Awaited<ReturnType<typeof generateMeetingMinutesFromTranscript>>
      jobId: string
    }
  | { ok: false; error: string }
> {
  const pid = input.projectId.trim()
  const text = input.transcript.trim()
  if (!pid) return { ok: false, error: "חסר פרויקט" }
  if (!text) return { ok: false, error: "חסר תמלול" }

  try {
    const minutes = await generateMeetingMinutesFromTranscript(text)

    const persisted = await insertMoAiJobResult({
      module: AI_MODULES.meetings,
      actionKind: AI_ACTION_KINDS.meetingMinutes,
      projectId: pid,
      sourceStoragePath: input.sourceStoragePath ?? null,
      referenceLabel: input.meetingLabel ?? "transcript",
      inputSummary: {
        char_count: text.length,
        source: "transcript",
      },
      resultJson: minutes as unknown as Record<string, unknown>,
      status: "completed",
    })

    if (!persisted.ok) return persisted

    return { ok: true, minutes, jobId: persisted.id }
  } catch (e) {
    const err = formatError(e)
    await insertMoAiJobResult({
      module: AI_MODULES.meetings,
      actionKind: AI_ACTION_KINDS.meetingMinutes,
      projectId: pid,
      sourceStoragePath: input.sourceStoragePath ?? null,
      inputSummary: { source: "transcript" },
      resultJson: {},
      status: "failed",
      errorMessage: err,
    }).catch(() => {})
    return { ok: false, error: err }
  }
}

export async function runMeetingIntelligenceFromAudioBase64(input: {
  projectId: string
  base64: string
  mimeType: string
  sourceStoragePath?: string | null
}): Promise<
  | {
      ok: true
      minutes: Awaited<ReturnType<typeof generateMeetingMinutesFromAudioBase64>>
      jobId: string
    }
  | { ok: false; error: string }
> {
  const pid = input.projectId.trim()
  if (!pid) return { ok: false, error: "חסר פרויקט" }
  const mime = input.mimeType.trim() || "audio/mpeg"
  if (!input.base64?.trim()) return { ok: false, error: "חסר אודיו" }

  try {
    const minutes = await generateMeetingMinutesFromAudioBase64({
      base64: input.base64,
      mimeType: mime,
    })

    const persisted = await insertMoAiJobResult({
      module: AI_MODULES.meetings,
      actionKind: AI_ACTION_KINDS.meetingMinutes,
      projectId: pid,
      sourceStoragePath: input.sourceStoragePath ?? null,
      referenceLabel: "audio_inline",
      inputSummary: { mime_type: mime, source: "audio" },
      resultJson: minutes as unknown as Record<string, unknown>,
      status: "completed",
    })

    if (!persisted.ok) return persisted

    return { ok: true, minutes, jobId: persisted.id }
  } catch (e) {
    const err = formatError(e)
    await insertMoAiJobResult({
      module: AI_MODULES.meetings,
      actionKind: AI_ACTION_KINDS.meetingMinutes,
      projectId: pid,
      sourceStoragePath: input.sourceStoragePath ?? null,
      inputSummary: { mime_type: mime, source: "audio" },
      resultJson: {},
      status: "failed",
      errorMessage: err,
    }).catch(() => {})
    return { ok: false, error: err }
  }
}
