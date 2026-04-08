import Papa from "papaparse"

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

const UPSERT_CHUNK = 200

/** ברירת מחדל כשאין מטבע בקובץ (שקל) */
const DEFAULT_CURRENCY_CODE = "ILS"

type ColumnDef = {
  field: keyof CustomerEntityUpsertPayload
  aliases: string[]
}

/** שדות ל-upsert — `type` תמיד client */
export type CustomerEntityUpsertPayload = {
  name: string
  type: "client"
  erp_customer_number: string
  status_he: string | null
  account_manager: string | null
  tax_id: string | null
  legal_id: string | null
  currency_code: string | null
  vat_code: string | null
  phone: string | null
  fax: string | null
  email: string | null
  address_line_1: string | null
  city: string | null
  zip_code: string | null
  address: string | null
  billing_address: string | null
  contact_info: Record<string, unknown>
  is_deleted: boolean
}

const COLUMN_DEFS: ColumnDef[] = [
  { field: "erp_customer_number", aliases: ["מספר לקוח", "Customer Number", "customer_number", "ERP #", "מס' לקוח"] },
  { field: "name", aliases: ["שם לקוח", "Customer Name", "name", "שם", "לקוח"] },
  { field: "status_he", aliases: ["סטטוס", "Status", "status", "מצב"] },
  { field: "account_manager", aliases: ["מנהל לקוח", "Account Manager", "אחראי", "מנהל"] },
  { field: "tax_id", aliases: ["ח.פ", "ע.מ", "מספר זהות", "Tax ID", "tax_id", "חפ", "מס. ח.פ"] },
  { field: "phone", aliases: ["טלפון", "Phone", "phone", "נייד"] },
  { field: "fax", aliases: ["פקס", "Fax", "fax"] },
  { field: "email", aliases: ["דואל", 'דוא"ל', "Email", "email", "מייל"] },
  { field: "address_line_1", aliases: ["כתובת", "Address", "address", "רחוב", "כתובת 1"] },
  { field: "city", aliases: ["עיר", "City", "city"] },
  { field: "zip_code", aliases: ["מיקוד", "Zip", "zip", "ZIP", "מיקוד דואר"] },
  { field: "currency_code", aliases: ["מטבע", "Currency", "currency", "מטבע ברירת מחדל"] },
  { field: "vat_code", aliases: ["קוד מעמ", "מעמ", "VAT", "vat_code", "סיווג מעמ", "מע\"מ"] },
]

export type CustomersCsvImportResult =
  | { ok: true; upserted: number; skipped: number; warnings: string[] }
  | { ok: false; error: string }

function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1)
  return text
}

function normalizeHeaderKey(key: string): string {
  return stripBom(key).trim().replace(/\s+/g, " ")
}

function buildHeaderFieldMap(headers: string[]): Map<string, keyof CustomerEntityUpsertPayload> {
  const map = new Map<string, keyof CustomerEntityUpsertPayload>()
  const normHeaders = headers.map((h) => normalizeHeaderKey(h))

  for (let i = 0; i < normHeaders.length; i++) {
    const raw = headers[i] ?? ""
    const n = normHeaders[i] ?? ""
    for (const def of COLUMN_DEFS) {
      if (def.aliases.some((a) => a === n || a === raw.trim())) {
        if (!map.has(n)) map.set(n, def.field)
        break
      }
    }
  }
  return map
}

function cellValue(
  row: Record<string, string>,
  headers: string[],
  fieldMap: Map<string, keyof CustomerEntityUpsertPayload>,
  field: keyof CustomerEntityUpsertPayload
): string {
  for (const h of headers) {
    const nk = normalizeHeaderKey(h)
    if (fieldMap.get(nk) === field) {
      const v = row[h]
      if (v == null) continue
      const s = String(v).trim()
      if (s !== "") return s
    }
  }
  return ""
}

