"use server"

import { matchContractVaultDocumentsCore } from "@/lib/marker-ofek/contract-vault/vault-match-core"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

export type VaultAssistantSnippet = {
  file_name: string
  excerpt: string
  similarity: number
}

/**
 * Hook לעוזר AI: חיפוש מקטעים בכספת החוזה לפי שאילתה (וקטור + RPC).
 */
export async function matchContractVaultForAssistant(input: {
  projectId: string
  query: string
}): Promise<
  { ok: true; snippets: VaultAssistantSnippet[] } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const res = await matchContractVaultDocumentsCore(supabase, {
      projectId: input.projectId,
      query: input.query,
      matchCount: 6,
    })
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, snippets: res.snippets }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
