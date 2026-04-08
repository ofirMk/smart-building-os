"use server"

import { revalidatePath } from "next/cache"

import { ensureFinanceInvoiceJournalEntry } from "@/lib/finance/accounting-core"
import {
  ALLOCATION_REQUIRED_ABOVE_NIS,
  canonicalInvoiceHash,
  requestAllocationNumber,
} from "@/lib/finance/israel-tax-api"
import {
  buildInvoiceVaultFolderTitle,
  ensureFinanceInvoiceVaultFolder,
} from "@/lib/finance/invoice-vault-folder"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

export type FinanceInvoiceLine = {
  description: string
  qty: number
  unit_price: number
  vat_rate: number
  total: number
}

export type FinanceTotals = {
  subtotal: number
  vat: number
  total: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function createFinanceClientRow(input: {
  name: string
  tax_id?: string | null
  address?: string | null
  email?: string | null
  payment_terms_days?: number | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }
    const name = input.name.trim()
    if (!name) return { ok: false, error: "שם לקוח חובה" }

    const { data, error } = await supabase
      .from("finance_clients")
      .insert({
        name,
        tax_id: input.tax_id?.trim() || null,
        address: input.address?.trim() || null,
        email: input.email?.trim() || null,
        payment_terms_days:
          input.payment_terms_days != null &&
          Number.isFinite(input.payment_terms_days)
            ? Math.max(0, Math.floor(input.payment_terms_days))
            : null,
        is_deleted: false,
      })
      .select("id")
      .single()

    if (error || !data?.id) {
      return { ok: false, error: error?.message ?? "שמירה נכשלה" }
    }
    revalidatePath("/marker-ofek/finance/invoices/new")
    return { ok: true, id: data.id as string }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function saveFinanceInvoiceDraft(input: {
  id?: string | null
  clientId: string
  projectId: string | null
  type: "TAX_INVOICE" | "TRANSACTION" | "CREDIT"
  items: FinanceInvoiceLine[]
  totals: FinanceTotals
  dueDate: string | null
}): Promise<
  | { ok: true; invoiceId: string; invoiceNumber: number }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: cl } = await supabase
      .from("finance_clients")
      .select("id")
      .eq("id", input.clientId)
      .eq("is_deleted", false)
      .maybeSingle()
    if (!cl) return { ok: false, error: "לקוח לא נמצא" }

    if (input.projectId) {
      const { data: pr } = await supabase
        .from("projects")
        .select("id")
        .eq("id", input.projectId)
        .eq("is_deleted", false)
        .maybeSingle()
      if (!pr) return { ok: false, error: "פרויקט לא נמצא" }
    }

    const totals = {
      subtotal: round2(input.totals.subtotal),
      vat: round2(input.totals.vat),
      total: round2(input.totals.total),
    }

    if (input.id) {
      const { data: cur } = await supabase
        .from("finance_invoices")
        .select("status")
        .eq("id", input.id)
        .maybeSingle()
      const st = (cur as { status?: string } | null)?.status
      if (st === "PAID") {
        return { ok: false, error: "לא ניתן לערוך חשבונית ששולמה" }
      }

      const { data: row, error } = await supabase
        .from("finance_invoices")
        .update({
          client_id: input.clientId,
          project_id: input.projectId,
          type: input.type,
          items: input.items,
          totals,
          due_date: input.dueDate,
          status: st === "APPROVED" || st === "PENDING_ALLOCATION" ? st : "DRAFT",
        })
        .eq("id", input.id)
        .select("id, invoice_number")
        .single()
      if (error || !row) {
        return { ok: false, error: error?.message ?? "עדכון נכשל" }
      }
      revalidatePath("/marker-ofek/finance/invoices/new")
      return {
        ok: true,
        invoiceId: row.id as string,
        invoiceNumber: Number(row.invoice_number),
      }
    }

    const { data: row, error } = await supabase
      .from("finance_invoices")
      .insert({
        client_id: input.clientId,
        project_id: input.projectId,
        type: input.type,
        status: "DRAFT",
        items: input.items,
        totals,
        due_date: input.dueDate,
      })
      .select("id, invoice_number")
      .single()

    if (error || !row) {
      return { ok: false, error: error?.message ?? "שמירת טיוטה נכשלה" }
    }
    revalidatePath("/marker-ofek/finance/invoices/new")
    return {
      ok: true,
      invoiceId: row.id as string,
      invoiceNumber: Number(row.invoice_number),
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function requestFinanceInvoiceAllocation(
  invoiceId: string
): Promise<
  | {
      ok: true
      allocationNumber: string
      taxAuthorityRef: string
      status: "APPROVED" | "PENDING_ALLOCATION"
    }
  | { ok: false; error: string; pending?: boolean }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: inv, error: invErr } = await supabase
      .from("finance_invoices")
      .select("id, items, totals, type, client_id, project_id, invoice_number")
      .eq("id", invoiceId)
      .maybeSingle()

    if (invErr) {
      return { ok: false, error: invErr.message }
    }

    const row = inv as {
      id: string
      items: FinanceInvoiceLine[]
      totals: FinanceTotals
      type: string
      client_id: string
      project_id: string | null
      invoice_number: number
    } | null

    if (!row) return { ok: false, error: "חשבונית לא נמצאה" }

    const { data: clRow } = await supabase
      .from("finance_clients")
      .select("tax_id, name")
      .eq("id", row.client_id)
      .eq("is_deleted", false)
      .maybeSingle()

    const clientName =
      String((clRow as { name?: string } | null)?.name ?? "").trim() || "לקוח"

    const customerTaxId = (clRow as { tax_id?: string | null } | null)?.tax_id?.trim() || null

    const { data: company } = await supabase
      .from("company_profile")
      .select("legal_id, vat_registration_number")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    const issuerTaxId =
      String(
        (company as { vat_registration_number?: string | null; legal_id?: string | null } | null)
          ?.vat_registration_number ||
          (company as { legal_id?: string | null } | null)?.legal_id ||
          ""
      ).trim() || "000000000"

    const issueDate = new Date().toISOString().slice(0, 10)
    const totals = row.totals
    const hash = canonicalInvoiceHash({
      invoiceId: row.id,
      issuerTaxId,
      customerTaxId,
      lines: row.items,
      totals,
      issueDate,
    })

    const res = await requestAllocationNumber({
      invoiceHash: hash,
      issuerTaxId,
      customerTaxId,
      totalNis: Math.abs(totals.total),
      invoiceId: row.id,
    })

    if (!res.ok) {
      if (res.offlineMode) {
        await supabase
          .from("finance_invoices")
          .update({ status: "PENDING_ALLOCATION" })
          .eq("id", invoiceId)
        revalidatePath("/marker-ofek/finance/invoices/new")
        return {
          ok: false,
          error: res.message,
          pending: true,
        }
      }
      return { ok: false, error: res.message }
    }

    await supabase
      .from("finance_invoices")
      .update({
        allocation_number: res.allocationNumber,
        tax_authority_ref: res.taxAuthorityRef,
        status: "APPROVED",
      })
      .eq("id", invoiceId)

    const journalRes = await ensureFinanceInvoiceJournalEntry({
      supabase,
      invoiceId,
      invoiceNumber: Number(row.invoice_number),
      projectId: row.project_id,
      issueDate,
      totals,
      invoiceType: row.type as "TAX_INVOICE" | "TRANSACTION" | "CREDIT",
    })
    if (!journalRes.ok) {
      console.error("[finance-invoice] auto-journal failed", journalRes.error)
    }

    if (row.project_id) {
      const folderTitle = buildInvoiceVaultFolderTitle({
        issueDate,
        clientName,
        invoiceNumber: Number(row.invoice_number),
      })
      const vaultRes = await ensureFinanceInvoiceVaultFolder({
        supabase,
        projectId: row.project_id,
        title: folderTitle,
      })
      if (!vaultRes.ok) {
        console.error("[finance-invoice] vault folder failed", vaultRes.error)
      }
    }

    revalidatePath("/marker-ofek/finance/invoices/new")
    return {
      ok: true,
      allocationNumber: res.allocationNumber,
      taxAuthorityRef: res.taxAuthorityRef,
      status: "APPROVED",
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function markFinanceInvoicePaid(
  invoiceId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: inv, error } = await supabase
      .from("finance_invoices")
      .select("totals, allocation_number, status")
      .eq("id", invoiceId)
      .maybeSingle()
    if (error || !inv) return { ok: false, error: error?.message ?? "לא נמצא" }

    const totals = (inv as { totals: FinanceTotals }).totals
    const allocation = (inv as { allocation_number: string | null }).allocation_number
    const total = round2(totals.total)
    const absTotal = Math.abs(total)

    if (absTotal > ALLOCATION_REQUIRED_ABOVE_NIS && !allocation?.trim()) {
      return {
        ok: false,
        error:
          "לפי מדיניות הולדן: מעל 25,000 ₪ חובה מספר הקצאה לפני סימון כשולם. קבלו הקצאה או השלימו ממתין.",
      }
    }

    const { error: up } = await supabase
      .from("finance_invoices")
      .update({ status: "PAID" })
      .eq("id", invoiceId)
    if (up) return { ok: false, error: up.message }

    revalidatePath("/marker-ofek/finance/invoices/new")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
