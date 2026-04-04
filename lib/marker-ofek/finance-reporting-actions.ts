"use server"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import {
  canViewHoldingExecutive,
  resolvePartnerMetricsPersona,
} from "@/lib/marker-ofek/partner-metrics/access"
import { roundMoney } from "@/lib/marker-ofek/partial-account-calc"
import { formatError } from "@/lib/utils"
import type { AppUserRole } from "@/lib/auth/user-role"

export type ProjectOverheadPolicyInput = {
  projectId: string
  method: "revenue_based" | "labor_based" | "fixed_rate"
  fixedRatePercent: number
}

export async function upsertProjectOverheadPolicy(
  input: ProjectOverheadPolicyInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const pid = String(input.projectId ?? "").trim()
    if (!pid) return { ok: false, error: "חסר פרויקט" }

    const { error } = await supabase.from("project_overhead_allocation").upsert(
      {
        project_id: pid,
        method: input.method,
        fixed_rate_percent: Math.min(
          100,
          Math.max(0, Number(input.fixedRatePercent) || 0)
        ),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" }
    )

    if (error) {
      if (/does not exist|relation/i.test(error.message)) {
        return {
          ok: false,
          error: "הריצו מיגרציות — חסרה טבלת project_overhead_allocation",
        }
      }
      return { ok: false, error: error.message }
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export type VatProjectRow = {
  projectId: string
  projectName: string
  projectCode: string
  outputSubtotalNis: number
  outputVatNis: number
  outputGrandNis: number
}

export type VatSummaryPayload = {
  outputSubtotalNis: number
  outputVatNis: number
  outputGrandNis: number
  byProject: VatProjectRow[]
  inputVatNote: string
}

/**
 * דוח מע״מ פלט לפי פרויקט — מקור: mo_invoices (מאושר/שולם), ללא כפילות עם חשבוניות אחרות.
 * קלט (תשומות): יש לקשר חשבוניות ספק עם פירוט מע״מ — טבלאות נפרדות.
 */
export async function getMoVatSummaryByProject(): Promise<
  { ok: true; data: VatSummaryPayload } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id || !user.email) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
    const role = (profile as { role?: AppUserRole } | null)?.role ?? null
    const persona = resolvePartnerMetricsPersona(user.email)
    if (!canViewHoldingExecutive(user.email, role) && !persona) {
      return { ok: false, error: "אין הרשאה" }
    }

    const { data: inv, error } = await supabase
      .from("mo_invoices")
      .select(
        "project_id, subtotal, vat_amount, grand_total, status, projects(name, internal_project_code)"
      )
      .in("status", ["approved", "paid"])

    if (error) return { ok: false, error: error.message }

    type InvRow = {
      project_id: string
      subtotal?: number
      vat_amount?: number
      grand_total?: number
      projects?:
        | { name?: string; internal_project_code?: string }
        | { name?: string; internal_project_code?: string }[]
    }

    const byPid = new Map<
      string,
      { name: string; code: string; sub: number; vat: number; grand: number }
    >()

    for (const raw of (inv ?? []) as InvRow[]) {
      const pid = raw.project_id
      if (!pid) continue
      const sub = Number(raw.subtotal ?? 0) || 0
      const vat = Number(raw.vat_amount ?? 0) || 0
      const grand = Number(raw.grand_total ?? 0) || 0
      const emb = raw.projects
      const p = Array.isArray(emb) ? emb[0] : emb
      const prev = byPid.get(pid) ?? {
        name: String(p?.name ?? "—"),
        code: String(p?.internal_project_code ?? ""),
        sub: 0,
        vat: 0,
        grand: 0,
      }
      prev.sub = roundMoney(prev.sub + sub)
      prev.vat = roundMoney(prev.vat + vat)
      prev.grand = roundMoney(prev.grand + grand)
      if (p?.name) prev.name = String(p.name)
      if (p?.internal_project_code) prev.code = String(p.internal_project_code)
      byPid.set(pid, prev)
    }

    const byProject: VatProjectRow[] = [...byPid.entries()].map(([projectId, v]) => ({
      projectId,
      projectName: v.name,
      projectCode: v.code,
      outputSubtotalNis: v.sub,
      outputVatNis: v.vat,
      outputGrandNis: v.grand,
    }))
    byProject.sort((a, b) => a.projectCode.localeCompare(b.projectCode, "he"))

    let outputSubtotalNis = 0
    let outputVatNis = 0
    let outputGrandNis = 0
    for (const r of byProject) {
      outputSubtotalNis += r.outputSubtotalNis
      outputVatNis += r.outputVatNis
      outputGrandNis += r.outputGrandNis
    }

    return {
      ok: true,
      data: {
        outputSubtotalNis: roundMoney(outputSubtotalNis),
        outputVatNis: roundMoney(outputVatNis),
        outputGrandNis: roundMoney(outputGrandNis),
        byProject,
        inputVatNote:
          "מע״מ תשומות: קליטה מ־supplier_invoices.vat_amount / mo_supplier_invoices כשמפורט — מחובר לרכש.",
      },
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
