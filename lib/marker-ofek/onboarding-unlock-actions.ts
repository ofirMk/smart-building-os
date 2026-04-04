"use server"

import { revalidatePath } from "next/cache"

import {
  MARKER_DEMO_SANDBOX_PROJECT_ID,
  MARKER_ONBOARDING_SANDBOX_PATH,
} from "@/lib/marker-ofek/hr-qualification-gate"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

export async function getSandboxOnboardingState(): Promise<{
  isQualified: boolean
}> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { isQualified: true }

    const { data, error } = await supabase
      .from("user_onboarding_status")
      .select("is_qualified")
      .eq("user_id", user.id)
      .maybeSingle()

    if (error || !data) return { isQualified: true }
    return { isQualified: Boolean((data as { is_qualified?: boolean }).is_qualified) }
  } catch {
    return { isQualified: true }
  }
}

/**
 * אימות שמירת ניכוי מס בהזמנת רכש על פרויקט הדמו — פותח גישה מלאה.
 * נקרא אחרי עדכון שדות מס ב־PO (לא חוסם UI).
 */
export async function tryUnlockQualificationAfterDemoPoTaxSave(input: {
  poId: string
  withholdingTaxPercent: number
}): Promise<void> {
  try {
    const poId = input.poId.trim()
    if (!poId) return
    const pct = Number(input.withholdingTaxPercent)
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return

    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return

    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .select("id, project_id, is_deleted")
      .eq("id", poId)
      .maybeSingle()
    if (poErr || !po) return

    const row = po as { project_id?: string | null; is_deleted?: boolean }
    if (row.is_deleted) return
    const pid = row.project_id?.trim()
    if (pid !== MARKER_DEMO_SANDBOX_PROJECT_ID) return

    const { error: upErr } = await supabase.from("user_onboarding_status").upsert(
      {
        user_id: user.id,
        is_qualified: true,
        qualified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    if (upErr) {
      if (!/relation|does not exist|column/i.test(String(upErr.message ?? ""))) {
        console.error("[onboarding-unlock] upsert failed:", upErr.message)
      }
      return
    }

    revalidatePath("/marker-ofek")
    revalidatePath(MARKER_ONBOARDING_SANDBOX_PATH)
  } catch (e) {
    console.error("[onboarding-unlock] tryUnlockQualificationAfterDemoPoTaxSave:", formatError(e))
  }
}

/** סיום ידני / אחרי אנימציה — מסמן מוסמך (אם כבר עמד בתנאים; idempotent) */
export async function unlockFullWorkspace(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: po } = await supabase
      .from("purchase_orders")
      .select("id, withholding_tax_percent")
      .eq("project_id", MARKER_DEMO_SANDBOX_PROJECT_ID)
      .eq("is_deleted", false)
      .gt("withholding_tax_percent", 0)
      .limit(1)
      .maybeSingle()

    if (!po) {
      return {
        ok: false,
        error: "יש לשמור הזמנת רכש בפרויקט האימון עם ניכוי מס במקור תקין (גדול מ־0).",
      }
    }

    const { error } = await supabase.from("user_onboarding_status").upsert(
      {
        user_id: user.id,
        is_qualified: true,
        qualified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    if (error) throw error

    revalidatePath("/marker-ofek")
    revalidatePath(MARKER_ONBOARDING_SANDBOX_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
