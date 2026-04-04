"use server"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

import type { AiActionKind, AiModuleId } from "@/lib/marker-ofek/ai/registry"

export type MoAiJobResultRow = {
  id: string
  module: AiModuleId
  action_kind: AiActionKind | string
  project_id: string | null
  contract_id: string | null
  reference_id: string | null
  reference_label: string | null
  source_storage_path: string | null
  input_summary: Record<string, unknown>
  result_json: Record<string, unknown>
  status: string
  error_message: string | null
  created_by: string | null
  created_at: string
}

export async function insertMoAiJobResult(params: {
  module: AiModuleId
  actionKind: AiActionKind | string
  projectId?: string | null
  contractId?: string | null
  referenceId?: string | null
  referenceLabel?: string | null
  sourceStoragePath?: string | null
  inputSummary?: Record<string, unknown>
  resultJson: Record<string, unknown>
  status?: "pending" | "processing" | "completed" | "failed"
  errorMessage?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data, error } = await supabase
      .from("mo_ai_job_results")
      .insert({
        module: params.module,
        action_kind: params.actionKind,
        project_id: params.projectId ?? null,
        contract_id: params.contractId ?? null,
        reference_id: params.referenceId ?? null,
        reference_label: params.referenceLabel ?? null,
        source_storage_path: params.sourceStoragePath ?? null,
        input_summary: params.inputSummary ?? {},
        result_json: params.resultJson,
        status: params.status ?? "completed",
        error_message: params.errorMessage ?? null,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (error) throw error
    const id = (data as { id: string }).id
    return { ok: true, id }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function listMoAiJobResultsForProject(params: {
  projectId: string
  module?: AiModuleId
  limit?: number
}): Promise<
  { ok: true; rows: MoAiJobResultRow[] } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const pid = params.projectId.trim()
    if (!pid) return { ok: false, error: "חסר מזהה פרויקט" }

    let q = supabase
      .from("mo_ai_job_results")
      .select("*")
      .eq("project_id", pid)
      .order("created_at", { ascending: false })
      .limit(Math.min(100, Math.max(1, params.limit ?? 30)))

    if (params.module) {
      q = q.eq("module", params.module)
    }

    const { data, error } = await q
    if (error) throw error
    return { ok: true, rows: (data ?? []) as MoAiJobResultRow[] }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
