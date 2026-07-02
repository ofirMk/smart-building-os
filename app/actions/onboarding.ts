"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { apiErrorPayload, type ApiErrorPayload } from "@/lib/api/api-error"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import {
  coerceIotGateway,
  type AssignOnboardingTaskInput,
  type ContractType,
  type CreateOnboardingConfigInput,
  type ErpOnboardingConfig,
  type ErpOnboardingTaskInstance,
  type FeaturesConfig,
  type OnboardingReadiness,
  type OnboardingPhase,
} from "@/types/onboarding"

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

type ActionSuccess<T> = { ok: true; data: T }
type ActionResult<T> = ActionSuccess<T> | ApiErrorPayload

// ─────────────────────────────────────────────────────────────────────────────
// Context resolver (same pattern as procurement.ts / projects.ts)
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
        "No active company selected. Please select a company first."
      ),
    }
  }

  return { ok: true as const, supabase, userId: user.id, companyId }
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

const featuresConfigSchema = z.object({
  smart_locks: z.boolean(),
  pump_monitoring: z.boolean(),
  gardening: z.boolean(),
  elevator_monitoring: z.boolean(),
  ev_charging: z.boolean(),
  cctv: z.boolean(),
  energy_metering: z.boolean(),
  pest_control: z.boolean(),
  cleaning: z.boolean(),
  iot_gateway: z.boolean(),
})

const createConfigSchema = z.object({
  buildingId: z.string().uuid("יש לבחור בניין תקין"),
  contractType: z.enum(["full_maintenance", "basic_management", "premium", "custom"]),
  featuresConfig: featuresConfigSchema,
  agreementReference: z.string().trim().optional(),
  agreementSignedAt: z.string().optional(),
  committeeContactName: z.string().trim().optional(),
  committeeContactPhone: z.string().trim().optional(),
  committeeContactEmail: z.string().email("כתובת דואל לא תקינה").optional().or(z.literal("")),
  notes: z.string().trim().optional(),
})

const assignTaskSchema = z.object({
  taskId: z.string().uuid("מזהה משימה לא תקין"),
  supplierId: z.string().uuid("יש לבחור ספק תקין"),
  scheduledStartDate: z.string().optional(),
  scheduledEndDate: z.string().optional(),
})

const taskIdSchema = z.object({
  taskId: z.string().uuid("מזהה משימה לא תקין"),
})

// ─────────────────────────────────────────────────────────────────────────────
// ACTION 1 — createOnboardingConfig
// Creates a new draft config for a building (or returns the existing active one).
// Enforces the partial unique index: only one active config per building.
// ─────────────────────────────────────────────────────────────────────────────

