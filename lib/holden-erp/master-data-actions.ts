"use server"

import { revalidatePath } from "next/cache"

import { createServerSupabaseClient } from "@/lib/supabase/server"
import { formatError } from "@/lib/utils"
import type {
  ErpPaymentTermOption,
  MasterDataCurrencyRow,
  MasterDataSupplierPartRow,
  MasterDataSupplierV2Row,
  MasterDataUomRow,
} from "@/types/master-data"

const MASTER_PATH = "/marker-ofek/master-data"

function rev() {
  revalidatePath(MASTER_PATH)
}

export async function fetchCurrenciesAction(): Promise<
  | { ok: true, data: MasterDataCurrencyRow[] }
  | { ok: false, error: string }
> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from("currencies")
      .select("*")
      .order("code", { ascending: true })
    if (error) throw error
    return { ok: true, data: (data ?? []) as MasterDataCurrencyRow[] }
  } catch (e) {
    return { ok: false, error: formatError(e) || "טעינת מטבעות נכשלה" }
  }
}

export async function createCurrencyAction(input: {
  code: string
  name_he: string
  symbol: string
}): Promise<{ ok: true, id: string } | { ok: false, error: string }> {
  try {
    const code = input.code?.trim().toUpperCase()
    const name_he = input.name_he?.trim() ?? ""
    const symbol = input.symbol?.trim() ?? ""
    if (!code || !name_he) {
      return { ok: false, error: "קוד ושם בעברית נדרשים" }
    }
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from("currencies")
      .insert({ code, name_he, symbol })
      .select("id")
      .single()
    if (error) throw error
    rev()
    return { ok: true, id: (data as { id: string }).id }
  } catch (e) {
    return { ok: false, error: formatError(e) || "יצירה נכשלה" }
  }
}

export async function updateCurrencyAction(input: {
  id: string
  code: string
  name_he: string
  symbol: string
}): Promise<{ ok: true } | { ok: false, error: string }> {
  try {
    const id = input.id?.trim()
    const code = input.code?.trim().toUpperCase()
    const name_he = input.name_he?.trim() ?? ""
    const symbol = input.symbol?.trim() ?? ""
    if (!id || !code || !name_he) {
      return { ok: false, error: "שדות חסרים" }
    }
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase
      .from("currencies")
      .update({ code, name_he, symbol })
      .eq("id", id)
    if (error) throw error
    rev()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) || "עדכון נכשל" }
  }
}

export async function deleteCurrencyAction(
  id: string
): Promise<{ ok: true } | { ok: false, error: string }> {
  try {
    const sid = id?.trim()
    if (!sid) return { ok: false, error: "חסר מזהה" }
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.from("currencies").delete().eq("id", sid)
    if (error) throw error
    rev()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) || "מחיקה נכשלה" }
  }
}

export async function fetchUnitsOfMeasureAction(): Promise<
  | { ok: true, data: MasterDataUomRow[] }
  | { ok: false, error: string }
> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from("units_of_measure")
      .select("*")
      .order("code", { ascending: true })
    if (error) throw error
    return { ok: true, data: (data ?? []) as MasterDataUomRow[] }
  } catch (e) {
    return { ok: false, error: formatError(e) || "טעינת יחידות נכשלה" }
  }
}

export async function createUnitOfMeasureAction(input: {
  code: string
  description_he: string
  name_en: string
}): Promise<{ ok: true, id: string } | { ok: false, error: string }> {
  try {
    const code = input.code?.trim().toUpperCase()
    const description_he = input.description_he?.trim() ?? ""
    const name_en = input.name_en?.trim() ?? ""
    if (!code || !description_he) {
      return { ok: false, error: "קוד ותיאור בעברית נדרשים" }
    }
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from("units_of_measure")
      .insert({ code, description_he, name_en })
      .select("id")
      .single()
    if (error) throw error
    rev()
    return { ok: true, id: (data as { id: string }).id }
  } catch (e) {
    return { ok: false, error: formatError(e) || "יצירה נכשלה" }
  }
}

export async function updateUnitOfMeasureAction(input: {
  id: string
  code: string
  description_he: string
  name_en: string
}): Promise<{ ok: true } | { ok: false, error: string }> {
  try {
    const id = input.id?.trim()
    const code = input.code?.trim().toUpperCase()
    const description_he = input.description_he?.trim() ?? ""
    const name_en = input.name_en?.trim() ?? ""
    if (!id || !code || !description_he) {
      return { ok: false, error: "שדות חסרים" }
    }
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase
      .from("units_of_measure")
      .update({ code, description_he, name_en })
      .eq("id", id)
    if (error) throw error
    rev()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) || "עדכון נכשל" }
  }
}

export async function deleteUnitOfMeasureAction(
  id: string
): Promise<{ ok: true } | { ok: false, error: string }> {
  try {
    const sid = id?.trim()
    if (!sid) return { ok: false, error: "חסר מזהה" }
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.from("units_of_measure").delete().eq("id", sid)
    if (error) throw error
    rev()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) || "מחיקה נכשלה" }
  }
}

export async function fetchSupplierPartsAction(): Promise<
  | { ok: true, data: MasterDataSupplierPartRow[] }
  | { ok: false, error: string }
> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from("supplier_parts")
      .select("*")
      .order("updated_at", { ascending: false })
    if (error) throw error
    return { ok: true, data: (data ?? []) as MasterDataSupplierPartRow[] }
  } catch (e) {
    return { ok: false, error: formatError(e) || "טעינת מקט״י נכשלה" }
  }
}

