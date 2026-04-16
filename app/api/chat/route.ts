import { openai } from "@ai-sdk/openai"
import { createClient } from "@supabase/supabase-js"
import {
  stepCountIs,
  streamText,
  tool,
} from "ai"
import { z } from "zod"

export const runtime = "nodejs"
export const maxDuration = 60

const SYSTEM_PROMPT = `You are the central AI Assistant for the "Holden Group", operating within the "Smart Building OS" platform.
Holden Group is a premier enterprise managing complex electrical infrastructure, manufacturing, and smart property management.
Your primary users are executive managers and project directors (like Ofir).
Your goal is to assist with procurement, finance, project management, and HR inquiries.
Always respond professionally, concisely, and practically. When discussing technical details (like BoQ, electrical boards, or budgets), be precise.
Acknowledge that you are currently in Beta, learning the internal data structures of the Holden Group.
You have access to tools to fetch active projects, budget status, and BoQ data. You MUST use these tools to answer queries about projects.
NEVER tell the user to check the system themselves - you are the system. Fetch the data and present it.

<document_extraction_protocol>
When the user uploads a document, image, invoice, or PDF, DO NOT provide generic summaries (e.g., "This looks like an invoice"). You MUST act as an expert data extractor.
Actively scan the document and explicitly list:
1. Document Type.
2. Project Name.
3. Client/Customer Name.
4. Supplier/Vendor Name.
5. Total Amount.
6. Key Items.
If the document is in Hebrew, pay close attention to the context to pair entities correctly despite right-to-left formatting quirks.
</document_extraction_protocol>

<orchestration_protocol>
Analyze the user's query, user identity, and any uploaded images/documents to determine WHICH areas of expertise are required to best serve the company's interests.
Before convening the panel, you MUST seamlessly use any available tools (Budget, BoQ, Projects) to gather the necessary data.
You may adopt multiple personas for a single response if the context demands it (e.g., acting as "Chief Electrical Engineer" AND "Legal Counsel" AND "Lead Procurement Officer").
If multiple experts are required, you MUST structure your response explicitly with clear headings and signatures for each expert section using this consistent premium format:
### 📋 חוות דעת מומחה: [שם התפקיד]
Once all data is fetched, synthesize the experts' views into a cohesive executive summary.
Always respond in the male form (לשון זכר).
</orchestration_protocol>

<contract_rule>
When asked about a contract or PDF, you MUST stick strictly to the text in the document. NEVER invent clauses.
If you suggest an argument based on commercial logic or industry experience, explicitly state it is an oral recommendation, NOT a quote from the contract.
Always speak in the male form (לשון זכר).
</contract_rule>

<verification_protocol>
Before finalizing any calculation or anomaly detection (e.g., comparing a BoQ to standard baselines), double-check the numbers.
If you detect a discrepancy or a human error in the uploaded files, raise a clear "RED FLAG" in your response and explain the error.
</verification_protocol>`

const LEARNING_PROTOCOL_PROMPT = `<learning_protocol>If the user corrects you, provides a new business rule, or gives a persistent fact, you MUST call the 'saveToMemory' tool immediately to store it for future sessions.</learning_protocol>`
const SYSTEM_CAPABILITIES_PROMPT = `<system_capabilities>UI AWARENESS & AUTHORITY: You are operating within the 'Smart Building OS' dashboard. The user has full Admin/CEO privileges. NEVER tell the user they lack permissions to create projects, tasks, or Gantt charts, and never tell them to "coordinate with project managers". If the user asks how to view or create a Gantt chart, explicitly provide this direct URL path: /marker-ofek/projects/gantt (e.g., "מערכת הגאנט נמצאת בנתיב /marker-ofek/projects/gantt"). The Gantt chart is located at /marker-ofek/projects/gantt. Do not pretend you can render a full interactive Gantt chart inside the chat, but act as a guide to the system's frontend features.</system_capabilities>`

const MOCK_ACTIVE_PROJECTS = [
  { id: "mock-1", name: "Ramat Ir HaYayin", status: "active" },
  { id: "mock-2", name: "Gindi Savyon", status: "active" },
  { id: "mock-3", name: "Nechalim", status: "active" },
]

type UnknownRecord = Record<string, unknown>
type UserCorrectionRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null
}

