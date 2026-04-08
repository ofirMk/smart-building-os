/**
 * Israel Tax Authority — allocation / digital invoice bridge (Mivzak / רשות המסים).
 * OAuth2 + allocation request. When credentials or API are unavailable, returns
 * structured offline/pending so the ERP can keep working (PENDING_ALLOCATION).
 */

import { createHash } from "crypto"

export type IsraelTaxApiErrorCode =
  | "INVALID_TAX_ID"
  | "SYSTEM_MAINTENANCE"
  | "UNAUTHORIZED"
  | "NETWORK"
  | "UNKNOWN"

export type AllocationRequestInput = {
  /** Stable hash payload (canonical JSON) */
  invoiceHash: string
  /** Issuer VAT / tax id (עוסק מורשה) */
  issuerTaxId: string
  /** Customer tax id (ח.פ / ע.מ) */
  customerTaxId: string | null
  /** Gross total in NIS (incl. VAT for display / reporting) */
  totalNis: number
  /** Invoice UUID in our DB */
  invoiceId: string
}

export type AllocationSuccess = {
  ok: true
  allocationNumber: string
  taxAuthorityRef: string
  raw?: Record<string, unknown>
}

export type AllocationFailure = {
  ok: false
  code: IsraelTaxApiErrorCode
  message: string
  /** When true, UI should set status PENDING_ALLOCATION and retry later */
  offlineMode: boolean
}

export type AllocationResult = AllocationSuccess | AllocationFailure

let cachedToken: { token: string; expiresAtMs: number } | null = null

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined
}

/**
 * Canonical SHA-256 over invoice payload for רשות המסים.
 */
export function canonicalInvoiceHash(input: {
  invoiceId: string
  issuerTaxId: string
  customerTaxId: string | null
  lines: unknown
  totals: { subtotal: number; vat: number; total: number }
  issueDate: string
}): string {
  const canonical = JSON.stringify({
    v: 1,
    invoice_id: input.invoiceId,
    issuer_tax_id: input.issuerTaxId.replace(/\s/g, ""),
    customer_tax_id: input.customerTaxId?.replace(/\s/g, "") ?? null,
    lines: input.lines,
    totals: input.totals,
    issue_date: input.issueDate,
  })
  return createHash("sha256").update(canonical, "utf8").digest("hex")
}

async function fetchOAuthToken(): Promise<
  { ok: true; accessToken: string } | { ok: false; code: IsraelTaxApiErrorCode; message: string }
> {
  const clientId = env("ISRAEL_TAX_AUTHORITY_CLIENT_ID")
  const clientSecret = env("ISRAEL_TAX_AUTHORITY_CLIENT_SECRET")
  const tokenUrl =
    env("ISRAEL_TAX_AUTHORITY_TOKEN_URL") ??
    "https://ita-api.tax.gov.il/oauth/token"

  if (!clientId || !clientSecret) {
    return {
      ok: false,
      code: "UNKNOWN",
      message: "חסרים משתני סביבה ל-OAuth2 של רשות המסים",
    }
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: env("ISRAEL_TAX_AUTHORITY_SCOPE") ?? "allocation",
  })

  try {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(25_000),
    })
    const json = (await res.json()) as {
      access_token?: string
      expires_in?: number
      error?: string
      error_description?: string
    }
    if (!res.ok || !json.access_token) {
      const msg =
        json.error_description ||
        json.error ||
        `HTTP ${res.status} — אימות מול רשות המסים נכשל`
      return {
        ok: false,
        code: res.status === 401 ? "UNAUTHORIZED" : "UNKNOWN",
        message: msg,
      }
    }
    return { ok: true, accessToken: json.access_token }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      code: "NETWORK",
      message: msg,
    }
  }
}

async function getOAuthAccessToken(): Promise<string | null> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAtMs > now + 5_000) {
    return cachedToken.token
  }
  const tok = await fetchOAuthToken()
  if (!tok.ok) {
    return null
  }
  cachedToken = {
    token: tok.accessToken,
    expiresAtMs: now + 3_600_000,
  }
  return tok.accessToken
}

/**
 * Requests a mandatory allocation UID (2026 framework). When credentials are missing
 * or the authority returns maintenance/invalid, returns offlineMode for graceful UX.
 */
