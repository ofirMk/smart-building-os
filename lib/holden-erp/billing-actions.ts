"use server"

import { createHash } from "node:crypto"

import { revalidatePath } from "next/cache"

import { createJournalEntryAction, fetchAllGlAccounts } from "@/lib/holden-erp/journal-actions"
import { fetchProjectPoCommitmentAction } from "@/lib/holden-erp/procurement-actions"
import {
  fetchCurrenciesAction,
  fetchSupplierPartsAction,
  fetchUnitsOfMeasureAction,
} from "@/lib/holden-erp/master-data-actions"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { formatError } from "@/lib/utils"
import type {
  BillingLineInput,
  CreateFinalTaxInvoicePayload,
} from "@/types/billing-control"
import type { GlAccountRow } from "@/types/holden-finance"
import type {
  MasterDataCurrencyRow,
  MasterDataSupplierPartRow,
  MasterDataUomRow,
} from "@/types/master-data"

const DEFAULT_CUSTOMER_AR_CODE = "100"
const DEFAULT_VAT_OUTPUT_CODE = "200"

export type CreateTaxInvoicePayload = {
  invoiceNumber?: string
  issueDate: string
  customerName: string
  description: string
  subtotal: number
  vatAmount: number
  totalAmount: number
  /** `gl_accounts.id` (UUID) — resolved to `account_code` for storage and journal */
  incomeGlAccountId: string
  customerAccountCode?: string
  vatAccountCode?: string
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100
}

function generateInvoiceNumber() {
  const part = Math.random().toString(36).slice(2, 10).toUpperCase()
  return `INV-${part}`
}

export async function createTaxInvoiceAction(
  payload: CreateTaxInvoicePayload
): Promise<
  | { success: true; invoiceId: string; journalEntryId: string }
  | { success: false; error: string }
> {
  const customerName = payload.customerName?.trim() ?? ""
  if (!customerName) {
    return { success: false, error: "נא להזין שם לקוח" }
  }

  const issueDate = payload.issueDate?.trim() ?? ""
  if (!issueDate) {
    return { success: false, error: "נא לבחור תאריך הפקה" }
  }

  const incomeId = payload.incomeGlAccountId?.trim() ?? ""
  if (!incomeId) {
    return { success: false, error: "נא לבחור חשבון הכנסות" }
  }

  const subtotal = roundMoney(Number(payload.subtotal))
  const vatAmount = roundMoney(Number(payload.vatAmount))
  const totalAmount = roundMoney(Number(payload.totalAmount))

  if (!Number.isFinite(subtotal) || subtotal < 0) {
    return { success: false, error: "סכום לפני מע״מ לא תקין" }
  }
  if (!Number.isFinite(vatAmount) || vatAmount < 0) {
    return { success: false, error: "סכום מע״מ לא תקין" }
  }
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    return { success: false, error: "סכום כולל לא תקין" }
  }

  const expectedTotal = roundMoney(subtotal + vatAmount)
  if (Math.abs(totalAmount - expectedTotal) > 0.02) {
    return {
      success: false,
      error: "סכום כולל אינו תואם לסכום לפני מע״מ + מע״מ",
    }
  }

  const supabase = await createServerSupabaseClient()

  const { data: incomeRow, error: incomeErr } = await supabase
    .from("gl_accounts")
    .select("id, account_code")
    .eq("id", incomeId)
    .maybeSingle()

  if (incomeErr || !incomeRow) {
    return { success: false, error: "חשבון הכנסות לא נמצא" }
  }

  const incomeCode = String(
    (incomeRow as { account_code?: string }).account_code ?? ""
  ).trim()
  if (!incomeCode) {
    return { success: false, error: "קוד חשבון הכנסות חסר" }
  }

  let invoiceNumber = payload.invoiceNumber?.trim() ?? ""
  if (!invoiceNumber) {
    invoiceNumber = generateInvoiceNumber()
  }

  const customerAr =
    payload.customerAccountCode?.trim() || DEFAULT_CUSTOMER_AR_CODE
  const vatCode = payload.vatAccountCode?.trim() || DEFAULT_VAT_OUTPUT_CODE

  const desc = payload.description?.trim() ?? ""

  const idemSource = `legacy_simple:${customerName}:${issueDate}:${incomeId}:${subtotal}:${vatAmount}:${totalAmount}:${invoiceNumber}`
  const idemHash = createHash("sha256").update(idemSource).digest("hex")

  const { data: existedSimple } = await supabase
    .from("sales_invoices")
    .select("id")
    .eq("idempotency_key", idemHash)
    .maybeSingle()
  if (existedSimple?.id) {
    return {
      success: false,
      error: "כבר קיימת חשבונית לאותה תנועה (מפתח ייחודיות)",
    }
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("sales_invoices")
    .insert({
      invoice_number: invoiceNumber,
      issue_date: issueDate,
      customer_name: customerName,
      description: desc,
      subtotal,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      gl_account_code_income: incomeCode,
      idempotency_key: idemHash,
      income_gl_account_id: incomeId,
    })
    .select("id")
    .single()

  if (insertErr || !inserted) {
    console.error("sales_invoices insert:", insertErr)
    return {
      success: false,
      error: formatError(insertErr) || "שמירת החשבונית נכשלה",
    }
  }

  const invoiceId = (inserted as { id: string }).id

  const journalDescription = `טיוטת יומן — חשבונית ${invoiceNumber} — ${customerName}`

  const journalResult = await createJournalEntryAction({
    entryDate: issueDate,
    description: journalDescription,
    status: "draft",
    idempotencyKey: `simple_inv_${idemHash}`,
    lines: [
      {
        accountId: customerAr,
        debit: totalAmount,
        credit: 0,
        reference1: invoiceNumber,
        reference2: "",
        details: "חובת לקוח (טיוטה)",
      },
      {
        accountId: incomeId,
        debit: 0,
        credit: subtotal,
        reference1: invoiceNumber,
        reference2: "",
        details: "הכנסות (טיוטה)",
      },
      {
        accountId: vatCode,
        debit: 0,
        credit: vatAmount,
        reference1: invoiceNumber,
        reference2: "",
        details: 'מע״מ עסקאות (טיוטה)',
      },
    ],
  })

  if (!journalResult.success) {
    await supabase.from("sales_invoices").delete().eq("id", invoiceId)
    return { success: false, error: journalResult.error }
  }

  await supabase
    .from("sales_invoices")
    .update({ draft_journal_entry_id: journalResult.entryId })
    .eq("id", invoiceId)

  revalidatePath("/marker-ofek/finance/billing/new")
  revalidatePath("/marker-ofek/finance/journal-entries")

  return {
    success: true,
    invoiceId,
    journalEntryId: journalResult.entryId,
  }
}

