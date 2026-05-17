"use server"

/**
 * Sprint P1 — Project Onboarding Wizard server actions.
 *
 * Three real-DB-write actions powering the 3-step wizard at
 * `/marker-ofek/projects/new`:
 *
 *   1. `createProjectAction`        — Step 1 (Initiation / Master Data)
 *      Inserts into the canonical `erp_proj_projects` AND mirrors the same
 *      UUID into the legacy `projects` table so the project is reachable
 *      both from the list page (`/marker-ofek/projects`, reads `projects`)
 *      and from any FK target referencing `erp_proj_projects` (e.g.
 *      `erp_client_contracts.project_id`).
 *
 *   2. `createClientContractAction` — Step 2 (Commercials / חוזה מסחרי)
 *      Inserts into `erp_client_contracts` linked to the project from step 1.
 *
 *   3. `lockBaselineAndLaunchAction` — Step 3 (Go-Live)
 *      Activates both the project (`erp_proj_projects.status='ACTIVE'`,
 *      `projects.status='active'`) and the client contract
 *      (`erp_client_contracts.status='ACTIVE'`).
 *
 * Production-mode mandates:
 *   - NO mock data — every call writes to the real Supabase tables.
 *   - try/catch around every DB call. On failure we return `{ ok: false }`
 *     with a human-readable error message; the wizard halts on the failing
 *     step and surfaces the message via `sonner`.
 *   - Auth-gated: an unauthenticated request returns `{ ok: false,
 *     error: "Unauthorized" }`.
 *
 * No optional shortcuts. No "if column exists" branches. The DB schema is
 * the source of truth.
 */

import { revalidatePath } from "next/cache"

import {
  COMPANY_COOKIE_KEY,
  resolveCompanyContext,
  type CompanyContextId,
} from "@/lib/company-context"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateProjectInput = {
  projectNumber: string
  name: string
  clientName: string
  projectManager: string
  startDate: string | null
  endDate: string | null
  /**
   * Optional company override. When omitted, the action resolves the active
   * company from the `selected_company` cookie, falling back to
   * `marker_ofek` so the wizard works inside a fresh tenant.
   */
  companyId?: CompanyContextId | null
}

export type CreateProjectResult =
  | { ok: true; projectId: string; projectNumber: string }
  | { ok: false; error: string }

export type CreateClientContractInput = {
  projectId: string
  contractNumber: string
  title: string
  clientName: string
  totalAmount: number
  indexationPct: number
  retentionPct: number
  advancePaymentAmount: number
  advanceRepaymentPct: number
  startDate: string | null
  endDate: string | null
  companyId?: CompanyContextId | null
}

export type CreateClientContractResult =
  | { ok: true; contractId: string }
  | { ok: false; error: string }

export type LockBaselineInput = {
  projectId: string
  contractId: string
  companyId?: CompanyContextId | null
}

export type LockBaselineResult =
  | { ok: true; projectId: string }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Auth + company helpers
// ---------------------------------------------------------------------------

async function authedClient() {
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return { ok: false as const, error: "Unauthorized" }
  }
  return { ok: true as const, supabase }
}

async function resolveCompany(
  override?: CompanyContextId | null,
): Promise<CompanyContextId> {
  if (override) return override
  // Read from the cookie store. Defer the import so this module stays
  // tree-shakeable from non-server contexts.
  const { cookies } = await import("next/headers")
  const store = await cookies()
  const fromCookie = resolveCompanyContext(store.get(COMPANY_COOKIE_KEY)?.value)
  return fromCookie ?? "marker_ofek"
}

function describeError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === "string" && err.length > 0) return err
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === "string" && msg.length > 0) return msg
  }
  return fallback
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`חסר שדה חובה: ${label}`)
  }
  return value.trim()
}

// ---------------------------------------------------------------------------
// Step 1 — create project
// ---------------------------------------------------------------------------

/**
 * Insert a fresh project. Writes to BOTH `erp_proj_projects` (canonical) and
 * `projects` (legacy hub) under the SAME UUID so:
 *   - `erp_client_contracts.project_id` FK validates against erp_proj_projects.
 *   - `/marker-ofek/projects/[id]` (which queries `projects`) finds the row.
 *
 * The legacy mirror insert is best-effort: if it fails for any reason, the
 * canonical row is rolled back so the wizard can retry cleanly.
 */
