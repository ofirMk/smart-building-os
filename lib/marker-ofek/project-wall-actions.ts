"use server"

import { randomUUID } from "node:crypto"

import { openai } from "@ai-sdk/openai"
import { generateObject } from "ai"
import { z } from "zod"

import {
  buildSharedClassificationUserPrompt,
  classifyProjectWallCategoryFromKeywords,
} from "@/lib/ai/agent-logic"
import type {
  ProjectWallAiCategory,
  ProjectWallPostKind,
  ProjectWallPostRow,
} from "@/lib/marker-ofek/project-wall-types"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

const WALL_BUCKET = "project_wall"

const categorySchema = z.object({
  category: z.enum(["technical", "safety", "delay", "finance"]),
})

async function classifyWallPostContent(input: {
  postKind: ProjectWallPostKind
  body: string | null
  tagSlugs: string[]
}): Promise<ProjectWallAiCategory> {
  const lines = [
    `סוג: ${input.postKind}`,
    input.body?.trim() ? `תוכן: ${input.body.trim()}` : null,
    input.tagSlugs.length ? `תגיות: ${input.tagSlugs.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: categorySchema,
      prompt: buildSharedClassificationUserPrompt(lines),
    })
    return object.category
  } catch {
    return classifyProjectWallCategoryFromKeywords(lines)
  }
}

export async function getProjectWallBootstrap(projectId: string): Promise<{
  ok: true
  posts: ProjectWallPostRow[]
  canPost: boolean
  projectName: string
} | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const { data: project, error: projectErr } = await supabase
      .from("projects")
      .select("id, name")
      .eq("id", projectId)
      .eq("is_deleted", false)
      .maybeSingle()

    if (projectErr || !project) {
      return { ok: false, error: "הפרויקט לא נמצא" }
    }

    const { data: canPostRpc, error: rpcErr } = await supabase.rpc(
      "mo_user_can_post_project_wall",
      { p_project_id: projectId }
    )
    const canPost = !rpcErr && Boolean(canPostRpc)

    const { data: rows, error: postsErr } = await supabase
      .from("project_wall_posts")
      .select(
        "id, project_id, author_id, post_kind, body, tag_slugs, image_storage_bucket, image_storage_path, ai_category, created_at"
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(80)

    if (postsErr) {
      if (/relation|does not exist|column/i.test(String(postsErr.message ?? ""))) {
        return {
          ok: true,
          posts: [],
          canPost: Boolean(canPost),
          projectName: String((project as { name?: string }).name ?? ""),
        }
      }
      return { ok: false, error: postsErr.message }
    }

    const authorIds = [...new Set((rows ?? []).map((r) => r.author_id as string))]
    let nameById: Record<string, string | null> = {}
    if (authorIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", authorIds)
      nameById = Object.fromEntries(
        (profs ?? []).map((p) => [p.id as string, (p as { full_name?: string | null }).full_name ?? null])
      )
    }

    const posts: ProjectWallPostRow[] = []
    for (const r of rows ?? []) {
      let image_signed_url: string | null = null
      const bucket = r.image_storage_bucket as string | null
      const path = r.image_storage_path as string | null
      if (bucket && path) {
        const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
        image_signed_url = signed?.signedUrl ?? null
      }
      posts.push({
        id: r.id as string,
        project_id: r.project_id as string,
        author_id: r.author_id as string,
        post_kind: r.post_kind as ProjectWallPostKind,
        body: (r.body as string | null) ?? null,
        tag_slugs: Array.isArray(r.tag_slugs) ? (r.tag_slugs as string[]) : [],
        image_storage_bucket: bucket,
        image_storage_path: path,
        ai_category: r.ai_category as ProjectWallAiCategory,
        created_at: r.created_at as string,
        author_full_name: nameById[r.author_id as string] ?? null,
        image_signed_url,
      })
    }

    return {
      ok: true,
      posts,
      canPost: Boolean(canPost),
      projectName: String((project as { name?: string }).name ?? ""),
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function createProjectWallPost(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const projectId = String(formData.get("project_id") ?? "").trim()
    const postKind = String(formData.get("post_kind") ?? "").trim() as ProjectWallPostKind
    if (!projectId || !["text", "photo", "tags"].includes(postKind)) {
      return { ok: false, error: "בקשה לא חוקית" }
    }

    const { data: allowed, error: rpcErr } = await supabase.rpc(
      "mo_user_can_post_project_wall",
      { p_project_id: projectId }
    )
    if (rpcErr || !allowed) {
      return { ok: false, error: "אין הרשאת פרסום בקיר לפרויקט זה" }
    }

    const bodyRaw =
      postKind === "text"
        ? String(formData.get("text_body") ?? "").trim()
        : postKind === "photo"
          ? String(formData.get("photo_caption") ?? "").trim()
          : String(formData.get("tags_note") ?? "").trim()
    const tagSlugs = formData
      .getAll("tag_slugs")
      .map((v) => String(v).trim())
      .filter(Boolean)
    const file = formData.get("photo")

    let image_storage_bucket: string | null = null
    let image_storage_path: string | null = null
    let body: string | null = bodyRaw || null

    if (postKind === "photo") {
      if (!(file instanceof File) || file.size === 0) {
        return { ok: false, error: "נא לצרף תמונה" }
      }
      const maxBytes = 12 * 1024 * 1024
      if (file.size > maxBytes) {
        return { ok: false, error: "התמונה גדולה מדי (מקסימום 12 מ״ב)" }
      }
      const ext =
        file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : file.type === "image/gif"
              ? "gif"
              : "jpg"
      const objectPath = `${projectId}/${randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(WALL_BUCKET)
        .upload(objectPath, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        })
      if (upErr) {
        return { ok: false, error: `העלאה נכשלה: ${upErr.message}` }
      }
      image_storage_bucket = WALL_BUCKET
      image_storage_path = objectPath
    } else if (postKind === "text") {
      if (!bodyRaw) {
        return { ok: false, error: "נא להזין טקסט" }
      }
    } else if (postKind === "tags") {
      if (tagSlugs.length === 0) {
        return { ok: false, error: "נא לבחור לפחות תגית" }
      }
      body = bodyRaw || null
    }

    const ai_category = await classifyWallPostContent({
      postKind,
      body,
      tagSlugs: postKind === "tags" ? tagSlugs : [],
    })

    const { error: insErr } = await supabase.from("project_wall_posts").insert({
      project_id: projectId,
      author_id: user.id,
      post_kind: postKind,
      body,
      tag_slugs: postKind === "tags" ? tagSlugs : [],
      image_storage_bucket,
      image_storage_path,
      ai_category,
    })

    if (insErr) {
      if (/relation|does not exist/i.test(String(insErr.message ?? ""))) {
        return { ok: false, error: "טבלת קיר הפרויקט עדיין לא הופעלה במסד הנתונים." }
      }
      return { ok: false, error: insErr.message }
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