function inferMediaTypeFromUrl(url: string): string | undefined {
  const lower = url.toLowerCase()
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".webp")) return "image/webp"
  if (lower.endsWith(".gif")) return "image/gif"
  return undefined
}

function parseDataUri(dataUri: string): { mediaType: string; data: string } | null {
  if (!dataUri.startsWith("data:")) return null
  const parts = dataUri.split(",", 2)
  if (parts.length !== 2) return null

  const header = parts[0] ?? ""
  const data = parts[1] ?? ""
  if (!data) return null

  const mediaTypeMatch = /^data:([^;]+)(;base64)?$/i.exec(header)
  const mediaType = mediaTypeMatch?.[1]?.trim() || "application/octet-stream"
  return { mediaType, data }
}

function mapFileLikePart(url: string, mediaType?: string): UnknownRecord {
  const parsedDataUri = parseDataUri(url)
  if (parsedDataUri) {
    const resolvedMediaType = mediaType || parsedDataUri.mediaType
    if (resolvedMediaType.startsWith("image/")) {
      return {
        type: "image",
        image: parsedDataUri.data,
      }
    }

    return {
      type: "file",
      data: parsedDataUri.data,
      mimeType: resolvedMediaType,
      mediaType: resolvedMediaType,
    }
  }

  const resolvedMediaType = mediaType ?? inferMediaTypeFromUrl(url)
  return {
    type: "file",
    url,
    mediaType: resolvedMediaType,
  }
}

type NormalizedCoreMessage = {
  role: "system" | "user" | "assistant"
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image"; image: string }
        | { type: "file"; data: string; mimeType?: string; mediaType?: string }
        | { type: "file"; url: string; mediaType?: string }
      >
}

function normalizeIncomingMessages(rawMessages: unknown[]): NormalizedCoreMessage[] {
  return rawMessages.map((rawMessage, index) => {
    const fallback: NormalizedCoreMessage = {
      role: "user",
      content: [{ type: "text", text: "" }],
    }
    if (!isRecord(rawMessage)) return fallback

    const role =
      rawMessage.role === "assistant" ||
      rawMessage.role === "system" ||
      rawMessage.role === "user"
        ? rawMessage.role
        : "user"

    const normalizedParts: UnknownRecord[] = []

    const content = rawMessage.content
    if (typeof content === "string" && content.trim() !== "") {
      normalizedParts.push({ type: "text", text: content })
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (!isRecord(block)) continue
        if (block.type === "text" && typeof block.text === "string") {
          normalizedParts.push({ type: "text", text: block.text })
          continue
        }
        if (
          block.type === "input_image" ||
          block.type === "image_url" ||
          block.type === "image"
        ) {
          const imageUrl =
            typeof block.image === "string"
              ? block.image
              : isRecord(block.image_url) && typeof block.image_url.url === "string"
                ? block.image_url.url
                : typeof block.image_url === "string"
                  ? block.image_url
                  : undefined
          if (imageUrl) {
            normalizedParts.push(
              mapFileLikePart(imageUrl, inferMediaTypeFromUrl(imageUrl) ?? "image/*")
            )
          }
        }
      }
    }

    const rawParts = Array.isArray(rawMessage.parts) ? rawMessage.parts : []
    for (const part of rawParts) {
      if (!isRecord(part)) continue
      if (part.type === "text" && typeof part.text === "string") {
        normalizedParts.push({ type: "text", text: part.text })
        continue
      }
      if (part.type === "file") {
        const fileUrl =
          typeof part.url === "string"
            ? part.url
            : typeof part.data === "string"
              ? part.data
              : undefined
        if (fileUrl) {
          const mediaType =
            typeof part.mediaType === "string"
              ? part.mediaType
              : typeof part.mimeType === "string"
                ? part.mimeType
                : inferMediaTypeFromUrl(fileUrl)
          normalizedParts.push(mapFileLikePart(fileUrl, mediaType))
          continue
        }
      }
      // Keep unknown part types (tool parts etc.) to avoid losing context.
      if (part.type === "step-start" || typeof part.type === "string") continue
    }

    const legacyAttachments = Array.isArray(rawMessage.experimental_attachments)
      ? rawMessage.experimental_attachments
      : []
    for (const attachment of legacyAttachments) {
      if (!isRecord(attachment)) continue
      const url =
        typeof attachment.url === "string"
          ? attachment.url
          : typeof attachment.contentUrl === "string"
            ? attachment.contentUrl
            : undefined
      if (!url) continue
      const mediaType =
        typeof attachment.contentType === "string"
          ? attachment.contentType
          : typeof attachment.mediaType === "string"
            ? attachment.mediaType
            : typeof attachment.mimeType === "string"
              ? attachment.mimeType
              : inferMediaTypeFromUrl(url)
      normalizedParts.push(mapFileLikePart(url, mediaType))
    }

    if (normalizedParts.length === 0) {
      normalizedParts.push({ type: "text", text: "" })
    }

    return {
      role,
      content: normalizedParts as NormalizedCoreMessage["content"],
    }
  })
}