export async function createProjectAction(
  input: CreateProjectInput,
): Promise<CreateProjectResult> {
  try {
    const auth = await authedClient()
    if (!auth.ok) return { ok: false, error: auth.error }
    const supabase = auth.supabase

    const projectNumber = nonEmpty(input.projectNumber, "מספר פרויקט")
    const name = nonEmpty(input.name, "שם פרויקט")
    const clientName = nonEmpty(input.clientName, "שם לקוח")
    const projectManager = nonEmpty(input.projectManager, "מנהל פרויקט")
    const companyId = await resolveCompany(input.companyId)

    // 1. Canonical insert. We let Postgres allocate the UUID via the column
    //    default so we get the same id for the legacy mirror without an
    //    extra RPC.
    const { data: canonical, error: canonicalErr } = await supabase
      .from("erp_proj_projects")
      .insert({
        company_id: companyId,
        project_number: projectNumber,
        name,
        status: "DRAFT",
        start_date: input.startDate || null,
        end_date: input.endDate || null,
      })
      .select("id, project_number")
      .single()

    if (canonicalErr || !canonical) {
      return {
        ok: false,
        error: describeError(
          canonicalErr,
          "שמירת הפרויקט ב-erp_proj_projects נכשלה",
        ),
      }
    }

    const newProjectId = canonical.id as string

    // 2. Legacy mirror — same UUID. The legacy `projects` table has all
    //    columns nullable, so this is a thin row.
    const { error: legacyErr } = await supabase.from("projects").insert({
      id: newProjectId,
      name: `${name} — ${projectManager}`,
      client_name: clientName,
      internal_project_code: projectNumber,
      status: "planning",
      is_deleted: false,
    })

    if (legacyErr) {
      // Roll back the canonical insert so a retry doesn't get a duplicate
      // project_number error from the unique index.
      await supabase
        .from("erp_proj_projects")
        .delete()
        .eq("id", newProjectId)
        .eq("company_id", companyId)
      return {
        ok: false,
        error: describeError(
          legacyErr,
          "שמירה למאגר projects (legacy) נכשלה — בוצע rollback",
        ),
      }
    }

    return {
      ok: true,
      projectId: newProjectId,
      projectNumber: canonical.project_number as string,
    }
  } catch (err) {
    return {
      ok: false,
      error: describeError(err, "שגיאה לא צפויה ביצירת פרויקט"),
    }
  }
}

// ---------------------------------------------------------------------------
// Step 2 — create client contract
// ---------------------------------------------------------------------------

export async function createClientContractAction(
  input: CreateClientContractInput,
): Promise<CreateClientContractResult> {
  try {
    const auth = await authedClient()
    if (!auth.ok) return { ok: false, error: auth.error }
    const supabase = auth.supabase

    const projectId = nonEmpty(input.projectId, "מזהה פרויקט")
    const contractNumber = nonEmpty(input.contractNumber, "מספר חוזה")
    const title = nonEmpty(input.title, "כותרת חוזה")
    const clientName = nonEmpty(input.clientName, "שם הלקוח")
    const companyId = await resolveCompany(input.companyId)

    const totalAmount = Number(input.totalAmount)
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      return { ok: false, error: "סכום חוזה לא תקין" }
    }
    const retentionPct = clamp(Number(input.retentionPct ?? 0), 0, 100)
    const indexationPct = Math.max(0, Number(input.indexationPct ?? 0))
    const advancePaymentAmount = Math.max(
      0,
      Number(input.advancePaymentAmount ?? 0),
    )
    const advanceRepaymentPct = clamp(
      Number(input.advanceRepaymentPct ?? 0),
      0,
      100,
    )

    const { data, error } = await supabase
      .from("erp_client_contracts")
      .insert({
        company_id: companyId,
        project_id: projectId,
        contract_number: contractNumber,
        client_name: clientName,
        title,
        status: "DRAFT",
        indexation_pct: indexationPct,
        retention_pct: retentionPct,
        advance_payment_amount: advancePaymentAmount,
        advance_repayment_pct: advanceRepaymentPct,
        total_amount: totalAmount,
        start_date: input.startDate || null,
        end_date: input.endDate || null,
      })
      .select("id")
      .single()

    if (error || !data) {
      return {
        ok: false,
        error: describeError(error, "שמירת החוזה המסחרי נכשלה"),
      }
    }

    return { ok: true, contractId: data.id as string }
  } catch (err) {
    return {
      ok: false,
      error: describeError(err, "שגיאה לא צפויה ביצירת חוזה"),
    }
  }
}

// ---------------------------------------------------------------------------
// Step 3 — lock baseline & launch
// ---------------------------------------------------------------------------

