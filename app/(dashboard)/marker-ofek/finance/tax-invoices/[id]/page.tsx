/**
 * Tax Invoice show page — Sprint T7b.
 *
 * Server shell: loads the invoice + lines + print events + GL JE lines, then
 * delegates to the client component for interactive Close / Cancel / Print
 * actions.
 */

import Link from "next/link"
import { notFound } from "next/navigation"

import { TaxInvoiceShowClient } from "@/components/marker-ofek/finance/tax-invoice-show-client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { fetchTaxInvoiceAction } from "@/lib/marker-ofek/finance/t7-tax-invoice-actions"
import { listReceiptsForTaxInvoiceAction } from "@/lib/marker-ofek/finance/t7c-allocation-actions"
import { ALLOCATION_REQUIRED_ABOVE_NIS } from "@/lib/finance/israel-tax-api"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export const dynamic = "force-dynamic"

export default async function TaxInvoiceShowPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolved = await Promise.resolve(params)
  const id = typeof resolved.id === "string" ? resolved.id : ""
  if (!id) notFound()

  const fetched = await fetchTaxInvoiceAction(id)
  if (!fetched.ok) {
    return (
      <div dir="rtl" className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <Card className="border-red-300 bg-red-50 p-5 text-sm text-red-900">
          <p className="font-bold">שגיאה בטעינת החשבונית</p>
          <p className="mt-1">{fetched.error}</p>
          <div className="mt-3">
            <Button
              render={<Link href="/marker-ofek/finance/tax-invoices" />}
              variant="outline"
              size="sm"
            >
              חזרה לרשימה
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const supabase = await createSupabaseServerAuthClient()

  const { data: printEvents } = await supabase
    .from("erp_tax_invoice_print_events")
    .select("id, printed_at, copy_label, user_agent, sha256_snapshot")
    .eq("invoice_id", id)
    .order("printed_at", { ascending: false })
    .limit(50)

  const { data: jeHeader } = await supabase
    .from("erp_gl_journal_entries")
    .select("id, entry_number, entry_date, description, status, source_type, source_ref")
    .eq("source_type", "invoice")
    .eq("source_ref", id)
    .maybeSingle()

  const jeLines = jeHeader?.id
    ? ((
        await supabase
          .from("erp_gl_journal_lines")
          .select("line_no, account_id, debit_amount, credit_amount, description")
          .eq("journal_entry_id", jeHeader.id)
          .order("line_no", { ascending: true })
      ).data ?? [])
    : []

  // T7c — load the collection-tab receipts allocated to this invoice. If the
  // migration is not yet applied, the action soft-fails to an empty list.
  const receiptsRes = await listReceiptsForTaxInvoiceAction(id)
  const receipts = receiptsRes.ok ? receiptsRes.rows : []
  const receiptsTotal = receiptsRes.ok ? receiptsRes.totalAllocated : 0

  return (
    <TaxInvoiceShowClient
      header={fetched.header}
      lines={fetched.lines}
      itaThresholdNis={ALLOCATION_REQUIRED_ABOVE_NIS}
      receipts={receipts}
      receiptsTotal={receiptsTotal}
      printEvents={(printEvents ?? []).map((e) => ({
        id: String(e.id),
        printedAt: String(e.printed_at),
        copyLabel: String(e.copy_label),
        userAgent: (e.user_agent as string | null) ?? null,
        sha256Snapshot: (e.sha256_snapshot as string | null) ?? null,
      }))}
      journalEntry={
        jeHeader
          ? {
              id: String(jeHeader.id),
              entryNumber: String(jeHeader.entry_number),
              entryDate: String(jeHeader.entry_date),
              description: String(jeHeader.description),
              status: String(jeHeader.status),
              lines: jeLines.map((jl) => ({
                lineNo: Number(jl.line_no) || 0,
                accountId: (jl.account_id as string | null) ?? "",
                debit: Number(jl.debit_amount) || 0,
                credit: Number(jl.credit_amount) || 0,
                description: (jl.description as string | null) ?? "",
              })),
            }
          : null
      }
    />
  )
}