const VAT_RATE = 0.17

function buildFinalInvoiceIdempotencyKey(
  projectId: string | null,
  progressReportId: string | null,
  purchaseOrderId: string | null
): string | null {
  if (!projectId?.trim()) return null
  const p = projectId.trim()
  if (progressReportId?.trim()) {
    return `sales_inv:${p}:pr:${progressReportId.trim()}`
  }
  if (purchaseOrderId?.trim()) {
    return `sales_inv:${p}:po:${purchaseOrderId.trim()}`
  }
  return null
}

export async function fetchDisplayFxRatesAction(): Promise<
  | {
      ok: true
      base: "ILS"
      rates: Record<string, number>
    }
  | { ok: false, error: string }
> {
  try {
    return {
      ok: true,
      base: "ILS",
      rates: {
        ILS: 1,
        USD: 3.65,
        EUR: 3.92,
      },
    }
  } catch (e) {
    return { ok: false, error: formatError(e) || "שגיאה" }
  }
}

export async function fetchBillingAgentsAction(): Promise<
  | {
      ok: true
      agents: Array<{ id: string, label: string }>
    }
  | { ok: false, error: string }
> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .or("is_active.eq.true,is_active.is.null")
      .order("full_name", { ascending: true })
      .limit(200)
    if (error) throw error
    const agents = (data ?? []).map((r) => {
      const row = r as { id: string, full_name: string | null, email: string | null }
      const label =
        [row.full_name, row.email].filter(Boolean).join(" · ") || row.id.slice(0, 8)
      return { id: row.id, label }
    })
    return { ok: true, agents }
  } catch (e) {
    return { ok: false, error: formatError(e) || "טעינת משתמשים נכשלה" }
  }
}

export async function fetchProjectsForBillingAction(): Promise<
  | {
      ok: true
      projects: Array<{
        id: string
        name: string
        internal_project_code: string
      }>
    }
  | { ok: false, error: string }
> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, internal_project_code")
      .eq("is_deleted", false)
      .order("name", { ascending: true })
      .limit(500)
    if (error) throw error
    const projects = (data ?? []).map((r) => ({
      id: String((r as { id: string }).id),
      name: String((r as { name: string }).name ?? ""),
      internal_project_code: String(
        (r as { internal_project_code: string }).internal_project_code ?? ""
      ),
    }))
    return { ok: true, projects }
  } catch (e) {
    return { ok: false, error: formatError(e) || "טעינת פרויקטים נכשלה" }
  }
}

export async function fetchWbsNodesForProjectAction(
  projectId: string
): Promise<
  | { ok: true, nodes: Array<{ id: string, label: string }> }
  | { ok: false, error: string }
> {
  try {
    const pid = projectId?.trim()
    if (!pid) return { ok: true, nodes: [] }
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from("erp_project_wbs")
      .select("id, milestone_name")
      .eq("project_id", pid)
      .order("milestone_name", { ascending: true })
    if (error) throw error
    const nodes = (data ?? []).map((r) => ({
      id: String((r as { id: string }).id),
      label: String((r as { milestone_name: string }).milestone_name ?? "—"),
    }))
    return { ok: true, nodes }
  } catch (e) {
    return { ok: false, error: formatError(e) || "טעינת WBS נכשלה" }
  }
}

export async function fetchPullSourcesForProjectAction(projectId: string): Promise<
  | {
      ok: true
      progressReports: Array<{
        id: string
        label: string
        totalPayable: number
        status: string | null
      }>
      purchaseOrders: Array<{
        id: string
        label: string
        totalAmount: number
      }>
    }
  | { ok: false, error: string }
> {
  try {
    const pid = projectId?.trim()
    if (!pid) {
      return {
        ok: true,
        progressReports: [],
        purchaseOrders: [],
      }
    }
    const supabase = await createServerSupabaseClient()
    const { data: reps, error: rErr } = await supabase
      .from("project_progress_reports")
      .select("id, report_month, total_payable, status, bill_month_label")
      .eq("project_id", pid)
      .eq("status", "approved")
      .order("report_month", { ascending: false })
      .limit(100)
    if (rErr) throw rErr
    const progressReports = (reps ?? []).map((r) => {
      const row = r as {
        id: string
        report_month: string
        total_payable: number | null
        status: string | null
        bill_month_label: string | null
      }
      const lab = row.bill_month_label?.trim() || row.report_month
      return {
        id: row.id,
        label: `דוח התקדמות ${lab}`,
        totalPayable: Number(row.total_payable) || 0,
        status: row.status,
      }
    })

    const { data: pos, error: pErr } = await supabase
      .from("purchase_orders")
      .select("id, po_number, total_amount, order_date")
      .eq("project_id", pid)
      .eq("is_deleted", false)
      .order("order_date", { ascending: false })
      .limit(100)
    if (pErr) throw pErr
    const purchaseOrders = (pos ?? []).map((p) => {
      const row = p as {
        id: string
        po_number: string
        total_amount: number
        order_date: string
      }
      return {
        id: row.id,
        label: `הזמנה ${row.po_number || row.id.slice(0, 8)} · ${row.order_date}`,
        totalAmount: Number(row.total_amount) || 0,
      }
    })

    return { ok: true, progressReports, purchaseOrders }
  } catch (e) {
    return { ok: false, error: formatError(e) || "טעינת מקורות נכשלה" }
  }
}

export async function fetchBillingPrefillFromSourceAction(input: {
  projectId: string
  sourceType: "progress_report" | "purchase_order"
  sourceId: string
}): Promise<
  | {
      ok: true
      customerName: string
      lines: BillingLineInput[]
      headerMemo: string
      suggestedSubtotal: number
    }
  | { ok: false, error: string }
