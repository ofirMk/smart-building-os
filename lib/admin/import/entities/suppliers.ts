/**
 * Suppliers importer (`erp_md_suppliers`).
 *
 * Source: Priority's SUPPLIERS form export. Common headers in Hebrew:
 *   "מספר ספק", "שם ספק", "ח.פ", "טלפון", "כתובת", "מייל", "תנאי תשלום".
 *
 * Conflict key: `(company_id, supplier_number)` (unique index in DB).
 * On collision: UPDATE non-null fields. New rows: INSERT.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { ImporterSpec, RowError } from "../types"

const UPSERT_CHUNK = 200

export type SupplierImportPayload = {
  supplier_number: string
  name: string
  supplier_kind: "supplier" | "subcontractor"
  foreign_name: string | null
  tax_vat_id: string | null
  phone: string | null
  email: string | null
  address: string | null
  payment_terms: string | null
}

const ALLOWED_KINDS = new Set(["supplier", "subcontractor"])

function transformKind(raw: string): SupplierImportPayload["supplier_kind"] {
  const t = raw.trim().toLowerCase()
  if (!t) return "supplier"
  if (t === "subcontractor" || t.includes("קבלן") || t.includes("משנה")) {
    return "subcontractor"
  }
  if (t === "supplier" || t.includes("ספק")) return "supplier"
  if (!ALLOWED_KINDS.has(t)) {
    throw new Error(`סוג ספק לא חוקי: "${raw}". יש להשתמש ב-"ספק" או "קבלן משנה".`)
  }
  return t as SupplierImportPayload["supplier_kind"]
}

function transformEmail(raw: string): string {
  const t = raw.trim().toLowerCase()
  if (!t) return ""
  // Permissive validation — Priority exports often contain spaces / commas.
  // Reject only obvious non-emails.
  if (!t.includes("@") || !t.includes(".")) {
    throw new Error(`כתובת מייל לא תקינה: "${raw}"`)
  }
  return t
}

function transformPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "")
  if (!digits) return ""
  if (digits.replace(/\D/g, "").length < 7) {
    throw new Error(`מספר טלפון קצר מדי: "${raw}"`)
  }
  return digits
}

function transformTaxId(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (!digits) return ""
  if (digits.length < 8 || digits.length > 9) {
    throw new Error(`ח.פ / ע.מ לא תקין (חייב 8-9 ספרות): "${raw}"`)
  }
  return digits
}

export const SUPPLIERS_IMPORTER: ImporterSpec<SupplierImportPayload> = {
  kind: "suppliers",
  title: "ספקים וקבלני משנה",
  description:
    "ייבוא ספקים מ-Priority. ה-conflict key הוא (company_id, supplier_number) — שורה קיימת תעודכן.",
  templateFileName: "suppliers-template.csv",
  columns: [
    {
      field: "supplier_number",
      label: "מספר ספק",
      aliases: ["מספר ספק", "מס ספק", "Supplier Number", "supplier_number", "SUPNAME"],
      required: true,
    },
    {
      field: "name",
      label: "שם ספק",
      aliases: ["שם ספק", "שם", "Supplier Name", "name", "SUPDES"],
      required: true,
    },
    {
      field: "supplier_kind",
      label: "סוג",
      aliases: ["סוג", "kind", "Type", "supplier_kind"],
      required: false,
      transform: transformKind,
    },
    {
      field: "foreign_name",
      label: "שם בלועזית",
      aliases: ["שם בלועזית", "Foreign Name", "foreign_name", "EngName"],
      required: false,
    },
    {
      field: "tax_vat_id",
      label: "ח.פ / ע.מ",
      aliases: ["ח.פ", "חפ", "ע.מ", "Tax ID", "VAT", "tax_vat_id", "VATNUM"],
      required: false,
      transform: transformTaxId,
    },
    {
      field: "phone",
      label: "טלפון",
      aliases: ["טלפון", "Phone", "phone", "TELNO"],
      required: false,
      transform: transformPhone,
    },
    {
      field: "email",
      label: "אימייל",
      aliases: ['דוא"ל', "מייל", "Email", "email", "EMAIL"],
      required: false,
      transform: transformEmail,
    },
    {
      field: "address",
      label: "כתובת",
      aliases: ["כתובת", "Address", "address", "ADDRESS"],
      required: false,
    },
    {
      field: "payment_terms",
      label: "תנאי תשלום",
      aliases: ["תנאי תשלום", "Payment Terms", "payment_terms"],
      required: false,
    },
  ],
  upsert: async (client, companyId, payloads) => {
    const failed: RowError[] = []
    let inserted = 0
    let updated = 0

    // Pre-fetch existing supplier_numbers in this company for accurate
    // insert-vs-update accounting (Supabase upsert returns combined count).
    const allNumbers = payloads.map((p) => p.supplier_number)
    const { data: existing } = await client
      .from("erp_md_suppliers")
      .select("supplier_number")
      .eq("company_id", companyId)
      .in("supplier_number", allNumbers)
    const existingSet = new Set(
      (existing ?? []).map((r: { supplier_number: string }) => r.supplier_number),
    )

    for (let i = 0; i < payloads.length; i += UPSERT_CHUNK) {
      const chunk = payloads.slice(i, i + UPSERT_CHUNK)
      const rows = chunk.map((p) => ({
        company_id: companyId,
        supplier_number: p.supplier_number,
        name: p.name,
        supplier_kind: p.supplier_kind ?? "supplier",
        foreign_name: p.foreign_name,
        tax_vat_id: p.tax_vat_id,
        phone: p.phone,
        email: p.email,
        address: p.address,
        payment_terms: p.payment_terms,
      }))

      const { error } = await client
        .from("erp_md_suppliers")
        .upsert(rows, { onConflict: "company_id,supplier_number" })

      if (error) {
        // Whole chunk failed — record one error referencing the first row.
        failed.push({
          rowNumber: i + 2,
          field: null,
          message: `שגיאת DB ב-chunk שמתחיל בשורה ${i + 2}: ${error.message}`,
          rawValue: null,
        })
        continue
      }

      for (const p of chunk) {
        if (existingSet.has(p.supplier_number)) updated += 1
        else inserted += 1
      }
    }

    return { inserted, updated, failed }
  },
}
