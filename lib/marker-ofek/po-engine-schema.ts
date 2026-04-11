import { z } from "zod"

/** Phase 2.1 — budget lock threshold (₪), compared to PO total כולל מע״מ */
export const PROJECT_BUDGET_LIMIT_NIS = 50_000

/** מע״מ לתצוגה ולסיכום (דמו) */
export const PO_ENGINE_VAT_RATE = 0.17

export const MOCK_PO_SUPPLIERS = [
  { id: "sup_alpha", name: "אלפא ספקים בע\"מ" },
  { id: "sup_beta", name: "בטא חומרי בניין" },
  { id: "sup_gamma", name: "גמא לוגיסטיקה" },
] as const

export const MOCK_PO_PROJECTS = [
  { id: "proj_wine", name: "עיר היין" },
  { id: "proj_rainbow", name: "ריינבו" },
] as const

/** תובנות תקציב לפרויקט (מוק) — מוצג בכרטיס B כשפרויקט נבחר */
export const MOCK_PROJECT_BUDGET_INSIGHTS: Record<
  string,
  { approvedNis: number; usedNis: number; remainingNis: number }
> = {
  proj_wine: {
    approvedNis: 5_000_000,
    usedNis: 3_200_000,
    remainingNis: 1_800_000,
  },
  proj_rainbow: {
    approvedNis: 5_000_000,
    usedNis: 3_200_000,
    remainingNis: 1_800_000,
  },
}

export const MOCK_PO_CATALOG_ITEMS = [
  { id: "cat_cement", label: "צמנט 50 ק\"ג — שק", sku: "CEM-50" },
  { id: "cat_rebar_12", label: "ברזל זיון 12 מ\"מ", sku: "RB-12" },
  { id: "cat_sand", label: "חול ניקי — מ\"ק", sku: "SND-01" },
  { id: "cat_wood", label: "עץ תבנית — מ\"ר", sku: "WD-FM" },
] as const

const lineSchema = z.object({
  catalogItemId: z.string().min(1, "נא לבחור פריט"),
  quantity: z.coerce.number().positive("כמות חייבת להיות חיובית"),
  unitPrice: z.coerce.number().min(0, "מחיר לא יכול להיות שלילי"),
  lineNotes: z.string().max(500, "הערה ארוכה מדי").optional().default(""),
})

export const purchaseOrderEngineSchema = z
  .object({
    supplierId: z.string().min(1, "נא לבחר ספק"),
    projectId: z.string().min(1, "נא לבחר פרויקט"),
    expectedDelivery: z.string().min(1, "תאריך אספקה נדרש"),
    lines: z.array(lineSchema).min(1, "נדרשת לפחות שורה אחת"),
  })
  .transform((data) => {
    const supplier =
      MOCK_PO_SUPPLIERS.find((s) => s.id === data.supplierId) ?? null
    const project =
      MOCK_PO_PROJECTS.find((p) => p.id === data.projectId) ?? null

    const lines = data.lines.map((line) => {
      const item =
        MOCK_PO_CATALOG_ITEMS.find((c) => c.id === line.catalogItemId) ?? null
      const lineTotal = line.quantity * line.unitPrice
      return {
        catalogItemId: line.catalogItemId,
        catalogLabel: item?.label ?? line.catalogItemId,
        sku: item?.sku ?? null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineNotes: line.lineNotes?.trim() ?? "",
        lineTotal,
      }
    })

    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0)
    const vatAmount = Math.round(subtotal * PO_ENGINE_VAT_RATE * 100) / 100
    const grandTotal = Math.round((subtotal + vatAmount) * 100) / 100

    return {
      supplierId: data.supplierId,
      supplierName: supplier?.name ?? data.supplierId,
      projectId: data.projectId,
      projectName: project?.name ?? data.projectId,
      expectedDelivery: data.expectedDelivery,
      lines,
      subtotal,
      vatRate: PO_ENGINE_VAT_RATE,
      vatAmount,
      grandTotal,
      exceedsBudget: grandTotal > PROJECT_BUDGET_LIMIT_NIS,
    }
  })

export type PurchaseOrderEngineInput = z.input<typeof purchaseOrderEngineSchema>
export type PurchaseOrderEngineOutput = z.output<typeof purchaseOrderEngineSchema>

export function defaultPurchaseOrderEngineValues(): PurchaseOrderEngineInput {
  return {
    supplierId: "",
    projectId: "",
    expectedDelivery: "",
    lines: [
      {
        catalogItemId: "",
        quantity: 1,
        unitPrice: 0,
        lineNotes: "",
      },
    ],
  }
}
