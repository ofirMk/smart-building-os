import "server-only"

import { createServerSupabaseClient } from "@/lib/supabase/server"
import { formatError } from "@/lib/utils"
import type {
  FetchPendingPaymentsResult,
  PendingPaymentRow,
} from "@/types/holden-finance"

type ContractEmbed = {
  contract_number?: string | null
  name?: string | null
  entities?: { name?: string | null } | null
  projects?: { name?: string | null } | null
}

/**
 * דוחות התקדמות מאושרים ללא סימון שולם (כרגע רק לפי status = approved).
 * סכום לתשלום: `total_payable` (אין עמודת approved_amount ב־DB).
 */
export async function fetchPendingPayments(): Promise<FetchPendingPaymentsResult> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from("project_progress_reports")
    .select(
      `
      id,
      report_date,
      total_payable,
      status,
      gl_account_code,
      contracts!inner (
        contract_number,
        name,
        entities (
          name
        ),
        projects (
          name
        )
      )
    `
    )
    .eq("status", "approved")
    // כשתתווסף עמודה: .neq("payment_status", "paid")
    .order("report_date", { ascending: true })

  if (error) {
    console.error("Error fetching pending payments:", error)
    return {
      success: false,
      data: [],
      error: formatError(error) || error.message || "שגיאת טעינה",
    }
  }

  const rows = data ?? []
  const formattedData: PendingPaymentRow[] = rows.map((row) => {
    const c = row.contracts as ContractEmbed | ContractEmbed[] | null
    const contract = Array.isArray(c) ? c[0] : c

    let contractorName = "קבלן לא ידוע"
    const entityName = contract?.entities?.name
    if (entityName != null && String(entityName).trim() !== "") {
      contractorName = String(entityName).trim()
    } else if (
      contract?.name != null &&
      String(contract.name).trim() !== ""
    ) {
      contractorName = String(contract.name).trim()
    }

    const projName = contract?.projects?.name
    const projectName =
      projName != null && String(projName).trim() !== ""
        ? String(projName).trim()
        : "פרויקט כללי"

    const raw = row.total_payable
    const n = Number(raw)
    const amount = Number.isFinite(n) ? n : 0

    return {
      id: String(row.id),
      date: row.report_date,
      contractorName,
      contractNumber: String(contract?.contract_number ?? "").trim(),
      projectName,
      amount,
      glAccountCode:
        row.gl_account_code != null ? String(row.gl_account_code) : null,
      paymentSource: "progress_report" as const,
    }
  })

  const { data: mqRows, error: mqErr } = await supabase
    .from("masav_queue_items")
    .select("id, amount_ils, payee_label, reference_label, created_at")
    .eq("status", "draft")
    .order("created_at", { ascending: true })

  if (mqErr) {
    console.error("masav_queue_items:", mqErr)
  } else {
    for (const mq of mqRows ?? []) {
      const m = mq as {
        id: string
        amount_ils: number
        payee_label: string
        reference_label: string
        created_at: string
      }
      const amount = Number(m.amount_ils) || 0
      formattedData.push({
        id: String(m.id),
        date: m.created_at?.slice(0, 10) ?? null,
        contractorName: String(m.payee_label ?? "").trim() || "ספק",
        contractNumber: String(m.reference_label ?? "").trim(),
        projectName: "רכש — קבלת מחסן",
        amount,
        glAccountCode: null,
        paymentSource: "procurement_masav",
      })
    }
  }

  return { success: true, data: formattedData }
}
