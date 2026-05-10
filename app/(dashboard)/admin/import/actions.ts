"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { runDryRun, runCommit } from "@/lib/admin/import/engine"
import { parseFile, isParseError } from "@/lib/admin/import/parsers"
import { getImporterSpec } from "@/lib/admin/import/registry"
import type {
  ImportJobRow,
  ImporterEntityKind,
  RowError,
} from "@/lib/admin/import/types"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

async function resolveActiveCompanyId(): Promise<string> {
  const store = await cookies()
  const id = resolveCompanyContext(store.get(COMPANY_COOKIE_KEY)?.value)
  if (!id) throw new Error("חסר הקשר חברה. בחרו חברה פעילה.")
  return id
}

async function ensureAdminMembership(
  companyId: string,
): Promise<{ userId: string }> {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) throw new Error("נדרשת התחברות")

  const { data: mem, error } = await supabase
    .from("erp_user_company_memberships")
    .select("role,is_active")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) throw new Error(`שגיאה בבדיקת חברות: ${error.message}`)
  if (!mem || !mem.is_active) {
    throw new Error("אין לך גישה פעילה לחברה זו")
  }
  if (mem.role !== "admin") {
    throw new Error("רק admin של החברה יכול לבצע ייבוא נתונים")
  }
  return { userId: user.id }
}

/* -------------------------------------------------------------------------- */
/* List jobs                                                                  */
/* -------------------------------------------------------------------------- */

export async function listImportJobs(
  limit = 50,
): Promise<ImportJobRow[]> {
  const companyId = await resolveActiveCompanyId()
  const supabase = await createSupabaseServerAuthClient()

  const { data, error } = await supabase
    .from("erp_import_jobs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`שגיאה בטעינת משימות ייבוא: ${error.message}`)
  return (data ?? []) as ImportJobRow[]
}

/* -------------------------------------------------------------------------- */
/* Dry-run: parse + validate + create job in 'previewed' state                */
/* -------------------------------------------------------------------------- */

export type DryRunResult = {
  jobId: string
  rowsTotal: number
  rowsValid: number
  rowsError: number
  rowsSkipped: number
  previewRows: Record<string, unknown>[]
  errors: RowError[]
  unmappedHeaders: string[]
  missingRequiredFields: string[]
}

export async function dryRunImport(input: {
  entityKind: ImporterEntityKind
  fileName: string
  fileSizeBytes: number
  /** UTF-8 text for CSV; base64-encoded binary for XLSX. */
  fileContent: string
  encoding: "text" | "base64"
}): Promise<DryRunResult> {
  const companyId = await resolveActiveCompanyId()
  const { userId } = await ensureAdminMembership(companyId)

  const spec = getImporterSpec(input.entityKind)
  if (!spec) throw new Error(`Importer לא רשום: ${input.entityKind}`)

  const content =
    input.encoding === "base64"
      ? Buffer.from(input.fileContent, "base64")
      : input.fileContent
  const parsed = await parseFile(input.fileName, content)
  if (isParseError(parsed)) throw new Error(parsed.message)

  const dryRun = runDryRun(spec, parsed)

  // Persist a "previewed" job row + cache the validated payloads in
  // summary_text JSON so the commit step doesn't need to re-parse.
  const supabase = await createSupabaseServerAuthClient()
  const { data: jobInsert, error: insertErr } = await supabase
    .from("erp_import_jobs")
    .insert({
      company_id: companyId,
      entity_kind: input.entityKind,
      status: "previewed",
      file_name: input.fileName,
      file_size_bytes: input.fileSizeBytes,
      rows_total: dryRun.rowsTotal,
      rows_success: 0, // not yet committed
      rows_error: dryRun.rowsError,
      rows_skipped: dryRun.rowsSkipped,
      error_report: dryRun.errors,
      summary_text: JSON.stringify({
        unmappedHeaders: dryRun.unmappedHeaders,
        missingRequiredFields: dryRun.missingRequiredFields.map(String),
        validPayloads: dryRun.validPayloads,
      }),
      created_by: userId,
      previewed_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (insertErr || !jobInsert)
    throw new Error(`שגיאה ביצירת job: ${insertErr?.message ?? "unknown"}`)

  return {
    jobId: jobInsert.id,
    rowsTotal: dryRun.rowsTotal,
    rowsValid: dryRun.rowsValid,
    rowsError: dryRun.rowsError,
    rowsSkipped: dryRun.rowsSkipped,
    previewRows: dryRun.previewPayloads as unknown as Record<string, unknown>[],
    errors: dryRun.errors,
    unmappedHeaders: dryRun.unmappedHeaders,
    missingRequiredFields: dryRun.missingRequiredFields.map(String),
  }
}

/* -------------------------------------------------------------------------- */
/* Commit: run upsert against the cached payloads                             */
/* -------------------------------------------------------------------------- */

export type CommitResult = {
  jobId: string
  inserted: number
  updated: number
  failed: number
}

export async function commitImport(jobId: string): Promise<CommitResult> {
  const companyId = await resolveActiveCompanyId()
  await ensureAdminMembership(companyId)

  const supabase = await createSupabaseServerAuthClient()
  const { data: job, error: jobErr } = await supabase
    .from("erp_import_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("company_id", companyId)
    .single()

  if (jobErr || !job) throw new Error(`Job לא נמצא: ${jobErr?.message ?? jobId}`)
  if (job.status !== "previewed") {
    throw new Error(`Job בסטטוס "${job.status}" — לא ניתן לבצע commit`)
  }

  const spec = getImporterSpec(job.entity_kind as ImporterEntityKind)
  if (!spec) throw new Error(`Importer לא רשום: ${job.entity_kind}`)

  const summary = JSON.parse(job.summary_text ?? "{}") as {
    validPayloads: unknown[]
  }
  const payloads = (summary.validPayloads ?? []) as unknown[]

  const result = await runCommit(spec, supabase, companyId, payloads)

  const finalStatus = result.failed.length === 0 ? "committed" : "failed"
  const { error: updErr } = await supabase
    .from("erp_import_jobs")
    .update({
      status: finalStatus,
      rows_success: result.inserted + result.updated,
      rows_error: job.rows_error + result.failed.length,
      error_report: [...(job.error_report ?? []), ...result.failed],
      committed_at: finalStatus === "committed" ? new Date().toISOString() : null,
      failed_at: finalStatus === "failed" ? new Date().toISOString() : null,
    })
    .eq("id", jobId)
    .eq("company_id", companyId)

  if (updErr) throw new Error(`שגיאה בעדכון job: ${updErr.message}`)

  revalidatePath("/admin/import")

  return {
    jobId,
    inserted: result.inserted,
    updated: result.updated,
    failed: result.failed.length,
  }
}

export async function cancelImport(jobId: string): Promise<void> {
  const companyId = await resolveActiveCompanyId()
  await ensureAdminMembership(companyId)
  const supabase = await createSupabaseServerAuthClient()
  await supabase
    .from("erp_import_jobs")
    .update({ status: "cancelled" })
    .eq("id", jobId)
    .eq("company_id", companyId)
    .eq("status", "previewed")
  revalidatePath("/admin/import")
}
