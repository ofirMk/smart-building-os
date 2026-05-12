"use server"

/**
 * W2.5 — Supplier Agreement Type Action (MedaTech §2.1.2).
 *
 * Sets the agreement_type strategy on a supplier. This drives the
 * Tender Engine decision on which contract template to instantiate
 * when awarding a winning bid (PRICE_LIST, FRAME_PO, QUOTE, or NONE).
 *
 * Uses the authenticated server client so RLS applies.
 */

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type SupplierAgreementType =
  | "NONE"
  | "PRICE_LIST"
  | "FRAME_PO"
  | "QUOTE"

const VALID_AGREEMENT_TYPES: ReadonlySet<SupplierAgreementType> = new Set<
  SupplierAgreementType
>(["NONE", "PRICE_LIST", "FRAME_PO", "QUOTE"])

export type SetSupplierAgreementTypeResult =
  | { ok: true; supplierId: string; agreementType: SupplierAgreementType }
  | { ok: false; error: string }

export async function setSupplierAgreementTypeAction(input: {
  supplierId: string
  agreementType: SupplierAgreementType
}): Promise<SetSupplierAgreementTypeResult> {
  try {
    if (!input.supplierId) {
      return { ok: false, error: "supplierId is required" }
    }
    if (!VALID_AGREEMENT_TYPES.has(input.agreementType)) {
      return {
        ok: false,
        error: `agreementType must be one of: ${Array.from(VALID_AGREEMENT_TYPES).join(", ")}`,
      }
    }
    const supabase = await createSupabaseServerAuthClient()
    const { error } = await supabase
      .from("erp_md_suppliers")
      .update({ agreement_type: input.agreementType })
      .eq("id", input.supplierId)
    if (error) {
      return { ok: false, error: error.message ?? "Update failed" }
    }
    revalidatePath("/marker-ofek/procurement/suppliers")
    revalidatePath(`/marker-ofek/procurement/suppliers/${input.supplierId}`)
    return {
      ok: true,
      supplierId: input.supplierId,
      agreementType: input.agreementType,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}
