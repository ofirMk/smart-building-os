"use server"

import { createServerSupabaseClient } from "@/lib/supabase/server"
import { formatError } from "@/lib/utils"

type ContractEmbed = {
  contract_number?: string | null
  name?: string | null
  entities?: { name?: string | null } | null
  projects?: { name?: string | null } | null
}

function contractorNameFromContract(contract: ContractEmbed | null) {
  if (!contract) return "קבלן לא ידוע"
  const entityName = contract.entities?.name
  if (entityName != null && String(entityName).trim() !== "") {
    return String(entityName).trim()
  }
  if (contract.name != null && String(contract.name).trim() !== "") {
    return String(contract.name).trim()
  }
  return "קבלן לא ידוע"
}

function fixedNameField(s: string, width: number) {
  const t = s.trim().normalize("NFC")
  if (t.length >= width) return t.slice(0, width)
  return t + " ".repeat(width - t.length)
}

function fixedAmountField(n: number, width: number) {
  const rounded = Math.round(n * 100) / 100
  return rounded.toFixed(2).padStart(width, " ")
}

export async function generateMasavFileAction(
  paymentIds: string[]
): Promise<
  { success: true; fileContent: string } | { success: false; error: string }
> {
  if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
    return { success: false, error: "נא לבחור לפחות דוח אחד" }
  }

  const uniqueIds = [...new Set(paymentIds.map((id) => String(id)))]

  const supabase = await createServerSupabaseClient()

  const { data: mqData, error: mqErr } = await supabase
    .from("masav_queue_items")
    .select("id, amount_ils, payee_label, reference_label")
    .in("id", uniqueIds)
    .eq("status", "draft")

  if (mqErr) {
    return {
      success: false,
      error: formatError(mqErr) || mqErr.message || "שגיאת שרת",
    }
  }

  const mqRows = mqData ?? []
  const mqIds = new Set(mqRows.map((r) => String((r as { id: string }).id)))
  const reportIds = uniqueIds.filter((id) => !mqIds.has(id))

  const { data, error } =
    reportIds.length === 0
      ? { data: [], error: null as null }
      : await supabase
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
          .in("id", reportIds)
          .eq("status", "approved")

  if (error) {
    return {
      success: false,
      error: formatError(error) || error.message || "שגיאת שרת",
    }
  }

  const rows = data ?? []

  if (rows.length !== reportIds.length) {
    return {
      success: false,
      error: "חלק מהדוחות לא נמצאו או שאינם במצב מאושר",
    }
  }

  if (mqRows.length + rows.length !== uniqueIds.length) {
    return {
      success: false,
      error: "חלק מהשורות לא נמצאו בתור התשלומים או בדוחות",
    }
  }

  const runDate = new Date().toISOString().slice(0, 10)
  type Txn = { sortId: string, name: string, amount: number }
  const combined: Txn[] = []

  for (const row of rows) {
    const c = row.contracts as ContractEmbed | ContractEmbed[] | null
    const contract = Array.isArray(c) ? c[0] : c
    const name = contractorNameFromContract(contract ?? null)
    const raw = row.total_payable
    const n = Number(raw)
    const amount = Number.isFinite(n) ? n : 0
    combined.push({ sortId: String(row.id), name, amount })
  }

  for (const mq of mqRows) {
    const m = mq as {
      id: string
      amount_ils: number
      payee_label: string
      reference_label: string
    }
    const amount = Number(m.amount_ils) || 0
    const name = String(m.payee_label ?? "").trim() || "ספק"
    combined.push({ sortId: String(m.id), name, amount })
  }

  const sorted = [...combined].sort((a, b) =>
    a.sortId.localeCompare(b.sortId)
  )

  const count = sorted.length
  const headerLine = `H MASAV-MVP ${runDate} TXN_COUNT=${String(count).padStart(6, "0")}`

  let grandTotal = 0
  const transactionLines: string[] = []

  for (const row of sorted) {
    grandTotal += row.amount
    const name30 = fixedNameField(row.name, 30)
    const amt15 = fixedAmountField(row.amount, 15)
    transactionLines.push(`T ${name30}${amt15}`)
  }

  const totalStr = fixedAmountField(grandTotal, 15)
  const footerLine = `F END TOTAL=${totalStr} COUNT=${String(count).padStart(6, "0")}`

  const fileContent = [headerLine, ...transactionLines, footerLine].join("\n")

  return { success: true, fileContent }
}
