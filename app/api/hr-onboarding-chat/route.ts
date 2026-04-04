import { openai } from "@ai-sdk/openai"
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai"
import { z } from "zod"

import type { AppUserRole } from "@/lib/auth/user-role"
import { isPartnerDashboardSuperAdmin } from "@/lib/marker-ofek/partner-metrics/access"
import { provisionUserFromAiWizard } from "@/lib/marker-ofek/user-ai-provision-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export const maxDuration = 120

function catalogHasProject(
  catalog: readonly { id: string }[],
  projectId: string | null | undefined
): string | null {
  const t = projectId?.trim()
  if (!t) return null
  return catalog.some((p) => p.id === t) ? t : null
}

export async function POST(req: Request) {
  let body: { messages: UIMessage[]; projectCatalog?: { id: string; name: string }[] }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { messages, projectCatalog = [] } = body
  if (!Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "messages must be an array" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const auth = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await auth.auth.getUser()
  if (!user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { data: profile } = await auth.from("profiles").select("role").eq("id", user.id).maybeSingle()
  const role = (profile as { role?: AppUserRole } | null)?.role ?? "tenant"
  const allowed = role === "admin" || isPartnerDashboardSuperAdmin(user.email ?? null)
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  }

  const catalogJson = JSON.stringify(projectCatalog, null, 0)

  const system = [
    "You are the Marker Ofek HR Concierge — a Hebrew-speaking assistant that helps admins provision new users.",
    "Tone: professional, concise, 'Pharmacy clean'. All user-facing explanations in Hebrew.",
    "Infer from conversation: full name, work email, role, optional project.",
    "Roles map to workspace_persona: finance = כספים/חשבונאות; field = שטח/ביצוע/מפקח/מהנדס שטח; executive = הנהלה/פרויקטור בכיר (not system admin).",
    "grant_system_admin: true only for מנהל מערכת / IT admin / מי שצריך role admin במערכת — full ERP; still use workspace_persona executive for layout unless user is clearly finance or field only.",
    "If the user names a project, match by Hebrew name to an id from the catalog below. If unsure, ask. project_id must be a UUID from the catalog or null.",
    "When you have all required fields, call provision_marker_ofek_user once. Confirm success or error to the user in Hebrew.",
    "Required before tool: email (valid), full_name (non-empty), workspace_persona in finance|field|executive.",
    `Project catalog (id, name): ${catalogJson}`,
  ].join("\n")

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system,
    messages: await convertToModelMessages(messages),
    tools: {
      provision_marker_ofek_user: tool({
        description:
          "Create or update the user: invite by email if new, set profile, modules, workspace tabs, project assignment, HR welcome payload.",
        inputSchema: z.object({
          email: z.string().email().describe("Work email for SSO / invite"),
          full_name: z.string().min(1).describe("Full display name"),
          workspace_persona: z
            .enum(["finance", "field", "executive"])
            .describe("Primary workspace layout: finance, field, or executive"),
          grant_system_admin: z
            .boolean()
            .optional()
            .describe("Set true for system administrators (profiles.role = admin)"),
          project_id: z
            .string()
            .uuid()
            .nullable()
            .optional()
            .describe("Default project UUID from catalog, or null"),
        }),
        execute: async (input) => {
          const pid = catalogHasProject(projectCatalog, input.project_id ?? null)
          if (input.project_id && !pid) {
            return {
              ok: false as const,
              error: "מזהה פרויקט לא נמצא בקטלוג — בקשו מהמשתמש לבחור פרויקט מהרשימה.",
            }
          }
          const res = await provisionUserFromAiWizard({
            email: input.email,
            fullName: input.full_name,
            persona: input.workspace_persona,
            grantSystemAdmin: input.grant_system_admin === true,
            projectId: pid,
          })
          if (!res.ok) {
            return { ok: false as const, error: res.error }
          }
          return {
            ok: true as const,
            userId: res.userId,
            invited: res.invited,
            message: res.invited
              ? "הוזמן במייל והוגדרו פרופיל, הרשאות, שולחן עבודה ושיוך פרויקט (אם נבחר)."
              : "המשתמש עודכן — פרופיל, הרשאות ושולחן עבודה נשמרו.",
          }
        },
      }),
    },
    stopWhen: stepCountIs(8),
  })

  return result.toUIMessageStreamResponse()
}