export async function lockBaselineAndLaunchAction(
  input: LockBaselineInput,
): Promise<LockBaselineResult> {
  try {
    const auth = await authedClient()
    if (!auth.ok) return { ok: false, error: auth.error }
    const supabase = auth.supabase

    const projectId = nonEmpty(input.projectId, "מזהה פרויקט")
    const contractId = nonEmpty(input.contractId, "מזהה חוזה")
    const companyId = await resolveCompany(input.companyId)

    // Activate canonical project.
    const { error: canonicalErr } = await supabase
      .from("erp_proj_projects")
      .update({ status: "ACTIVE" })
      .eq("id", projectId)
      .eq("company_id", companyId)
    if (canonicalErr) {
      return {
        ok: false,
        error: describeError(
          canonicalErr,
          "הפעלת הפרויקט ב-erp_proj_projects נכשלה",
        ),
      }
    }

    // Activate legacy mirror so the list page (`status in ('planning',
    // 'active', 'on_hold')`) keeps showing it after launch.
    const { error: legacyErr } = await supabase
      .from("projects")
      .update({ status: "active" })
      .eq("id", projectId)
    if (legacyErr) {
      return {
        ok: false,
        error: describeError(
          legacyErr,
          "הפעלת הפרויקט במאגר projects (legacy) נכשלה",
        ),
      }
    }

    // Activate the client contract.
    const { error: contractErr } = await supabase
      .from("erp_client_contracts")
      .update({ status: "ACTIVE" })
      .eq("id", contractId)
      .eq("company_id", companyId)
    if (contractErr) {
      return {
        ok: false,
        error: describeError(
          contractErr,
          "הפעלת החוזה המסחרי נכשלה",
        ),
      }
    }

    // Refresh the projects list cache so the freshly-launched project
    // appears immediately on `/marker-ofek/projects`.
    try {
      revalidatePath("/marker-ofek/projects")
    } catch {
      /* ignore — best-effort */
    }

    return { ok: true, projectId }
  } catch (err) {
    return {
      ok: false,
      error: describeError(err, "שגיאה לא צפויה בהפעלת הפרויקט"),
    }
  }
}

// ---------------------------------------------------------------------------
// Step 3 helper — fetch the live records for the summary panel.
// ---------------------------------------------------------------------------

export type WizardSummary = {
  project: {
    id: string
    projectNumber: string
    name: string
    status: string
    startDate: string | null
    endDate: string | null
  } | null
  contract: {
    id: string
    contractNumber: string
    title: string
    clientName: string
    totalAmount: number
    retentionPct: number
    indexationPct: number
    advancePaymentAmount: number
    advanceRepaymentPct: number
    status: string
  } | null
}

export async function fetchWizardSummaryAction(input: {
  projectId: string
  contractId: string
  companyId?: CompanyContextId | null
}): Promise<{ ok: true; summary: WizardSummary } | { ok: false; error: string }> {
  try {
    const auth = await authedClient()
    if (!auth.ok) return { ok: false, error: auth.error }
    const supabase = auth.supabase
    const companyId = await resolveCompany(input.companyId)

    const [projectRes, contractRes] = await Promise.all([
      supabase
        .from("erp_proj_projects")
        .select("id, project_number, name, status, start_date, end_date")
        .eq("id", input.projectId)
        .eq("company_id", companyId)
        .maybeSingle(),
      supabase
        .from("erp_client_contracts")
        .select(
          "id, contract_number, title, client_name, total_amount, retention_pct, indexation_pct, advance_payment_amount, advance_repayment_pct, status",
        )
        .eq("id", input.contractId)
        .eq("company_id", companyId)
        .maybeSingle(),
    ])

    if (projectRes.error) {
      return {
        ok: false,
        error: describeError(projectRes.error, "טעינת סיכום פרויקט נכשלה"),
      }
    }
    if (contractRes.error) {
      return {
        ok: false,
        error: describeError(contractRes.error, "טעינת סיכום חוזה נכשלה"),
      }
    }

    const project = projectRes.data
      ? {
          id: projectRes.data.id as string,
          projectNumber: projectRes.data.project_number as string,
          name: projectRes.data.name as string,
          status: projectRes.data.status as string,
          startDate: (projectRes.data.start_date as string | null) ?? null,
          endDate: (projectRes.data.end_date as string | null) ?? null,
        }
      : null

    const contract = contractRes.data
      ? {
          id: contractRes.data.id as string,
          contractNumber: contractRes.data.contract_number as string,
          title: contractRes.data.title as string,
          clientName: contractRes.data.client_name as string,
          totalAmount: Number(contractRes.data.total_amount ?? 0),
          retentionPct: Number(contractRes.data.retention_pct ?? 0),
          indexationPct: Number(contractRes.data.indexation_pct ?? 0),
          advancePaymentAmount: Number(
            contractRes.data.advance_payment_amount ?? 0,
          ),
          advanceRepaymentPct: Number(
            contractRes.data.advance_repayment_pct ?? 0,
          ),
          status: contractRes.data.status as string,
        }
      : null

    return { ok: true, summary: { project, contract } }
  } catch (err) {
    return {
      ok: false,
      error: describeError(err, "טעינת הסיכום נכשלה"),
    }
  }
}

// ---------------------------------------------------------------------------
// Internal utils
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}
