"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { isPartnerDashboardSuperAdmin } from "@/lib/marker-ofek/partner-metrics/access"
import { formatError } from "@/lib/utils"
import type { TaxComplianceMode } from "@/lib/marker-ofek/entity-supplier-compliance"

export type MoSystemSettingsRow = {
  singleton_key: number
  default_vat_rate: number
  tax_compliance_mode: TaxComplianceMode
  send_weekly_expiry_report: boolean
  updated_at: string
}

export async function getMoSystemSettings(): Promise<
  { ok: true; settings: MoSystemSettingsRow } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("mo_system_settings")
      .select(
        "singleton_key, default_vat_rate, tax_compliance_mode, send_weekly_expiry_report, updated_at"
      )
      .eq("singleton_key", 1)
      .maybeSingle()

    if (error) {
      if (/relation|does not exist/i.test(error.message)) {
        return {
          ok: true,
          settings: {
            singleton_key: 1,
            default_vat_rate: 18,
            tax_compliance_mode: "warning",
            send_weekly_expiry_report: false,
            updated_at: new Date().toISOString(),
          },
        }
      }
      return { ok: false, error: error.message }
    }
    const row = data as Record<string, unknown> | null
    if (!row) {
      return {
        ok: true,
        settings: {
          singleton_key: 1,
          default_vat_rate: 18,
          tax_compliance_mode: "warning",
          send_weekly_expiry_report: false,
          updated_at: new Date().toISOString(),
        },
      }
    }
    return {
      ok: true,
      settings: {
        singleton_key: 1,
        default_vat_rate: Number(row.default_vat_rate ?? 18),
        tax_compliance_mode:
          row.tax_compliance_mode === "blocking" ? "blocking" : "warning",
        send_weekly_expiry_report: Boolean(row.send_weekly_expiry_report),
        updated_at: String(row.updated_at ?? new Date().toISOString()),
      },
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function updateMoSystemSettings(input: {
  defaultVatRate: number
  taxComplianceMode: TaxComplianceMode
  sendWeeklyExpiryReport: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, error: "נדרשת התחברות" }
    if (!isPartnerDashboardSuperAdmin(user.email)) {
      return { ok: false, error: "מסך זה מיועד לאופיר (מנהל מערכת) בלבד" }
    }

    const vat = Number(input.defaultVatRate)
    if (!Number.isFinite(vat) || vat < 0 || vat > 100) {
      return { ok: false, error: "אחוז מע״מ חייב בין 0 ל־100" }
    }
    const mode = input.taxComplianceMode === "blocking" ? "blocking" : "warning"

    const { error } = await supabase.from("mo_system_settings").upsert(
      {
        singleton_key: 1,
        default_vat_rate: vat,
        tax_compliance_mode: mode,
        send_weekly_expiry_report: Boolean(input.sendWeeklyExpiryReport),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "singleton_key" }
    )

    if (error && !/relation|does not exist/i.test(error.message)) {
      return { ok: false, error: error.message }
    }

    revalidatePath("/marker-ofek/settings/system-rules")
    revalidatePath("/marker-ofek/procurement/purchase-orders/new")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