function getMockProjectBudget(projectName: string) {
  const normalized = projectName.trim().toLowerCase()
  if (normalized.includes("ramat ir hayayin")) {
    return {
      projectName: "Ramat Ir HaYayin",
      currency: "ILS",
      totalBudget: 12_500_000,
      usedBudget: 4_200_000,
      remainingBudget: 8_300_000,
      utilizationPct: 33.6,
      status: "On Track",
    }
  }

  return {
    projectName: projectName.trim() || "Unknown Project",
    currency: "ILS",
    totalBudget: 9_800_000,
    usedBudget: 3_100_000,
    remainingBudget: 6_700_000,
    utilizationPct: 31.6,
    status: "On Track",
  }
}

function getMockProjectBoq(projectName: string) {
  const displayName = projectName.trim() || "Unknown Project"
  return {
    projectName: displayName,
    summary: [
      {
        category: "Lighting fixtures",
        status: "60% ordered",
        progressPct: 60,
      },
      {
        category: "Main electrical boards",
        status: "Pending approval",
        progressPct: 15,
      },
      {
        category: "Cable trays and containment",
        status: "45% ordered",
        progressPct: 45,
      },
    ],
  }
}

function buildBudgetSummary(budget: {
  projectName: string
  totalBudget: number
  usedBudget: number
  remainingBudget: number
  utilizationPct: number
  status: string
  currency?: string
}) {
  const currency = budget.currency ?? "ILS"
  return `${budget.projectName}: budget status is ${budget.status}. Total budget ${budget.totalBudget.toLocaleString()} ${currency}, used ${budget.usedBudget.toLocaleString()} ${currency}, remaining ${budget.remainingBudget.toLocaleString()} ${currency} (${budget.utilizationPct}% utilized).`
}

function buildBoqSummary(boq: {
  projectName: string
  summary: Array<{ category: string; status: string; progressPct: number }>
}) {
  const lines = boq.summary.map(
    (row) => `${row.category}: ${row.status} (${row.progressPct}%)`
  )
  return `${boq.projectName} BoQ summary - ${lines.join("; ")}.`
}

function normalizeMemoryText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  return null
}

function truncateMemoryText(value: string, max = 220): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

function formatCorrectionMemoryLine(row: UserCorrectionRecord): string | null {
  const context =
    normalizeMemoryText(row.context) ??
    normalizeMemoryText(row.topic) ??
    normalizeMemoryText(row.domain) ??
    "General"
  const correction =
    normalizeMemoryText(row.correction) ??
    normalizeMemoryText(row.corrected_value) ??
    normalizeMemoryText(row.correct_answer) ??
    normalizeMemoryText(row.resolution) ??
    normalizeMemoryText(row.user_preference) ??
    normalizeMemoryText(row.preference)
  const wrong =
    normalizeMemoryText(row.wrong_value) ??
    normalizeMemoryText(row.previous_answer) ??
    normalizeMemoryText(row.incorrect_answer)
  const note = normalizeMemoryText(row.notes)
  const createdAt = normalizeMemoryText(row.created_at)

  if (!correction && !wrong && !note) {
    return null
  }

  const parts = [`Context: ${truncateMemoryText(context)}`]
  if (wrong) parts.push(`Avoid: ${truncateMemoryText(wrong)}`)
  if (correction) parts.push(`Correct: ${truncateMemoryText(correction)}`)
  if (note) parts.push(`Note: ${truncateMemoryText(note)}`)
  if (createdAt) parts.push(`Updated: ${truncateMemoryText(createdAt, 40)}`)

  return `- ${parts.join(" | ")}`
}

