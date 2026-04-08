"use server"

import { createHash } from "crypto"
import { revalidatePath } from "next/cache"

import { logMoAuditEvent } from "@/lib/marker-ofek/audit-log"
import {
  moInvoiceCreateInputSchema,
  type MoInvoiceLineInput,
} from "@/lib/marker-ofek/mo-invoice-generator-schema"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function canonicalPayload(input: {
  invoiceNumber: number
  issueDate: string
  entityId: string
  projectId: string | null
  contractId: string | null
  documentType: string
  documentCopyLabel: string
  subtotal: number
  vatAmount: number
  grandTotal: number
  vatRatePercent: number
  lines: { description: string; quantity: number; unitPrice: number; lineTotal: number }[]
  companyLegalId: string | null
}) {
  const stable = {
    v: 1,
    invoice_number: input.invoiceNumber,
    issue_date: input.issueDate,
    entity_id: input.entityId,
    project_id: input.projectId,
    contract_id: input.contractId,
    document_type: input.documentType,
    document_copy_label: input.documentCopyLabel,
    subtotal: input.subtotal,
    vat_amount: input.vatAmount,
    grand_total: input.grandTotal,
    vat_rate_percent: input.vatRatePercent,
    lines: input.lines.map((l) => ({
      d: l.description,
      q: l.quantity,
      u: l.unitPrice,
      t: l.lineTotal,
    })),
    issuer_legal_id: input.companyLegalId,
  }
  return JSON.stringify(stable)
}

function computeLines(lines: MoInvoiceLineInput[]) {
  const out: {
    description: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }[] = []
  let subtotal = 0
  for (const row of lines) {
    const qty = roundMoney(row.quantity)
    const up = roundMoney(row.unitPrice)
    const lt = roundMoney(qty * up)
    subtotal = roundMoney(subtotal + lt)
    out.push({
      description: row.description.trim(),
      quantity: qty,
      unitPrice: up,
      lineTotal: lt,
    })
  }
  return { lines: out, subtotal }
}

export async function createMoTaxInvoiceAction(
  raw: unknown
): Promise<
  | { ok: true; invoiceId: string; invoiceNumber: number }
  | { ok: false; error: string }
