"use server"

/**
 * T13 — Variations cockpit server actions.
 *
 * Next.js 16 strict spec: 'use server' modules export ONLY async functions.
 * Pure constants / sync helpers stay in a non-action module (see local
 * helper file imports). Cookie & supabase access happens server-side.
 *
 * Actions:
 *   1. createVariationDraft        — INSERT contract_variation_orders (status='draft')
 *   2. triggerAiBookletGeneration  — POST to ai-worker /ai/variations/generate-booklet
 *   3. approveVariationPricing     — T14: PM approval + pricing + contract assignment
 *   4. getPendingApprovedVariations — T14: pull queue for billing (linked IS NULL)
 *   5. lockVariationToAccount      — T14: bind variation to a partial_account (no double-billing)
 */

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { logMoAuditEvent } from "@/lib/marker-ofek/audit-log"
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

// ─────────────────────────────────────────────────────────────────────────────
// T14 — Financial bridge
// ─────────────────────────────────────────────────────────────────────────────

export type ApproveVariationInput = {
  variationId: string
  approvedAmount: number
  contractId: string
}

export type ApprovedVariationData = {
  id: string
  voNumber: number
  approvedAmount: number
  contractId: string
}

// UUID v4-ish guard. אנחנו לא רוצים תלות חיצונית; הולכים על regex פרגמטית.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * T14.1 — PM Approval & Pricing.
 *
 * Closes the contract_id relaxation introduced in T13:
 *   - חריג בסטטוס 'submitted' עם חוברת AI → 'approved' עם סכום וחוזה.
 *   - Constraint contract_variation_orders_approved_requires_pricing
 *     מבטיח ברמת ה-DB ש-status='approved' תמיד עם approved_amount + contract_id.
 *   - חוק R6 — לוג ל-mo_audit_logs דרך logMoAuditEvent (כולל IP).
 */