function buildUserMemoryPromptBlock(corrections: UserCorrectionRecord[]): string | null {
  const lines = corrections
    .map((row) => formatCorrectionMemoryLine(row))
    .filter((line): line is string => Boolean(line))

  if (lines.length === 0) return null

  return `PRIOR KNOWLEDGE / MEMORY:
${lines.join("\n")}

User Memory Directive: You have access to the 'User Memory' block. Use these facts to override any conflicting general knowledge. Do not mention that you are using this memory unless specifically asked; simply provide the most accurate response based on these established facts.`
}

function resolveMemoryUserId(body: UnknownRecord, req: Request): string | null {
  const fromHeaders =
    req.headers.get("x-user-id")?.trim() ||
    req.headers.get("x-userid")?.trim() ||
    req.headers.get("x-client-id")?.trim() ||
    null
  if (fromHeaders) return fromHeaders

  const fromBody = normalizeMemoryText(body.userId) ?? normalizeMemoryText(body.user_id)
  if (fromBody) return fromBody

  if (isRecord(body.user)) {
    const nested = normalizeMemoryText(body.user.id) ?? normalizeMemoryText(body.user.userId)
    if (nested) return nested
  }

  if (isRecord(body.metadata)) {
    const nested =
      normalizeMemoryText(body.metadata.userId) ??
      normalizeMemoryText(body.metadata.user_id) ??
      normalizeMemoryText(body.metadata.clientId)
    if (nested) return nested
  }

  return null
}

async function fetchUserMemoryPromptBlock(userId: string | null): Promise<string | null> {
  const supabase = createSupabaseServiceClient()
  if (!supabase) return null

  try {
    let query = supabase
      .from("user_corrections")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(12)

    if (userId) {
      query = query.eq("user_id", userId)
    }

    const { data, error } = await query
    if (error) {
      console.debug("[chat] User memory fetch skipped", {
        userId: userId ?? "unknown",
        reason: error.message,
      })
      return null
    }

    const rows = Array.isArray(data) ? (data as UserCorrectionRecord[]) : []
    return buildUserMemoryPromptBlock(rows)
  } catch (error) {
    console.debug("[chat] User memory fetch skipped with exception", error)
    return null
  }
}

