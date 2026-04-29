import { type NextRequest, NextResponse } from "next/server"

import {
  COMPANY_COOKIE_KEY,
  type CompanyContextId,
  resolveCompanyContext,
} from "@/lib/company-context"
import { apiErrorResponse, unknownApiErrorResponse } from "@/lib/api/api-error"
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

async function userHasExplicitCompanyMembership(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>
  userId: string
  companyId: CompanyContextId
}): Promise<{ ok: true } | { ok: false; error: string; status: number; code: string }> {
  const { supabase, userId, companyId } = params
  const { data, error } = await supabase
    .from("erp_user_company_memberships")
    .select("user_id, company_id, is_active")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      status: 500,
      code: "COMPANY_MEMBERSHIP_READ_FAILED",
      error: error.message,
    }
  }

  if (!data) {
    return {
      ok: false,
      status: 403,
      code: "COMPANY_CONTEXT_FORBIDDEN",
      error: "User has no explicit membership for the selected company context.",
    }
  }

  return { ok: true }
}

export async function requireMasterDataApiContext(
  req: NextRequest
): Promise<{ ok: true; ctx: ApiContext } | { ok: false; response: NextResponse }> {
  try {
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
      const companyExists = await createSupabaseServiceRoleClient()
        .from("erp_companies")
        .select("id")
        .eq("id", headerCompany)
        .maybeSingle()
      if (companyExists.error || !companyExists.data?.id) {
        return {
          ok: false,
          response: apiErrorResponse(
            400,
            "INVALID_COMPANY_CONTEXT",
            companyExists.error?.message ?? "Unknown company context in cron request"
          ),
        }
      }
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
        response: apiErrorResponse(401, "UNAUTHORIZED", "Unauthorized"),
      }
    }

    const activeCompanyId = activeCompanyIdFromSession(req)
    if (!activeCompanyId) {
      return {
        ok: false,
        response: apiErrorResponse(
          400,
          "MISSING_COMPANY_CONTEXT",
          "Missing active company context. Select an active company first."
        ),
      }
    }

    const membership = await userHasExplicitCompanyMembership({
      supabase,
      userId: user.id,
      companyId: activeCompanyId,
    })
    if (!membership.ok) {
      return {
        ok: false,
        response: apiErrorResponse(membership.status, membership.code, membership.error),
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
        response: apiErrorResponse(500, "PROFILE_READ_FAILED", profile.error.message),
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
  } catch (error) {
    return {
      ok: false,
      response: unknownApiErrorResponse(500, "API_CONTEXT_BOOTSTRAP_FAILED", error),
    }
  }
}

export function sanitizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const next = value.trim()
  return next.length > 0 ? next : null
}

export type DecimalParseOptions = {
  maxDecimals?: number
  minValueInclusive?: number
  minValueExclusive?: number
  allowNegative?: boolean
}

/**
 * סוגות עשרוניות בטוחות (FP-safe).
 *
 * שומרים את הקלט כמחרוזת בפורמט Postgres `numeric`, מעבירים ישירות לפוסטגרס
 * שמפרסר ב-arbitrary precision. כך אין roundtrip דרך JS Number/double שגורם לרעש
 * עיגול (למשל 0.1 + 0.2 = 0.30000000000000004).
 *
 * **חשוב**: כל כפל/חילוק על ערכים אלה ב-runtime חייב להתבצע ב-SQL או דרך ספריית
 * decimal (decimal.js / big.js). אסור להמיר ל-Number ולכפול.
 */
export function sanitizeDecimalString(
  value: unknown,
  opts: DecimalParseOptions = {}
): string | null {
  const {
    maxDecimals = 4,
    minValueInclusive,
    minValueExclusive,
    allowNegative = false,
  } = opts

  let raw: string
  if (typeof value === "string") raw = value.trim()
  else if (typeof value === "number" && Number.isFinite(value)) raw = String(value)
  else return null
  if (raw.length === 0) return null

  raw = raw.replace(",", ".")
  if (/[eE]/.test(raw)) return null

  const signPattern = allowNegative ? "-?" : ""
  const decimalPattern = maxDecimals > 0 ? `(?:\\.\\d{1,${maxDecimals}})?` : ""
  const regex = new RegExp(`^${signPattern}\\d+${decimalPattern}$`)
  if (!regex.test(raw)) return null

  const negative = raw.startsWith("-")
  const body = negative ? raw.slice(1) : raw
  const [intPart, fracPart] = body.split(".")
  const trimmedInt = intPart.replace(/^0+(?=\d)/, "") || "0"
  const normalized =
    (negative && trimmedInt !== "0" ? "-" : "") +
    trimmedInt +
    (fracPart !== undefined ? `.${fracPart}` : "")

  // בדיקות גבולות — מבוצעות דרך השוואת מחרוזת + Number, אבל הערך עצמו נשמר כמחרוזת
  const asNumber = Number(normalized)
  if (
    minValueInclusive !== undefined &&
    Number.isFinite(asNumber) &&
    asNumber < minValueInclusive
  ) {
    return null
  }
  if (
    minValueExclusive !== undefined &&
    Number.isFinite(asNumber) &&
    asNumber <= minValueExclusive
  ) {
    return null
  }

  return normalized
}

