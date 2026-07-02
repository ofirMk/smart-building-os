"use server"

/**
 * Field Technician Server Actions
 * ================================
 * Covers the three lifecycle events a field technician performs:
 *   1. startWorkOrder        — check-in: moves status → 'in_progress', stamps GPS + time
 *   2. uploadVerificationPhoto — records the after-photo URL against the WO
 *   3. submitWorkOrderVerification — closes or sends to pending_verification
 *                                    based on the WO's verification_method
 *
 * Security: every action resolves the caller's identity + company from the
 * session cookie and verifies that the target WO belongs to that company
 * before mutating. RLS provides a second enforcement layer at the DB level.
 */

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { apiErrorPayload, type ApiErrorPayload } from "@/lib/api/api-error"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

type ActionSuccess<T = undefined> = { ok: true; data: T }
type ActionResult<T = undefined> = ActionSuccess<T> | ApiErrorPayload

// ─────────────────────────────────────────────────────────────────────────────
// Context resolver — identical pattern to onboarding.ts / procurement.ts
// ─────────────────────────────────────────────────────────────────────────────

async function resolveActionContext() {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return {
      ok: false as const,
      error: apiErrorPayload("UNAUTHORIZED", "User must be authenticated"),
    }
  }

  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
  if (!companyId) {
    return {
      ok: false as const,
      error: apiErrorPayload(
        "MISSING_COMPANY_CONTEXT",
        "No active company selected."
      ),
    }
  }

  return { ok: true as const, supabase, userId: user.id, companyId }
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas (input validation at the system boundary)
// ─────────────────────────────────────────────────────────────────────────────

const CheckInSchema = z.object({
  workOrderId: z.string().uuid(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
})

const PhotoSchema = z.object({
  workOrderId: z.string().uuid(),
  photoUrl: z.string().url("Invalid photo URL"),
})

const SubmitVerificationSchema = z.object({
  workOrderId: z.string().uuid(),
  notes: z.string().max(2000).optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWorkOrder(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  workOrderId: string,
  companyId: string
) {
  const { data, error } = await supabase
    .from("erp_work_orders")
    .select("id, status, verification_method, company_id")
    .eq("id", workOrderId)
    .eq("company_id", companyId)
    .single()

  if (error || !data) return null
  return data
}

// ─────────────────────────────────────────────────────────────────────────────
// Action 1 — startWorkOrder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Technician check-in: moves the Work Order from 'open' or 'assigned' →
 * 'in_progress', stamps `actual_start_at`, and optionally records GPS coordinates.
 */
export async function startWorkOrder(
  input: unknown
): Promise<ActionResult> {
  const ctx = await resolveActionContext()
  if (!ctx.ok) return ctx.error

  const parsed = CheckInSchema.safeParse(input)
  if (!parsed.success) {
    return apiErrorPayload("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input")
  }

  const { workOrderId, lat, lng } = parsed.data

  const wo = await fetchWorkOrder(ctx.supabase, workOrderId, ctx.companyId)
  if (!wo) return apiErrorPayload("NOT_FOUND", "Work order not found or access denied")

  if (!["open", "assigned"].includes(wo.status)) {
    return apiErrorPayload(
      "CONFLICT",
      `Cannot check in: work order is already '${wo.status}'.`
    )
  }

  const patch: Record<string, unknown> = {
    status: "in_progress",
    actual_start_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (lat != null) patch.checkin_lat = lat
  if (lng != null) patch.checkin_lng = lng
  if (lat != null || lng != null) patch.checkin_at = new Date().toISOString()

  const { error } = await ctx.supabase
    .from("erp_work_orders")
    .update(patch)
    .eq("id", workOrderId)
    .eq("company_id", ctx.companyId)

  if (error) {
    return apiErrorPayload("DB_ERROR", error.message)
  }

  revalidatePath(`/erp/field/work-orders/${workOrderId}`)
  revalidatePath("/erp/field")
  return { ok: true, data: undefined }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action 2 — uploadVerificationPhoto
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Records the after-photo URL on the Work Order.
 *
 * This action does NOT handle file upload itself (storage is handled client-side
 * via Supabase Storage's signed URL flow). It receives the final public/signed
 * URL and writes it to `after_photo_url`.
 *
 * The WO must be 'in_progress' to accept a photo.
 */
export async function uploadVerificationPhoto(
  input: unknown
): Promise<ActionResult> {
  const ctx = await resolveActionContext()
  if (!ctx.ok) return ctx.error

  const parsed = PhotoSchema.safeParse(input)
  if (!parsed.success) {
    return apiErrorPayload("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input")
  }

  const { workOrderId, photoUrl } = parsed.data

  const wo = await fetchWorkOrder(ctx.supabase, workOrderId, ctx.companyId)
  if (!wo) return apiErrorPayload("NOT_FOUND", "Work order not found or access denied")

  if (wo.status !== "in_progress") {
    return apiErrorPayload(
      "CONFLICT",
      "Photo upload is only allowed while the work order is in progress."
    )
  }

  const { error } = await ctx.supabase
    .from("erp_work_orders")
    .update({
      after_photo_url: photoUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workOrderId)
    .eq("company_id", ctx.companyId)

  if (error) return apiErrorPayload("DB_ERROR", error.message)

  revalidatePath(`/erp/field/work-orders/${workOrderId}`)
  return { ok: true, data: undefined }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action 3 — submitWorkOrderVerification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Technician submits completion.
 *
 * The next status depends on the WO's `verification_method`:
 *   - 'manual_admin'    → 'pending_verification' (property manager must approve)
 *   - 'tenant_feedback' → 'pending_verification' (tenant must confirm via app)
 *   - 'gps_checkin'     → 'closed' (GPS already confirmed; auto-close)
 *   - 'sensor_restore'  → 'pending_verification' (IoT baseline must normalise)
 *   - null              → 'pending_verification' (safe default)
 */
export async function submitWorkOrderVerification(
  input: unknown
): Promise<ActionResult> {
  const ctx = await resolveActionContext()
  if (!ctx.ok) return ctx.error

  const parsed = SubmitVerificationSchema.safeParse(input)
  if (!parsed.success) {
    return apiErrorPayload("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input")
  }

  const { workOrderId, notes } = parsed.data

  const wo = await fetchWorkOrder(ctx.supabase, workOrderId, ctx.companyId)
  if (!wo) return apiErrorPayload("NOT_FOUND", "Work order not found or access denied")

  if (wo.status !== "in_progress") {
    return apiErrorPayload(
      "CONFLICT",
      `Cannot submit: expected status 'in_progress', got '${wo.status}'.`
    )
  }

  // GPS check-in auto-closes; all other methods route to pending_verification
  const autoClose = wo.verification_method === "gps_checkin"
  const nextStatus = autoClose ? "closed" : "pending_verification"

  const patch: Record<string, unknown> = {
    status: nextStatus,
    verification_status: autoClose ? "verified" : "pending",
    updated_at: new Date().toISOString(),
  }
  if (autoClose) patch.closed_at = new Date().toISOString()
  if (notes) patch.description = notes  // Append notes to description

  const { error } = await ctx.supabase
    .from("erp_work_orders")
    .update(patch)
    .eq("id", workOrderId)
    .eq("company_id", ctx.companyId)

  if (error) return apiErrorPayload("DB_ERROR", error.message)

  revalidatePath(`/erp/field/work-orders/${workOrderId}`)
  revalidatePath("/erp/field")
  return { ok: true, data: undefined }
}
