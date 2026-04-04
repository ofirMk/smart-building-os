import { insertMoAiJobResult } from "@/lib/marker-ofek/ai/mo-ai-job-results-actions"
import {
  countSignificantInvoiceDeviations,
  enrichInvoicePoReconciliationWithDeviations,
  type InvoicePoDeviationLine,
} from "@/lib/marker-ofek/ai/procurement/invoice-po-deviations"
import { extractSupplierInvoiceFromDocument } from "@/lib/marker-ofek/ai/procurement/invoice-po-gemini"
import {
  reconcileInvoiceLinesToPoLines,
  type PoLineRef,
} from "@/lib/marker-ofek/ai/procurement/invoice-po-reconcile"
import { AI_ACTION_KINDS, AI_MODULES } from "@/lib/marker-ofek/ai/registry"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

async function loadOpenPoLinesForProject(
  projectId: string
): Promise<PoLineRef[]> {
  const supabase = await createSupabaseServerAuthClient()
  const { data: pos, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id, po_number, status")
    .eq("project_id", projectId)
    .neq("status", "draft")

  if (poErr) throw new Error(poErr.message)
  const poRows = (pos ?? []) as {
    id: string
    po_number: string
    status: string
  }[]
  if (poRows.length === 0) return []

  const poIds = poRows.map((p) => p.id)
  const byPo = new Map(poRows.map((p) => [p.id, p]))

  const { data: lines, error: liErr } = await supabase
    .from("po_line_items")
    .select("id, po_id, description, quantity, unit, unit_price, total_price")
    .in("po_id", poIds)

  if (liErr) throw new Error(liErr.message)

  return ((lines ?? []) as Record<string, unknown>[]).map((r) => {
    const po = byPo.get(String(r.po_id))!
    return {
      id: String(r.id),
      po_id: String(r.po_id),
      po_number: po.po_number,
      description: String(r.description ?? ""),
      quantity: Number(r.quantity) || 0,
      unit: r.unit != null ? String(r.unit) : null,
      unit_price: Number(r.unit_price) || 0,
      total_price: Number(r.total_price) || 0,
    }
  })
}

export type ReconcileSupplierInvoiceResult = {
  projectId: string
  extracted: Awaited<ReturnType<typeof extractSupplierInvoiceFromDocument>>
  reconciliation: InvoicePoDeviationLine[]
  stats: {
    invoice_lines: number
    po_lines_considered: number
    matched_lines: number
    deviation_lines: number
  }
}

/**
 * חילוץ שורות מחשבונית ספק והתאמה מול שורות הזמנות פתוחות בפרויקט + דגלי סטיית מחיר/כמות.
 */
export async function reconcileSupplierInvoice(input: {
  projectId: string
  invoiceFile: { base64: string; mimeType: string }
  persistJob?: boolean
}): Promise<
  | { ok: true; data: ReconcileSupplierInvoiceResult; jobId: string | null }
  | { ok: false; error: string }
> {
  const pid = input.projectId.trim()
  if (!pid) return { ok: false, error: "חסר פרויקט" }
  const mime = input.invoiceFile.mimeType.trim() || "application/pdf"
  if (!input.invoiceFile.base64?.trim()) {
    return { ok: false, error: "חסר קובץ חשבונית" }
  }

  try {
    const extracted = await extractSupplierInvoiceFromDocument({
      base64: input.invoiceFile.base64,
      mimeType: mime,
    })

    const poLines = await loadOpenPoLinesForProject(pid)
    const raw = reconcileInvoiceLinesToPoLines({
      invoiceLines: extracted.lines,
      poLines,
    })
    const reconciliation = enrichInvoicePoReconciliationWithDeviations(raw)
    const matched = reconciliation.filter((r) => r.best_match != null).length
    const deviation_lines = countSignificantInvoiceDeviations(reconciliation)

    const data: ReconcileSupplierInvoiceResult = {
      projectId: pid,
      extracted,
      reconciliation,
      stats: {
        invoice_lines: extracted.lines.length,
        po_lines_considered: poLines.length,
        matched_lines: matched,
        deviation_lines,
      },
    }

    let jobId: string | null = null
    if (input.persistJob !== false) {
      const persisted = await insertMoAiJobResult({
        module: AI_MODULES.procurement,
        actionKind: AI_ACTION_KINDS.invoiceVsPo,
        projectId: pid,
        inputSummary: {
          invoice_number: extracted.header.invoice_number,
          supplier_name: extracted.header.supplier_name,
          po_line_pool: poLines.length,
          mime_type: mime,
        },
        resultJson: {
          header: extracted.header,
          lines: extracted.lines,
          reconciliation,
          stats: data.stats,
        } as Record<string, unknown>,
        status: "completed",
      })
      if (!persisted.ok) return persisted
      jobId = persisted.id
    }

    return { ok: true, data, jobId }
  } catch (e) {
    const err = formatError(e)
    await insertMoAiJobResult({
      module: AI_MODULES.procurement,
      actionKind: AI_ACTION_KINDS.invoiceVsPo,
      projectId: pid,
      inputSummary: { mime_type: mime },
      resultJson: {},
      status: "failed",
      errorMessage: err,
    }).catch(() => {})
    return { ok: false, error: err }
  }
}