> {
  try {
    const projectId = input.projectId?.trim()
    const sourceId = input.sourceId?.trim()
    if (!projectId || !sourceId) {
      return { ok: false, error: "חסר פרויקט או מקור" }
    }
    const supabase = await createServerSupabaseClient()

    if (input.sourceType === "progress_report") {
      const { data: rep, error: repErr } = await supabase
        .from("project_progress_reports")
        .select(
          "id, project_id, contract_id, report_month, bill_month_label, total_before_tax, total_payable, status"
        )
        .eq("id", sourceId)
        .maybeSingle()
      if (repErr) throw repErr
      if (!rep) return { ok: false, error: "דוח לא נמצא" }
      if (String((rep as { status: string }).status) !== "approved") {
        return { ok: false, error: "ניתן למשוך רק דוחות במצב מאושר" }
      }
      if (String((rep as { project_id: string | null }).project_id) !== projectId) {
        return { ok: false, error: "הדוח אינו שייך לפרויקט הנבחר" }
      }
      const contractId = (rep as { contract_id: string | null }).contract_id
      let customerName = "לקוח"
      if (contractId) {
        const { data: cont } = await supabase
          .from("contracts")
          .select("entity_id")
          .eq("id", contractId)
          .maybeSingle()
        const eid = (cont as { entity_id: string } | null)?.entity_id
        if (eid) {
          const { data: ent } = await supabase
            .from("entities")
            .select("name")
            .eq("id", eid)
            .maybeSingle()
          customerName = String((ent as { name: string } | null)?.name ?? customerName)
        }
      }
      const tb = Number((rep as { total_before_tax: number | null }).total_before_tax)
      const tp = Number((rep as { total_payable: number | null }).total_payable)
      const sub = Number.isFinite(tb) && tb > 0 ? tb : tp > 0 ? roundMoney(tp / (1 + VAT_RATE)) : 0
      const monthLabel =
        String((rep as { bill_month_label: string | null }).bill_month_label ?? "").trim() ||
        String((rep as { report_month: string }).report_month ?? "")
      const headerMemo = `לפי דוח התקדמות ${monthLabel}`
      const lines: BillingLineInput[] = [
        {
          supplierPartId: null,
          description: `עבודות / התקדמות ${monthLabel}`.trim(),
          uomId: null,
          quantity: 1,
          unitPrice: sub,
          discountPercent: 0,
          netUnitPrice: sub,
          lineTotal: sub,
          wbsNodeId: null,
        },
      ]
      return {
        ok: true,
        customerName,
        lines,
        headerMemo,
        suggestedSubtotal: sub,
      }
    }

    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .select("id, project_id")
      .eq("id", sourceId)
      .maybeSingle()
    if (poErr) throw poErr
    if (!po) return { ok: false, error: "הזמנה לא נמצאה" }
    if (String((po as { project_id: string | null }).project_id) !== projectId) {
      return { ok: false, error: "ההזמנה אינה שייכת לפרויקט הנבחר" }
    }

    const { data: polRows, error: polErr } = await supabase
      .from("purchase_order_lines")
      .select("id, quantity, unit_price, line_total, part_id, uom_id")
      .eq("order_id", sourceId)
    if (polErr) throw polErr

    const partIds = [
      ...new Set(
        (polRows ?? [])
          .map((x) => (x as { part_id: string }).part_id)
          .filter(Boolean)
      ),
    ]
    const partDesc = new Map<string, string>()
    if (partIds.length > 0) {
      const { data: parts } = await supabase
        .from("supplier_parts")
        .select("id, part_number_supplier, description_32_chars, description_48_chars")
        .in("id", partIds)
      for (const p of parts ?? []) {
        const row = p as {
          id: string
          part_number_supplier: string
          description_32_chars: string
          description_48_chars: string
        }
        const d =
          [row.part_number_supplier, row.description_32_chars || row.description_48_chars]
            .filter(Boolean)
            .join(" · ") || "שורת הזמנה"
        partDesc.set(row.id, d)
      }
    }

    let subtotalSum = 0
    const lines: BillingLineInput[] = (polRows ?? []).map((raw, idx) => {
      const row = raw as {
        quantity: number
        unit_price: number
        line_total: number
        part_id: string
        uom_id: string
      }
      const qty = Number(row.quantity) || 0
      const unit = Number(row.unit_price) || 0
      const lt = Number(row.line_total) || roundMoney(qty * unit)
      subtotalSum += lt
      const disc = 0
      const net = qty > 0 ? roundMoney(lt / qty) : unit
      return {
        supplierPartId: row.part_id,
        description: partDesc.get(row.part_id) ?? `שורה ${idx + 1}`,
        uomId: row.uom_id,
        quantity: qty > 0 ? qty : 1,
        unitPrice: unit,
        discountPercent: disc,
        netUnitPrice: net,
        lineTotal: lt,
        wbsNodeId: null,
      }
    })

    const { data: proj } = await supabase
      .from("projects")
      .select("client_name, name")
      .eq("id", projectId)
      .maybeSingle()
    const customerName = String(
      (proj as { client_name: string | null, name: string } | null)?.client_name ??
        (proj as { name: string } | null)?.name ??
        "לקוח"
    )

    return {
      ok: true,
      customerName,
      lines,
      headerMemo: "לפי הזמנת רכש (הפקה כמסמך מכירה)",
      suggestedSubtotal: roundMoney(subtotalSum),
    }
  } catch (e) {
    return { ok: false, error: formatError(e) || "טעינת מקור נכשלה" }
  }
}

