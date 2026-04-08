import "server-only"

/**
 * ניכוי במקור / ציות ספקים — שאילתת מאגר מידע פתוח (data.gov.il / CKAN).
 * מזהה משאב (resource_id) משתנה לפי עדכוני הרשות — יש להגדיר ב־ISRAEL_TAX_REGISTRY_RESOURCE_ID.
 *
 * דוגמאות למציאת resource_id: פורטל data.gov.il → ערכת נתונים → API → datastore_search.
 */

const CKAN_SEARCH = "https://data.gov.il/api/3/action/datastore_search"

export type VendorTaxOpenDataResult = {
  found: boolean
  /** שם רשום במאגר (אם זוהה) */
  registeredName: string | null
  /** שדות גולמיים לניתוח נוסף (ניכוי במקור, סטטוס וכו׳) */
  raw: Record<string, unknown> | null
  /** טקסט הסבר אם יש רמז לניכוי במקור בשדות */
  withholdingHint: string | null
}

function normalizeIsraelTaxId(raw: string): string {
  const d = raw.replace(/\D/g, "")
  if (d.length === 0) return ""
  return d.padStart(9, "0").slice(-9)
}

function pickRegisteredName(rec: Record<string, unknown>): string | null {
  const keys = [
    "שם",
    "שם_עוסק",
    "שם עוסק",
    "שם חברה",
    "שם העסק",
    "שם העוסק",
    "שם תאגיד",
    "name",
    "shem",
  ]
  for (const k of keys) {
    const v = rec[k]
    if (typeof v === "string" && v.trim().length > 1) return v.trim()
  }
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v !== "string" || v.trim().length < 2) continue
    if (/מספר|עוסק|ח\.פ|כתובת|רחוב|מיקוד|ת\.ד/i.test(k)) continue
    if (/[\u0590-\u05FF]/.test(v)) return v.trim()
  }
  return null
}

function pickWithholdingHint(rec: Record<string, unknown>): string | null {
  const keys = ["ניכוי במקור", "ניכוי_במקור", "אחוז ניכוי", "החזקה במקור"]
  for (const k of keys) {
    const v = rec[k]
    if (v != null && String(v).trim() !== "") {
      return `${k}: ${String(v).trim()}`
    }
  }
  return null
}

type CkanSearchJson = {
  success?: boolean
  result?: { records?: Record<string, unknown>[] }
  error?: { message?: string }
}

async function ckanSearch(params: URLSearchParams): Promise<CkanSearchJson> {
  const url = `${CKAN_SEARCH}?${params.toString()}`
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "smart-building-os/1.0 (ERP; tax-compliance)",
    },
    signal: AbortSignal.timeout(22_000),
    next: { revalidate: 0 },
  })
  if (!res.ok) {
    return {
      success: false,
      error: { message: `data.gov.il HTTP ${res.status}` },
    }
  }
  return (await res.json()) as CkanSearchJson
}

/**
 * משיכת סטטוס / שם רשום לפי ח.פ. או מספר עוסק ממאגר CKAN.
 */
export async function fetchVendorTaxStatusFromOpenData(
  taxId: string
): Promise<
  | { ok: true; data: VendorTaxOpenDataResult }
  | { ok: false; error: string }
> {
  const id = normalizeIsraelTaxId(taxId)
  if (id.length !== 9) {
    return { ok: false, error: "ח.פ./ע.מ. לא תקין" }
  }

  const resourceId = process.env.ISRAEL_TAX_REGISTRY_RESOURCE_ID?.trim()
  if (!resourceId) {
    return {
      ok: false,
      error:
        "לא הוגדר ISRAEL_TAX_REGISTRY_RESOURCE_ID — הוסיפו מזהה משאב CKAN מ־data.gov.il (מאגר עוסקים/חברות).",
    }
  }

  const fieldTax =
    process.env.ISRAEL_TAX_REGISTRY_FIELD_TAX_ID?.trim() || "מספר עוסק"

  try {
    const filters = new URLSearchParams()
    filters.set("resource_id", resourceId)
    filters.set("limit", "8")
    filters.set("filters", JSON.stringify({ [fieldTax]: id }))

    let json = await ckanSearch(filters)
    let records = json.result?.records ?? []

    if (!json.success) {
      return {
        ok: false,
        error: json.error?.message ?? "שגיאת CKAN",
      }
    }

    if (records.length === 0) {
      const q = new URLSearchParams()
      q.set("resource_id", resourceId)
      q.set("limit", "8")
      q.set("q", id)
      json = await ckanSearch(q)
      if (!json.success) {
        return { ok: false, error: json.error?.message ?? "שגיאת CKAN" }
      }
      records = json.result?.records ?? []
    }

    if (records.length === 0) {
      return {
        ok: true,
        data: {
          found: false,
          registeredName: null,
          raw: null,
          withholdingHint: null,
        },
      }
    }

    const first = records[0]!
    return {
      ok: true,
      data: {
        found: true,
        registeredName: pickRegisteredName(first),
        raw: first,
        withholdingHint: pickWithholdingHint(first),
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || "קריאה למאגר נכשלה" }
  }
}