> {
  try {
    const parsed = moInvoiceCreateInputSchema.safeParse(raw)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(" · ")
      return { ok: false, error: msg || "נתונים לא תקינים" }
    }
    const p = parsed.data

    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: ent, error: entErr } = await supabase
      .from("entities")
      .select("id, type, is_deleted")
      .eq("id", p.entityId)
      .maybeSingle()
    if (entErr) return { ok: false, error: entErr.message }
    if (!ent || ent.is_deleted || ent.type !== "client") {
      return { ok: false, error: "הלקוח לא נמצא או שאינו מסוג מזמין" }
    }

    let projectId: string | null =
      p.projectId && String(p.projectId).trim() ? String(p.projectId).trim() : null
    if (projectId) {
      const { data: pr, error: prErr } = await supabase
        .from("projects")
        .select("id, is_deleted")
        .eq("id", projectId)
        .maybeSingle()
      if (prErr) return { ok: false, error: prErr.message }
      if (!pr || pr.is_deleted) {
        return { ok: false, error: "הפרויקט לא נמצא" }
      }
    }

    const contractId: string | null =
      p.contractId && String(p.contractId).trim() ? String(p.contractId).trim() : null
    if (contractId) {
      const { data: ct, error: ctErr } = await supabase
        .from("contracts")
        .select("id, project_id, is_deleted")
        .eq("id", contractId)
        .maybeSingle()
      if (ctErr) return { ok: false, error: ctErr.message }
      if (!ct || ct.is_deleted) {
        return { ok: false, error: "החוזה לא נמצא" }
      }
      if (projectId && String(ct.project_id) !== projectId) {
        return { ok: false, error: "החוזה אינו שייך לפרויקט שנבחר" }
      }
      if (!projectId) {
        projectId = String(ct.project_id)
      }
    }

    const { lines: lineRows, subtotal } = computeLines(p.lines)
    const vatRate = p.vatRatePercent / 100
    const vatAmount = roundMoney(subtotal * vatRate)
    const grandTotal = roundMoney(subtotal + vatAmount)

    const { data: company } = await supabase
      .from("company_profile")
      .select("legal_id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    const companyLegalId =
      company && typeof (company as { legal_id?: string }).legal_id === "string"
        ? (company as { legal_id: string }).legal_id
        : null

    const financeClientId =
      p.financeClientId && String(p.financeClientId).trim()
        ? String(p.financeClientId).trim()
        : null

    if (financeClientId) {
      const { data: fcRow, error: fcErr } = await supabase
        .from("mo_finance_clients")
        .select("id, entity_id")
        .eq("id", financeClientId)
        .eq("is_deleted", false)
        .maybeSingle()
      if (fcErr) return { ok: false, error: fcErr.message }
      if (!fcRow) {
        return { ok: false, error: "רשומת לקוח במאגר לא נמצאה" }
      }
      const fcEnt = (fcRow as { entity_id?: string | null }).entity_id
      if (fcEnt && String(fcEnt) !== p.entityId) {
        return {
          ok: false,
          error: "המאגר משויך ללקוח אחר — בחרו את אותה ישות או נקו את בחירת המאגר",
        }
      }
    }

    const dueDate =
      p.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(String(p.dueDate).trim())
        ? String(p.dueDate).trim()
        : null

    const itemsSnapshot = lineRows.map((l, i) => ({
      sort_order: i,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      line_total: l.lineTotal,
    }))

    const { data: inv, error: invErr } = await supabase
      .from("mo_invoices")
      .insert({
        project_id: projectId,
        entity_id: p.entityId,
        finance_client_id: financeClientId,
        contract_id: contractId,
        linked_partial_account_id: null,
        issue_date: p.issueDate,
        due_date: dueDate,
        document_type: "tax_invoice",
        items_snapshot: itemsSnapshot,
        subtotal,
        vat_amount: vatAmount,
        grand_total: grandTotal,
        status: "issued",
        is_printed_original: false,
        is_finalized: false,
      })
      .select("id, invoice_number")
      .single()

    if (invErr || !inv?.id) {
      return { ok: false, error: invErr?.message ?? "יצירת חשבונית נכשלה" }
    }

    const invoiceId = inv.id as string
    const invoiceNumber = Number(inv.invoice_number)

    const lineInserts = lineRows.map((l, i) => ({
      invoice_id: invoiceId,
      sort_order: i,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      line_total: l.lineTotal,
    }))

    const { error: liErr } = await supabase
      .from("mo_invoice_line_items")
      .insert(lineInserts)
    if (liErr) {
      await supabase.from("mo_invoices").delete().eq("id", invoiceId)
      return { ok: false, error: liErr.message }
    }

    const canonical = canonicalPayload({
      invoiceNumber,
      issueDate: p.issueDate,
      entityId: p.entityId,
      projectId,
      contractId,
      documentType: "tax_invoice",
      documentCopyLabel: p.documentCopyLabel,
      subtotal,
      vatAmount,
      grandTotal,
      vatRatePercent: p.vatRatePercent,
      lines: lineRows,
      companyLegalId,
    })
    const digitalSignatureSha256 = createHash("sha256")
      .update(canonical, "utf8")
      .digest("hex")

    /* אימות החשבונית מפעיל טריגר DB (mo_invoices_double_entry_trg):
       פקודת יומן מאוזנת — חוב לקוחות / זכות הכנסות / זכות מע״מ */
    const { error: finErr } = await supabase
      .from("mo_invoices")
      .update({
        digital_signature_sha256: digitalSignatureSha256,
        is_finalized: true,
      })
      .eq("id", invoiceId)

    if (finErr) {
      await supabase.from("mo_invoices").delete().eq("id", invoiceId)
      return { ok: false, error: finErr.message }
    }

    void logMoAuditEvent({
      action_type: "INSERT",
      table_name: "mo_invoices",
      project_id: projectId,
      new_data: {
        id: invoiceId,
        invoice_number: invoiceNumber,
        entity_id: p.entityId,
        project_id: projectId,
        contract_id: contractId,
        subtotal,
        vat_amount: vatAmount,
        grand_total: grandTotal,
        digital_signature_sha256: digitalSignatureSha256,
        source: "invoice_generator",
      },
    })

    revalidatePath("/marker-ofek/finance")
    revalidatePath("/marker-ofek/finance/invoices/new")
    revalidatePath("/marker-ofek/invoices/new")
    return { ok: true, invoiceId, invoiceNumber }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