export async function fetchBillingBudgetContextAction(
  projectId: string
): Promise<
  | {
      ok: true
      committedPoIls: number
      recognizedRevenueIls: number
    }
  | { ok: false, error: string }
> {
  try {
    const pid = projectId?.trim()
    if (!pid) {
      return { ok: false, error: "חסר פרויקט" }
    }
    const supabase = await createServerSupabaseClient()
    const [poRes, actRes] = await Promise.all([
      fetchProjectPoCommitmentAction({ projectId: pid }),
      supabase
        .from("project_billing_actuals")
        .select("recognized_revenue_ils")
        .eq("project_id", pid)
        .maybeSingle(),
    ])
    if (!poRes.ok) {
      return { ok: false, error: poRes.error }
    }
    const recognizedRevenueIls = Number(
      (actRes.data as { recognized_revenue_ils?: number } | null)
        ?.recognized_revenue_ils ?? 0
    )
    if (actRes.error) {
      return { ok: false, error: formatError(actRes.error) || "שגיאה" }
    }
    return {
      ok: true,
      committedPoIls: poRes.committedIls,
      recognizedRevenueIls: roundMoney(recognizedRevenueIls),
    }
  } catch (e) {
    return { ok: false, error: formatError(e) || "שגיאה" }
  }
}

export async function fetchBillingControlWorkspaceAction(): Promise<
  | {
      ok: true
      accounts: GlAccountRow[]
      currencies: MasterDataCurrencyRow[]
      uoms: MasterDataUomRow[]
      parts: MasterDataSupplierPartRow[]
      projects: Array<{ id: string, name: string, internal_project_code: string }>
      agents: Array<{ id: string, label: string }>
      fx: Record<string, number>
    }
  | { ok: false, error: string }
> {
  try {
    const [acc, cur, uom, parts, proj, ag, fxr] = await Promise.all([
      fetchAllGlAccounts(),
      fetchCurrenciesAction(),
      fetchUnitsOfMeasureAction(),
      fetchSupplierPartsAction(),
      fetchProjectsForBillingAction(),
      fetchBillingAgentsAction(),
      fetchDisplayFxRatesAction(),
    ])

    if (!acc.success || !acc.data) {
      return { ok: false, error: "כרטסת לא נטענה" }
    }
    if (!cur.ok) return { ok: false, error: cur.error }
    if (!uom.ok) return { ok: false, error: uom.error }
    if (!parts.ok) return { ok: false, error: parts.error }
    if (!proj.ok) return { ok: false, error: proj.error }
    if (!ag.ok) return { ok: false, error: ag.error }
    if (!fxr.ok) return { ok: false, error: fxr.error }

    return {
      ok: true,
      accounts: acc.data,
      currencies: cur.data,
      uoms: uom.data,
      parts: parts.data,
      projects: proj.projects,
      agents: ag.agents,
      fx: fxr.rates,
    }
  } catch (e) {
    return { ok: false, error: formatError(e) || "שגיאה" }
  }
}

export async function createFinalTaxInvoiceAction(
  payload: CreateFinalTaxInvoicePayload
): Promise<
  | {
      success: true
      invoiceId: string
      draftJournalEntryId: string
      recognizedRevenueIls: number
    }
  | { success: false, error: string }
