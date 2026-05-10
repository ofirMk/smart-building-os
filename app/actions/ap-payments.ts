"use server"

/**
 * AP Payment Run server actions — Sprint A.2.
 *
 * Lifecycle:
 *   DRAFT → APPROVED → EXECUTED → RECONCILED
 *
 * createPaymentRun         — DRAFT, picks N invoices APPROVED/READY_FOR_PAYMENT.
 * approvePaymentRun        — DRAFT → APPROVED.
 * executePaymentRunMasav   — APPROVED → EXECUTED:
 *                              1) generate the .001 MASAV file (in-memory string).
 *                              2) post a balanced JE (Dr AP / Cr Bank) via gl-posting.
 *                              3) flip invoices → status='APPROVED' (legacy compat: stays).
 *                            Returns the file content + filename for download.
 * autoMatchBankReconciliation — runs the deterministic engine and confirms
 *                                every proposal with confidence >= AUTO_MATCH_THRESHOLD.
 */
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import {
  BANK_RECONCILIATION_CONSTANTS,
  proposeMatchesForStatement,
} from "@/lib/erp/bank-reconciliation-engine"
import { generateMasavFile } from "@/lib/erp/masav-generator"
import { postPaymentRunToGL } from "@/lib/erp/gl-posting"
import { formatError } from "@/lib/format-error"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function getCompanyId(): Promise<string | null> {
  const cookieStore = await cookies()
  return resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
}

// ---------------------------------------------------------------------------
// createPaymentRun
// ---------------------------------------------------------------------------

const createSchema = z.object({
  runNumber: z.string().trim().min(3, "מספר הרצה חובה"),
  runDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין"),
  paymentMethod: z.enum(["MASAV", "CHECK", "WIRE", "CREDIT_CARD"]),
  bankAccountId: z.string().uuid(),
  invoiceIds: z.array(z.string().uuid()).min(1, "יש לבחור לפחות חשבונית אחת"),
  notes: z.string().trim().optional(),
})

export async function createPaymentRun(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string; total_amount: number }>> {
  try {
    const parsed = createSchema.parse(input)
    const companyId = await getCompanyId()
    if (!companyId) return { ok: false, error: "חסר הקשר חברה" }

    const supabase = await createSupabaseServerAuthClient()

    const { data: invoices, error: invErr } = await supabase
      .from("erp_vendor_invoices")
      .select("id, supplier_id, total_amount, status")
      .eq("company_id", companyId)
      .in("id", parsed.invoiceIds)

    if (invErr) return { ok: false, error: invErr.message }
    if (!invoices || invoices.length === 0) {
      return { ok: false, error: "לא נמצאו חשבוניות" }
    }
    if (invoices.length !== parsed.invoiceIds.length) {
      return { ok: false, error: "חלק מהחשבוניות לא שייכות לחברה" }
    }
    const eligible = invoices.filter((i) =>
      ["APPROVED", "READY_FOR_PAYMENT", "MATCHED"].includes(
        String(i.status ?? ""),
      ),
    )
    if (eligible.length !== invoices.length) {
      return {
        ok: false,
        error: "חלק מהחשבוניות אינן במצב מאושר לתשלום",
      }
    }

    const total = invoices.reduce((s, i) => s + Number(i.total_amount ?? 0), 0)

    const { data: run, error: runErr } = await supabase
      .from("erp_ap_payment_runs")
      .insert({
        company_id: companyId,
        run_number: parsed.runNumber,
        run_date: parsed.runDate,
        payment_method: parsed.paymentMethod,
        bank_account_id: parsed.bankAccountId,
        status: "DRAFT",
        total_amount: total,
        notes: parsed.notes ?? null,
      })
      .select("id, total_amount")
      .single<{ id: string; total_amount: number }>()
    if (runErr || !run) {
      return { ok: false, error: runErr?.message ?? "יצירת הרצה נכשלה" }
    }

    // Insert payments (still DRAFT — total constraint trigger inactive on DRAFT).
    const payments = invoices.map((inv, i) => ({
      company_id: companyId,
      run_id: run.id,
      vendor_invoice_id: inv.id,
      supplier_id: inv.supplier_id,
      amount: Number(inv.total_amount ?? 0),
      payment_date: parsed.runDate,
      masav_record_seq: i + 1,
      reference: null,
      status: "PENDING",
    }))
    const { error: payErr } = await supabase
      .from("erp_ap_payments")
      .insert(payments)
    if (payErr) {
      // best-effort rollback
      await supabase.from("erp_ap_payment_runs").delete().eq("id", run.id)
      return { ok: false, error: payErr.message }
    }

    revalidatePath("/marker-ofek/finance/payments/runs")
    return { ok: true, data: run }
  } catch (err) {
    return { ok: false, error: formatError(err) }
  }
}

