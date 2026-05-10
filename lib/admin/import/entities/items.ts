/**
 * Items importer (`erp_md_items`).
 *
 * Source: Priority's LOGPART form (PARTNAME, PARTDES, UNAME, FAMILY).
 * Conflict key: `(company_id, item_number)`.
 *
 * Cross-entity dependency: each row references a `family_code` that must
 * already exist in `erp_md_product_families`. Resolution happens in
 * `upsert` (commit time, not dry-run) — failures become per-row errors.
 */
import { resolveProductFamilyIds, makeMissingLookupError } from "../lookups"
import type { ImporterSpec, RowError } from "../types"

const UPSERT_CHUNK = 200

export type ItemImportPayload = {
  item_number: string
  description: string
  unit_of_measure: string
  family_code: string
  is_inventory_managed: boolean
}

function transformInventoryFlag(raw: string): boolean {
  const t = raw.trim().toLowerCase()
  if (!t) return false
  if (["yes", "y", "true", "1", "כן", "פעיל"].includes(t)) return true
  if (["no", "n", "false", "0", "לא", "לא פעיל"].includes(t)) return false
  throw new Error(`ערך בוליאני לא חוקי: "${raw}". יש להשתמש ב-כן/לא.`)
}

export const ITEMS_IMPORTER: ImporterSpec<ItemImportPayload> = {
  kind: "items",
  title: "פריטים / מק״טים",
  description:
    "ייבוא פריטים. תלוי ב-product_families — חובה לייבא משפחות תחילה.",
  templateFileName: "items-template.csv",
  columns: [
    {
      field: "item_number",
      label: "מק״ט",
      aliases: ["מקט", "מק\"ט", "Item Number", "item_number", "PARTNAME"],
      required: true,
    },
    {
      field: "description",
      label: "תיאור",
      aliases: ["תיאור", "Description", "description", "PARTDES"],
      required: true,
    },
    {
      field: "unit_of_measure",
      label: "יחידת מידה",
      aliases: ["יחידת מידה", "יח\"מ", "UOM", "unit_of_measure", "UNAME"],
      required: true,
    },
    {
      field: "family_code",
      label: "קוד משפחה",
      aliases: ["קוד משפחה", "Family Code", "family_code", "FAMILY"],
      required: true,
    },
    {
      field: "is_inventory_managed",
      label: "מנוהל מלאי",
      aliases: ["מנוהל מלאי", "Inventory", "is_inventory_managed"],
      required: false,
      transform: transformInventoryFlag,
    },
  ],
  upsert: async (client, companyId, payloads) => {
    const failed: RowError[] = []
    let inserted = 0
    let updated = 0

    // Resolve family_code -> product_family_id in one batch.
    const familyMap = await resolveProductFamilyIds(
      client,
      companyId,
      payloads.map((p) => p.family_code),
    )

    // Filter out rows whose family didn't resolve; collect them as failures.
    const resolved: { p: ItemImportPayload; familyId: string; rowIdx: number }[] = []
    payloads.forEach((p, idx) => {
      const familyId = familyMap.get(p.family_code)
      if (!familyId) {
        failed.push(
          makeMissingLookupError(idx + 2, "family_code", p.family_code, "משפחת מוצר"),
        )
        return
      }
      resolved.push({ p, familyId, rowIdx: idx })
    })

    if (resolved.length === 0) return { inserted, updated, failed }

    // Existing-row accounting for accurate insert vs update counts.
    const numbers = resolved.map((r) => r.p.item_number)
    const { data: existing } = await client
      .from("erp_md_items")
      .select("item_number")
      .eq("company_id", companyId)
      .in("item_number", numbers)
    const existingSet = new Set(
      (existing ?? []).map((r: { item_number: string }) => r.item_number),
    )

    for (let i = 0; i < resolved.length; i += UPSERT_CHUNK) {
      const chunk = resolved.slice(i, i + UPSERT_CHUNK)
      const rows = chunk.map(({ p, familyId }) => ({
        company_id: companyId,
        item_number: p.item_number,
        description: p.description,
        unit_of_measure: p.unit_of_measure,
        product_family_id: familyId,
        is_inventory_managed: p.is_inventory_managed ?? false,
      }))
      const { error } = await client
        .from("erp_md_items")
        .upsert(rows, { onConflict: "company_id,item_number" })
      if (error) {
        failed.push({
          rowNumber: chunk[0].rowIdx + 2,
          field: null,
          message: `שגיאת DB ב-chunk שמתחיל בשורה ${chunk[0].rowIdx + 2}: ${error.message}`,
          rawValue: null,
        })
        continue
      }
      for (const { p } of chunk) {
        if (existingSet.has(p.item_number)) updated += 1
        else inserted += 1
      }
    }
    return { inserted, updated, failed }
  },
}
