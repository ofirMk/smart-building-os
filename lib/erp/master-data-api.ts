import { type NextRequest, NextResponse } from "next/server"

import {
  COMPANY_COOKIE_KEY,
  type CompanyContextId,
  resolveCompanyContext,
} from "@/lib/company-context"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

type ApiContext = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>
  companyId: CompanyContextId
  activeCompanyId: CompanyContextId
  userId: string
  userRole: string | null
}

function activeCompanyIdFromSession(req: NextRequest): CompanyContextId | null {
  const cp = req.cookies.get(COMPANY_COOKIE_KEY)?.value
  return resolveCompanyContext(cp)
}

export async function requireMasterDataApiContext(
  req: NextRequest
): Promise<{ ok: true; ctx: ApiContext } | { ok: false; response: NextResponse }> {
  const cronSecret = process.env.CRON_SECRET?.trim()
  const cronBearer = req.headers.get("authorization")?.trim()
  const cronHeader = req.headers.get("x-cron-secret")?.trim()
  const cronAuthorized =
    Boolean(cronSecret) &&
    (cronBearer === `Bearer ${cronSecret}` || cronHeader === cronSecret)
  const headerCompany = resolveCompanyContext(
    req.headers.get("x-active-company-id")?.trim() ?? req.headers.get("x-company-id")?.trim()
  )
  if (cronAuthorized && headerCompany) {
    return {
      ok: true,
      ctx: {
        supabase: createSupabaseServiceRoleClient(),
        companyId: headerCompany,
        activeCompanyId: headerCompany,
        userId: "system-cron",
        userRole: "admin",
      },
    }
  }

  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const activeCompanyId = activeCompanyIdFromSession(req)
  if (!activeCompanyId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Missing active company context. Select an active company first.",
        },
        { status: 400 }
      ),
    }
  }

  const profile = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile.error) {
    return {
      ok: false,
      response: NextResponse.json({ error: profile.error.message }, { status: 500 }),
    }
  }

  return {
    ok: true,
    ctx: {
      supabase,
      companyId: activeCompanyId,
      activeCompanyId,
      userId: user.id,
      userRole: (profile.data as { role?: string } | null)?.role ?? null,
    },
  }
}

export function sanitizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const next = value.trim()
  return next.length > 0 ? next : null
}

