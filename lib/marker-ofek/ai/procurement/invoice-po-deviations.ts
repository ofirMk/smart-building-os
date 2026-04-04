import type { ExtractedInvoiceLine } from "@/lib/marker-ofek/ai/procurement/invoice-po-gemini"
import type {
  InvoicePoReconciliationLine,
  PoLineRef,
} from "@/lib/marker-ofek/ai/procurement/invoice-po-reconcile"

export type DeviationSeverity = "none" | "info" | "warn" | "critical"

export type InvoicePoDeviationLine = InvoicePoReconciliationLine & {
  quantity_delta: number | null
  quantity_deviation_ratio: number | null
  quantity_severity: DeviationSeverity
  unit_price_delta: number | null
  unit_price_deviation_ratio: number | null
  unit_price_severity: DeviationSeverity
  line_total_delta: number | null
  line_total_deviation_ratio: number | null
  line_total_severity: DeviationSeverity
  /** סיכום קצר לדוח (עברית) */
  finding_he: string
}

function ratioSeverity(ratio: number | null): DeviationSeverity {
  if (ratio == null || !Number.isFinite(ratio)) return "none"
  const a = Math.abs(ratio)
  if (a < 0.02) return "none"
  if (a < 0.05) return "info"
  if (a < 0.12) return "warn"
  return "critical"
}

function relDiff(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const denom = Math.max(Math.abs(b), Math.abs(a), 1e-9)
  return (a - b) / denom
}

function buildFindingHe(
  inv: ExtractedInvoiceLine,
  po: PoLineRef | null,
  qSev: DeviationSeverity,
  pSev: DeviationSeverity,
  tSev: DeviationSeverity
): string {
  if (!po) {
    return "לא נמצאה התאמה לשורת הזמנה פתוחה"
  }
  const parts: string[] = []
  if (qSev === "warn" || qSev === "critical") {
    parts.push(
      `כמות: חשבונית ${inv.quantity ?? "—"} מול הזמנה ${po.quantity}`
    )
  }
  if (pSev === "warn" || pSev === "critical") {
    parts.push(
      `מחיר יחידה: חשבונית ${inv.unit_price ?? "—"} מול הזמנה ${po.unit_price}`
    )
  }
  if (tSev === "warn" || tSev === "critical") {
    parts.push(
      `סה״כ שורה: חשבונית ${inv.line_total ?? "—"} מול הזמנה ${po.total_price}`
    )
  }
  if (parts.length === 0) return "התאמה תקינה בטווח הסביר"
  return parts.join(" · ")
}

/**
 * השוואת כמויות ומחירים בין שורת חשבונית לשורת הזמנה מותאמת.
 */
export function enrichInvoicePoReconciliationWithDeviations(
  rows: InvoicePoReconciliationLine[]
): InvoicePoDeviationLine[] {
  return rows.map((row) => {
    const inv = row.invoice_line
    const po = row.best_match

    let quantity_delta: number | null = null
    let quantity_deviation_ratio: number | null = null
    if (
      po &&
      inv.quantity != null &&
      Number.isFinite(inv.quantity) &&
      Number.isFinite(po.quantity)
    ) {
      quantity_delta = inv.quantity - po.quantity
      quantity_deviation_ratio = relDiff(inv.quantity, po.quantity)
    }

    let unit_price_delta: number | null = null
    let unit_price_deviation_ratio: number | null = null
    if (
      po &&
      inv.unit_price != null &&
      Number.isFinite(inv.unit_price) &&
      Number.isFinite(po.unit_price)
    ) {
      unit_price_delta = inv.unit_price - po.unit_price
      unit_price_deviation_ratio = relDiff(inv.unit_price, po.unit_price)
    }

    let line_total_delta: number | null = null
    let line_total_deviation_ratio: number | null = null
    if (
      po &&
      inv.line_total != null &&
      Number.isFinite(inv.line_total) &&
      Number.isFinite(po.total_price)
    ) {
      line_total_delta = inv.line_total - po.total_price
      line_total_deviation_ratio = relDiff(inv.line_total, po.total_price)
    }

    const quantity_severity = ratioSeverity(quantity_deviation_ratio)
    const unit_price_severity = ratioSeverity(unit_price_deviation_ratio)
    const line_total_severity = ratioSeverity(line_total_deviation_ratio)

    const finding_he = buildFindingHe(
      inv,
      po,
      quantity_severity,
      unit_price_severity,
      line_total_severity
    )

    return {
      ...row,
      quantity_delta,
      quantity_deviation_ratio,
      quantity_severity,
      unit_price_delta,
      unit_price_deviation_ratio,
      unit_price_severity,
      line_total_delta,
      line_total_deviation_ratio,
      line_total_severity,
      finding_he,
    }
  })
}

export function countSignificantInvoiceDeviations(
  rows: InvoicePoDeviationLine[]
): number {
  return rows.filter((r) => {
    if (!r.best_match) return true
    return (
      r.quantity_severity === "warn" ||
      r.quantity_severity === "critical" ||
      r.unit_price_severity === "warn" ||
      r.unit_price_severity === "critical" ||
      r.line_total_severity === "warn" ||
      r.line_total_severity === "critical"
    )
  }).length
}
