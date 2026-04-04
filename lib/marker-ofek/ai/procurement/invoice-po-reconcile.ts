import type { ExtractedInvoiceLine } from "@/lib/marker-ofek/ai/procurement/invoice-po-gemini"

export type PoLineRef = {
  id: string
  po_id: string
  po_number: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total_price: number
}

export type InvoicePoReconciliationLine = {
  invoice_line: ExtractedInvoiceLine
  best_match: PoLineRef | null
  score: number
  match_reason: "sku" | "description" | "amount" | "none"
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s.-]/gu, "")
    .trim()
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(norm(a).split(" ").filter((t) => t.length > 2))
  const tb = new Set(norm(b).split(" ").filter((t) => t.length > 2))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / Math.max(ta.size, tb.size)
}

function amountClose(
  a: number | null | undefined,
  b: number | null | undefined,
  rel = 0.08
): boolean {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b))
    return false
  const m = Math.max(Math.abs(a), Math.abs(b), 1)
  return Math.abs(a - b) / m <= rel
}

export function reconcileInvoiceLinesToPoLines(input: {
  invoiceLines: ExtractedInvoiceLine[]
  poLines: PoLineRef[]
}): InvoicePoReconciliationLine[] {
  const usedPo = new Set<string>()
  const out: InvoicePoReconciliationLine[] = []

  for (const inv of input.invoiceLines) {
    let best: PoLineRef | null = null
    let score = 0
    let reason: InvoicePoReconciliationLine["match_reason"] = "none"

    for (const pl of input.poLines) {
      if (usedPo.has(pl.id)) continue

      let s = 0
      let r: InvoicePoReconciliationLine["match_reason"] = "none"

      if (inv.sku && pl.description.includes(inv.sku)) {
        s = Math.max(s, 0.95)
        r = "sku"
      }

      const descSim = tokenOverlap(inv.description, pl.description)
      if (descSim > s) {
        s = descSim
        r = "description"
      }

      if (
        inv.line_total != null &&
        amountClose(inv.line_total, pl.total_price)
      ) {
        const bump = 0.35
        if (s + bump > s) {
          s = Math.min(1, s + bump)
          r = s > 0.5 ? r : "amount"
        }
      }

      if (inv.quantity != null && amountClose(inv.quantity, pl.quantity, 0.12)) {
        s = Math.min(1, s + 0.15)
      }

      if (s > score) {
        score = s
        best = pl
        reason = r
      }
    }

    if (best && score >= 0.28) {
      usedPo.add(best.id)
      out.push({
        invoice_line: inv,
        best_match: best,
        score,
        match_reason: reason === "none" ? "description" : reason,
      })
    } else {
      out.push({
        invoice_line: inv,
        best_match: null,
        score,
        match_reason: "none",
      })
    }
  }

  return out
}