function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) return null

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return new Response(
      JSON.stringify({
        error: "Missing OPENAI_API_KEY in root .env.local",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  const contentType = req.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("application/json")) {
    console.warn("[chat] Non-JSON content-type received:", contentType)
  }

  let rawBody = ""
  try {
    rawBody = await req.text()
  } catch (error) {
    console.error("[chat] Failed to read request body", error)
    return new Response(JSON.stringify({ error: "Failed to read request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!rawBody.trim()) {
    console.error("[chat] Empty JSON body")
    return new Response(JSON.stringify({ error: "Empty JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(rawBody)
  } catch (error) {
    console.error("[chat] Invalid JSON body", {
      error,
      preview: rawBody.slice(0, 400),
    })
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const body = isRecord(parsedBody) ? parsedBody : {}
  if (!Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: "messages must be an array" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const normalizedMessages = normalizeIncomingMessages(body.messages)
  const filePartCount = normalizedMessages.reduce((count, message) => {
    if (!Array.isArray(message.content)) return count
    const fileParts = message.content.filter(
      (part) => part.type === "file" || part.type === "image"
    ).length
    return count + fileParts
  }, 0)

  console.info(
    `[chat] Request parsed: messages=${normalizedMessages.length}, fileParts=${filePartCount}`
  )

  const memoryUserId = resolveMemoryUserId(body, req)

  const tools = {
    get_projects: tool({
      description:
        "Fetch active projects from Supabase to support procurement, finance, PM and HR context.",
      inputSchema: z.object({}),
      execute: async () => {
        const supabase = createSupabaseServiceClient()
        if (!supabase) {
          return {
            ok: true as const,
            source: "mock" as const,
            reason:
              "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; returning mock projects.",
            projects: MOCK_ACTIVE_PROJECTS,
          }
        }

        const { data, error } = await supabase
          .from("projects")
          .select("id, name, status")
          .eq("status", "active")
          .order("name", { ascending: true })
          .limit(50)

        if (error) {
          return {
            ok: true as const,
            source: "mock" as const,
            reason: `Supabase query failed (${error.message}); returning mock projects.`,
            projects: MOCK_ACTIVE_PROJECTS,
          }
        }

        const projects =
          data?.map((row) => ({
            id: row.id,
            name: row.name,
            status: row.status,
          })) ?? []

        if (projects.length === 0) {
          return {
            ok: true as const,
            source: "mock" as const,
            reason: "No active projects found in DB; returning mock projects.",
            projects: MOCK_ACTIVE_PROJECTS,
          }
        }

        return {
          ok: true as const,
          source: "supabase" as const,
          projects,
        }
      },
    }),
    get_project_budget: tool({
      description:
        "Fetch budget status for a specific project by name (total, used, remaining and status).",
      inputSchema: z.object({
        projectName: z.string().min(2).describe("Project name, e.g. Ramat Ir HaYayin"),
      }),
      execute: async ({ projectName }) => {
        const normalizedProjectName = projectName.trim()
        const mockBudget = getMockProjectBudget(normalizedProjectName)
        const supabase = createSupabaseServiceClient()

        if (!supabase) {
          return {
            ok: true as const,
            source: "mock" as const,
            reason:
              "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; returning mock project budget.",
            budget: mockBudget,
            summary: buildBudgetSummary(mockBudget),
          }
        }

        const { data: project, error: projectError } = await supabase
          .from("projects")
          .select("id, name")
          .ilike("name", `%${normalizedProjectName}%`)
          .maybeSingle()

        if (projectError) {
          return {
            ok: true as const,
            source: "mock" as const,
            reason: `Project lookup failed (${projectError.message}); returning mock project budget.`,
            budget: mockBudget,
            summary: buildBudgetSummary(mockBudget),
          }
        }

        if (!project?.id) {
          return {
            ok: true as const,
            source: "mock" as const,
            reason: "Project was not found in DB; returning mock project budget.",
            budget: mockBudget,
            summary: buildBudgetSummary(mockBudget),
          }
        }

        const { data: budgetRow, error: budgetError } = await supabase
          .from("project_budgets")
          .select("total_budget_ils, used_budget_ils, status")
          .eq("project_id", project.id)
          .maybeSingle()

        if (budgetError || !budgetRow) {
          const fallbackBudget = {
            ...mockBudget,
            projectName: project.name ?? mockBudget.projectName,
          }
          return {
            ok: true as const,
            source: "mock" as const,
            reason: budgetError
              ? `Budget query failed (${budgetError.message}); returning mock project budget.`
              : "No budget row found for project; returning mock project budget.",
            budget: fallbackBudget,
            summary: buildBudgetSummary(fallbackBudget),
          }
        }

        const totalBudget = Number(budgetRow.total_budget_ils ?? 0)
        const usedBudget = Number(budgetRow.used_budget_ils ?? 0)
        const remainingBudget = Math.max(totalBudget - usedBudget, 0)
        const utilizationPct =
          totalBudget > 0 ? Number(((usedBudget / totalBudget) * 100).toFixed(1)) : 0

        const budget = {
          projectName: project.name ?? normalizedProjectName,
          currency: "ILS",
          totalBudget,
          usedBudget,
          remainingBudget,
          utilizationPct,
          status: budgetRow.status ?? "Unknown",
        }

        return {
          ok: true as const,
          source: "supabase" as const,
          budget,
          summary: buildBudgetSummary(budget),
        }
      },
    }),
    get_project_boq: tool({
      description:
        "Fetch electrical BoQ summary status for a specific project by name.",
      inputSchema: z.object({
        projectName: z.string().min(2).describe("Project name, e.g. Ramat Ir HaYayin"),
      }),
      execute: async ({ projectName }) => {
        const normalizedProjectName = projectName.trim()
        const mockBoq = getMockProjectBoq(normalizedProjectName)
        const supabase = createSupabaseServiceClient()

        if (!supabase) {
          return {
            ok: true as const,
            source: "mock" as const,
            reason:
              "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; returning mock BoQ summary.",
            boq: mockBoq,
            summary: buildBoqSummary(mockBoq),
          }
        }

        const { data: project, error: projectError } = await supabase
          .from("projects")
          .select("id, name")
          .ilike("name", `%${normalizedProjectName}%`)
          .maybeSingle()

        if (projectError) {
          return {
            ok: true as const,
            source: "mock" as const,
            reason: `Project lookup failed (${projectError.message}); returning mock BoQ summary.`,
            boq: mockBoq,
            summary: buildBoqSummary(mockBoq),
          }
        }

        if (!project?.id) {
          return {
            ok: true as const,
            source: "mock" as const,
            reason: "Project was not found in DB; returning mock BoQ summary.",
            boq: mockBoq,
            summary: buildBoqSummary(mockBoq),
          }
        }

        const { data: boqRows, error: boqError } = await supabase
          .from("project_boq_status")
          .select("category, status, progress_pct")
          .eq("project_id", project.id)
          .order("category", { ascending: true })
          .limit(30)

        if (boqError || !boqRows || boqRows.length === 0) {
          const fallbackBoq = {
            ...mockBoq,
            projectName: project.name ?? mockBoq.projectName,
          }
          return {
            ok: true as const,
            source: "mock" as const,
            reason: boqError
              ? `BoQ query failed (${boqError.message}); returning mock BoQ summary.`
              : "No BoQ rows found for project; returning mock BoQ summary.",
            boq: fallbackBoq,
            summary: buildBoqSummary(fallbackBoq),
          }
        }

        const boq = {
          projectName: project.name ?? normalizedProjectName,
          summary: boqRows.map((row) => ({
            category: row.category ?? "Unknown category",
            status: row.status ?? "Unknown",
            progressPct: Number(row.progress_pct ?? 0),
          })),
        }

        return {
          ok: true as const,
          source: "supabase" as const,
          boq,
          summary: buildBoqSummary(boq),
        }
      },
    }),
    saveToMemory: tool({
      description:
        "Use this tool to explicitly save important user facts, project details, or corrections permanently to the user's long-term memory ledger. Call this WHENEVER the user corrects you or provides a new rule/persistent fact.",
      inputSchema: z.object({
        fact: z.string().min(2),
        category: z.string().optional(),
      }),
      execute: async ({ fact, category }) => {
        const normalizedFact = fact.trim()
        const normalizedCategory = category?.trim()
        const resolvedUserId = memoryUserId ?? "anonymous"
        const supabase = createSupabaseServiceClient()

        if (!supabase) {
          return {
            ok: false as const,
            saved: false as const,
            message:
              "Memory client is unavailable (missing Supabase configuration), so the fact was not persisted.",
          }
        }

        const payload = {
          user_id: resolvedUserId,
          correction: normalizedFact,
          context: normalizedCategory && normalizedCategory.length > 0 ? normalizedCategory : "General",
        }

        const { error } = await supabase.from("user_corrections").insert(payload)
        if (error) {
          console.debug("[chat] saveToMemory failed", {
            userId: resolvedUserId,
            reason: error.message,
          })
          return {
            ok: false as const,
            saved: false as const,
            message: `Memory save failed: ${error.message}`,
          }
        }

        return {
          ok: true as const,
          saved: true as const,
          message: `Saved to long-term memory for user ${resolvedUserId}.`,
          entry: payload,
        }
      },
    }),
  }

  const memoryBlock = await fetchUserMemoryPromptBlock(memoryUserId)
  const runtimeSystemPrompt = [
    SYSTEM_PROMPT,
    SYSTEM_CAPABILITIES_PROMPT,
    LEARNING_PROTOCOL_PROMPT,
    memoryBlock ? `<user_memory>\n${memoryBlock}\n</user_memory>` : null,
  ]
    .filter((block): block is string => Boolean(block))
    .join("\n\n")

  try {
    const coreMessages = normalizedMessages as unknown as import("ai").ModelMessage[]
    const result = streamText({
      model: openai("gpt-4o"),
      system: runtimeSystemPrompt,
      messages: coreMessages,
      tools,
      toolChoice: "auto",
      stopWhen: stepCountIs(5),
    })

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        console.error("[chat] Stream response error", error)
        return "Chat streaming failed on server. Please retry."
      },
    })
  } catch (error) {
    console.error("[chat] streamText failed", error)
    return new Response(
      JSON.stringify({
        error: "Chat request failed at server. Check server logs for details.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
