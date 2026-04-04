"use server"

import { reconcileSupplierInvoice } from "@/lib/marker-ofek/ai/procurement/invoice-po-service"

export type { ReconcileSupplierInvoiceResult } from "@/lib/marker-ofek/ai/procurement/invoice-po-service"

export async function reconcileSupplierInvoiceAction(input: {
  projectId: string
  invoiceFile: { base64: string; mimeType: string }
}) {
  return reconcileSupplierInvoice({
    projectId: input.projectId,
    invoiceFile: input.invoiceFile,
    persistJob: true,
  })
}

/** תאימות לאחור — אותה לוגיקה כמו `reconcileSupplierInvoice`. */
export async function runInvoiceVsPoAnalysis(input: {
  projectId: string
  documentBase64: string
  mimeType: string
}): Promise<
  | {
      ok: true
      extracted: import("@/lib/marker-ofek/ai/procurement/invoice-po-gemini").ExtractedSupplierInvoice
      reconciliation: import("@/lib/marker-ofek/ai/procurement/invoice-po-deviations").InvoicePoDeviationLine[]
      jobId: string
    }
  | { ok: false; error: string }
> {
  const res = await reconcileSupplierInvoice({
    projectId: input.projectId,
    invoiceFile: {
      base64: input.documentBase64,
      mimeType: input.mimeType,
    },
    persistJob: true,
  })
  if (!res.ok) return res
  const jobId = res.jobId
  if (!jobId) {
    return { ok: false, error: "לא נשמרה רשומת job" }
  }
  return {
    ok: true,
    extracted: res.data.extracted,
    reconciliation: res.data.reconciliation,
    jobId,
  }
}