// ---------------------------------------------------------------------------
// approvePaymentRun
// ---------------------------------------------------------------------------

export async function approvePaymentRun(
  runId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { error } = await supabase
      .from("erp_ap_payment_runs")
      .update({ status: "APPROVED", approved_at: new Date().toISOString() })
      .eq("id", runId)
      .eq("status", "DRAFT")
    if (error) return { ok: false, error: error.message }

    revalidatePath("/marker-ofek/finance/payments/runs")
    return { ok: true, data: { id: runId } }
  } catch (err) {
    return { ok: false, error: formatError(err) }
  }
}

// ---------------------------------------------------------------------------
// executePaymentRunMasav
// ---------------------------------------------------------------------------

export async function executePaymentRunMasav(runId: string): Promise<
  ActionResult<{
    id: string
    fileName: string
    content: string
    journalEntryId: string | null
    summary: { recordCount: number; totalIls: number }
  }>
> {
  try {
    const supabase = await createSupabaseServerAuthClient()

    // 1) Generate MASAV file (validates suppliers' bank info + total match).
    const masav = await generateMasavFile(supabase, runId)
    if (!masav.ok) return { ok: false, error: masav.error }

    // 2) Flip run to EXECUTED + persist file path (mock; real impl uploads to storage).
    const filePath = `masav-files/${masav.fileName}`
    const { error: updErr } = await supabase
      .from("erp_ap_payment_runs")
      .update({
        status: "EXECUTED",
        executed_at: new Date().toISOString(),
        masav_file_path: filePath,
      })
      .eq("id", runId)
    if (updErr) return { ok: false, error: updErr.message }

    // 3) Mark every payment as EXECUTED + bump invoices to APPROVED (legacy).
    await supabase
      .from("erp_ap_payments")
      .update({ status: "EXECUTED" })
      .eq("run_id", runId)

    // 4) Post the JE (Dr AP / Cr Bank).
    const post = await postPaymentRunToGL(supabase, runId)
    const jeId = post.ok ? post.journalEntryId : null

    revalidatePath("/marker-ofek/finance/payments/runs")
    return {
      ok: true,
      data: {
        id: runId,
        fileName: masav.fileName,
        content: masav.content,
        journalEntryId: jeId,
        summary: {
          recordCount: masav.summary.recordCount,
          totalIls: masav.summary.totalIls,
        },
      },
    }
  } catch (err) {
    return { ok: false, error: formatError(err) }
  }
}

// ---------------------------------------------------------------------------
// autoMatchBankReconciliation
// ---------------------------------------------------------------------------

export async function autoMatchBankReconciliation(
  reconId: string,
): Promise<
  ActionResult<{ candidatesEvaluated: number; autoConfirmed: number }>
> {
  try {
    const companyId = await getCompanyId()
    if (!companyId) return { ok: false, error: "חסר הקשר חברה" }

    const supabase = await createSupabaseServerAuthClient()
    const { data: recon, error: rErr } = await supabase
      .from("erp_bank_reconciliations")
      .select("id, statement_id, company_id")
      .eq("id", reconId)
      .eq("company_id", companyId)
      .maybeSingle<{ id: string; statement_id: string; company_id: string }>()
    if (rErr || !recon) {
      return { ok: false, error: rErr?.message ?? "דוח התאמה לא נמצא" }
    }

    const proposals = await proposeMatchesForStatement(
      supabase,
      companyId,
      recon.statement_id,
    )
    let autoConfirmed = 0
    let candidatesEvaluated = 0
    const threshold = BANK_RECONCILIATION_CONSTANTS.AUTO_MATCH_THRESHOLD

    for (const p of proposals) {
      candidatesEvaluated += p.proposals.length
      const top = p.proposals[0]
      if (!top || top.confidence < threshold) continue
      const { error: updErr } = await supabase
        .from("erp_bank_statement_lines")
        .update({
          matched_journal_entry_id: top.candidate_je_id,
          match_confidence: top.confidence,
          matched_at: new Date().toISOString(),
        })
        .eq("id", p.bankLineId)
        .is("matched_journal_entry_id", null)
      if (!updErr) autoConfirmed += 1
    }

    revalidatePath("/marker-ofek/finance/bank-reconciliation")
    return { ok: true, data: { candidatesEvaluated, autoConfirmed } }
  } catch (err) {
    return { ok: false, error: formatError(err) }
  }
}