export async function createSupplierPartAction(input: {
  supplier_id: string
  part_number_supplier?: string
  manufacturer?: string
  supplier_name_text?: string
  description_32_chars?: string
  description_48_chars?: string
}): Promise<{ ok: true, id: string } | { ok: false, error: string }> {
  try {
    const supplier_id = input.supplier_id?.trim()
    if (!supplier_id) return { ok: false, error: "נא לבחור ספק" }
    const d32 = (input.description_32_chars ?? "").slice(0, 32)
    const d48 = (input.description_48_chars ?? "").slice(0, 48)
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from("supplier_parts")
      .insert({
        supplier_id,
        part_number_supplier: input.part_number_supplier?.trim() ?? "",
        manufacturer: input.manufacturer?.trim() ?? "",
        supplier_name_text: input.supplier_name_text?.trim() ?? "",
        description_32_chars: d32,
        description_48_chars: d48,
      })
      .select("id")
      .single()
    if (error) throw error
    rev()
    return { ok: true, id: (data as { id: string }).id }
  } catch (e) {
    return { ok: false, error: formatError(e) || "יצירה נכשלה" }
  }
}

export async function updateSupplierPartAction(input: {
  id: string
  supplier_id: string
  part_number_supplier: string
  manufacturer: string
  supplier_name_text: string
  description_32_chars: string
  description_48_chars: string
}): Promise<{ ok: true } | { ok: false, error: string }> {
  try {
    const id = input.id?.trim()
    const supplier_id = input.supplier_id?.trim()
    if (!id || !supplier_id) return { ok: false, error: "שדות חסרים" }
    const d32 = (input.description_32_chars ?? "").slice(0, 32)
    const d48 = (input.description_48_chars ?? "").slice(0, 48)
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase
      .from("supplier_parts")
      .update({
        supplier_id,
        part_number_supplier: input.part_number_supplier?.trim() ?? "",
        manufacturer: input.manufacturer?.trim() ?? "",
        supplier_name_text: input.supplier_name_text?.trim() ?? "",
        description_32_chars: d32,
        description_48_chars: d48,
      })
      .eq("id", id)
    if (error) throw error
    rev()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) || "עדכון נכשל" }
  }
}

export async function deleteSupplierPartAction(
  id: string
): Promise<{ ok: true } | { ok: false, error: string }> {
  try {
    const sid = id?.trim()
    if (!sid) return { ok: false, error: "חסר מזהה" }
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.from("supplier_parts").delete().eq("id", sid)
    if (error) throw error
    rev()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) || "מחיקה נכשלה" }
  }
}

export async function fetchSuppliersV2Action(): Promise<
  | { ok: true, data: MasterDataSupplierV2Row[] }
  | { ok: false, error: string }
> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from("suppliers")
      .select(
        "id, name, supplier_type, tax_id, bank_details, vat_status, balance, payment_term_code, currency_id, entity_id, created_at, updated_at"
      )
      .order("name", { ascending: true })
    if (error) throw error
    return {
      ok: true,
      data: (data ?? []) as MasterDataSupplierV2Row[],
    }
  } catch (e) {
    return { ok: false, error: formatError(e) || "טעינת ספקים נכשלה" }
  }
}

export async function createSupplierV2Action(input: {
  name: string
  supplier_type?: string
  tax_id?: string | null
  payment_term_code?: string | null
  currency_id?: string | null
}): Promise<{ ok: true, id: string } | { ok: false, error: string }> {
  try {
    const name = input.name?.trim() ?? ""
    if (!name) return { ok: false, error: "שם ספק נדרש" }
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        name,
        supplier_type: input.supplier_type?.trim() || "supplier",
        tax_id: input.tax_id?.trim() || null,
        payment_term_code: input.payment_term_code?.trim() || null,
        currency_id: input.currency_id?.trim() || null,
      })
      .select("id")
      .single()
    if (error) throw error
    rev()
    return { ok: true, id: (data as { id: string }).id }
  } catch (e) {
    return { ok: false, error: formatError(e) || "יצירה נכשלה" }
  }
}

export async function updateSupplierV2Action(input: {
  id: string
  name: string
  supplier_type?: string
  tax_id?: string | null
  payment_term_code?: string | null
  currency_id?: string | null
}): Promise<{ ok: true } | { ok: false, error: string }> {
  try {
    const id = input.id?.trim()
    const name = input.name?.trim() ?? ""
    if (!id || !name) return { ok: false, error: "שם נדרש" }
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase
      .from("suppliers")
      .update({
        name,
        supplier_type: input.supplier_type?.trim() || "supplier",
        tax_id: input.tax_id?.trim() || null,
        payment_term_code: input.payment_term_code?.trim() || null,
        currency_id: input.currency_id?.trim() || null,
      })
      .eq("id", id)
    if (error) throw error
    rev()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) || "עדכון נכשל" }
  }
}

export async function deleteSupplierV2Action(
  id: string
): Promise<{ ok: true } | { ok: false, error: string }> {
  try {
    const sid = id?.trim()
    if (!sid) return { ok: false, error: "חסר מזהה" }
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.from("suppliers").delete().eq("id", sid)
    if (error) throw error
    rev()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) || "מחיקה נכשלה" }
  }
}

export async function fetchErpPaymentTermsForMasterAction(): Promise<
  | { ok: true, data: ErpPaymentTermOption[] }
  | { ok: false, error: string }
> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from("erp_payment_terms")
      .select("code, description")
      .order("code", { ascending: true })
    if (error) throw error
    return {
      ok: true,
      data: (data ?? []) as ErpPaymentTermOption[],
    }
  } catch (e) {
    return { ok: false, error: formatError(e) || "טעינת תנאי תשלום נכשלה" }
  }
}
