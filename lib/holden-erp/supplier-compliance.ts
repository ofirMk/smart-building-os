"use server"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { SupplierTaxComplianceResult } from "@/types/holden-finance"

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (expiresAt == null || String(expiresAt).trim() === "") return false
  const d = String(expiresAt).slice(0, 10)
  return d < todayUtcDateString()
}

/**
 * בודק תוקף אישור ניהול ספרים ואישור ניכוי מס לפני מעבר חשבון חלקי ל־Paid.
 * משתמש בשדות החדשים וב־legacy (bookkeeping_auth_expiry / withholding_tax_expiry).
 */
export async function checkSupplierTaxCompliance(
  entityId: string
): Promise<SupplierTaxComplianceResult> {
  const id = entityId?.trim()
  if (!id) {
    return { ok: false, code: "MISSING_ENTITY", reason: "חסר מזהה ישות" }
  }

  const supabase = await createSupabaseServerAuthClient()

  const { data: ent, error } = await supabase
    .from("entities")
    .select(
      `
      id,
      bookkeeping_cert_expires_at,
      bookkeeping_cert_expiry,
      withholding_tax_expires_at,
      bookkeeping_auth_expiry,
      withholding_tax_expiry,
      is_deleted
    `
    )
    .eq("id", id)
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      code: "LOAD_ERROR",
      reason: error.message,
    }
  }

  const row = ent as {
    is_deleted?: boolean
    bookkeeping_cert_expires_at?: string | null
    bookkeeping_cert_expiry?: string | null
    withholding_tax_expires_at?: string | null
    bookkeeping_auth_expiry?: string | null
    withholding_tax_expiry?: string | null
  } | null

  if (!row || row.is_deleted) {
    return { ok: false, code: "ENTITY_NOT_FOUND", reason: "ישות לא נמצאה" }
  }

  const cert =
    row.bookkeeping_cert_expires_at ??
    row.bookkeeping_cert_expiry ??
    row.bookkeeping_auth_expiry ??
    null
  const wh =
    row.withholding_tax_expires_at ?? row.withholding_tax_expiry ?? null

  if (isExpired(cert)) {
    return {
      ok: false,
      code: "BOOKKEEPING_EXPIRED",
      reason:
        "אישור ניהול ספרים פג תוקף — לא ניתן לסמן תשלום עד לחידוש האישור",
    }
  }

  if (isExpired(wh)) {
    return {
      ok: false,
      code: "WITHHOLDING_EXPIRED",
      reason:
        "אישור ניכוי במקור פג תוקף — לא ניתן לסמן תשלום עד לחידוש האישור",
    }
  }

  return { ok: true }
}
