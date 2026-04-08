"use server"

import { openai } from "@ai-sdk/openai"
import { generateObject } from "ai"
import { z } from "zod"

import {
  getWorkspaceSettingsBootstrap,
  saveMyWorkspaceSettings,
} from "@/lib/marker-ofek/user-workspace-actions"
import type {
  ModuleActivityEntry,
  WorkspaceEfficiencyAnalysis,
  WorkspaceLayoutJson,
  WorkspaceSettingsSnapshot,
} from "@/lib/marker-ofek/workspace-types"
import { formatError } from "@/lib/utils"

const MAX_LOG_LINES = 120

const analysisSchema = z.object({
  confidence: z.number().min(0).max(1),
  patternId: z.string().min(1),
  summary: z.string(),
  frictionPoints: z.array(z.string()),
  proposedLayout: z
    .object({
      commandCenterLayout: z
        .object({
          order: z.array(z.string()),
          hidden: z.array(z.string()),
        })
        .nullable(),
      diamondWorkspaceLayout: z.object({
        horizontal: z.tuple([z.number(), z.number(), z.number()]),
        vertical: z.tuple([z.number(), z.number()]),
        consoleCollapsed: z.boolean(),
      }),
      pinnedWidgets: z.array(z.string()),
      workspacePersona: z.enum(["finance", "field", "executive"]),
    })
    .optional(),
})

function summarizeLogForPrompt(entries: ModuleActivityEntry[]): string {
  const lines = entries.slice(-MAX_LOG_LINES).map((e) => {
    const t = new Date(e.ts).toISOString()
    return `${t}  ${e.fromPath}  →  ${e.toPath}`
  })
  return lines.join("\n")
}

export async function appendWorkspaceActivityLog(
  entries: ModuleActivityEntry[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!entries.length) return { ok: true }
    const current = await getWorkspaceSettingsBootstrap()
    const merged = [...current.workspaceActivityLog, ...entries].slice(-500)
    return saveMyWorkspaceSettings({ workspaceActivityLog: merged })
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function applyWorkspaceLayoutPreview(
  layout: WorkspaceLayoutJson
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return saveMyWorkspaceSettings({
      commandCenterLayout: layout.commandCenterLayout,
      diamondWorkspaceLayout: layout.diamondWorkspaceLayout,
      pinnedWidgets: layout.pinnedWidgets,
      workspacePersona: layout.workspacePersona,
    })
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function restoreWorkspaceLayoutSnapshot(
  snapshot: Pick<
    WorkspaceSettingsSnapshot,
    | "commandCenterLayout"
    | "diamondWorkspaceLayout"
    | "pinnedWidgets"
    | "workspacePersona"
  >
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return saveMyWorkspaceSettings({
      commandCenterLayout: snapshot.commandCenterLayout,
      diamondWorkspaceLayout: snapshot.diamondWorkspaceLayout,
      pinnedWidgets: snapshot.pinnedWidgets,
      workspacePersona: snapshot.workspacePersona,
    })
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function dismissEfficiencyPattern(
  patternId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const current = await getWorkspaceSettingsBootstrap()
    if (current.aiDismissedPatterns.includes(patternId)) return { ok: true }
    return saveMyWorkspaceSettings({
      aiDismissedPatterns: [...current.aiDismissedPatterns, patternId],
    })
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function analyzeUserEfficiency(): Promise<
  | { ok: true; analysis: WorkspaceEfficiencyAnalysis }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string }
> {
  try {
    const current = await getWorkspaceSettingsBootstrap()
    const log = current.workspaceActivityLog
    if (log.length < 8) {
      return { ok: true, skipped: true, reason: "אין מספיק נתוני פעילות" }
    }

    const prompt = `אתה מומחה UX ל-B2B. נתח את יומן המעברים בין מסכים (RTL, מערכת ניהול פרויקטים).
זהה דפוסי חיכוך: מעברים תכופים, חזרה לאותו נתיב, חיפוש חוזר.
החזר confidence בין 0 ל-1, patternId ייחודי באנגלית (snake_case), סיכום קצר בעברית, רשימת נקודי חיכוך.
אם יש הצעת פריסה — מלא proposedLayout בהתאם לדוגמה (מבנה JSON).

יומן:
${summarizeLogForPrompt(log)}`

    let object: z.infer<typeof analysisSchema>
    try {
      const res = await generateObject({
        model: openai("gpt-4o-mini"),
        schema: analysisSchema,
        prompt,
      })
      object = res.object
    } catch (e) {
      return {
        ok: false,
        error:
          process.env.NODE_ENV === "development"
            ? formatError(e)
            : "ניתוח יעילות אינו זמין כרגע",
      }
    }

    if (current.aiDismissedPatterns.includes(object.patternId)) {
      return { ok: true, skipped: true, reason: "דפוס מוסתר על ידי המשתמש" }
    }

    const analysis: WorkspaceEfficiencyAnalysis = {
      confidence: object.confidence,
      patternId: object.patternId,
      summary: object.summary,
      frictionPoints: object.frictionPoints,
      proposedLayout: object.proposedLayout as WorkspaceLayoutJson | undefined,
    }

    return { ok: true, analysis }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