export async function requestAllocationNumber(
  input: AllocationRequestInput
): Promise<AllocationResult> {
  const mockMode = env("ISRAEL_TAX_AUTHORITY_MOCK") === "1"
  const apiBase =
    env("ISRAEL_TAX_AUTHORITY_API_BASE") ?? "https://ita-api.tax.gov.il/v1"

  if (mockMode) {
    const suffix = input.invoiceHash.slice(0, 16).toUpperCase()
    return {
      ok: true,
      allocationNumber: `IL-ALLOC-${suffix}`,
      taxAuthorityRef: `MIVZAK-${input.invoiceId.slice(0, 8)}`,
      raw: { mock: true },
    }
  }

  let access = await getOAuthAccessToken()
  if (!access) {
    const oauth = await fetchOAuthToken()
    if (!oauth.ok) {
      const code: IsraelTaxApiErrorCode =
        oauth.code === "UNAUTHORIZED" ? "UNAUTHORIZED" : "SYSTEM_MAINTENANCE"
      return {
        ok: false,
        code,
        message: oauth.message,
        offlineMode: true,
      }
    }
    const now = Date.now()
    cachedToken = { token: oauth.accessToken, expiresAtMs: now + 3_600_000 }
    access = oauth.accessToken
  }

  if (!access) {
    return {
      ok: false,
      code: "SYSTEM_MAINTENANCE",
      message:
        "לא ניתן להתחבר לרשות המסים כרגע. ניתן לשמור במצב ממתין להקצאה ולנסות שוב.",
      offlineMode: true,
    }
  }

  const url = `${apiBase.replace(/\/$/, "")}/allocations/request`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        invoice_hash: input.invoiceHash,
        issuer_tax_id: input.issuerTaxId.replace(/\s/g, ""),
        customer_tax_id: input.customerTaxId?.replace(/\s/g, "") ?? null,
        total_nis: input.totalNis,
        invoice_id: input.invoiceId,
      }),
      signal: AbortSignal.timeout(45_000),
    })

    const text = await res.text()
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      /* ignore */
    }

    if (res.status === 503 || res.status === 502) {
      return {
        ok: false,
        code: "SYSTEM_MAINTENANCE",
        message: "מערכת רשות המסים בתחזוקה או לא זמינה. נשמר מצב ממתין להקצאה.",
        offlineMode: true,
      }
    }

    if (res.status === 400 || res.status === 422) {
      const errCode = String(data.error_code ?? data.code ?? "")
      if (/tax|מס|invalid/i.test(errCode) || /invalid/i.test(text)) {
        return {
          ok: false,
          code: "INVALID_TAX_ID",
          message:
            "מספר עוסק / ח.פ לא תקין לפי רשות המסים. בדקו את הלקוח ונסו שוב.",
          offlineMode: false,
        }
      }
      return {
        ok: false,
        code: "UNKNOWN",
        message: String(data.message ?? (text || "בקשה נדחתה")),
        offlineMode: false,
      }
    }

    if (!res.ok) {
      return {
        ok: false,
        code: "SYSTEM_MAINTENANCE",
        message: `שגיאת רשות המסים (${res.status})`,
        offlineMode: true,
      }
    }

    const allocationNumber =
      String(
        data.allocation_number ?? data.allocationNumber ?? data.uid ?? ""
      ).trim() || ""
    const taxAuthorityRef =
      String(
        data.tax_authority_ref ?? data.taxAuthorityRef ?? data.reference ?? ""
      ).trim() || ""

    if (!allocationNumber) {
      return {
        ok: false,
        code: "UNKNOWN",
        message: "תגובה חסרה ממספר הקצאה",
        offlineMode: true,
      }
    }

    return {
      ok: true,
      allocationNumber,
      taxAuthorityRef: taxAuthorityRef || `REF-${input.invoiceId.slice(0, 8)}`,
      raw: data,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      code: "NETWORK",
      message: msg,
      offlineMode: true,
    }
  }
}

/** Threshold (NIS) above which allocation is mandatory in product rules */
export const ALLOCATION_REQUIRED_ABOVE_NIS = 25_000
