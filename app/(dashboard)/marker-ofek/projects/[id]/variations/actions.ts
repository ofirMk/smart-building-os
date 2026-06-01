"use server"

/**
 * T13 — Variations cockpit server actions.
 *
 * Next.js 16 strict spec: 'use server' modules export ONLY async functions.
 * Pure constants / sync helpers stay in a non-action module (see local
 * helper file imports). Cookie & supabase access happens server-side.
 *
 * Two actions:
 *   1. createVariationDraft        — INSERT contract_variation_orders (status='draft')
 *   2. triggerAiBookletGeneration  — POST to ai-worker /ai/variations/generate-booklet
 */

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export type CreateVariationDraftInput = {
  projectId: string
  title: string
  description: string
}

export type TriggerBookletInput = {
  variationId: string
  attachedPdfUrls: string[]
}

export type TriggerBookletData = {
  pdfUrl: string
  aiJustificationText: string
  ragMatchesCount: number
  pagesMerged: number
  elapsedSeconds: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers (must be async to coexist with 'use server')
// ─────────────────────────────────────────────────────────────────────────────

async function resolveActiveCompanyId(): Promise<string> {
  const cookieStore = await cookies()
  const id = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
  if (!id) {
    throw new Error("חסר הקשר חברה — בחרו חברה פעילה מהסרגל העליון")
  }
  return id
}

async function resolveNextVoNumber(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  projectId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("contract_variation_orders")
    .select("vo_number")
    .eq("project_id", projectId)
    .order("vo_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ vo_number: number }>()

  if (error) {
    // לא קריטי — נופלים ל-1. הלוג נשמר.
    console.warn("[t13] vo_number lookup failed:", error.message)
    return 1
  }
  return (data?.vo_number ?? 0) + 1
}

// ─────────────────────────────────────────────────────────────────────────────
// Action 1 — createVariationDraft
// ─────────────────────────────────────────────────────────────────────────────

export async function createVariationDraft(
  input: CreateVariationDraftInput,
): Promise<ActionResult<{ id: string; voNumber: number }>> {
  try {
    const title = input.title?.trim() ?? ""
    const description = input.description?.trim() ?? ""
    const projectId = input.projectId?.trim() ?? ""

    if (!projectId) return { ok: false, error: "חסר מזהה פרויקט" }
    if (!title) return { ok: false, error: "שם החריג חובה" }
    if (description.length < 10) {
      return { ok: false, error: "תיאור חייב להיות מפורט (לפחות 10 תווים) — קריטי ל-RAG" }
    }

    const supabase = await createSupabaseServerAuthClient()
    const companyId = await resolveActiveCompanyId() // R1

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const voNumber = await resolveNextVoNumber(supabase, projectId)

    const { data: inserted, error } = await supabase
      .from("contract_variation_orders")
      .insert({
        contract_id: null, // T13: optional now
        project_id: projectId,
        company_id: companyId, // R1
        vo_number: voNumber,
        title,
        description,
        status: "draft",
      })
      .select("id")
      .single<{ id: string }>()

    if (error || !inserted) {
      return {
        ok: false,
        error: `כשל ביצירת חריג: ${error?.message ?? "תגובה ריקה"}`,
      }
    }

    revalidatePath(`/marker-ofek/projects/${projectId}/variations`)
    return { ok: true, data: { id: inserted.id, voNumber } }
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc)
    console.error("[t13.createVariationDraft]", msg)
    return { ok: false, error: msg }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action 2 — triggerAiBookletGeneration
// ─────────────────────────────────────────────────────────────────────────────

export async function triggerAiBookletGeneration(
  input: TriggerBookletInput,
): Promise<ActionResult<TriggerBookletData>> {
  try {
    const variationId = input.variationId?.trim() ?? ""
    if (!variationId) return { ok: false, error: "חסר מזהה חריג" }

    const workerUrl =
      process.env.AI_WORKER_URL?.trim() || "http://localhost:8001"
    const workerBearer = process.env.AI_WORKER_BEARER?.trim() ?? ""
    if (!workerBearer) {
      return {
        ok: false,
        error: "AI_WORKER_BEARER לא מוגדר ב-env — לא ניתן לפנות ל-worker",
      }
    }

    const supabase = await createSupabaseServerAuthClient()
    const companyId = await resolveActiveCompanyId() // R1

    // טען את החריג עם R1 double-defense (company_id filter בנוסף ל-RLS).
    const { data: row, error: loadErr } = await supabase
      .from("contract_variation_orders")
      .select("id, project_id, company_id, description, status, pdf_url")
      .eq("id", variationId)
      .eq("company_id", companyId)
      .maybeSingle<{
        id: string
        project_id: string | null
        company_id: string | null
        description: string | null
        status: string
        pdf_url: string | null
      }>()

    if (loadErr || !row) {
      return {
        ok: false,
        error: `חריג לא נמצא או לא שייך לחברה הפעילה (${loadErr?.message ?? "no row"})`,
      }
    }
    if (!row.project_id) {
      return { ok: false, error: "חריג ללא שיוך פרויקט — לא ניתן להפיק חוברת" }
    }
    if (!row.description || row.description.trim().length < 10) {
      return { ok: false, error: "תיאור החריג קצר מדי ל-RAG (פחות מ-10 תווים)" }
    }

    // קריאה ל-Python microservice. ה-payload תואם ל-VariationBookletRequest.
    const payload = {
      variation_id: row.id,
      company_id: row.company_id ?? companyId,
      project_id: row.project_id,
      description: row.description,
      attached_pdf_urls: Array.isArray(input.attachedPdfUrls)
        ? input.attachedPdfUrls.filter((u) => typeof u === "string" && u.trim())
        : [],
    }

    const endpoint = `${workerUrl.replace(/\/+$/, "")}/ai/variations/generate-booklet`
    let resp: Response
    try {
      resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${workerBearer}`,
        },
        body: JSON.stringify(payload),
        // ה-worker עשוי לקחת 25+ שניות — לא לחתוך מוקדם.
        signal: AbortSignal.timeout(120_000),
        cache: "no-store",
      })
    } catch (netErr) {
      const msg = netErr instanceof Error ? netErr.message : String(netErr)
      return {
        ok: false,
        error: `כשל ברשת מול ai-worker (${endpoint}): ${msg}`,
      }
    }

    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => "")
      return {
        ok: false,
        error: `ai-worker החזיר ${resp.status}: ${bodyText.slice(0, 250)}`,
      }
    }

    const payloadOut = (await resp.json().catch(() => null)) as
      | {
          ok?: boolean
          variation_id?: string
          pdf_url?: string
          ai_justification_text?: string
          rag_matches_count?: number
          pages_merged?: number
          elapsed_seconds?: number
        }
      | null

    if (!payloadOut?.pdf_url) {
      return {
        ok: false,
        error: "תגובה לא תקינה מ-ai-worker (חסר pdf_url)",
      }
    }

    revalidatePath(`/marker-ofek/projects/${row.project_id}/variations`)
    return {
      ok: true,
      data: {
        pdfUrl: payloadOut.pdf_url,
        aiJustificationText: payloadOut.ai_justification_text ?? "",
        ragMatchesCount: payloadOut.rag_matches_count ?? 0,
        pagesMerged: payloadOut.pages_merged ?? 1,
        elapsedSeconds: payloadOut.elapsed_seconds ?? 0,
      },
    }
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc)
    console.error("[t13.triggerAiBookletGeneration]", msg)
    return { ok: false, error: msg }
  }
}
