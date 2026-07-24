"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerClient } from "@/lib/supabase/server"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeaturesConfig = {
  ev_charging: boolean
  elevator_monitoring: boolean
  pump_monitoring: boolean
  smart_locks: boolean
  cctv: boolean
  energy_metering: boolean
  iot_gateway: boolean
  cleaning: boolean
  gardening: boolean
  pest_control: boolean
}

export type CreateBuildingInput = {
  // Step 1 — פרטי הנכס
  name: string
  address_line1: string
  address_line2: string
  city: string
  region: string
  postal_code: string
  site_id: string          // empty string = no site

  // Step 2 — מאפייני הבניין
  total_floors: number | null
  planned_units: number | null
  year_built: number | null

  // Step 3 — חוזה ניהול
  contract_type: "full_maintenance" | "basic_management" | "premium" | "custom"
  agreement_reference: string
  agreement_signed_at: string  // ISO date string "YYYY-MM-DD" or ""

  // Step 4 — ועד הדיירים
  committee_contact_name: string
  committee_contact_phone: string
  committee_contact_email: string

  // Step 5 — שירותים חכמים
  features: FeaturesConfig
}

export type CreateBuildingResult =
  | { ok: true; buildingId: string }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function createBuilding(
  input: CreateBuildingInput
): Promise<CreateBuildingResult> {
  // Basic validation
  if (!input.name?.trim()) return { ok: false, error: "שם הבניין הוא שדה חובה" }
  if (!input.city?.trim()) return { ok: false, error: "עיר היא שדה חובה" }

  try {
    const supabase = createSupabaseServerClient()

    // ------------------------------------------------------------------
    // 1. Get the current user's company_id
    // ------------------------------------------------------------------
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { ok: false, error: "נדרשת התחברות" }

    // Fetch the company_id of the first company this user manages
    // (erp_company_members → company_id).  Falls back to the first company.
    let companyId: string | null = null

    const { data: membership } = await supabase
      .from("erp_company_members")
      .select("company_id")
      .eq("profile_id", user.id)
      .limit(1)
      .single()

    if (membership?.company_id) {
      companyId = membership.company_id
    } else {
      const { data: firstCompany } = await supabase
        .from("erp_companies")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .single()
      companyId = firstCompany?.id ?? null
    }

    if (!companyId) return { ok: false, error: "לא נמצאה חברה מנהלת. צור חברה קודם." }

    // ------------------------------------------------------------------
    // 2. Insert the building row
    // ------------------------------------------------------------------
    const { data: building, error: bldgErr } = await supabase
      .from("buildings")
      .insert({
        name: input.name.trim(),
        address_line1: input.address_line1.trim() || null,
        address_line2: input.address_line2.trim() || null,
        city: input.city.trim(),
        region: input.region.trim() || null,
        postal_code: input.postal_code.trim() || null,
        country: "IL",
        site_id: input.site_id.trim() || null,
        total_floors: input.total_floors ?? null,
        planned_units: input.planned_units ?? null,
        year_built: input.year_built ?? null,
        company_id: companyId,
      })
      .select("id")
      .single()

    if (bldgErr || !building) {
      return { ok: false, error: bldgErr?.message ?? "שגיאה ביצירת הבניין" }
    }

    const buildingId: string = building.id

    // ------------------------------------------------------------------
    // 3. Insert erp_onboarding_configs row (non-critical — don't fail if missing)
    // ------------------------------------------------------------------
    const featuresConfig = {
      ...input.features,
      // Auto-enable IoT gateway when any IoT feature is on
      iot_gateway:
        input.features.iot_gateway ||
        input.features.ev_charging ||
        input.features.elevator_monitoring ||
        input.features.pump_monitoring ||
        input.features.smart_locks ||
        input.features.cctv ||
        input.features.energy_metering,
    }

    // Get the current user's profile id
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single()

    if (profileData) {
      await supabase.from("erp_onboarding_configs").insert({
        company_id: companyId,
        building_id: buildingId,
        contract_type: input.contract_type,
        features_config: featuresConfig,
        status: "draft",
        agreement_reference: input.agreement_reference.trim() || null,
        agreement_signed_at: input.agreement_signed_at || null,
        committee_contact_name: input.committee_contact_name.trim() || null,
        committee_contact_phone: input.committee_contact_phone.trim() || null,
        committee_contact_email: input.committee_contact_email.trim() || null,
        created_by: profileData.id,
      })
    }

    revalidatePath("/buildings")
    return { ok: true, buildingId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה לא ידועה" }
  }
}
