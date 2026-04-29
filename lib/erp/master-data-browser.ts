import { readActiveCompanyIdFromCookie } from "@/lib/company-context"

type MasterDataEnvelope<T> = {
  data: T
  error?: string
}

function withCompanyHeaders(headers?: HeadersInit): Headers {
  const out = new Headers(headers ?? {})
  const activeCompanyId = readActiveCompanyIdFromCookie()
  if (activeCompanyId) {
    out.set("x-company-id", activeCompanyId)
    out.set("x-active-company-id", activeCompanyId)
  }
  return out
}

export async function masterDataFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: withCompanyHeaders(init?.headers),
  })
  const payload = (await response
    .json()
    .catch(() => ({}))) as MasterDataEnvelope<T>
  if (!response.ok) {
    throw new Error(payload.error ?? `Master data API error (${response.status})`)
  }
  return payload.data
}
