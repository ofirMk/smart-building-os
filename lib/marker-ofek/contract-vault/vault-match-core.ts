import {
  embedTextForContractVault,
  vectorToPgString,
} from "@/lib/marker-ofek/contract-vault/gemini-contract-ingest"
import type { SupabaseClient } from "@supabase/supabase-js"

export type VaultMatchSnippet = {
  file_name: string
  excerpt: string
  similarity: number
}

/**
 * חיפוש וקטורי בכספת החוזה — ללא `"use server"` (שימוש מ־Route Handlers ופעולות שרת).
 */
export async function matchContractVaultDocumentsCore(
  supabase: SupabaseClient,
  input: {
    projectId: string
    query: string
    matchCount?: number
  }
): Promise<
  { ok: true; snippets: VaultMatchSnippet[] } | { ok: false; error: string }
> {
  const pid = input.projectId.trim()
  const q = input.query.trim()
  if (!pid || !q) return { ok: true, snippets: [] }

  try {
    const vec = await embedTextForContractVault(q)
    if (vec.length === 0) return { ok: true, snippets: [] }

    const limit = Math.min(20, Math.max(1, input.matchCount ?? 6))
    const { data, error } = await supabase.rpc("match_contract_vault_documents", {
      p_project_id: pid,
      query_embedding: vectorToPgString(vec),
      match_count: limit,
    })

    if (error) {
      if (/function|does not exist|rpc/i.test(error.message)) {
        return { ok: true, snippets: [] }
      }
      throw error
    }

    const rows = (data ?? []) as {
      file_name: string
      ocr_excerpt: string
      similarity: number
    }[]

    return {
      ok: true,
      snippets: rows.map((r) => ({
        file_name: r.file_name,
        excerpt: r.ocr_excerpt ?? "",
        similarity: Number(r.similarity) || 0,
      })),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
