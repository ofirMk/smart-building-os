import {
  geminiGenerateJsonFromAudio,
  geminiGenerateJsonFromText,
} from "@/lib/marker-ofek/ai/shared/gemini-json"

export type MeetingActionItem = {
  title: string
  owner: string | null
  due_date: string | null
  priority: "low" | "medium" | "high" | null
}

export type MeetingMinutesResult = {
  title: string | null
  summary: string
  decisions: string[]
  action_items: MeetingActionItem[]
  open_questions: string[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v)
}

export function normalizeMeetingMinutes(raw: unknown): MeetingMinutesResult {
  if (!isRecord(raw)) throw new Error("פלט המודל אינו אובייקט")

  const action_items: MeetingActionItem[] = Array.isArray(raw.action_items)
    ? (raw.action_items as unknown[]).map((x) => {
        if (!isRecord(x)) {
          return {
            title: "",
            owner: null,
            due_date: null,
            priority: null,
          }
        }
        const pr = x.priority
        const priority =
          pr === "low" || pr === "medium" || pr === "high" ? pr : null
        return {
          title: String(x.title ?? x.task ?? "").trim(),
          owner: x.owner != null ? String(x.owner) : null,
          due_date: x.due_date != null ? String(x.due_date) : null,
          priority,
        }
      })
    : []

  return {
    title: raw.title != null ? String(raw.title) : null,
    summary: String(raw.summary ?? ""),
    decisions: Array.isArray(raw.decisions)
      ? (raw.decisions as unknown[]).map((s) => String(s))
      : [],
    action_items: action_items.filter((a) => a.title.length > 0),
    open_questions: Array.isArray(raw.open_questions)
      ? (raw.open_questions as unknown[]).map((s) => String(s))
      : [],
  }
}

const MINUTES_PROMPT_PREFIX = `You are a construction / project meeting secretary. From the transcript, produce STRICT JSON only:
{
  "title": string|null,
  "summary": string (Hebrew concise),
  "decisions": string[],
  "action_items": [ { "title": string, "owner": string|null, "due_date": string|null (ISO or free text), "priority": "low"|"medium"|"high"|null } ],
  "open_questions": string[]
}
`

export async function generateMeetingMinutesFromTranscript(
  transcript: string
): Promise<MeetingMinutesResult> {
  const prompt = `${MINUTES_PROMPT_PREFIX}

TRANSCRIPT:
${transcript.slice(0, 120_000)}
`
  const raw = await geminiGenerateJsonFromText({ prompt })
  return normalizeMeetingMinutes(raw)
}

/** Zoom export / מקליט — קובץ אודיו קצר; להארכות גדולות מומלץ שירות תמלול חיצוני. */
export async function generateMeetingMinutesFromAudioBase64(input: {
  base64: string
  mimeType: string
}): Promise<MeetingMinutesResult> {
  const prompt = `${MINUTES_PROMPT_PREFIX}
Listen to the audio and extract the same JSON structure from the discussion.`
  const raw = await geminiGenerateJsonFromAudio({
    prompt,
    mimeType: input.mimeType,
    base64Data: input.base64,
  })
  return normalizeMeetingMinutes(raw)
}
