"use server"

import { fetchVendorTaxStatusFromOpenData } from "@/lib/finance/israel-tax-registry-open-data"
import { namesLikelyMatch } from "@/lib/finance/registry-name-match"
import { formatError } from "@/lib/utils"

export type TaxIdVerifyResult =
  | {
      ok: true
      match: true
      registryName: string | null
    }
  | {
      ok: true
      match: false
      reason: "not_found" | "name_mismatch"
      registryName: string | null
      message: string
    }
  | { ok: false; error: string }

/**
 * בדיקת התאמה בין שם לקוח לבין רישום במאגר המידע הפתוח (ניכוי במקור / ציות).
 */
export async function verifyClientTaxIdAgainstGovernmentRegistry(input: {
  taxId: string
  clientName: string
}): Promise<TaxIdVerifyResult> {
  const taxId = input.taxId?.trim() ?? ""
  const clientName = input.clientName?.trim() ?? ""
  if (!taxId) {
    return { ok: false, error: "חסר מספר ח.פ./ע.מ." }
  }
  if (!clientName) {
    return { ok: false, error: "חסר שם לקוח להשוואה" }
  }

  try {
    const res = await fetchVendorTaxStatusFromOpenData(taxId)
    if (!res.ok) {
      return { ok: false, error: res.error }
    }

    if (!res.data.found) {
      return {
        ok: true,
        match: false,
        reason: "not_found",
        registryName: null,
        message: "לא נמצא רישום במאגר המידע הפתוח למספר זה.",
      }
    }

    const regName = res.data.registeredName
    if (!regName) {
      return {
        ok: true,
        match: true,
        registryName: null,
      }
    }

    if (namesLikelyMatch(clientName, regName)) {
      return {
        ok: true,
        match: true,
        registryName: regName,
      }
    }

    return {
      ok: true,
      match: false,
      reason: "name_mismatch",
      registryName: regName,
      message: `השם במאגר: «${regName}» — אינו תואם את שם הלקוח שהוזן.`,
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
