"use server"

import {
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
} from "date-fns"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { canViewHoldingExecutive } from "@/lib/marker-ofek/partner-metrics/access"
import { roundMoney } from "@/lib/marker-ofek/partial-account-calc"
import type { AppUserRole } from "@/lib/auth/user-role"
import { formatError } from "@/lib/utils"

export type VatReadinessPayload = {
  monthKey: string
  monthLabel: string
  defaultVatRatePercent: number
  /** עסקאות — חשבוניות מס ללקוח */
  outputNetNis: number
  outputVatNis: number
  outputInvoiceCount: number
  /** תשומות — חשבוניות ספק */
  inputNetNis: number
  inputVatNis: number
  inputInvoiceCount: number
  /** ניכוי במקור צפוי על PO מאושרים שנוצרו בחודש (פרוקסי) */
  withholdingFromPosNis: number
  poWithholdingRows: number
}

function estimateVatFromInclusiveGross(gross: number, ratePct: number): { net: number; vat: number } {
  const r = Math.max(0, ratePct) / 100
  if (gross <= 0 || r <= 0) return { net: 0, vat: 0 }
  const net = roundMoney(gross / (1 + r))
  const vat = roundMoney(gross - net)
  return { net, vat }
}

export async function getVatReadinessForMonth(
  monthKey: string
): Promise<{ ok: true; data: VatReadinessPayload } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id || !user.email) return { ok: false, error: "נדרשת התחברות" }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
    const role = (profile as { role?: AppUserRole } | null)?.role ?? null
    if (!canViewHoldingExecutive(user.email, role)) {
      return { ok: false, error: "אין הרשאה לדוח מע״מ" }
    }

    const key = monthKey.trim()
    if (!/^\d{4}-\d{2}$/.test(key)) {
      return { ok: false, error: "פורמט חודש: YYYY-MM" }
    }

    const start = startOfMonth(parseISO(`${key}-01`))
    const end = endOfMonth(start)
    const startIso = format(start, "yyyy-MM-dd")
    const endIso = format(end, "yyyy-MM-dd")

    const { data: cp } = await supabase
      .from("company_profile")
      .select("default_vat_rate_percent")
      .limit(1)
      .maybeSingle()
    const defaultVatRatePercent = Number(
      (cp as { default_vat_rate_percent?: number } | null)?.default_vat_rate_percent ?? 18
    )

    const [{ data: outInv, error: outErr }, { data: supInv, error: supErr }, { data: pos, error: poErr }] =
      await Promise.all([
        supabase
          .from("mo_invoices")
          .select("subtotal, vat_amount")
          .gte("issue_date", startIso)
          .lte("issue_date", endIso),
        supabase
          .from("supplier_invoices")
          .select("total_amount, vat_amount")
          .gte("invoice_date", startIso)
          .lte("invoice_date", endIso),
        supabase
          .from("purchase_orders")
          .select("total_amount, withholding_tax_percent, created_at")
          .eq("is_deleted", false)
          .gte("created_at", `${startIso}T00:00:00`)
          .lte("created_at", `${endIso}T23:59:59`),
      ])

    if (outErr) return { ok: false, error: outErr.message }
    if (supErr && !/relation|does not exist/i.test(supErr.message)) {
      return { ok: false, error: supErr.message }
    }
    if (poErr && !/column|does not exist/i.test(poErr.message)) {
      return { ok: false, error: poErr.message }
    }

    let outputNetNis = 0
    let outputVatNis = 0
    let outputInvoiceCount = 0
    for (const r of outInv ?? []) {
      const row = r as { subtotal?: number; vat_amount?: number }
      const st = Number(row.subtotal ?? 0) || 0
      const va = Number(row.vat_amount ?? 0) || 0
      if (st <= 0 && va <= 0) continue
      outputNetNis += st
      outputVatNis += va
      outputInvoiceCount += 1
    }
    outputNetNis = roundMoney(outputNetNis)
    outputVatNis = roundMoney(outputVatNis)

    let inputNetNis = 0
    let inputVatNis = 0
    let inputInvoiceCount = 0
    for (const r of supInv ?? []) {
      const row = r as { total_amount?: number; vat_amount?: number | null }
      const gross = Number(row.total_amount ?? 0) || 0
      if (gross <= 0) continue
      const explicit = row.vat_amount
      if (explicit != null && Number.isFinite(Number(explicit))) {
        const vat = roundMoney(Number(explicit))
        const net = roundMoney(gross - vat)
        inputNetNis += net
        inputVatNis += vat
      } else {
        const { net, vat } = estimateVatFromInclusiveGross(gross, defaultVatRatePercent)
        inputNetNis += net
        inputVatNis += vat
      }
      inputInvoiceCount += 1
    }
    inputNetNis = roundMoney(inputNetNis)
    inputVatNis = roundMoney(inputVatNis)

    let withholdingFromPosNis = 0
    let poWithholdingRows = 0
    for (const r of pos ?? []) {
      const row = r as { total_amount?: number; withholding_tax_percent?: number }
      const amt = Number(row.total_amount ?? 0) || 0
      const pct = Number(row.withholding_tax_percent ?? 0) || 0
      if (amt <= 0 || pct <= 0) continue
      withholdingFromPosNis += roundMoney((amt * pct) / 100)
      poWithholdingRows += 1
    }
    withholdingFromPosNis = roundMoney(withholdingFromPosNis)

    const monthLabel = format(start, "MMMM yyyy", { locale: undefined })

    return {
      ok: true,
      data: {
        monthKey: key,
        monthLabel,
        defaultVatRatePercent,
        outputNetNis,
        outputVatNis,
        outputInvoiceCount,
        inputNetNis,
        inputVatNis,
        inputInvoiceCount,
        withholdingFromPosNis,
        poWithholdingRows,
      },
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
