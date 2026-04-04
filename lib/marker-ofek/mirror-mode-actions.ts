"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

import { isPartnerDashboardSuperAdmin } from "@/lib/marker-ofek/partner-metrics/access"
import {
  MIRROR_MODE_COOKIE,
  type ViewAsToken,
} from "@/lib/marker-ofek/mirror-mode-types"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

function normalizeViewAs(raw: string): ViewAsToken {
  const v = raw.trim().toLowerCase()
  if (v === "guy" || v === "samer" || v === "site_manager" || v === "global") return v
  return "global"
}

export async function setMirrorMode(
  viewAs: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, error: "נדרשת התחברות" }
    if (!isPartnerDashboardSuperAdmin(user.email)) {
      return { ok: false, error: "אין הרשאה" }
    }

    const mode = normalizeViewAs(viewAs)
    const jar = await cookies()
    jar.set(MIRROR_MODE_COOKIE, mode, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 90,
      httpOnly: false,
    })
    revalidatePath("/", "layout")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
