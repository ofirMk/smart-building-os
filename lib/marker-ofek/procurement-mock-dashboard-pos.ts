import type { PurchaseOrderEngineInput } from "@/lib/marker-ofek/po-engine-schema"

export type PoStatusEn = "Draft" | "Sent" | "Received"

export type ProcurementDashboardMockPo = {
  id: string
  poNumber: string
  date: string
  project: string
  supplier: string
  totalAmount: number
  status: PoStatusEn
  /** טיוטת מנוע PO — לפתיחה מלחיצה על שורה בלוח הרכש */
  engineDefaults: PurchaseOrderEngineInput
}

function projectIdForLabel(projectLabel: string): "proj_wine" | "proj_rainbow" {
  if (
    projectLabel.includes("סביון") ||
    projectLabel.includes("גינדי") ||
    projectLabel.includes("ריינבו")
  ) {
    return "proj_rainbow"
  }
  return "proj_wine"
}

function supplierIdForIndex(i: number): "sup_alpha" | "sup_beta" | "sup_gamma" {
  const ids = ["sup_alpha", "sup_beta", "sup_gamma"] as const
  return ids[i % 3]!
}

/** נתוני דמה — לוח רכש; תואם `PurchaseOrderEngineForm` */
export const PROCUREMENT_DASHBOARD_MOCK_ORDERS: ProcurementDashboardMockPo[] = [
  {
    id: "1",
    poNumber: "PO-2025-0152",
    date: "2025-12-01",
    project: "רמת עיר היין",
    supplier: "חשמל ישיר",
    totalAmount: 224_800,
    status: "Sent" as PoStatusEn,
    engineDefaults: {
      supplierId: "sup_alpha",
      projectId: "proj_wine",
      expectedDelivery: "2025-12-01",
      lines: [
        {
          catalogItemId: "cat_rebar_12",
          quantity: 120,
          unitPrice: 1600,
          lineNotes: "אספקה לפרויקט — דמו",
        },
      ],
    },
  },
  {
    id: "2",
    poNumber: "PO-2025-0148",
    date: "2025-11-28",
    project: "גינדי סביון",
    supplier: 'א.א. מערכות בע"מ',
    totalAmount: 318_400,
    status: "Received" as PoStatusEn,
    engineDefaults: {
      supplierId: "sup_beta",
      projectId: "proj_rainbow",
      expectedDelivery: "2025-11-28",
      lines: [
        {
          catalogItemId: "cat_cement",
          quantity: 200,
          unitPrice: 1358.12,
          lineNotes: "",
        },
      ],
    },
  },
  {
    id: "3",
    poNumber: "PO-2025-0141",
    date: "2025-11-22",
    project: "ריינבו שדה דב",
    supplier: "תאורת חירום וכבלי נחושת",
    totalAmount: 96_200,
    status: "Draft" as PoStatusEn,
    engineDefaults: {
      supplierId: "sup_gamma",
      projectId: "proj_rainbow",
      expectedDelivery: "2025-11-22",
      lines: [
        {
          catalogItemId: "cat_sand",
          quantity: 44,
          unitPrice: 1850,
          lineNotes: "טיוטה",
        },
      ],
    },
  },
  {
    id: "4",
    poNumber: "PO-2025-0138",
    date: "2025-11-18",
    project: "רמת עיר היין",
    supplier: "מסגרות תאורה — אגף B",
    totalAmount: 72_500,
    status: "Draft" as PoStatusEn,
    engineDefaults: {
      supplierId: "sup_alpha",
      projectId: "proj_wine",
      expectedDelivery: "2025-11-18",
      lines: [
        {
          catalogItemId: "cat_wood",
          quantity: 18,
          unitPrice: 3420.55,
          lineNotes: "",
        },
      ],
    },
  },
  {
    id: "5",
    poNumber: "PO-2025-0124",
    date: "2025-10-30",
    project: "גינדי סביון",
    supplier: "כבישים ותשתיות דרום בע״מ",
    totalAmount: 512_000,
    status: "Received" as PoStatusEn,
    engineDefaults: {
      supplierId: "sup_beta",
      projectId: "proj_rainbow",
      expectedDelivery: "2025-10-30",
      lines: [
        {
          catalogItemId: "cat_rebar_12",
          quantity: 280,
          unitPrice: 1525.64,
          lineNotes: "",
        },
      ],
    },
  },
  {
    id: "6",
    poNumber: "PO-2025-0110",
    date: "2025-10-12",
    project: "ריינבו שדה דב",
    supplier: "תקשורת וסיבים אופטיים",
    totalAmount: 188_900,
    status: "Sent" as PoStatusEn,
    engineDefaults: {
      supplierId: "sup_gamma",
      projectId: "proj_rainbow",
      expectedDelivery: "2025-10-12",
      lines: [
        {
          catalogItemId: "cat_cement",
          quantity: 90,
          unitPrice: 1790,
          lineNotes: "",
        },
      ],
    },
  },
  {
    id: "7",
    poNumber: "PO-2025-0097",
    date: "2025-09-05",
    project: "רמת עיר היין",
    supplier: "מסגרות ודלתות תעשייתיות",
    totalAmount: 128_400,
    status: "Received" as PoStatusEn,
    engineDefaults: {
      supplierId: "sup_alpha",
      projectId: "proj_wine",
      expectedDelivery: "2025-09-05",
      lines: [
        {
          catalogItemId: "cat_sand",
          quantity: 60,
          unitPrice: 1828.21,
          lineNotes: "",
        },
      ],
    },
  },
  {
    id: "8",
    poNumber: "PO-2025-0083",
    date: "2025-08-21",
    project: "גינדי סביון",
    supplier: "מיזוג ואוורור — צוות 3",
    totalAmount: 265_750,
    status: "Sent" as PoStatusEn,
    engineDefaults: {
      supplierId: "sup_beta",
      projectId: "proj_rainbow",
      expectedDelivery: "2025-08-21",
      lines: [
        {
          catalogItemId: "cat_wood",
          quantity: 72,
          unitPrice: 3154.17,
          lineNotes: "",
        },
      ],
    },
  },
].map((row, index): ProcurementDashboardMockPo => ({
  id: row.id,
  poNumber: row.poNumber,
  date: row.date,
  project: row.project,
  supplier: row.supplier,
  totalAmount: row.totalAmount,
  status: row.status,
  engineDefaults: {
    ...row.engineDefaults,
    projectId: projectIdForLabel(row.project),
    supplierId: supplierIdForIndex(index),
  },
}))

export function purchaseOrderEngineDefaultsFromMockPo(
  poNumber: string | null | undefined
): PurchaseOrderEngineInput | null {
  const n = poNumber?.trim()
  if (!n) return null
  const row = PROCUREMENT_DASHBOARD_MOCK_ORDERS.find((r) => r.poNumber === n)
  return row ? { ...row.engineDefaults } : null
}