export async function approveVariationPricing(
  input: ApproveVariationInput,
): Promise<ActionResult<ApprovedVariationData>> {
  try {
    const variationId = input.variationId?.trim() ?? ""
    const contractId = input.contractId?.trim() ?? ""
    const approvedAmount = Number(input.approvedAmount)

    if (!variationId) return { ok: false, error: "חסר מזהה חריג" }
    if (!UUID_RE.test(variationId)) {
      return { ok: false, error: "מזהה חריג לא תקין" }
    }
    if (!contractId) return { ok: false, error: "חובה לשייך חוזה בעת האישור" }
    if (!UUID_RE.test(contractId)) {
      return { ok: false, error: "מזהה חוזה לא תקין (UUID)" }
    }
    if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
      return { ok: false, error: "סכום מאושר חייב להיות מספר חיובי" }
    }
    if (approvedAmount > 1e11) {
      return { ok: false, error: "סכום מאושר גבוה מדי" }
    }

    const supabase = await createSupabaseServerAuthClient()
    const companyId = await resolveActiveCompanyId() // R1

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    // טעינת הרשומה — old snapshot + verify tenant (R1 double-defense)
    const { data: oldRow, error: loadErr } = await supabase
      .from("contract_variation_orders")
      .select(
        "id, vo_number, project_id, company_id, contract_id, status, approved_amount, linked_partial_account_id",
      )
      .eq("id", variationId)
      .eq("company_id", companyId)
      .maybeSingle<{
        id: string
        vo_number: number
        project_id: string | null
        company_id: string | null
        contract_id: string | null
        status: string
        approved_amount: number | null
        linked_partial_account_id: string | null
      }>()

    if (loadErr || !oldRow) {
      return {
        ok: false,
        error: `חריג לא נמצא או לא שייך לחברה הפעילה (${loadErr?.message ?? "no row"})`,
      }
    }

    // State machine: מותר לאשר רק מ-'submitted'. אם כבר approved/rejected — חוסם.
    if (oldRow.status !== "submitted") {
      return {
        ok: false,
        error: `לא ניתן לאשר חריג בסטטוס '${oldRow.status}'. נדרש סטטוס 'submitted' (לאחר הפקת חוברת AI).`,
      }
    }
    if (oldRow.linked_partial_account_id) {
      return {
        ok: false,
        error: "חריג זה כבר ננעל לחשבון חלקי — לא ניתן לערוך את האישור.",
      }
    }

    // ודא שהחוזה שייך לאותה חברה (R1 — defence in depth ל-FK)
    const { data: contractRow, error: contractErr } = await supabase
      .from("contracts")
      .select("id, project_id")
      .eq("id", contractId)
      .maybeSingle<{ id: string; project_id: string | null }>()

    if (contractErr || !contractRow) {
      return {
        ok: false,
        error: `חוזה ${contractId} לא נמצא או לא נגיש`,
      }
    }
    if (
      oldRow.project_id &&
      contractRow.project_id &&
      contractRow.project_id !== oldRow.project_id
    ) {
      return {
        ok: false,
        error: "החוזה שייך לפרויקט אחר — לא ניתן לקשר חריג לחוזה זה.",
      }
    }

    // UPDATE — נשען על ה-DB constraint approved_requires_pricing כ-safety net.
    const { data: newRow, error: updErr } = await supabase
      .from("contract_variation_orders")
      .update({
        status: "approved",
        approved_amount: approvedAmount,
        contract_id: contractId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", variationId)
      .eq("company_id", companyId) // R1
      .eq("status", "submitted") // optimistic concurrency
      .select(
        "id, vo_number, project_id, contract_id, approved_amount, status",
      )
      .maybeSingle<{
        id: string
        vo_number: number
        project_id: string | null
        contract_id: string
        approved_amount: number
        status: string
      }>()

    if (updErr) {
      return { ok: false, error: `עדכון נכשל: ${updErr.message}` }
    }
    if (!newRow) {
      return {
        ok: false,
        error: "העדכון לא תפס — ייתכן שהחריג שונה בו-זמנית. רענן ונסה שוב.",
      }
    }

    // R6 — audit log עם diff מלא
    const auditRes = await logMoAuditEvent({
      action_type: "UPDATE",
      table_name: "contract_variation_orders",
      project_id: oldRow.project_id,
      old_data: { ...oldRow, _t14_event: "pm_approval" },
      new_data: {
        id: newRow.id,
        status: newRow.status,
        approved_amount: newRow.approved_amount,
        contract_id: newRow.contract_id,
        _t14_event: "pm_approval",
        _approved_by: user.id,
      },
    })
    if (!auditRes.ok) {
      console.warn("[t14.approveVariationPricing] audit log failed:", auditRes.error)
      // לא מפילים את הפעולה — האישור הפיננסי תפס כבר ב-DB.
    }

    if (newRow.project_id) {
      revalidatePath(`/marker-ofek/projects/${newRow.project_id}/variations`)
    }

    return {
      ok: true,
      data: {
        id: newRow.id,
        voNumber: newRow.vo_number,
        approvedAmount: Number(newRow.approved_amount),
        contractId: newRow.contract_id,
      },
    }
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc)
    console.error("[t14.approveVariationPricing]", msg)
    return { ok: false, error: msg }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// T14.2 — Billing Pull infrastructure
// ─────────────────────────────────────────────────────────────────────────────

export type PendingApprovedVariation = {
  id: string
  voNumber: number
  title: string
  description: string | null
  approvedAmount: number
  contractId: string
  projectId: string | null
  pdfUrl: string | null
  approvedAt: string | null
}

/**
 * T14.2.a — Pull queue ל-Billing.
 *
 * חוק עליון (Zero Double-Billing):
 *   שולף רק חריגים בסטטוס 'approved' עם linked_partial_account_id IS NULL.
 *   חריג שכבר ננעל לחשבון חלקי — לא יחזור ב-pull queue, גם אם יבוטל
 *   החשבון (במקרה כזה צריך RPC נפרד לשחרור — לא חלק מ-T14).
 *
 * R1 — סינון נוסף ב-company_id (defence in depth מעל ל-RLS).
 */
export async function getPendingApprovedVariations(
  projectId: string,
  contractId?: string | null,
): Promise<ActionResult<PendingApprovedVariation[]>> {
  try {
    if (!projectId?.trim()) return { ok: false, error: "חסר מזהה פרויקט" }
    if (!UUID_RE.test(projectId)) return { ok: false, error: "מזהה פרויקט לא תקין" }

    const supabase = await createSupabaseServerAuthClient()
    const companyId = await resolveActiveCompanyId() // R1

    let query = supabase
      .from("contract_variation_orders")
      .select(
        "id, vo_number, title, description, approved_amount, contract_id, project_id, pdf_url, approved_at",
      )
      .eq("project_id", projectId)
      .eq("company_id", companyId) // R1
      .eq("status", "approved")
      .is("linked_partial_account_id", null) // ZERO DOUBLE-BILLING
      .order("vo_number", { ascending: true })

    if (contractId?.trim()) {
      if (!UUID_RE.test(contractId.trim())) {
        return { ok: false, error: "מזהה חוזה לא תקין" }
      }
      query = query.eq("contract_id", contractId.trim())
    }

    const { data: rows, error } = await query.returns<
      Array<{
        id: string
        vo_number: number
        title: string
        description: string | null
        approved_amount: number | string
        contract_id: string
        project_id: string | null
        pdf_url: string | null
        approved_at: string | null
      }>
    >()

    if (error) {
      return { ok: false, error: `שליפת חריגים למשיכה נכשלה: ${error.message}` }
    }

    const mapped: PendingApprovedVariation[] = (rows ?? []).map((r) => ({
      id: r.id,
      voNumber: r.vo_number,
      title: r.title,
      description: r.description,
      approvedAmount: Number(r.approved_amount),
      contractId: r.contract_id,
      projectId: r.project_id,
      pdfUrl: r.pdf_url,
      approvedAt: r.approved_at,
    }))

    return { ok: true, data: mapped }
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc)
    console.error("[t14.getPendingApprovedVariations]", msg)
    return { ok: false, error: msg }
  }
}

export type LockVariationToAccountInput = {
  variationId: string
  accountId: string
}

export type LockedVariationData = {
  id: string
  voNumber: number
  linkedPartialAccountId: string
  approvedAmount: number
}

/**
 * T14.2.b — נעילת חריג לחשבון חלקי.
 *
 * זוהי "פעולת הברזל" — אחרי שהיא תפסה, החריג לא יוכל לחזור ל-pull queue
 * (חוק zero double-billing). מבוצע ב-UPDATE עם הגנת optimistic concurrency
 * על `linked_partial_account_id IS NULL`, כך ש-race condition בין שני
 * חשבונאים שמנסים למשוך את אותו חריג — רק אחד יזכה.
 *
 * R6 — audit log מלא.
 */
export async function lockVariationToAccount(
  input: LockVariationToAccountInput,
): Promise<ActionResult<LockedVariationData>> {
  try {
    const variationId = input.variationId?.trim() ?? ""
    const accountId = input.accountId?.trim() ?? ""

    if (!variationId || !UUID_RE.test(variationId)) {
      return { ok: false, error: "מזהה חריג לא תקין" }
    }
    if (!accountId || !UUID_RE.test(accountId)) {
      return { ok: false, error: "מזהה חשבון חלקי לא תקין" }
    }

    const supabase = await createSupabaseServerAuthClient()
    const companyId = await resolveActiveCompanyId() // R1

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    // ודא שהחשבון קיים ושייך לאותה חברה דרך החוזה.
    const { data: account, error: accountErr } = await supabase
      .from("partial_accounts")
      .select("id, contract_id, project_id")
      .eq("id", accountId)
      .maybeSingle<{
        id: string
        contract_id: string | null
        project_id: string | null
      }>()

    if (accountErr || !account) {
      return { ok: false, error: `חשבון חלקי לא נמצא: ${accountErr?.message ?? ""}` }
    }

    // טעינת old snapshot (לפני NEEDED ל-audit + ולוודא tenant)
    const { data: oldRow } = await supabase
      .from("contract_variation_orders")
      .select(
        "id, vo_number, project_id, company_id, contract_id, status, approved_amount, linked_partial_account_id",
      )
      .eq("id", variationId)
      .eq("company_id", companyId)
      .maybeSingle<{
        id: string
        vo_number: number
        project_id: string | null
        company_id: string | null
        contract_id: string | null
        status: string
        approved_amount: number | null
        linked_partial_account_id: string | null
      }>()

    if (!oldRow) {
      return {
        ok: false,
        error: "חריג לא נמצא או לא שייך לחברה הפעילה",
      }
    }
    if (oldRow.status !== "approved") {
      return {
        ok: false,
        error: `ניתן לנעול לחשבון רק חריג בסטטוס 'approved' (נוכחי: ${oldRow.status})`,
      }
    }
    if (oldRow.linked_partial_account_id) {
      return {
        ok: false,
        error: "חריג זה כבר נעול לחשבון חלקי אחר — אסור כפל-חיוב.",
      }
    }
    // ודא שהחשבון תואם לחוזה של החריג (defence in depth)
    if (
      account.contract_id &&
      oldRow.contract_id &&
      account.contract_id !== oldRow.contract_id
    ) {
      return {
        ok: false,
        error: "החשבון החלקי שייך לחוזה אחר מזה של החריג.",
      }
    }

    // UPDATE — אטומי עם optimistic guard על linked_partial_account_id IS NULL.
    const { data: newRow, error: updErr } = await supabase
      .from("contract_variation_orders")
      .update({ linked_partial_account_id: accountId })
      .eq("id", variationId)
      .eq("company_id", companyId)
      .eq("status", "approved")
      .is("linked_partial_account_id", null) // ZERO DOUBLE-BILLING GUARD
      .select("id, vo_number, linked_partial_account_id, approved_amount")
      .maybeSingle<{
        id: string
        vo_number: number
        linked_partial_account_id: string
        approved_amount: number | string
      }>()

    if (updErr) {
      return { ok: false, error: `נעילה נכשלה: ${updErr.message}` }
    }
    if (!newRow) {
      return {
        ok: false,
        error:
          "החריג נעול כבר ע\"י משתמש אחר (race condition). רענן את הרשימה.",
      }
    }

    // R6 — audit log
    const auditRes = await logMoAuditEvent({
      action_type: "UPDATE",
      table_name: "contract_variation_orders",
      project_id: oldRow.project_id,
      old_data: { ...oldRow, _t14_event: "lock_to_partial_account" },
      new_data: {
        id: newRow.id,
        linked_partial_account_id: newRow.linked_partial_account_id,
        _t14_event: "lock_to_partial_account",
        _locked_by: user.id,
      },
    })
    if (!auditRes.ok) {
      console.warn("[t14.lockVariationToAccount] audit log failed:", auditRes.error)
    }

    if (oldRow.project_id) {
      revalidatePath(`/marker-ofek/projects/${oldRow.project_id}/variations`)
    }

    return {
      ok: true,
      data: {
        id: newRow.id,
        voNumber: newRow.vo_number,
        linkedPartialAccountId: newRow.linked_partial_account_id,
        approvedAmount: Number(newRow.approved_amount),
      },
    }
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc)
    console.error("[t14.lockVariationToAccount]", msg)
    return { ok: false, error: msg }
  }
}
