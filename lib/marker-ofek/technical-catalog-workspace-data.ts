/**
 * Master grid + rich detail mocks for Technical Items Catalog (Priority-style workspace).
 */

export type CatalogMasterRow = {
  sku: string
  name: string
  category: string
  uom: string
  basePriceNis: number
  active: boolean
}

/** נתוני דמה — תשתיות חשמל; יוחלף ב-API */
export const TECHNICAL_CATALOG_MASTER_MOCK: CatalogMasterRow[] = [
  {
    sku: "CBL-XLPE-3x150+75",
    name: "כבל נחושת XLPE 0.6/1kV — 3×150+מסילת עפר 75",
    category: "כבלים",
    uom: "מטר",
    basePriceNis: 184.5,
    active: true,
  },
  {
    sku: "ACB-3200-3P",
    name: "מפסק אוויר מגנטי 3200A — 3 פאזות, ICW 50kA",
    category: "מפסקים",
    uom: "יחידה",
    basePriceNis: 42800,
    active: true,
  },
  {
    sku: "TRAY-P200x50-PG",
    name: "תעלת פח מחוררת גלוונית 200×50 מ״מ",
    category: "תעלות",
    uom: "מטר",
    basePriceNis: 96.2,
    active: true,
  },
  {
    sku: "SWG-LV-2500A",
    name: "לוח חלוקה ראשי תת-תחנתי — 2500A, תאורה ומזגנים",
    category: "לוחות",
    uom: "יחידה",
    basePriceNis: 187500,
    active: true,
  },
  {
    sku: "RPDU-32A-C19",
    name: "יחידת אספקה ממותגת 32A — 12×C19, מדידת אנרגיה",
    category: "ציוד קצה",
    uom: "יחידה",
    basePriceNis: 6420,
    active: true,
  },
  {
    sku: "BUSBAR-CU-2000A",
    name: "מוביל נחושת דוחף 2000A — מקטע 100×10 מ״מ",
    category: "לוחות",
    uom: "מטר",
    basePriceNis: 312,
    active: true,
  },
  {
    sku: "LADDER-600-HDG",
    name: "סולם כבלים מגולוון 600 מ״מ — משקל עצמי גבוה",
    category: "תעלות",
    uom: "מטר",
    basePriceNis: 142.8,
    active: false,
  },
  {
    sku: "EARTH-CU-95",
    name: "כבל הארה נחושת 95 מ״מ² — ירוק-צהוב",
    category: "כבלים",
    uom: "מטר",
    basePriceNis: 28.4,
    active: true,
  },
  {
    sku: "ATS-1600A",
    name: "מעביר אוטומטי 1600A — מעבר גנרטור/רשת",
    category: "מפסקים",
    uom: "יחידה",
    basePriceNis: 98500,
    active: true,
  },
  {
    sku: "JBOX-IP65-400",
    name: "קופסת חיבור אטומה IP65 — 400×300 מ״מ",
    category: "ציוד קצה",
    uom: "יחידה",
    basePriceNis: 210,
    active: true,
  },
]

export type ProType = "P" | "R" | "O"

export type CatalogLinkedSupplierRow = {
  supplierName: string
  supplierSku: string
  lastPriceNis: number
  preferred: boolean
}

export type CatalogItemWorkspaceDetail = {
  sku: string
  general: {
    barcode: string
    proType: ProType
    proTypeLabel: string
    englishDescription: string
    productFamily: string
  }
  linkedSuppliers: CatalogLinkedSupplierRow[]
  mrp: {
    minOrder: number
    maxOrder: number
    safetyStock: number
    abcClass: "A" | "B" | "C"
    leadTimeDays: number
  }
  costing: {
    standardCostUsd: number
    importAirPct: number
    importSeaPct: number
  }
}

function hashSku(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick<T>(h: number, arr: readonly T[]): T {
  return arr[h % arr.length]!
}

const FAMILIES = [
  "LV Distribution",
  "Cable & Busway",
  "Enclosures & Trays",
  "Switching & Protection",
  "Power Quality",
] as const

const SUPPLIERS = [
  "אלקטרה תעשיות בע״מ",
  "שלגי הנדסה",
  "קרליאניט השקעות",
  "מיטב חשמל",
  "גלובל כבלים",
  "טבע תעשיות",
] as const

const PRO_LABELS: Record<ProType, string> = {
  P: "רכש (Purchase)",
  R: "גלם / חומר (Raw)",
  O: "אחר / שירות (Other)",
}

/**
 * יוצר פרטי ERP עשירים (דמה) לפי מק״ט — דטרמיניסטי לאותו SKU.
 */
export function getCatalogWorkspaceDetail(
  row: CatalogMasterRow
): CatalogItemWorkspaceDetail {
  const h = hashSku(row.sku)
  const abc = pick(h, ["A", "B", "C"] as const)
  const proType = pick(h + 1, ["P", "R", "O"] as const)

  const lead = 5 + (h % 21)
  const minO = 1 + (h % 8)
  const maxO = minO * (10 + (h % 40))
  const safety = (h % 500) + 10

  const stdUsd = Math.max(
    12,
    Math.round((row.basePriceNis / 3.65 + (h % 200)) * 100) / 100
  )
  const airPct = 4 + (h % 8)
  const seaPct = 12 + (h % 15)

  const nSup = 2 + (h % 3)
  const linked: CatalogLinkedSupplierRow[] = []
  for (let i = 0; i < nSup; i++) {
    const sh = hashSku(`${row.sku}|${i}`)
    const base = row.basePriceNis * (0.92 + (sh % 14) / 100)
    linked.push({
      supplierName: SUPPLIERS[sh % SUPPLIERS.length]!,
      supplierSku: `VND-${(sh % 900000) + 100000}`,
      lastPriceNis: Math.round(base * 100) / 100,
      preferred: i === h % nSup,
    })
  }

  const en = `${row.category} — ${row.sku.replace(/-/g, " ")} (Master SKU, ERP sync)`

  return {
    sku: row.sku,
    general: {
      barcode: `729${String(h % 1000000000).padStart(9, "0")}`,
      proType,
      proTypeLabel: PRO_LABELS[proType],
      englishDescription: en,
      productFamily: FAMILIES[h % FAMILIES.length]!,
    },
    linkedSuppliers: linked,
    mrp: {
      minOrder: minO,
      maxOrder: maxO,
      safetyStock: safety,
      abcClass: abc,
      leadTimeDays: lead,
    },
    costing: {
      standardCostUsd: stdUsd,
      importAirPct: airPct,
      importSeaPct: seaPct,
    },
  }
}
