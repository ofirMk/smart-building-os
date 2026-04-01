"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createSupabaseServerClient } from "@/lib/supabase/server"

/** דייר ברירת מחדל (seed / env) — עד חיבור Auth */
const DEFAULT_TENANT_PROFILE_ID =
  process.env.DEMO_TENANT_PROFILE_ID?.trim() ||
  "a1111111-1111-4111-8111-111111111102"

const HEALTH_DECLARATION_VERSION = "v1-2025"

const bookingSchema = z.object({
  amenityId: z.string().uuid("מזהה מתקן לא תקין"),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  partySize: z.coerce.number().int().min(1, "יש להזין מספר משתתפים חוקי"),
  healthAccepted: z.boolean().refine((v) => v === true, {
    message: "יש לאשר את הצהרת הבריאות",
  }),
})

export type CreateAmenityBookingResult =
  | { ok: true }
  | { ok: false; error: string }

export async function createAmenityBooking(
  input: unknown
): Promise<CreateAmenityBookingResult> {
  const parsed = bookingSchema.safeParse(input)
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "נתונים לא תקינים"
    return { ok: false, error: first }
  }

  const { amenityId, startsAt: startsRaw, endsAt: endsRaw, partySize } =
    parsed.data

  const starts = new Date(startsRaw)
  const ends = new Date(endsRaw)

  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
    return { ok: false, error: "תאריך או שעה לא תקינים" }
  }

  if (ends <= starts) {
    return { ok: false, error: "שעת הסיום חייבת להיות אחרי שעת ההתחלה" }
  }

  const supabase = createSupabaseServerClient()

  const { data: amenity, error: amenityError } = await supabase
    .from("amenities")
    .select("id, capacity_per_slot, is_active")
    .eq("id", amenityId)
    .maybeSingle()

  if (amenityError || !amenity) {
    return { ok: false, error: "המתקן לא נמצא" }
  }

  if (!amenity.is_active) {
    return { ok: false, error: "המתקן אינו זמין להזמנה" }
  }

  const cap = Math.max(1, Math.floor(Number(amenity.capacity_per_slot ?? 1)))
  if (partySize > cap) {
    return {
      ok: false,
      error: `מספר המשתתפים לא יכול לעלות על ${cap} (קיבולת המשבצת)`,
    }
  }

  const { error } = await supabase.from("amenity_bookings").insert({
    amenity_id: amenityId,
    tenant_id: DEFAULT_TENANT_PROFILE_ID,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    party_size: partySize,
    health_declaration_version: HEALTH_DECLARATION_VERSION,
    health_declaration_payload: {
      accepted: true,
      version: HEALTH_DECLARATION_VERSION,
    },
    health_declaration_accepted_at: new Date().toISOString(),
    status: "confirmed",
  })

  if (error) {
    return {
      ok: false,
      error: error.message || "שמירת ההזמנה נכשלה",
    }
  }

  revalidatePath("/tenant/amenities")
  revalidatePath("/amenities")
  revalidatePath("/")
  return { ok: true }
}