> {
  const customerName = payload.customerName?.trim() ?? ""
  if (!customerName) {
    return { success: false, error: "נא להזין שם לקוח" }
  }
  const issueDate = payload.issueDate?.trim() ?? ""
  if (!issueDate) {
    return { success: false, error: "נא לבחור תאריך הפקה" }
  }
  const incomeId = payload.incomeGlAccountId?.trim() ?? ""
  if (!incomeId) {
    return { success: false, error: "נא לבחור חשבון הכנסות" }
  }
  const linesIn = payload.lines ?? []
  if (linesIn.length === 0) {
    return { success: false, error: "נדרשת לפחות שורת פריט אחת" }
  }

  let sumLines = 0
  for (const ln of linesIn) {
    const q = Number(ln.quantity)
    if (!Number.isFinite(q) || q <= 0) {
      return { success: false, error: "כמות חיובית נדרשת בכל שורה" }
    }
    const lt = roundMoney(Number(ln.lineTotal))
    if (!Number.isFinite(lt) || lt < 0) {
      return { success: false, error: "שורת פריט לא תקינה" }
    }
    sumLines += lt
  }
  sumLines = roundMoney(sumLines)

  const subtotal = roundMoney(Number(payload.subtotal))
  const vatAmount = roundMoney(Number(payload.vatAmount))
  const totalAmount = roundMoney(Number(payload.totalAmount))

  if (Math.abs(sumLines - subtotal) > 0.02) {
    return {
      success: false,
      error: "סכום שורות אינו תואם לסכום לפני מע״מ",
    }
  }
  const expectedTotal = roundMoney(subtotal + vatAmount)
  if (Math.abs(totalAmount - expectedTotal) > 0.02) {
    return {
      success: false,
      error: "החשבונית אינה מאוזנת (סכום כולל מול מע״מ)",
    }
  }

  const supabase = await createServerSupabaseClient()

  const idem = buildFinalInvoiceIdempotencyKey(
    payload.projectId,
    payload.sourceProgressReportId,
    payload.sourcePurchaseOrderId
  )
  const idemHash =
    idem != null
      ? createHash("sha256").update(idem).digest("hex")
      : null

  if (idemHash) {
    const { data: existed } = await supabase
      .from("sales_invoices")
      .select("id")
      .eq("idempotency_key", idemHash)
      .maybeSingle()
    if (existed?.id) {
      return {
        success: false,
        error: "כבר קיימת חשבונית עבור אותו פרויקט ומקור (מפתח ייחודיות)",
      }
    }
  }

  if (payload.projectId?.trim() && payload.sourceProgressReportId?.trim()) {
    const { data: dup } = await supabase
      .from("sales_invoices")
      .select("id")
      .eq("project_id", payload.projectId.trim())
      .eq("source_progress_report_id", payload.sourceProgressReportId.trim())
      .maybeSingle()
    if (dup?.id) {
      return {
        success: false,
        error: "חשבונית כבר הופקה לדוח התקדמות זה",
      }
    }
  }
  if (payload.projectId?.trim() && payload.sourcePurchaseOrderId?.trim()) {
    const { data: dupPo } = await supabase
      .from("sales_invoices")
      .select("id")
      .eq("project_id", payload.projectId.trim())
      .eq("source_purchase_order_id", payload.sourcePurchaseOrderId.trim())
      .maybeSingle()
    if (dupPo?.id) {
      return {
        success: false,
        error: "חשבונית כבר הופקה להזמנת רכש זו",
      }
    }
  }

  const { data: incomeRow, error: incomeErr } = await supabase
    .from("gl_accounts")
    .select("id, account_code")
    .eq("id", incomeId)
    .maybeSingle()
  if (incomeErr || !incomeRow) {
    return { success: false, error: "חשבון הכנסות לא נמצא" }
  }
  const incomeCode = String(
    (incomeRow as { account_code?: string }).account_code ?? ""
  ).trim()
  if (!incomeCode) {
    return { success: false, error: "קוד חשבון הכנסות חסר" }
  }

  const invoiceNumber = generateInvoiceNumber()
  const memo = payload.headerMemo?.trim() ?? ""
  const fx = Math.max(1e-9, Number(payload.fxRateToIls) || 1)
  const recognizedRevenueIls = roundMoney(totalAmount * fx)

  const customerAr = DEFAULT_CUSTOMER_AR_CODE
  const vatCode = DEFAULT_VAT_OUTPUT_CODE

  const insertRow: Record<string, unknown> = {
    invoice_number: invoiceNumber,
    issue_date: issueDate,
    customer_name: customerName,
    description: memo,
    subtotal,
    vat_amount: vatAmount,
    total_amount: totalAmount,
    gl_account_code_income: incomeCode,
    project_id: payload.projectId?.trim() || null,
    profit_center_label: payload.profitCenterLabel?.trim() || null,
    document_kind: payload.documentKind,
    transaction_mode: payload.transactionMode,
    agent_user_id: payload.agentUserId?.trim() || null,
    currency_code: (payload.currencyCode || "ILS").trim().toUpperCase(),
    fx_rate_to_ils: fx,
    source_progress_report_id: payload.sourceProgressReportId?.trim() || null,
    source_purchase_order_id: payload.sourcePurchaseOrderId?.trim() || null,
    idempotency_key: idemHash,
    income_gl_account_id: incomeId,
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("sales_invoices")
    .insert(insertRow)
    .select("id")
    .single()

  if (insertErr || !inserted) {
    console.error("sales_invoices insert (final):", insertErr)
    return {
      success: false,
      error: formatError(insertErr) || "שמירת החשבונית נכשלה",
    }
  }

  const invoiceId = (inserted as { id: string }).id

  const linePayload = linesIn.map((ln, idx) => ({
    sales_invoice_id: invoiceId,
    sort_order: idx,
    supplier_part_id: ln.supplierPartId?.trim() || null,
    description: ln.description?.trim() || "—",
    uom_id: ln.uomId?.trim() || null,
    quantity: Number(ln.quantity) || 0,
    unit_price: roundMoney(Number(ln.unitPrice)),
    discount_percent: roundMoney(Number(ln.discountPercent)),
    net_unit_price: roundMoney(Number(ln.netUnitPrice)),
    line_total: roundMoney(Number(ln.lineTotal)),
    wbs_node_id: ln.wbsNodeId?.trim() || null,
  }))

  const { error: liErr } = await supabase
    .from("sales_invoice_line_items")
    .insert(linePayload)

  if (liErr) {
    await supabase.from("sales_invoices").delete().eq("id", invoiceId)
    return {
      success: false,
      error: formatError(liErr) || "שמירת שורות נכשלה",
    }
  }

  const journalDebitTotal = roundMoney(totalAmount)
  const journalCreditTotal = roundMoney(subtotal + vatAmount)
  if (Math.abs(journalDebitTotal - journalCreditTotal) > 0.02) {
    await supabase.from("sales_invoice_line_items").delete().eq("sales_invoice_id", invoiceId)
    await supabase.from("sales_invoices").delete().eq("id", invoiceId)
    return {
      success: false,
      error: "פקודת יומן לא מאוזנת — בוטל שמירה",
    }
  }

  const journalDescription = `טיוטת יומן — חשבונית ${invoiceNumber} — ${customerName}`

  const journalResult = await createJournalEntryAction({
    entryDate: issueDate,
    description: journalDescription,
    status: "draft",
    idempotencyKey: `sales_final_${invoiceId}`,
    lines: [
      {
        accountId: customerAr,
        debit: totalAmount,
        credit: 0,
        reference1: invoiceNumber,
        reference2: "",
        details: "חובת לקוח (טיוטה)",
      },
      {
        accountId: incomeId,
        debit: 0,
        credit: subtotal,
        reference1: invoiceNumber,
        reference2: "",
        details: "הכנסות (טיוטה)",
      },
      {
        accountId: vatCode,
        debit: 0,
        credit: vatAmount,
        reference1: invoiceNumber,
        reference2: "",
        details: "מע״מ עסקאות (טיוטה)",
      },
    ],
  })

  if (!journalResult.success) {
    await supabase.from("sales_invoice_line_items").delete().eq("sales_invoice_id", invoiceId)
    await supabase.from("sales_invoices").delete().eq("id", invoiceId)
    return { success: false, error: journalResult.error }
  }

  await supabase
    .from("sales_invoices")
    .update({ draft_journal_entry_id: journalResult.entryId })
    .eq("id", invoiceId)

  if (payload.projectId?.trim()) {
    const pid = payload.projectId.trim()
    const { data: curA } = await supabase
      .from("project_billing_actuals")
      .select("recognized_revenue_ils")
      .eq("project_id", pid)
      .maybeSingle()
    const prev = Number((curA as { recognized_revenue_ils: number } | null)?.recognized_revenue_ils) || 0
    const next = roundMoney(prev + recognizedRevenueIls)
    await supabase.from("project_billing_actuals").upsert(
      {
        project_id: pid,
        recognized_revenue_ils: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" }
    )
  }

  revalidatePath("/marker-ofek/finance/billing/new")
  revalidatePath("/marker-ofek/finance/journal-entries")

  return {
    success: true,
    invoiceId,
    draftJournalEntryId: journalResult.entryId,
    recognizedRevenueIls,
  }
}