/** מיפוי תצוגת מטבע ERP (שקל / דולר) לקוד ISO ב־erp_currencies */
export function normalizeErpCurrencyCode(raw: string): string | null {
  const t = raw.trim().toUpperCase()
  if (!t) return null
  if (t === "ILS" || t === "NIS" || t.includes("שקל") || /ש[\u0022\u201C\u201D']ח/.test(raw.trim()))
    return "ILS"
  if (t === "USD" || t.includes("דולר") || t === "DOLLAR") return "USD"
  if (t === "EUR" || t.includes("יורו")) return "EUR"
  if (t === "GBP") return "GBP"
  return null
}

function formatBillingAddress(
  line1: string,
  city: string,
  zip: string
): string | null {
  const parts = [line1, city, zip].map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return null
  return parts.join(", ")
}

function csvRowToPayload(
  row: Record<string, string>,
  headers: string[],
  fieldMap: Map<string, keyof CustomerEntityUpsertPayload>,
  rowIndex: number,
  warnings: string[]
): CustomerEntityUpsertPayload | null {
  const erp_customer_number = cellValue(row, headers, fieldMap, "erp_customer_number")
  if (!erp_customer_number) {
    warnings.push(`שורה ${rowIndex + 2}: חסר מספר לקוח — דולג`)
    return null
  }

  const name = cellValue(row, headers, fieldMap, "name")
  if (!name) {
    warnings.push(`שורה ${rowIndex + 2} (${erp_customer_number}): חסר שם — דולג`)
    return null
  }

  const taxRaw = cellValue(row, headers, fieldMap, "tax_id")
  const status_he = cellValue(row, headers, fieldMap, "status_he") || null
  const account_manager = cellValue(row, headers, fieldMap, "account_manager") || null
  const phone = cellValue(row, headers, fieldMap, "phone") || null
  const fax = cellValue(row, headers, fieldMap, "fax") || null
  const email = cellValue(row, headers, fieldMap, "email") || null
  const address_line_1 = cellValue(row, headers, fieldMap, "address_line_1") || null
  const city = cellValue(row, headers, fieldMap, "city") || null
  const zip_code = cellValue(row, headers, fieldMap, "zip_code") || null
  const currencyRaw = cellValue(row, headers, fieldMap, "currency_code")
  const vat_code = cellValue(row, headers, fieldMap, "vat_code") || null

  let currency_code = currencyRaw ? normalizeErpCurrencyCode(currencyRaw) : null
  if (currencyRaw && !currency_code) {
    warnings.push(
      `שורה ${rowIndex + 2} (${erp_customer_number}): מטבע לא מזוהה "${currencyRaw}" — יושם ${DEFAULT_CURRENCY_CODE}`
    )
    currency_code = DEFAULT_CURRENCY_CODE
  }
  if (!currency_code) currency_code = DEFAULT_CURRENCY_CODE

  const tax_id = taxRaw || null
  const legal_id = taxRaw || null

  const billing_address = formatBillingAddress(
    address_line_1 ?? "",
    city ?? "",
    zip_code ?? ""
  )
  const address = billing_address

  const contact_info: Record<string, unknown> = {}
  if (phone) contact_info.phone = phone
  if (fax) contact_info.fax = fax
  if (email) contact_info.email = email

  return {
    name,
    type: "client",
    erp_customer_number,
    status_he,
    account_manager,
    tax_id,
    legal_id,
    currency_code,
    vat_code,
    phone,
    fax,
    email,
    address_line_1,
    city,
    zip_code,
    address,
    billing_address,
    contact_info,
    is_deleted: false,
  }
}

/**
 * ייבוא CSV לקוחות (לקוחות Priority): upsert לפי `erp_customer_number` לישויות `type = client`.
 * דורש `SUPABASE_SERVICE_ROLE_KEY`.
 */
export async function parseAndUpsertCustomersCsv(
  csvContent: string
): Promise<CustomersCsvImportResult> {
  const text = stripBom(csvContent ?? "")
  if (!text.trim()) {
    return { ok: false, error: "קובץ ריק" }
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => normalizeHeaderKey(h),
  })

  if (parsed.errors?.length) {
    const fatal = parsed.errors.find((e) => e.type === "Quotes" || e.type === "FieldMismatch")
    if (fatal) {
      return { ok: false, error: `שגיאת CSV: ${fatal.message}` }
    }
  }

  const rows =
    parsed.data?.filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== "")) ?? []
  const headerList = parsed.meta.fields ?? []
  if (!headerList.length || !rows.length) {
    return { ok: false, error: "לא נמצאו כותרות או שורות נתונים" }
  }

  const fieldMap = buildHeaderFieldMap(headerList)
  if (![...fieldMap.values()].includes("erp_customer_number")) {
    return {
      ok: false,
      error: 'חובה עמודת מספר לקוח (למשל "מספר לקוח" או Customer Number)',
    }
  }
  if (![...fieldMap.values()].includes("name")) {
    return {
      ok: false,
      error: 'חובה עמודת שם (למשל "שם לקוח" או Customer Name)',
    }
  }

  const warnings: string[] = []
  const payloads: CustomerEntityUpsertPayload[] = []
  let skipped = 0

  for (let i = 0; i < rows.length; i++) {
    const p = csvRowToPayload(rows[i], headerList, fieldMap, i, warnings)
    if (p) payloads.push(p)
    else skipped++
  }

  if (!payloads.length) {
    return { ok: false, error: "אין שורות תקינות לייבוא" }
  }

  const supabase = createSupabaseServiceRoleClient()
  let upserted = 0

  for (let i = 0; i < payloads.length; i += UPSERT_CHUNK) {
    const chunk = payloads.slice(i, i + UPSERT_CHUNK)
    const { error } = await supabase.from("entities").upsert(chunk, {
      onConflict: "erp_customer_number",
    })
    if (error) {
      return { ok: false, error: error.message || String(error) }
    }
    upserted += chunk.length
  }

  return { ok: true, upserted, skipped, warnings }
}
