import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { DocumentRow } from "@/types/documents"

const SIGNED_URL_TTL_SEC = 3600

export async function getDocuments(): Promise<{
  data: DocumentRow[] | null
  error: string | null
}> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      return { data: null, error: error.message }
    }

    const rows = (data ?? []) as DocumentRow[]
    const withUrls: DocumentRow[] = []

    for (const d of rows) {
      const path = d.storage_path?.trim()
      if (!path) {
        withUrls.push({ ...d, file_url: "" })
        continue
      }
      const { data: signed, error: signErr } = await supabase.storage
        .from("documents")
        .createSignedUrl(path, SIGNED_URL_TTL_SEC)
      if (signErr || !signed?.signedUrl) {
        withUrls.push({ ...d, file_url: "" })
      } else {
        withUrls.push({ ...d, file_url: signed.signedUrl })
      }
    }

    return { data: withUrls, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: null, error: message }
  }
}