export async function createOnboardingConfig(
  input: CreateOnboardingConfigInput
): Promise<ActionResult<ErpOnboardingConfig>> {
  try {
    const ctx = await resolveActionContext()
    if (!ctx.ok) return ctx.error

    const parsed = createConfigSchema.safeParse(input)
    if (!parsed.success) {
      return apiErrorPayload("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "נתונים לא תקינים")
    }

    const {
      buildingId,
      contractType,
      featuresConfig: rawFeatures,
      agreementReference,
      agreementSignedAt,
      committeeContactName,
      committeeContactPhone,
      committeeContactEmail,
      notes,
    } = parsed.data

    // Auto-coerce: any IoT-dependent feature ON → iot_gateway ON
    const featuresConfig = coerceIotGateway(rawFeatures as FeaturesConfig)

    // Verify the building belongs to this company
    const { data: building, error: bldgErr } = await ctx.supabase
      .from("buildings")
      .select("id, company_id")
      .eq("id", buildingId)
      .eq("company_id", ctx.companyId)
      .single()

    if (bldgErr || !building) {
      return apiErrorPayload("NOT_FOUND", "הבניין לא נמצא או אינו שייך לחברה הנוכחית")
    }

    const row = {
      company_id: ctx.companyId,
      building_id: buildingId,
      contract_type: contractType,
      features_config: featuresConfig,
      agreement_reference: agreementReference ?? null,
      agreement_signed_at: agreementSignedAt ?? null,
      committee_contact_name: committeeContactName ?? null,
      committee_contact_phone: committeeContactPhone ?? null,
      committee_contact_email: committeeContactEmail ?? null,
      notes: notes ?? null,
      created_by: ctx.userId,
    }

    const { data, error } = await ctx.supabase
      .from("erp_onboarding_configs")
      .insert(row)
      .select()
      .single()

    if (error) {
      // Unique violation = active config already exists for this building
      if (error.code === "23505") {
        return apiErrorPayload("CONFLICT", "קיים כבר תהליך הקמה פעיל לבניין זה.")
      }
      return apiErrorPayload("DB_ERROR", error.message)
    }

    revalidatePath("/erp/onboarding")
    return { ok: true, data: data as ErpOnboardingConfig }
  } catch (e) {
    return apiErrorPayload("UNEXPECTED", String(e))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION 2 — generateOnboardingTasks
// Loads templates filtered by contract_type × features_config (JS layer),
// then batch-inserts task instances. Idempotent via ON CONFLICT DO NOTHING.
// ─────────────────────────────────────────────────────────────────────────────

export async function generateOnboardingTasks(
  configId: string
): Promise<ActionResult<ErpOnboardingTaskInstance[]>> {
  try {
    const ctx = await resolveActionContext()
    if (!ctx.ok) return ctx.error

    if (!z.string().uuid().safeParse(configId).success) {
      return apiErrorPayload("VALIDATION_ERROR", "מזהה הגדרה לא תקין")
    }

    // Load and validate config
    const { data: config, error: cfgErr } = await ctx.supabase
      .from("erp_onboarding_configs")
      .select("*")
      .eq("id", configId)
      .eq("company_id", ctx.companyId)
      .single()

    if (cfgErr || !config) {
      return apiErrorPayload("NOT_FOUND", "הגדרת ההקמה לא נמצאה")
    }
    if (config.status !== "draft") {
      return apiErrorPayload("CONFLICT", "ניתן לייצר משימות רק מהגדרה בסטטוס טיוטה")
    }

    const contractType = config.contract_type as ContractType
    const featuresConfig = config.features_config as FeaturesConfig
    const enabledFeatures = (Object.keys(featuresConfig) as Array<keyof FeaturesConfig>).filter(
      (f) => featuresConfig[f]
    )

    // Load all active system-global templates
    const { data: templates, error: tplErr } = await ctx.supabase
      .from("erp_onboarding_templates")
      .select("*")
      .eq("is_active", true)
      .is("company_id", null)  // system-global only (MVP)
      .order("display_order", { ascending: true })

    if (tplErr) return apiErrorPayload("DB_ERROR", tplErr.message)

    // Filter in JS — small dataset (~25 rows), avoids complex SQL array ops
    const matched = (templates ?? []).filter((t) => {
      // Contract type filter
      if (t.required_contract_types && !t.required_contract_types.includes(contractType)) {
        return false
      }
      // Feature filter — ALL required features must be enabled
      if (t.required_features) {
        const allEnabled = (t.required_features as string[]).every((f) =>
          enabledFeatures.includes(f as keyof FeaturesConfig)
        )
        if (!allEnabled) return false
      }
      return true
    })

    if (matched.length === 0) {
      return apiErrorPayload("NO_TEMPLATES", "לא נמצאו תבניות התואמות להגדרה זו")
    }

    // Batch insert task instances (ON CONFLICT DO NOTHING → idempotent)
    const rows = matched.map((t) => ({
      company_id: ctx.companyId,
      config_id: configId,
      template_id: t.id,
      building_id: config.building_id,
      template_key: t.template_key,
      title: t.title,
      description: t.description,
      phase: t.phase,
      category: t.category,
      priority: t.default_priority,
      display_order: t.display_order,
      is_mandatory: t.is_mandatory,
    }))

    const { error: insertErr } = await ctx.supabase
      .from("erp_onboarding_task_instances")
      .insert(rows)
      // Supabase upsert with ignoreDuplicates mimics ON CONFLICT DO NOTHING
      .select()

    if (insertErr && insertErr.code !== "23505") {
      return apiErrorPayload("DB_ERROR", insertErr.message)
    }

    // Advance config status → tasks_generated
    await ctx.supabase
      .from("erp_onboarding_configs")
      .update({
        status: "tasks_generated",
        tasks_generated_at: new Date().toISOString(),
        tasks_generated_by: ctx.userId,
      })
      .eq("id", configId)

    // Return the created task instances
    const { data: tasks, error: fetchErr } = await ctx.supabase
      .from("erp_onboarding_task_instances")
      .select("*")
      .eq("config_id", configId)
      .order("display_order", { ascending: true })

    if (fetchErr) return apiErrorPayload("DB_ERROR", fetchErr.message)

    revalidatePath(`/erp/onboarding/buildings/${config.building_id}`)
    return { ok: true, data: (tasks ?? []) as ErpOnboardingTaskInstance[] }
  } catch (e) {
    return apiErrorPayload("UNEXPECTED", String(e))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION 3 — assignOnboardingTask
// Creates an erp_work_order (trigger_source='onboarding_setup') and links it
// back to the task instance. Advances config status to 'in_progress' on the
// first assignment.
// ─────────────────────────────────────────────────────────────────────────────

export async function assignOnboardingTask(
  input: AssignOnboardingTaskInput
): Promise<ActionResult<{ workOrderId: string }>> {
  try {
    const ctx = await resolveActionContext()
    if (!ctx.ok) return ctx.error

    const parsed = assignTaskSchema.safeParse(input)
    if (!parsed.success) {
      return apiErrorPayload("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "נתונים לא תקינים")
    }

    const { taskId, supplierId, scheduledStartDate, scheduledEndDate } = parsed.data

    // Load task instance + validate ownership
    const { data: task, error: taskErr } = await ctx.supabase
      .from("erp_onboarding_task_instances")
      .select("*, erp_onboarding_configs(building_id, status)")
      .eq("id", taskId)
      .eq("company_id", ctx.companyId)
      .single()

    if (taskErr || !task) {
      return apiErrorPayload("NOT_FOUND", "המשימה לא נמצאה")
    }
    if (task.status === "done" || task.status === "skipped") {
      return apiErrorPayload("CONFLICT", "לא ניתן לשבץ משימה שכבר הושלמה או דולגה")
    }

    // Validate supplier belongs to company
    const { data: supplier, error: splErr } = await ctx.supabase
      .from("erp_md_suppliers")
      .select("id")
      .eq("id", supplierId)
      .eq("company_id", ctx.companyId)
      .single()

    if (splErr || !supplier) {
      return apiErrorPayload("NOT_FOUND", "הספק לא נמצא")
    }

    const buildingId: string = (task.erp_onboarding_configs as { building_id: string }).building_id

    // Resolve SLA deadlines from erp_sla_contracts
    let slaResponseDueAt: string | null = null
    let slaResolutionDueAt: string | null = null
    try {
      const { data: slaRows } = await ctx.supabase.rpc("erp_resolve_sla", {
        p_company_id: ctx.companyId,
        p_building_id: buildingId,
        p_supplier_id: supplierId,
        p_category: task.category,
        p_priority: task.priority,
      })
      if (slaRows?.[0]) {
        const now = Date.now()
        const MS_PER_HOUR = 3_600_000
        slaResponseDueAt = new Date(now + slaRows[0].response_hours * MS_PER_HOUR).toISOString()
        slaResolutionDueAt = new Date(now + slaRows[0].resolution_hours * MS_PER_HOUR).toISOString()
      }
    } catch {
      // SLA resolution is best-effort — proceed without deadlines if RPC fails
    }

    // Create the Work Order
    const woRow = {
      company_id: ctx.companyId,
      title: task.title,
      description: task.description ?? null,
      category: task.category,
      priority: task.priority,
      status: "open",
      trigger_source: "onboarding_setup",
      source_onboarding_task_id: taskId,
      building_id: buildingId,
      asset_id: null,
      assigned_to_supplier_id: supplierId,
      assigned_at: new Date().toISOString(),
      sla_response_due_at: slaResponseDueAt,
      sla_resolution_due_at: slaResolutionDueAt,
      created_by: ctx.userId,
    }

    const { data: wo, error: woErr } = await ctx.supabase
      .from("erp_work_orders")
      .insert(woRow)
      .select("id")
      .single()

    if (woErr || !wo) {
      return apiErrorPayload("DB_ERROR", woErr?.message ?? "שגיאה ביצירת פקודת עבודה")
    }

    // Link WO back to the task instance and advance status
    const { error: updateErr } = await ctx.supabase
      .from("erp_onboarding_task_instances")
      .update({
        work_order_id: wo.id,
        assigned_to_supplier_id: supplierId,
        assigned_at: new Date().toISOString(),
        status: "assigned",
        scheduled_start_date: scheduledStartDate ?? null,
        scheduled_end_date: scheduledEndDate ?? null,
      })
      .eq("id", taskId)

    if (updateErr) return apiErrorPayload("DB_ERROR", updateErr.message)

    // Advance config to in_progress on first assignment (idempotent WHERE guard)
    await ctx.supabase
      .from("erp_onboarding_configs")
      .update({ status: "in_progress" })
      .eq("id", task.config_id)
      .eq("status", "tasks_generated")

    revalidatePath(`/erp/onboarding/buildings/${buildingId}`)
    return { ok: true, data: { workOrderId: wo.id } }
  } catch (e) {
    return apiErrorPayload("UNEXPECTED", String(e))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION 4 — skipOnboardingTask
// Only non-mandatory tasks may be skipped (the UI already enforces this,
// but we validate at the action layer too).
// ─────────────────────────────────────────────────────────────────────────────

export async function skipOnboardingTask(
  taskId: string,
  skipReason: string
): Promise<ActionResult<void>> {
  try {
    const ctx = await resolveActionContext()
    if (!ctx.ok) return ctx.error

    if (!z.string().uuid().safeParse(taskId).success) {
      return apiErrorPayload("VALIDATION_ERROR", "מזהה משימה לא תקין")
    }

    const { data: task, error: taskErr } = await ctx.supabase
      .from("erp_onboarding_task_instances")
      .select("id, is_mandatory, status, company_id")
      .eq("id", taskId)
      .eq("company_id", ctx.companyId)
      .single()

    if (taskErr || !task) return apiErrorPayload("NOT_FOUND", "המשימה לא נמצאה")
    if (task.is_mandatory) return apiErrorPayload("FORBIDDEN", "לא ניתן לדלג על משימה חובה")
    if (task.status === "done") return apiErrorPayload("CONFLICT", "המשימה כבר הושלמה")

    const { error } = await ctx.supabase
      .from("erp_onboarding_task_instances")
      .update({ status: "skipped", is_skipped: true, skip_reason: skipReason || null })
      .eq("id", taskId)

    if (error) return apiErrorPayload("DB_ERROR", error.message)
    return { ok: true, data: undefined }
  } catch (e) {
    return apiErrorPayload("UNEXPECTED", String(e))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION 5 — updateOnboardingTaskStatus
// Allows PM to manually advance a task's status.
// ─────────────────────────────────────────────────────────────────────────────

export async function updateOnboardingTaskStatus(
  taskId: string,
  status: "in_progress" | "done",
  notes?: string
): Promise<ActionResult<void>> {
  try {
    const ctx = await resolveActionContext()
    if (!ctx.ok) return ctx.error

    if (!z.string().uuid().safeParse(taskId).success) {
      return apiErrorPayload("VALIDATION_ERROR", "מזהה משימה לא תקין")
    }

    const updates: Record<string, unknown> = { status, notes: notes ?? null }
    if (status === "done") {
      updates.actual_completion_date = new Date().toISOString().split("T")[0]
    }

    const { error } = await ctx.supabase
      .from("erp_onboarding_task_instances")
      .update(updates)
      .eq("id", taskId)
      .eq("company_id", ctx.companyId)

    if (error) return apiErrorPayload("DB_ERROR", error.message)
    return { ok: true, data: undefined }
  } catch (e) {
    return apiErrorPayload("UNEXPECTED", String(e))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION 6 — completeOnboarding
// Validates all mandatory tasks are done, then marks the config completed.
// ─────────────────────────────────────────────────────────────────────────────

export async function completeOnboarding(
  configId: string
): Promise<ActionResult<void>> {
  try {
    const ctx = await resolveActionContext()
    if (!ctx.ok) return ctx.error

    if (!z.string().uuid().safeParse(configId).success) {
      return apiErrorPayload("VALIDATION_ERROR", "מזהה הגדרה לא תקין")
    }

    // Load all task instances for this config
    const { data: tasks, error: taskErr } = await ctx.supabase
      .from("erp_onboarding_task_instances")
      .select("id, is_mandatory, status")
      .eq("config_id", configId)
      .eq("company_id", ctx.companyId)

    if (taskErr) return apiErrorPayload("DB_ERROR", taskErr.message)
    if (!tasks?.length) return apiErrorPayload("NOT_FOUND", "לא נמצאו משימות להגדרה זו")

    // Block completion if any mandatory task is not done
    const blocking = tasks.filter(
      (t) => t.is_mandatory && t.status !== "done"
    )
    if (blocking.length > 0) {
      return apiErrorPayload(
        "BLOCKING_TASKS",
        `יש ${blocking.length} משימות חובה שלא הושלמו. יש לסיים אותן לפני אישור ההקמה.`
      )
    }

    const { error } = await ctx.supabase
      .from("erp_onboarding_configs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: ctx.userId,
      })
      .eq("id", configId)
      .eq("company_id", ctx.companyId)

    if (error) return apiErrorPayload("DB_ERROR", error.message)

    revalidatePath("/erp/onboarding")
    return { ok: true, data: undefined }
  } catch (e) {
    return apiErrorPayload("UNEXPECTED", String(e))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — computeReadiness (pure, used client-side too)
// ─────────────────────────────────────────────────────────────────────────────

export function computeReadiness(tasks: ErpOnboardingTaskInstance[]): OnboardingReadiness {
  const phases: OnboardingPhase[] = ["setup", "commissioning", "handover"]
  const byPhase = Object.fromEntries(
    phases.map((p) => [p, { total: 0, done: 0 }])
  ) as Record<OnboardingPhase, { total: number; done: number }>

  let mandatoryTotal = 0
  let doneCount = 0
  const blockingTasks: ErpOnboardingTaskInstance[] = []

  for (const t of tasks) {
    byPhase[t.phase].total++
    if (t.status === "done") byPhase[t.phase].done++

    if (t.is_mandatory) {
      mandatoryTotal++
      if (t.status === "done") {
        doneCount++
      } else if (t.status !== "skipped") {
        blockingTasks.push(t)
      }
    }
  }

  const scorePct = mandatoryTotal === 0 ? 100 : Math.round((doneCount / mandatoryTotal) * 100)
  return { scorePct, doneCount, mandatoryTotal, byPhase, blockingTasks }
}
