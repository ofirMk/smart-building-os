"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { isPartnerDashboardSuperAdmin } from "@/lib/marker-ofek/partner-metrics/access"
import type { OverheadAllocationMethod } from "@/lib/marker-ofek/project-overhead-loading"
import { formatError } from "@/lib/utils"

export type CompanyGlobalOverheadMethod = Exclude<
  OverheadAllocationMethod,
  "per_project"
>

function normalizeCompanyGlobalMethod(
  raw: string | null | undefined
): CompanyGlobalOverheadMethod {
  return String(raw ?? "").trim().toLowerCase() === "labor_hours"
    ? "labor_hours"
    : "revenue_pct"
}

export async function getCompanyOverheadAllocationMethod(): Promise<
  | { ok: true; method: CompanyGlobalOverheadMethod }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("company_profile")
      .select("overhead_allocation_method")
      .limit(1)
      .maybeSingle()

    if (error && !/column|does not exist/i.test(error.message)) {
      return { ok: false, error: error.message }
    }
    const method = normalizeCompanyGlobalMethod(
      (data as { overhead_allocation_method?: string } | null)?.overhead_allocation_method
    )
    return { ok: true, method }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function setCompanyOverheadAllocationMethod(
  method: CompanyGlobalOverheadMethod
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, error: "נדרשת התחברות" }
    if (!isPartnerDashboardSuperAdmin(user.email)) {
      return { ok: false, error: "רק אופיר (סופר-אדמין) רשאי לשנות מדיניות העמסה" }
    }

    const m = method === "labor_hours" ? "labor_hours" : "revenue_pct"

    const { data: row, error: selErr } = await supabase
      .from("company_profile")
      .select("id")
      .limit(1)
      .maybeSingle()

    if (selErr) return { ok: false, error: selErr.message }

    const id = (row as { id?: string } | null)?.id
    if (!id) {
      return { ok: false, error: "חסר company_profile — הריצו מיגרציות" }
    }

    const { error } = await supabase
      .from("company_profile")
      .update({ overhead_allocation_method: m })
      .eq("id", id)

    if (error) return { ok: false, error: error.message }

    revalidatePath("/marker-ofek/command-center")
    revalidatePath("/management")
    revalidatePath("/marker-ofek/finance/overhead")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
