/**
 * Product Families importer (`erp_md_product_families`).
 *
 * Trivial parent-table for items. Conflict key: `(company_id, family_code)`.
 * Lihtman's Priority installation may not have an explicit "families" concept;
 * in that case, derive from item-number prefixes pre-import (offline).
 */
import type { ImporterSpec, RowError } from "../types"

const UPSERT_CHUNK = 200

export type ProductFamilyImportPayload = {
  family_code: string
  name: string
}

export const PRODUCT_FAMILIES_IMPORTER: ImporterSpec<ProductFamilyImportPayload> = {
  kind: "product_families",
  title: "משפחות מוצר",
  description:
    "טבלת אב של פריטים. ייבאו תחילה — לפני items. Conflict key: family_code.",
  templateFileName: "product-families-template.csv",
  columns: [
    {
      field: "family_code",
      label: "קוד משפחה",
      aliases: ["קוד משפחה", "Family Code", "family_code", "FAMNAME"],
      required: true,
    },
    {
      field: "name",
      label: "שם משפחה",
      aliases: ["שם משפחה", "Family Name", "name", "FAMDES"],
      required: true,
    },
  ],
  upsert: async (client, companyId, payloads) => {
    const failed: RowError[] = []
    let inserted = 0
    let updated = 0

    const codes = payloads.map((p) => p.family_code)
    const { data: existing } = await client
      .from("erp_md_product_families")
      .select("family_code")
      .eq("company_id", companyId)
      .in("family_code", codes)
    const existingSet = new Set(
      (existing ?? []).map((r: { family_code: string }) => r.family_code),
    )

    for (let i = 0; i < payloads.length; i += UPSERT_CHUNK) {
      const chunk = payloads.slice(i, i + UPSERT_CHUNK)
      const rows = chunk.map((p) => ({
        company_id: companyId,
        family_code: p.family_code,
        name: p.name,
      }))
      const { error } = await client
        .from("erp_md_product_families")
        .upsert(rows, { onConflict: "company_id,family_code" })
      if (error) {
        failed.push({
          rowNumber: i + 2,
          field: null,
          message: `שגיאת DB ב-chunk שמתחיל בשורה ${i + 2}: ${error.message}`,
          rawValue: null,
        })
        continue
      }
      for (const p of chunk) {
        if (existingSet.has(p.family_code)) updated += 1
        else inserted += 1
      }
    }
    return { inserted, updated, failed }
  },
}
